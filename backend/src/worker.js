/**
 * Processo do worker: consome a fila de jobs (librishelf.jobs).
 *
 *   npm run worker            local, lê src/.env
 *   docker compose up -d      serviço "worker", mesma imagem do backend
 *
 * Pode haver mais de um worker: cada job é pego por um só (SKIP LOCKED).
 */
import { db } from './database/connection.js'
import { pendingMigrations } from './database/migrate.js'
import { loop } from './jobs/worker.js'
import logger from './utils/logger.js'

const REQUIRED_DB_VARS = ['DB_HOST', 'DB_NAME', 'DB_USER']
const SHUTDOWN_TIMEOUT_MS = 30_000

const missing = REQUIRED_DB_VARS.filter(name => !process.env[name]?.trim())
if (missing.length) {
  logger.error('Variáveis de banco ausentes', { missing })
  process.exit(1)
}

// Mesmo cuidado do servidor: código novo com banco antigo falharia job a job
try {
  const pending = await pendingMigrations()
  if (pending.length) {
    logger.error('Banco desatualizado: há migrations pendentes. Rode as migrations e suba de novo.', { pending })
    await db.end().catch(() => { })
    process.exit(1)
  }
} catch (err) {
  logger.error('Não foi possível conectar ao banco', { message: err.message })
  process.exit(1)
}

const controller = new AbortController()

function shutdown(signal) {
  if (controller.signal.aborted) return
  logger.info('Encerrando worker', { signal })
  controller.abort()
  // O job em andamento termina; se travar, sai à força (o lock vence sozinho)
  setTimeout(() => {
    logger.error('Encerramento do worker demorou demais; saindo à força')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

await loop({ signal: controller.signal })
await db.end().catch(() => { })
process.exit(0)
