import app from './app.js'
import logger from './utils/logger.js'
import { db } from './database/connection.js'
import { pendingMigrations } from './database/migrate.js'
import { verifySmtp } from './services/mailService.js'
import { deleteStale as deleteStaleTokens } from './repositories/tokenRepository.js'

const PORT = process.env.PORT || 3050
const MIN_SECRET_LENGTH = 32
const REQUIRED_DB_VARS = ['DB_HOST', 'DB_NAME', 'DB_USER']
const SHUTDOWN_TIMEOUT_MS = 10_000

function validateEnv() {
  const secret = process.env.SECRET_KEY

  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    logger.error('SECRET_KEY ausente ou fraca', { minLength: MIN_SECRET_LENGTH })
    process.exit(1)
  }

  const missingDbVars = REQUIRED_DB_VARS.filter(name => !process.env[name]?.trim())

  if (missingDbVars.length > 0) {
    logger.error('Variáveis de banco ausentes', { missing: missingDbVars })
    process.exit(1)
  }

  // Sem isso os links dos e-mails apontam para localhost.
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL?.trim()) {
    logger.warn('APP_URL não definido: os links dos e-mails vão apontar para http://localhost:5173')
  }
  if (!process.env.SMTP_HOST?.trim()) {
    logger.warn('SMTP_HOST não definido: e-mails de senha e confirmação só aparecem no log')
  }
}

// Código novo com banco antigo responde 500 em toda rota que usa colunas
// novas (ex.: /auth/me). Melhor não subir e dizer o que fazer.
async function ensureDatabaseIsMigrated() {
  let pending
  try {
    pending = await pendingMigrations()
  } catch (err) {
    logger.error('Não foi possível conectar ao banco', { message: err.message })
    process.exit(1)
  }

  if (pending.length > 0) {
    logger.error('Banco desatualizado: há migrations pendentes. Rode "npm run db:migrate" (local) ou "docker compose run --rm backend npm run db:migrate:docker" e suba de novo.', { pending })
    await db.end().catch(() => { })
    process.exit(1)
  }
}

validateEnv()
await ensureDatabaseIsMigrated()

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
})

verifySmtp()

// Links de e-mail vencidos ou usados saem do banco uma vez por dia.
const TOKEN_CLEANUP_MS = 24 * 60 * 60 * 1000
setInterval(() => {
  deleteStaleTokens()
    .then(removed => { if (removed) logger.info('Links de e-mail antigos removidos', { removed }) })
    .catch(err => logger.warn('Falha ao limpar links de e-mail antigos', { message: err.message }))
}, TOKEN_CLEANUP_MS).unref()

// `docker stop` manda SIGTERM: para de aceitar conexões, termina as requisições
// em andamento e fecha o pool antes de sair, em vez de esperar o SIGKILL.
let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  logger.info('Encerrando', { signal })

  const forceExit = setTimeout(() => {
    logger.error('Encerramento demorou demais; saindo à força')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  server.close(async () => {
    try {
      await db.end()
    } finally {
      process.exit(0)
    }
  })
  server.closeIdleConnections?.()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))