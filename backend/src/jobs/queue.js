import os from 'node:os'
import { db } from '../database/connection.js'
import { JOB_QUERIES as q } from '../database/queries.js'

/**
 * Fila de jobs no Postgres (tabela librishelf.jobs, sem Redis).
 *
 *   enqueue('email.send', { … })                          agora
 *   enqueue('x', {}, { runAt: date })                     depois
 *   enqueue('x', {}, { dedupeKey: 'renewal:42' })         uma vez só, para sempre
 *
 * `client` opcional: enfileirar dentro da mesma transação de outra escrita
 * (o job só existe se a escrita for confirmada).
 */
export const DEFAULT_MAX_ATTEMPTS = 5
// Lock mais velho que isso = worker morreu no meio do job
export const STALE_LOCK_SECONDS = Number(process.env.JOB_STALE_LOCK_SECONDS) || 10 * 60
const MAX_BACKOFF_SECONDS = 60 * 60

export const workerId = () => `${os.hostname()}:${process.pid}`

/** → id do job, ou null se a dedupe_key já existia */
export async function enqueue(type, payload = {}, { runAt = null, dedupeKey = null, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}, client = db) {
  const { rows } = await client.query(q.ENQUEUE, [type, JSON.stringify(payload), runAt, dedupeKey, maxAttempts])
  return rows[0]?.id ?? null
}

/** Pega o próximo job pronto (ou null). `types` limita a alguns tipos. */
export async function claim(worker, { types = null, staleSeconds = STALE_LOCK_SECONDS } = {}) {
  const { rows } = await db.query(q.CLAIM, [worker, staleSeconds, types])
  return rows[0] || null
}

export async function complete(job, worker) {
  await db.query(q.COMPLETE, [job.id, worker])
}

/** 30s, 1min, 2min, 4min… até 1h */
export function backoffSeconds(attempts) {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_SECONDS)
}

/** → true se desistiu de vez (failed_at); permanent: não tenta de novo */
export async function fail(job, worker, error, { permanent = false } = {}) {
  const message = String(error?.message || error).slice(0, 2000)
  const { rows } = await db.query(q.FAIL, [job.id, worker, message, permanent, backoffSeconds(job.attempts)])
  return rows[0]?.gave_up ?? false
}

export async function cleanup(days) {
  const { rowCount } = await db.query(q.CLEANUP, [days])
  return rowCount
}

export async function stats() {
  const { rows } = await db.query(q.STATS)
  return rows
}
