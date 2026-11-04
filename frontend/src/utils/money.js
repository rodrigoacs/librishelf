/**
 * Dinheiro em centavos (inteiros), como a API guarda.
 *   parseCents('89,90') → 8990 · parseCents('1.234,5') → 123450 · parseCents('') → null
 * Aceita vírgula ou ponto como separador decimal; o último separador seguido
 * de 1 ou 2 dígitos é o decimal, os outros são de milhar.
 */
export function parseCents(text) {
  const raw = String(text ?? '').replace(/[^\d.,-]/g, '').trim()
  if (!raw) return null
  if (raw.includes('-')) return NaN
  const match = raw.match(/^(.*?)[.,](\d{1,2})$/)
  const whole = (match ? match[1] : raw).replace(/[.,]/g, '')
  const decimals = match ? match[2].padEnd(2, '0') : '00'
  if (!/^\d*$/.test(whole)) return NaN
  return Number(whole || '0') * 100 + Number(decimals)
}

/** Para preencher o campo: 8990 → "89,90" (pt) ou "89.90" (en) */
export function centsToInput(cents, locale = 'pt-BR') {
  if (cents === null || cents === undefined) return ''
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100)
}

export function formatMoney(cents, locale = 'pt-BR', currency = 'BRL') {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
