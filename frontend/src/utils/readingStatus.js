/**
 * Status de leitura de um livro, como o app mostra:
 *   reading → "Lendo"  (vale mesmo se o livro já foi lido antes: releitura)
 *   read    → "Lido"
 *   want    → "Quero ler"
 *   none    → só na estante
 */
export function statusOf(book) {
  if (!book) return 'none'
  if (book.reading_status === 'reading') return 'reading'
  if (book.read_date) return 'read'
  if (book.reading_status === 'want') return 'want'
  return 'none'
}

/** Ordem em que os status aparecem nos seletores. */
export const STATUS_OPTIONS = ['want', 'reading', 'read']

export const STATUS_ICONS = {
  none: 'pi pi-book',
  want: 'pi pi-bookmark',
  reading: 'pi pi-book',
  read: 'pi pi-check'
}
