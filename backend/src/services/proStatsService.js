import * as repo from '../repositories/proStatsRepository.js'
import { PRO_STATS_QUERIES } from '../database/queries.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'

/**
 * Estatísticas avançadas (Pro: stats_advanced). Nada aqui é guardado: tudo
 * sai das leituras já registradas. Datas no formato AAAA-MM-DD, em UTC.
 */

export const METRICS = Object.freeze(Object.keys(PRO_STATS_QUERIES.CHART_METRICS))
export const GROUPS = Object.freeze(Object.keys(PRO_STATS_QUERIES.CHART_GROUPS))
export const DIMENSIONS = Object.freeze(Object.keys(PRO_STATS_QUERIES.OVER_YEARS))
export const LENGTHS = Object.freeze(['short', 'medium', 'long', 'epic'])

const MAX_MONTHS = 120
const MAX_YEARS = 30
const MAX_CATEGORICAL = 12
const DAY_MS = 86400000

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const iso = date => date.toISOString().slice(0, 10)

function parseDate(value, field) {
  const text = typeof value === 'string' ? value.trim() : ''
  const date = DATE_RE.test(text) ? new Date(`${text}T00:00:00Z`) : null
  if (!date || Number.isNaN(date.getTime()) || iso(date) !== text) {
    throw httpError('Data inválida: use o formato AAAA-MM-DD.', STATUS.BAD_REQUEST, 'STATS_DATE_INVALID', { field })
  }
  const year = date.getUTCFullYear()
  if (year < 1900 || year > 2200) {
    throw httpError('Data inválida: use o formato AAAA-MM-DD.', STATUS.BAD_REQUEST, 'STATS_DATE_INVALID', { field })
  }
  return date
}

function parsePeriod(fromValue, toValue, prefix = '') {
  const from = parseDate(fromValue, `${prefix}from`)
  const to = parseDate(toValue, `${prefix}to`)
  if (to < from) {
    throw httpError('O fim do período precisa ser depois do início.', STATUS.BAD_REQUEST, 'STATS_PERIOD_INVALID')
  }
  return { from, to }
}

function option(value, allowed, field, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (!allowed.includes(value)) {
    throw httpError('Opção de estatística inválida.', STATUS.BAD_REQUEST, 'STATS_OPTION_INVALID', { field })
  }
  return value
}

function parseYear(value) {
  if (value === undefined || value === null || value === '') return new Date().getUTCFullYear()
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw httpError('Ano inválido: use um ano com 4 dígitos.', STATUS.BAD_REQUEST, 'YEAR_INVALID')
  }
  return year
}

// Últimos 12 meses inteiros até hoje (padrão do gráfico personalizado)
function lastTwelveMonths() {
  const today = new Date()
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const from = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() + 1, 1))
  return { from, to }
}

const round1 = value => Math.round(value * 10) / 10

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2)
}

const avg = values => (values.length ? round1(values.reduce((sum, v) => sum + v, 0) / values.length) : null)

// ---------------------------------------------------------------------------

/** Dois períodos lado a lado. */
export async function compare(userId, query = {}) {
  const a = parsePeriod(query.aFrom, query.aTo, 'a.')
  const b = parsePeriod(query.bFrom, query.bTo, 'b.')
  const [first, second] = await Promise.all([
    repo.periodSummary(userId, iso(a.from), iso(a.to)),
    repo.periodSummary(userId, iso(b.from), iso(b.to))
  ])
  return { a: first, b: second }
}

/** Ritmo de leitura no ano e previsão do que está em andamento. */
export async function pace(userId, query = {}) {
  const year = parseYear(query.year)
  const [finished, current] = await Promise.all([repo.finishedInYear(userId, year), repo.currentReadings(userId)])

  const timed = finished.filter(row => row.days !== null)
  const withPages = timed.filter(row => row.page_count)
  const pageDays = withPages.reduce((sum, row) => sum + row.days, 0)
  const book = row => (row ? { bookId: row.book_id, title: row.title, days: row.days } : null)
  const byDays = [...timed].sort((x, y) => x.days - y.days || x.id - y.id)

  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const rows = finished.filter(row => row.month === i + 1)
    const days = rows.filter(row => row.days !== null).map(row => row.days)
    return {
      month: i + 1,
      readings: rows.length,
      pages: rows.reduce((sum, row) => sum + (row.page_count || 0), 0),
      avgDays: avg(days)
    }
  })

  return {
    year,
    finished: finished.length,
    timed: timed.length,
    avgDays: avg(timed.map(row => row.days)),
    medianDays: median(timed.map(row => row.days)),
    pagesPerDay: pageDays ? round1(withPages.reduce((sum, row) => sum + row.page_count, 0) / pageDays) : null,
    fastest: book(byDays[0]),
    slowest: book(byDays.length > 1 ? byDays[byDays.length - 1] : null),
    byMonth,
    current: current.map(projection)
  }
}

// Previsão de término pelo ritmo da própria leitura: se em d dias chegou a p%,
// faltam d × (100 − p) / p dias. Sem progresso, sem previsão.
function projection(row) {
  let percent = row.progress_percent
  if (percent === null && row.current_page !== null && row.page_count) {
    percent = Math.min(100, Math.round((row.current_page / row.page_count) * 100))
  }
  let expectedOn = null
  if (percent > 0 && percent < 100) {
    const remaining = Math.ceil((row.days * (100 - percent)) / percent)
    expectedOn = iso(new Date(new Date(`${row.today}T00:00:00Z`).getTime() + remaining * DAY_MS))
  }
  return { bookId: row.book_id, title: row.title, startedOn: row.started_on, days: row.days, percent: percent ?? null, expectedOn }
}

/** Autores ou editoras ano a ano, e quantos foram lidos pela primeira vez. */
export async function overYears(userId, query = {}) {
  const dimension = option(query.dimension, DIMENSIONS, 'dimension', 'authors')
  const limit = query.limit === undefined || query.limit === '' ? 6 : Number(query.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw httpError('Opção de estatística inválida.', STATUS.BAD_REQUEST, 'STATS_OPTION_INVALID', { field: 'limit' })
  }

  const row = await repo.overYears(userId, dimension, limit)
  if (row.first_year === null) return { dimension, years: [], series: [], discovered: [], distinct: [] }

  const first = Math.max(row.first_year, row.last_year - MAX_YEARS + 1)
  const years = Array.from({ length: row.last_year - first + 1 }, (_, i) => first + i)
  const at = map => years.map(year => map?.[year] ?? 0)

  return {
    dimension,
    years,
    series: row.series.map(item => ({ name: item.name, total: item.total, counts: at(item.years) })),
    discovered: at(row.discovered),
    distinct: at(row.distinct_names)
  }
}

// Chaves fixas dos agrupamentos de tempo e escala (os zerados também aparecem)
function fixedKeys(group, from, to) {
  if (group === 'weekday') return ['1', '2', '3', '4', '5', '6', '7']
  if (group === 'rating') return ['1', '2', '3', '4', '5']
  if (group === 'length') return [...LENGTHS]
  if (group === 'year') {
    return Array.from({ length: to.getUTCFullYear() - from.getUTCFullYear() + 1 }, (_, i) => String(from.getUTCFullYear() + i))
  }
  if (group === 'month') {
    const keys = []
    for (let y = from.getUTCFullYear(), m = from.getUTCMonth(); y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth());) {
      keys.push(`${y}-${String(m + 1).padStart(2, '0')}`)
      m += 1
      if (m === 12) { m = 0; y += 1 }
    }
    return keys
  }
  return null
}

/** Gráfico personalizado: uma métrica agrupada do jeito que a pessoa escolher. */
export async function chart(userId, query = {}) {
  const metric = option(query.metric, METRICS, 'metric', 'readings')
  const group = option(query.group, GROUPS, 'group', 'month')
  const { from, to } = query.from || query.to ? parsePeriod(query.from, query.to) : lastTwelveMonths()

  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1
  if (group === 'month' && months > MAX_MONTHS) {
    throw httpError(`Período longo demais para agrupar por mês: use até ${MAX_MONTHS} meses.`, STATUS.BAD_REQUEST, 'STATS_RANGE_TOO_LONG', { max: MAX_MONTHS })
  }

  const rows = await repo.chart(userId, metric, group, iso(from), iso(to))
  const counting = metric === 'readings' || metric === 'pages'
  const keys = fixedKeys(group, from, to)
  let points

  if (keys) {
    const values = new Map(rows.map(row => [row.key, row.value]))
    points = keys.map(key => ({ key, value: values.get(key) ?? (counting ? 0 : null) }))
  } else {
    points = rows
      .filter(row => row.value !== null)
      .sort((x, y) => y.value - x.value || x.key.localeCompare(y.key))
      .slice(0, MAX_CATEGORICAL)
      .map(row => ({ key: row.key, value: row.value }))
  }

  return { metric, group, from: iso(from), to: iso(to), points }
}
