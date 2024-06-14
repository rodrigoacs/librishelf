import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  user: 'acs',
  host: '195.200.2.145',
  database: 'librishelf',
  password: 'acs1405',
  port: 5432,
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
