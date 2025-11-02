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

export const db = {
  query: (text, params, callback) => {
    return pool.query(text, params, callback)
  }
}

pool.on('error', (err) => {
  error(`${new Date().toISOString()}[connection.js]: ${err.message}`)
  process.exit(-1)
})  
