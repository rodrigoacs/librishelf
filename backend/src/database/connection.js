import pkg from 'pg'
import { error } from '../utils/logger.js'

const { Pool } = pkg

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

pool.on('error', (err) => {
  const logMsg = `${new Date().toISOString()}[connection.js]: ${err.message}`
  if (typeof error === 'function') {
    error(logMsg)
  } else {
    console.error(logMsg)
  }
  process.exit(-1)
})

export const db = pool