import pkg from 'pg'

const { Pool } = pkg

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

pool.on('error', (err) => {
  const logMsg = `${new Date().toISOString()}[connection.js]: erro em cliente ocioso do pool — ${err.message}`
  console.error(logMsg)
})

export const db = pool