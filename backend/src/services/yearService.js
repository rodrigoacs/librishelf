import { db } from '../database/connection.js'
import { YEAR_QUERIES as q } from '../database/queries.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'

/**
 * "Seu ano em livros": tudo o que foi terminado no ano (releitura conta de
 * novo, como no painel). Disponível o ano todo — no ano corrente é "até
 * agora". A imagem para stories é desenhada no navegador com estes dados.
 */
const DAY = 24 * 60 * 60 * 1000
const TOP_RATED = 5
const COVERS = 9

function normalizeYear(value) {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw httpError('Ano inválido: use um ano com 4 dígitos.', STATUS.BAD_REQUEST, 'YEAR_INVALID')
  }
  return year
}

// Datas do tipo DATE chegam do pg como Date à meia-noite local; o texto
// "AAAA-MM-DD" evita escorregar um dia por fuso.
function isoDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const pad = n => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function daysBetween(start, end) {
  if (!start || !end) return null
  return Math.round((Date.parse(`${isoDate(end)}T00:00:00Z`) - Date.parse(`${isoDate(start)}T00:00:00Z`)) / DAY)
}

function toBook(row) {
  return {
    bookId: row.book_id,
    title: row.title,
    authors: row.authors,
    rating: row.rating,
    pages: row.page_count,
    finishedOn: isoDate(row.finished_on)
  }
}

export async function yearInBooks(userId, rawYear) {
  const year = normalizeYear(rawYear)
  const [finished, authors, tags, years, previous, goal, reviews] = await Promise.all([
    db.query(q.FINISHED, [userId, year]),
    db.query(q.TOP_AUTHORS, [userId, year]),
    db.query(q.TOP_TAGS, [userId, year]),
    db.query(q.YEARS, [userId]),
    db.query(q.PREVIOUS_COUNT, [userId, year]),
    db.query(q.GOAL, [userId, year]),
    db.query(q.REVIEWS, [userId, year])
  ])
  const rows = finished.rows
  const currentYear = new Date().getFullYear()

  const months = Array.from({ length: 12 }, () => 0)
  for (const row of rows) months[Number(isoDate(row.finished_on).slice(5, 7)) - 1]++
  const busiest = Math.max(...months)

  const withPages = rows.filter(row => row.page_count)
  const rated = rows.filter(row => row.rating)
  const durations = rows
    .map(row => ({ row, days: daysBetween(row.started_on, row.finished_on) }))
    .filter(item => item.days !== null && item.days >= 0)

  // Mais bem avaliados: um por livro (a releitura não repete o livro)
  const seen = new Set()
  const byRating = [...rows]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || isoDate(b.finished_on).localeCompare(isoDate(a.finished_on)))
    .filter(row => (seen.has(row.book_id) ? false : seen.add(row.book_id)))

  const longest = withPages.reduce((best, row) => (!best || row.page_count > best.page_count ? row : best), null)
  const shortest = withPages.reduce((best, row) => (!best || row.page_count < best.page_count ? row : best), null)
  const fastest = durations.reduce((best, item) => (!best || item.days < best.days ? item : best), null)

  const availableYears = [...new Set([currentYear, ...years.rows.map(row => row.year)])].sort((a, b) => b - a)

  return {
    year,
    isCurrentYear: year === currentYear,
    years: availableYears,
    totals: {
      readings: rows.length,
      books: new Set(rows.map(row => row.book_id)).size,
      rereads: rows.filter(row => row.reread).length,
      pages: withPages.reduce((sum, row) => sum + row.page_count, 0),
      // Livros sem número de páginas não entram na soma
      pagesMissing: rows.length - withPages.length,
      averageRating: rated.length ? Math.round((rated.reduce((sum, row) => sum + row.rating, 0) / rated.length) * 10) / 10 : null,
      rated: rated.length,
      reviews: reviews.rows[0].total
    },
    months,
    busiestMonth: busiest > 0 ? { month: months.indexOf(busiest) + 1, count: busiest } : null,
    previousYear: previous.rows[0].total,
    goal: goal.rows[0] ? { target: goal.rows[0].target, done: rows.length } : null,
    topRated: byRating.filter(row => row.rating).slice(0, TOP_RATED).map(toBook),
    authors: authors.rows,
    tags: tags.rows,
    longest: longest ? toBook(longest) : null,
    shortest: shortest && shortest !== longest ? toBook(shortest) : null,
    fastest: fastest ? { ...toBook(fastest.row), days: fastest.days } : null,
    averageDays: durations.length ? Math.round(durations.reduce((sum, item) => sum + item.days, 0) / durations.length) : null,
    first: rows.length ? toBook(rows[0]) : null,
    last: rows.length > 1 ? toBook(rows[rows.length - 1]) : null,
    // Capas para a imagem: as mais bem avaliadas primeiro, sem repetir
    covers: byRating.slice(0, COVERS).map(row => ({ bookId: row.book_id, title: row.title, authors: row.authors }))
  }
}
