import sqlite3 from 'sqlite3'

const DB_PATH = '/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/metadata.db'

export function dbConnect() {
  return new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error connecting to the database: ${err.message}`)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Connected to the database.`)
    }
  })
}

export function dbClose(db) {
  db.close((err) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error closing the database connection: ${err.message}`)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Database connection closed.`)
    }
  })
}
