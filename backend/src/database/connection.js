import fs from 'fs'
import pkg from 'pg'
import logger from '../utils/logger.js'

const { Pool } = pkg

/**
 * SSL do Postgres, controlado por env:
 *   DB_SSL=true                          → liga SSL
 *   DB_SSL_REJECT_UNAUTHORIZED=false     → aceita certificado autoassinado (padrão: valida)
 *   DB_SSL_CA=/caminho/para/ca.pem       → CA própria para validar o certificado do servidor
 * Com o banco na mesma rede Docker do backend, deixar DB_SSL desligado é aceitável.
 */
function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return false

  const ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  }

  if (process.env.DB_SSL_CA) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8')
  }

  return ssl
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: buildSslConfig()
})

pool.on('error', (err) => {
  logger.error('Erro em cliente ocioso do pool de conexões', { context: 'connection.js', message: err.message })
})

export { buildSslConfig }
export const db = pool
