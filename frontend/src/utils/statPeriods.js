/**
 * Períodos das estatísticas avançadas (Pro). Tudo em data local do aparelho,
 * no formato que a API espera (AAAA-MM-DD).
 */

export const isoDate = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const fromIso = text => {
  const [y, m, d] = String(text).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const day = (y, m, d) => new Date(y, m, d)

// Mesmo dia/mês em outro ano (29/02 vira 28/02)
function sameDayIn(year, date) {
  const last = new Date(year, date.getMonth() + 1, 0).getDate()
  return day(year, date.getMonth(), Math.min(date.getDate(), last))
}

const period = (from, to) => ({ from: isoDate(from), to: isoDate(to) })

/** Comparações prontas: [a, b], com b o período mais recente. */
export const COMPARE_PRESETS = ['yearToDate', 'lastYears', 'monthToDate', 'rolling']

export function comparePeriods(preset, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()
  switch (preset) {
    case 'lastYears':
      return [period(day(y - 2, 0, 1), day(y - 2, 11, 31)), period(day(y - 1, 0, 1), day(y - 1, 11, 31))]
    case 'monthToDate':
      return [period(day(y - 1, m, 1), sameDayIn(y - 1, today)), period(day(y, m, 1), today)]
    case 'rolling': {
      const start = day(y, m - 11, 1)
      return [period(day(y, m - 23, 1), day(y, m - 11, 0)), period(start, today)]
    }
    default: // yearToDate
      return [period(day(y - 1, 0, 1), sameDayIn(y - 1, today)), period(day(y, 0, 1), today)]
  }
}

/** Períodos do gráfico personalizado. */
export const CHART_PERIODS = ['last12', 'thisYear', 'lastYear', 'last5']

export function chartPeriod(preset, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()
  switch (preset) {
    case 'thisYear': return period(day(y, 0, 1), today)
    case 'lastYear': return period(day(y - 1, 0, 1), day(y - 1, 11, 31))
    case 'last5': return period(day(y - 4, 0, 1), today)
    default: return period(day(y, m - 11, 1), today) // last12
  }
}

/** "1 de jan. – 2 de nov. de 2026" (ou o mais curto que o navegador souber). */
export function formatRange(from, to, locale) {
  const options = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = fromIso(from)
  const b = fromIso(to)
  try {
    return new Intl.DateTimeFormat(locale, options).formatRange(a, b)
  } catch {
    const f = new Intl.DateTimeFormat(locale, options)
    return `${f.format(a)} – ${f.format(b)}`
  }
}

/** Variação de b em relação a a: { text, tone } (tone: up, down ou vazio). */
export function change(a, b, { percent = true, decimals = 0, locale } = {}) {
  if (a === null || b === null || a === undefined || b === undefined) return { text: '—', tone: '' }
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, signDisplay: 'exceptZero' })
  if (percent) {
    if (a === 0) return { text: b === 0 ? '0%' : '—', tone: b > 0 ? 'up' : '' }
    const value = ((b - a) / a) * 100
    return { text: `${nf.format(Math.round(value))}%`, tone: value > 0 ? 'up' : value < 0 ? 'down' : '' }
  }
  const diff = b - a
  return { text: nf.format(Number(diff.toFixed(decimals))), tone: diff > 0 ? 'up' : diff < 0 ? 'down' : '' }
}
