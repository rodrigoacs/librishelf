import pkg from 'pg'
import { info, error } from '../utils/logger.js'

const { Pool } = pkg
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

export function dbConnect(callback) {
  pool.connect((err, client, release) => {
    if (err) {
      error(`Error connecting to the database: ${err.message}`)
      callback(err, null)
    } else {
      info('Database connection established.')
      callback(null, client, release)
    }
  })
}

export function dbClose(client) {
  client.release((err) => {
    if (err) {
      error(`Error closing the database connection: ${err.message}`)
    } else {
      info('Database connection closed.')
    }
  })
}
