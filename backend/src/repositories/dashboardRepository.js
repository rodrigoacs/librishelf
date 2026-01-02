import { db } from "../database/connection.js"
import { DASHBOARD_QUERIES as q } from "../database/queries.js"

export async function getDashboardStats(userId) {
  const [totalRes, readRes, yearsRes, authorsRes, tagsRes] = await Promise.all([
    db.query(q.COUNT_TOTAL, [userId]),
    db.query(q.COUNT_READ, [userId]),
    db.query(q.READ_BY_YEAR, [userId]),
    db.query(q.TOP_AUTHORS, [userId]),
    db.query(q.TOP_TAGS, [userId])
  ])

  return {
    totalBooks: parseInt(totalRes.rows[0].count),
    readBooks: parseInt(readRes.rows[0].count),
    readingByYear: yearsRes.rows,
    topAuthors: authorsRes.rows,
    topTags: tagsRes.rows
  }
}