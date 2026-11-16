import { localDate } from '../../utils/dates.js'
import { useI18n } from 'vue-i18n'

/**
 * Formatação comum às seções do "Seu ano em livros" (números, nota, meses e
 * datas curtas), no idioma da interface.
 */
export function useYearFormat() {
  const { locale } = useI18n()
  const formatNumber = value => Number(value).toLocaleString(locale.value)
  const formatDecimal = value => Number(value).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const monthName = month => new Date(2000, month - 1, 1).toLocaleDateString(locale.value, { month: 'long' })
  const monthShort = month => new Date(2000, month - 1, 1).toLocaleDateString(locale.value, { month: 'narrow' })

  const dateLabel = iso => (iso ? localDate(iso).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' }) : '')

  return { formatNumber, formatDecimal, monthName, monthShort, dateLabel }
}
