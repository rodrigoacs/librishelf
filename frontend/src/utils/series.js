/** "Duna #2", "Duna #1,5" (pt) ou só "Duna" quando não há volume. */
export function seriesText(book, t, locale) {
  if (!book?.series) return ''
  const index = book.series_index
  if (index === null || index === undefined || index === '') return book.series
  const number = Number(String(index).replace(',', '.'))
  const n = Number.isFinite(number) ? number.toLocaleString(locale) : String(index)
  return t('series.label', { series: book.series, n })
}
