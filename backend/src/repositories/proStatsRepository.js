import { db } from '../database/connection.js'
import { PRO_STATS_QUERIES as q } from '../database/queries.js'

const top = list => list.map(item => ({ name: item.name, count: item.count }))

export async function periodSummary(userId, from, to) {
  const { rows: [row] } = await db.query(q.PERIOD, [userId, from, to])
  return {
    from,
    to,
    readings: row.readings,
    books: row.books,
    pages: row.pages,
    avgRating: row.avg_rating,
    avgDays: row.avg_days,
    rereads: row.rereads,
    topAuthors: top(row.top_authors),
    topPublishers: top(row.top_publishers),
    topCategories: top(row.top_categories)
  }
}

export async function finishedInYear(userId, year) {
  const { rows } = await db.query(q.PACE_FINISHED, [userId, year])
  return rows
}

export async function currentReadings(userId) {
  const { rows } = await db.query(q.PACE_CURRENT, [userId])
  return rows
}

export async function overYears(userId, dimension, limit) {
  const { rows: [row] } = await db.query(q.OVER_YEARS[dimension], [userId, limit])
  return row
}

export async function chart(userId, metric, group, from, to) {
  const { rows } = await db.query(q.CHART(metric, group), [userId, from, to])
  return rows
}
