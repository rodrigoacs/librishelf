/**
 * Datas trafegam como 'YYYY-MM-DD'. As colunas são `timestamp without time zone`,
 * então o pg serializa meia-noite no fuso do servidor; ler pelos componentes UTC
 * e montar uma data local evita o "dia anterior" no fuso de Brasília.
 */
export function fromApiDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Date local (do Calendar) → 'YYYY-MM-DD', sem passar por UTC. */
export function toApiDate(date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return null
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
