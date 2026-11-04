import fs from 'fs/promises'
import path from 'path'
import { gzip } from 'zlib'
import { promisify } from 'util'
import { db } from '../database/connection.js'
import { BACKUP_QUERIES as q } from '../database/queries.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import { enqueue } from '../jobs/queue.js'
import * as entitlementService from './entitlementService.js'
import { exportJson } from './dataService.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Backup automático (pacote 30, Pro: auto_backup).
 *
 * O job backup.create gera o mesmo conteúdo da exportação JSON (dataService,
 * com a coleção do pacote 28), compacta com gzip e guarda para baixar. Com o
 * aviso ligado, sai um e-mail com o link (o arquivo não vai no e-mail: a
 * biblioteca não fica na caixa de entrada e o limite da caixa não sofre).
 *
 * Sem Pro, o agendamento espera: nada novo é gerado e nada é excluído. Os
 * backups que existem continuam para baixar.
 */
const gzipAsync = promisify(gzip)

export const FREQUENCY_DAYS = Object.freeze({ weekly: 7, monthly: 30 })
const DAY_MS = 24 * 60 * 60 * 1000
const MANUAL_GAP_MINUTES = 60

// Início da hora (UTC), para a dedupe_key do backup manual
const hourBucket = (now = Date.now()) => new Date(Math.floor(now / 3600000) * 3600000).toISOString().slice(0, 13)

export const keep = () => positiveInt(process.env.BACKUP_KEEP, 5)
const backupDir = () => process.env.BACKUP_DIR || path.join(UPLOAD_DIR, 'backups')
const userDir = userId => path.join(backupDir(), String(userId))
export const backupPath = (userId, id) => path.join(userDir(userId), `${id}.json.gz`)

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const out = row => ({ id: row.id, trigger: row.trigger, books: row.books, bytes: row.bytes, createdAt: row.created_at })

const settingsOut = row => ({
  enabled: row?.enabled ?? false,
  frequency: row?.frequency ?? 'weekly',
  notify: row?.notify ?? true,
  nextRunAt: row?.enabled ? row.next_run_at : null
})

export async function state(userId) {
  const [settings, backups] = await Promise.all([db.query(q.SETTINGS, [userId]), db.query(q.LIST, [userId])])
  return { settings: settingsOut(settings.rows[0]), backups: backups.rows.map(out), keep: keep() }
}

const bool = (value, field) => {
  if (typeof value !== 'boolean') throw httpError('Opção de backup inválida.', STATUS.BAD_REQUEST, 'BACKUP_OPTION_INVALID', { field })
  return value
}

/** { enabled, frequency, notify } — ligar agenda o primeiro para já (a varredura é de hora em hora). */
export async function saveSettings(userId, body = {}) {
  const { rows: [current] } = await db.query(q.SETTINGS, [userId])
  const enabled = 'enabled' in body ? bool(body.enabled, 'enabled') : (current?.enabled ?? false)
  const notify = 'notify' in body ? bool(body.notify, 'notify') : (current?.notify ?? true)
  const frequency = body.frequency ?? current?.frequency ?? 'weekly'
  if (!FREQUENCY_DAYS[frequency]) throw httpError('Opção de backup inválida.', STATUS.BAD_REQUEST, 'BACKUP_OPTION_INVALID', { field: 'frequency' })

  let next = current?.next_run_at ?? null
  if (!enabled) next = null
  else if (!current?.enabled || !next) next = new Date()
  else if (frequency !== current.frequency) next = new Date(Date.now() + FREQUENCY_DAYS[frequency] * DAY_MS)

  await db.query(q.SAVE_SETTINGS, [userId, enabled, frequency, notify, next])
  return state(userId)
}

/** Backup agora (um por hora). */
export async function requestNow(userId) {
  const id = await enqueue('backup.create', { userId, trigger: 'manual' }, {
    dedupeKey: `backup:manual:${userId}:${hourBucket()}`,
    maxAttempts: 3
  })
  if (!id) {
    throw httpError('Você já pediu um backup nesta hora. Tente de novo mais tarde.', STATUS.TOO_MANY_REQUESTS, 'BACKUP_TOO_SOON', { minutes: MANUAL_GAP_MINUTES })
  }
  return { queued: true }
}

/** backups.sweep (de hora em hora): enfileira os backups vencidos. */
export async function sweep() {
  const { rows } = await db.query(q.DUE)
  let queued = 0
  for (const row of rows) {
    const key = `backup:scheduled:${row.user_id}:${new Date(row.next_run_at).toISOString()}`
    if (await enqueue('backup.create', { userId: row.user_id, trigger: 'scheduled' }, { dedupeKey: key, maxAttempts: 3 })) queued++
  }
  if (queued) logger.info('Backups automáticos enfileirados', { queued })
  return { queued }
}

/** backup.create: gera, guarda, tira os antigos e (se ligado) avisa por e-mail. */
export async function create({ userId, trigger = 'scheduled' }) {
  if (!(await entitlementService.hasPro(userId))) return { skipped: 'sem Pro' }

  const data = await exportJson(userId)
  const body = await gzipAsync(Buffer.from(JSON.stringify(data, null, 2)))
  const { rows: [row] } = await db.query(q.INSERT, [userId, trigger === 'manual' ? 'manual' : 'scheduled', data.books.length, body.length])

  try {
    await fs.mkdir(userDir(userId), { recursive: true })
    await fs.writeFile(backupPath(userId, row.id), body)
  } catch (err) {
    await db.query(q.DELETE, [row.id, userId])
    throw err
  }

  await prune(userId)

  const { rows: [settings] } = await db.query(q.SETTINGS, [userId])
  if (trigger === 'scheduled' && settings?.enabled) {
    await db.query(q.SET_NEXT, [userId, new Date(Date.now() + FREQUENCY_DAYS[settings.frequency] * DAY_MS)])
  }
  if (settings?.enabled && settings.notify) {
    await enqueue('email.send', { kind: 'backup_ready', backupId: row.id }, { dedupeKey: `email:backup-ready:${row.id}`, maxAttempts: 6 })
  }
  return { backupId: row.id, bytes: body.length }
}

async function prune(userId) {
  const { rows } = await db.query(q.OVERFLOW, [userId, keep()])
  for (const { id } of rows) {
    await db.query(q.DELETE, [id, userId])
    await fs.unlink(backupPath(userId, id)).catch(() => { })
  }
}

export async function download(userId, id) {
  const { rows: [row] } = await db.query(q.ONE, [id, userId])
  if (!row) throw httpError('Backup não encontrado.', STATUS.NOT_FOUND, 'BACKUP_NOT_FOUND')
  const day = new Date(row.created_at).toISOString().slice(0, 10)
  return { file: backupPath(userId, id), filename: `librishelf-backup-${day}.json.gz` }
}

export async function remove(userId, id) {
  const { rows: [row] } = await db.query(q.ONE, [id, userId])
  if (!row) throw httpError('Backup não encontrado.', STATUS.NOT_FOUND, 'BACKUP_NOT_FOUND')
  await db.query(q.DELETE, [id, userId])
  await fs.unlink(backupPath(userId, id)).catch(() => { })
}

/** Conta excluída: a pasta de backups inteira. */
export function removeUserFiles(userId) {
  return fs.rm(userDir(userId), { recursive: true, force: true })
}

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

/** E-mail backup_ready (job email.send), montado na hora de enviar. */
export async function backupReadyMessage({ backupId }) {
  const { rows: [row] } = await db.query(q.EMAIL, [backupId])
  if (!row) return { skip: 'backup não existe mais' }
  if (!row.notify) return { skip: 'aviso desligado' }
  if (!row.email || !row.email_verified_at) return { skip: 'e-mail não confirmado' }
  return {
    userId: row.user_id,
    to: row.email,
    name: row.name,
    locale: row.email_locale,
    params: { link: `${siteUrl()}/settings#settings-backup`, books: row.books, createdAt: row.created_at, keep: keep() }
  }
}
