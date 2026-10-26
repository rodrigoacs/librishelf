import { db } from '../database/connection.js'
import logger from './logger.js'

/**
 * Métricas para a área administrativa, sem dado pessoal persistido:
 *
 *   count(event)        contador do dia (usage_counters), gravado a cada minuto
 *   timing(name, ms)    últimas durações (memória), para média e p95
 *   serverError(...)    últimos 50 erros 500 (memória: somem ao reiniciar)
 *   rateLimited(...)    429 por código (contador) e IPs da última hora (memória)
 *
 * O IP fica só em memória e só pela hora corrente e a anterior, como diz a
 * política de privacidade ("usado por pouco tempo, para proteger o serviço").
 */
const FLUSH_MS = 60_000
const MAX_TIMINGS = 200
const MAX_ERRORS = 50
const HOUR_MS = 60 * 60 * 1000

const pending = new Map() // "AAAA-MM-DD|evento" → n
const timings = new Map() // nome → [ms...]
const errors = []
const lastErrors = new Map() // nome → { at, message }
let ipWindows = [] // [{ hour, ips: Map }]
const startedAt = new Date()

const today = () => new Date().toISOString().slice(0, 10)

export function count(event, n = 1) {
  const key = `${today()}|${event.slice(0, 60)}`
  pending.set(key, (pending.get(key) || 0) + n)
}

export async function flushMetrics() {
  if (pending.size === 0) return
  const entries = [...pending]
  pending.clear()
  try {
    await db.query(`
      INSERT INTO librishelf.usage_counters (day, event, count)
      SELECT split_part(k, '|', 1)::date, split_part(k, '|', 2), n
      FROM unnest($1::text[], $2::int[]) AS t(k, n)
      ON CONFLICT (day, event) DO UPDATE SET count = librishelf.usage_counters.count + EXCLUDED.count
    `, [entries.map(([k]) => k), entries.map(([, n]) => n)])
  } catch (err) {
    // Sem tabela (migration pendente) ou banco fora: devolve para a próxima vez
    for (const [k, n] of entries) pending.set(k, (pending.get(k) || 0) + n)
    logger.warn('Contadores de uso não foram gravados', { message: err.message })
  }
}

if (process.env.NODE_ENV !== 'test') setInterval(flushMetrics, FLUSH_MS).unref()

export function timing(name, ms) {
  const list = timings.get(name) || []
  list.push(Math.round(ms))
  if (list.length > MAX_TIMINGS) list.shift()
  timings.set(name, list)
}

export function timingStats(name) {
  const list = [...(timings.get(name) || [])].sort((a, b) => a - b)
  if (list.length === 0) return { samples: 0, avgMs: null, p95Ms: null }
  return {
    samples: list.length,
    avgMs: Math.round(list.reduce((sum, ms) => sum + ms, 0) / list.length),
    p95Ms: list[Math.min(list.length - 1, Math.floor(list.length * 0.95))]
  }
}

export function failure(name, message) {
  lastErrors.set(name, { at: new Date().toISOString(), message: String(message).slice(0, 200) })
}

export function lastFailure(name) {
  return lastErrors.get(name) || null
}

const lastOks = new Map()
export function succeeded(name) {
  lastOks.set(name, new Date().toISOString())
}

export function lastSuccess(name) {
  return lastOks.get(name) || null
}

/** Erro 500: rota, contexto e mensagem (cortada). Sem corpo, usuário ou IP. */
export function serverError({ method, path, context, message }) {
  errors.unshift({
    at: new Date().toISOString(),
    method: method || '',
    path: String(path || '').replace(/\d{2,}/g, ':id').slice(0, 120),
    context: context ? String(context).slice(0, 120) : '',
    message: String(message || '').slice(0, 300)
  })
  if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS
  count('error.500')
}

export function recentErrors() {
  return errors.slice()
}

export function rateLimited(code, ip) {
  count(`ratelimit.${code}`)
  const hour = Math.floor(Date.now() / HOUR_MS)
  ipWindows = ipWindows.filter(w => w.hour >= hour - 1)
  let current = ipWindows.find(w => w.hour === hour)
  if (!current) {
    current = { hour, ips: new Map() }
    ipWindows.push(current)
  }
  const entry = current.ips.get(ip) || { total: 0, codes: {} }
  entry.total++
  entry.codes[code] = (entry.codes[code] || 0) + 1
  current.ips.set(ip, entry)
}

/** IPs que mais bateram no limite na hora corrente e na anterior. */
export function topRateLimitedIps(limit = 10) {
  const hour = Math.floor(Date.now() / HOUR_MS)
  const merged = new Map()
  for (const window of ipWindows.filter(w => w.hour >= hour - 1)) {
    for (const [ip, entry] of window.ips) {
      const acc = merged.get(ip) || { ip, total: 0, codes: {} }
      acc.total += entry.total
      for (const [code, n] of Object.entries(entry.codes)) acc.codes[code] = (acc.codes[code] || 0) + n
      merged.set(ip, acc)
    }
  }
  return [...merged.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

export function processStartedAt() {
  return startedAt
}

/** Só para testes: contadores ainda não gravados, por evento. */
export function pendingCounts() {
  return Object.fromEntries([...pending].map(([key, n]) => [key.split('|')[1], n]))
}

/** Só para testes. */
export function resetMetrics() {
  pending.clear()
  timings.clear()
  errors.length = 0
  lastErrors.clear()
  lastOks.clear()
  ipWindows = []
}

/** Middleware: conta o evento quando a resposta sai com sucesso (< 400). */
export function track(event) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return
      const name = typeof event === 'function' ? event(req) : event
      if (name) count(name)
    })
    next()
  }
}
