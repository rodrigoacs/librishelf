import { db } from '../../src/database/connection.js'

export async function clearDatabase() {
  if (process.env.NODE_ENV === 'test') {
    await db.query('TRUNCATE TABLE librishelf.books_authors_link, librishelf.books_tags_link, librishelf.books, librishelf.authors, librishelf.publishers, librishelf.tags, librishelf.users RESTART IDENTITY CASCADE')
  }
}

export async function closeDatabase() {
  await db.end()
}