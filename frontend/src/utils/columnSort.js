/**
 * Cabeçalho de colunas do modo lista: clicar numa coluna ordena por ela;
 * clicar de novo na mesma inverte a ordem. Título começa de A a Z; datas e
 * nota, do mais recente/maior.
 */
export function nextColumnSort(field, { sortField, sortOrder }) {
  if (field === sortField) return { field, order: sortOrder === 'asc' ? 'desc' : 'asc' }
  return { field, order: field === 'title' ? 'asc' : 'desc' }
}
