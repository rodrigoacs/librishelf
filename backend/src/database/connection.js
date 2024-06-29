import pkg from 'pg'

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
      console.error(`[${new Date().toLocaleTimeString()}] Error connecting to the database: ${err.message}`)
      callback(err, null)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Connected to the database.`)
      callback(null, client, release)
    }
  })
}

export function dbClose(client) {
  client.release((err) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error closing the database connection: ${err.message}`)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Database connection closed.`)
    }
  })
}
