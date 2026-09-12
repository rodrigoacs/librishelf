import pkg from 'pg'
import logger from '../utils/logger.js'

const { Pool } = pkg

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

pool.on('error', (err) => {
  logger.error('Erro em cliente ocioso do pool de conexões', { context: 'connection.js', message: err.message })
})

export const db = pool