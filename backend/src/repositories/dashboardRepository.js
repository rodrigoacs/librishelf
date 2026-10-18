import { db } from "../database/connection.js"
import { DASHBOARD_QUERIES as q, GOAL_QUERIES } from "../database/queries.js"

export async function getDashboardStats(userId, year) {
  const { rows } = await db.query(q.STATS, [userId, year])
  const row = rows[0]

  return {
    year,
    totalBooks: row.total_books,
    readBooks: row.read_books,
    readingBooks: row.reading_books,
    wantBooks: row.want_books,
    goal: row.goal_target ?? null,
    readingByYear: row.reading_by_year,
    readingByMonth: row.reading_by_month,
    topAuthors: row.top_authors,
    topTags: row.top_tags,
    topPublishers: row.top_publishers,
    invalidIsbn: row.invalid_isbn
  }
}

export async function upsertGoal(userId, year, target) {
  const { rows } = await db.query(GOAL_QUERIES.UPSERT, [userId, year, target])
  return rows[0]
}

export async function deleteGoal(userId, year) {
  await db.query(GOAL_QUERIES.DELETE, [userId, year])
}
