import { createHash } from 'node:crypto'
import { db } from '../database/connection.js'
import { ERROR_REPORT_QUERIES as q, ADMIN_QUERIES as aq } from '../database/queries.js'
import logger from '../utils/logger.js'
import { httpError } from '../utils/httpError.js'
import { resolvePagination } from '../utils/pagination.js'
import STATUS from '../utils/statusCodes.js'
import { sendMail as defaultSendMail } from './mailService.js'
import { errorDigestEmail } from './emailTemplates.js'

/**
 * Erros num lugar só (pacote 37): navegador (POST /client-errors), erros 500
 * da API, jobs que desistiram, webhooks que falharam e violações de CSP.
 *
 * - Deduplicado: uma linha por assinatura (origem + mensagem normalizada +
 *   onde). Repetir só soma ocorrências.
 * - Sem dados pessoais: nada de usuário ou IP; URLs viram só o caminho, com
 *   números longos trocados por :id; e-mails e tokens saem das mensagens.
 * - Nunca lança: registrar um erro não pode virar outro erro.
 */
export const SOURCES = Object.freeze(['client', 'server', 'worker', 'webhook', 'csp'])
export const RETENTION_DAYS = 90

const MAX_MESSAGE = 300
const MAX_LOCATION = 160
const MAX_STACK_LINES = 6
const MAX_DETAIL_TEXT = 200

// ------------------------------------------------------------- limpeza

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
// Tokens, JWTs, hashes: 20+ caracteres de letras, números, - e _, com algum
// dígito (nomes longos de função na pilha ficam)
const TOKEN = /\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{20,}(\.[A-Za-z0-9_-]{10,}){0,2}\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const QUERY = /\?[^\s)'"]*/g

/** Mensagem sem e-mail, token nem query string. */
export function scrub(text, max = MAX_MESSAGE) {
  return String(text ?? '')
    .replace(EMAIL, '<email>')
    .replace(UUID, '<uuid>')
    .replace(TOKEN, '<token>')
    .replace(QUERY, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** URL ou caminho → só o caminho, com ids trocados (/u/ana fica: é o endereço público). */
export function cleanPath(value) {
  if (typeof value !== 'string' || !value) return null
  let path = value
  try { path = new URL(value, 'http://x').pathname } catch { path = value.split(/[?#]/)[0] }
  return path.replace(/\/\d+(?=\/|$)/g, '/:id').replace(UUID, ':uuid').slice(0, MAX_LOCATION)
}

/** Pilha: primeiras linhas, sem origem e sem query (o arquivo e a linha bastam). */
export function cleanStack(stack) {
  if (typeof stack !== 'string' || !stack) return null
  return stack.split('\n')
    .slice(0, MAX_STACK_LINES)
    // A query sai antes do :linha:coluna, que fica
    .map(line => scrub(line.replace(/https?:\/\/[^/\s)]+/g, '').replace(/\?[^\s):]*/g, ''), 240))
    .filter(Boolean)
    .join('\n')
}

// Para a assinatura: números e trechos variáveis não podem separar o mesmo erro
const normalized = text => String(text ?? '').toLowerCase().replace(/\d+/g, 'N').replace(/'[^']*'|"[^"]*"/g, 'S').slice(0, 200)

export function signatureOf(source, message, location) {
  return createHash('sha256').update(`${source}|${normalized(message)}|${location ?? ''}`).digest('hex').slice(0, 40)
}

function cleanDetail(detail = {}) {
  const out = {}
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (value === undefined || value === null || value === '') continue
    if (key === 'stack') out.stack = cleanStack(value)
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value
    else out[key] = scrub(value, MAX_DETAIL_TEXT)
  }
  return out
}

// -------------------------------------------------------------- registro

/**
 * { source, message, location?, detail? } → grava (ou soma). Devolve a
 * promessa, mas quem chama pode ignorar: falhas vão só para o log.
 */
export async function record({ source, message, location = null, detail = {} }) {
  try {
    if (!SOURCES.includes(source)) throw new Error(`origem desconhecida: ${source}`)
    const text = scrub(message) || '(sem mensagem)'
    const where = location ? String(location).slice(0, MAX_LOCATION) : null
    await db.query(q.UPSERT, [source, signatureOf(source, text, where), text, where, cleanDetail(detail)])
  } catch (err) {
    logger.warn('Erro não foi registrado', { source, message: err.message })
  }
}

/** Erro 500 da API (sendError e errorHandler). */
export function recordServerError({ method, path, context, error }) {
  return record({
    source: 'server',
    message: error?.message,
    location: `${method || '?'} ${cleanPath(path) || '?'}`,
    detail: { context, stack: error?.stack }
  })
}

/** Job que esgotou as tentativas (worker). */
export function recordJobFailure(job, error) {
  return record({ source: 'worker', message: error?.message, location: job.type, detail: { attempts: job.attempts, stack: error?.stack } })
}

/** Webhook do Mercado Pago que falhou ao processar. */
export function recordWebhookFailure(event, error) {
  return record({ source: 'webhook', message: error?.message, location: `${event.provider}/${event.topic}`, detail: { attempts: event.attempts } })
}

// ------------------------------------------------------------ navegador

const CLIENT_KINDS = new Set(['vue', 'error', 'unhandledrejection'])

/**
 * Corpo de POST /client-errors → registro, ou null se não serve. O
 * navegador manda { kind, message, stack?, page, info?, release? }.
 */
export function fromClient(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (!CLIENT_KINDS.has(body.kind) || typeof body.message !== 'string' || !body.message.trim()) return null
  const page = cleanPath(body.page)
  return {
    source: 'client',
    message: body.message,
    location: page,
    detail: {
      kind: body.kind,
      info: typeof body.info === 'string' ? body.info.slice(0, 60) : null,
      release: typeof body.release === 'string' ? body.release.slice(0, 40) : null,
      stack: typeof body.stack === 'string' ? body.stack.slice(0, 4000) : null
    }
  }
}

export async function recordClient(body) {
  const report = fromClient(body)
  if (!report) return false
  await record(report)
  return true
}

// ------------------------------------------------------- resumo por e-mail

const DIGEST_MAX_ITEMS = 10
export const digestMinutes = () => Math.max(Number(process.env.ERROR_DIGEST_MINUTES) || 60, 5)

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

/**
 * Job errors.digest (a cada 15 min): apaga o que passou de RETENTION_DAYS e,
 * se houver erro aberto novo ou repetido desde o último resumo, manda um
 * e-mail para ADMIN_EMAIL, no máximo um a cada ERROR_DIGEST_MINUTES (60).
 * Um erro que se repete mil vezes vira uma linha com a contagem.
 */
export async function digest({ now = Date.now(), send } = {}) {
  await db.query(q.CLEANUP, [RETENTION_DAYS])
  const to = process.env.ADMIN_EMAIL?.trim()
  if (!to) return { skipped: 'ADMIN_EMAIL não definido' }

  const minutes = digestMinutes()
  const { rows: [{ at }] } = await db.query(q.LAST_DIGEST)
  if (at && now - new Date(at).getTime() < minutes * 60 * 1000) return { skipped: 'intervalo mínimo' }

  const { rows } = await db.query(q.PENDING_DIGEST)
  if (!rows.length) return { skipped: 'nada novo' }

  const items = rows.slice(0, DIGEST_MAX_ITEMS).map(row => ({
    source: row.source, message: row.message, location: row.location, occurrences: row.occurrences, isNew: row.is_new
  }))
  const mail = errorDigestEmail({ link: `${siteUrl()}/admin?tab=errors`, locale: 'pt', items, total: rows.length, minutes })
  const sendMail = send ?? defaultSendMail
  await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html })
  await db.query(q.MARK_NOTIFIED, [rows.map(row => row.id)])
  return { sent: rows.length }
}

// ------------------------------------------------------------------- Admin

const STATUSES = ['open', 'resolved', 'all']
const iso = date => (date ? new Date(date).toISOString() : null)

/** GET /admin/errors?status=open|resolved|all&source=… */
export async function list({ status = 'open', source = null, page, limit } = {}) {
  if (!STATUSES.includes(status)) throw httpError("Parâmetro 'status' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'status' })
  if (source !== null && source !== undefined && source !== '' && !SOURCES.includes(source)) {
    throw httpError("Parâmetro 'source' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'source' })
  }
  const pagination = resolvePagination(page, limit)
  const [{ rows }, { rows: [{ open }] }] = await Promise.all([
    db.query(q.LIST, [status, source || null, pagination.limit, pagination.offset]),
    db.query(q.OPEN_COUNT)
  ])
  return {
    total: rows[0]?.total ?? 0,
    open,
    page: pagination.page,
    limit: pagination.limit,
    errors: rows.map(row => ({
      id: Number(row.id),
      source: row.source,
      message: row.message,
      location: row.location,
      detail: row.detail,
      occurrences: row.occurrences,
      firstSeenAt: iso(row.first_seen_at),
      lastSeenAt: iso(row.last_seen_at),
      resolvedAt: iso(row.resolved_at)
    }))
  }
}

/** POST /admin/errors/:id/resolve (o registro do admin fica com quem e o quê) */
export async function resolve(adminId, id) {
  const { rows: [row] } = await db.query(q.RESOLVE, [id])
  if (!row) throw httpError('Erro não encontrado ou já resolvido.', STATUS.NOT_FOUND, 'ERROR_REPORT_NOT_FOUND')
  await db.query(aq.LOG, [adminId, 'error.resolve', null, null, { errorId: Number(row.id), source: row.source, message: row.message.slice(0, 120) }])
  logger.info('Ação administrativa', { adminId, action: 'error.resolve', errorId: Number(row.id) })
  return { resolved: true }
}
