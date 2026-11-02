import fs from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import * as queue from './queue.js'
import { HANDLERS, RECURRING, PermanentJobError, RetryLaterError } from './registry.js'
import logger from '../utils/logger.js'

export const POLL_MS = Number(process.env.JOB_POLL_MS) || 5000
// O healthcheck do Compose confere a idade deste arquivo
export const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || '/tmp/librishelf-worker-heartbeat'

/** Início do intervalo atual, em ISO até os minutos: "2026-11-02T14:15" */
export function bucketOf(everyMinutes, now = Date.now()) {
  const size = everyMinutes * 60 * 1000
  return new Date(Math.floor(now / size) * size).toISOString().slice(0, 16)
}

/** Agenda os periódicos do intervalo atual (idempotente). → quantos entraram */
export async function scheduleRecurring(now = Date.now()) {
  let created = 0
  for (const { type, everyMinutes } of RECURRING) {
    const id = await queue.enqueue(type, {}, { dedupeKey: `${type}:${bucketOf(everyMinutes, now)}`, maxAttempts: 3 })
    if (id) created++
  }
  return created
}

/** Roda um job, se houver. → { id, type, status } ou null se a fila está vazia */
export async function runOnce(worker = queue.workerId(), options = {}) {
  const job = await queue.claim(worker, options)
  if (!job) return null

  const handler = HANDLERS[job.type]
  const started = Date.now()

  if (!handler) {
    await queue.fail(job, worker, new Error(`Tipo de job sem handler: ${job.type}`), { permanent: true })
    logger.error('Job sem handler', { id: job.id, type: job.type })
    return { id: job.id, type: job.type, status: 'failed' }
  }

  try {
    const result = await handler(job.payload, job)
    await queue.complete(job, worker)
    logger.debug('Job concluído', { id: job.id, type: job.type, ms: Date.now() - started, result })
    return { id: job.id, type: job.type, status: 'done', result }
  } catch (err) {
    if (err instanceof RetryLaterError) {
      await queue.defer(job, worker, err.seconds)
      logger.debug('Job adiado', { id: job.id, type: job.type, seconds: err.seconds, message: err.message })
      return { id: job.id, type: job.type, status: 'deferred' }
    }
    const gaveUp = await queue.fail(job, worker, err, { permanent: err instanceof PermanentJobError })
    logger[gaveUp ? 'error' : 'warn'](gaveUp ? 'Job falhou de vez' : 'Job falhou; vai tentar de novo', {
      id: job.id, type: job.type, attempt: job.attempts, message: err.message
    })
    return { id: job.id, type: job.type, status: gaveUp ? 'failed' : 'retry' }
  }
}

/** Esvazia a fila do que está pronto agora (testes e "rodar na mão"). */
export async function drain(worker, options) {
  const results = []
  for (let result = await runOnce(worker, options); result; result = await runOnce(worker, options)) {
    results.push(result)
  }
  return results
}

async function heartbeat() {
  await fs.writeFile(HEARTBEAT_FILE, String(Date.now())).catch(() => { })
}

/**
 * Laço do worker: agenda os periódicos, roda tudo o que está pronto e espera
 * POLL_MS. `signal` (AbortSignal) encerra depois do job em andamento.
 */
export async function loop({ signal, worker = queue.workerId() } = {}) {
  logger.info('Worker iniciado', { worker, pollMs: POLL_MS })

  while (!signal?.aborted) {
    try {
      await scheduleRecurring()
      while (!signal?.aborted && await runOnce(worker)) { /* próximo */ }
    } catch (err) {
      // Banco fora do ar etc.: espera e tenta de novo, sem derrubar o processo
      logger.error('Falha no laço do worker', { message: err.message })
    }
    await heartbeat()
    await sleep(POLL_MS, undefined, { signal }).catch(() => { })
  }

  logger.info('Worker parado', { worker })
}
