import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Opções e rótulos dos filtros da biblioteca, usados pelo cabeçalho, pela
// gaveta de filtros e pelos chips (cada um chama o seu; tudo segue o idioma).

const FIRST_YEAR = 1950

const READ_STATE_KEYS = {
  all: 'library.all',
  want: 'status.want',
  reading: 'status.reading',
  read: 'library.read',
  unread: 'library.unread'
}

/** Ano de leitura escolhido (o padrão é 'all'). */
export const hasReadYear = filters => Boolean(filters.readYear) && filters.readYear !== 'all'

export function useLibraryFilterOptions() {
  const { t, locale } = useI18n()

  const sortOptions = computed(() => [
    { label: t('library.sort.recent'), value: 'recent' },
    { label: t('library.sort.title'), value: 'title' },
    { label: t('library.sort.author'), value: 'authors' },
    { label: t('library.sort.read_date'), value: 'readDate' },
    { label: t('library.sort.pub_date'), value: 'pubDate' },
    { label: t('library.sort.rating'), value: 'rating' },
    { label: t('library.sort.series'), value: 'series' }
  ])

  const readStateOptions = computed(() =>
    ['all', 'want', 'reading', 'read', 'unread'].map(value => ({ value, label: t(READ_STATE_KEYS[value]) }))
  )

  const yearOptions = computed(() => {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => {
      const year = String(currentYear - i)
      return { label: year, value: year }
    })
    return [{ label: t('library.sort.all_years'), value: 'all' }, ...years]
  })

  function readStateLabel(value) {
    return t(READ_STATE_KEYS[value] ?? 'library.all')
  }

  // "Lidos em 2025" ou "Lidos em março de 2025" (quando veio do gráfico mensal).
  function readPeriodLabel({ readYear, readMonth }) {
    if (!readMonth) return t('library.read_year_chip', { year: readYear })
    const month = new Date(Number(readYear), readMonth - 1, 1)
      .toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' })
    return t('library.read_month_chip', { period: month })
  }

  return { sortOptions, readStateOptions, yearOptions, readStateLabel, readPeriodLabel }
}
