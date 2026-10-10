import { db } from "../database/connection.js"
import { DASHBOARD_QUERIES as q } from "../database/queries.js"

export async function getDashboardStats(userId) {
  const { rows } = await db.query(q.STATS, [userId])
  const row = rows[0]

  return {
    totalBooks: row.total_books,
    readBooks: row.read_books,
    readingByYear: row.reading_by_year,
    topAuthors: row.top_authors,
    topTags: row.top_tags,
    invalidIsbn: row.invalid_isbn
  }
}
