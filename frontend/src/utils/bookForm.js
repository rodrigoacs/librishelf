import { localDate, toApiDate } from './dates.js'

/**
 * Regras do formulário de livro (components/book/BookEditForm.vue), sem Vue:
 * validação, preenchimento pelo ISBN/busca e o que vai para a API.
 * `form` é o estado do formulário: { title, authorNames, publisher, tags,
 * isbn, pubdate, rating, series, series_index, notes, pageCount }.
 */

export function blankBookForm() {
  return { title: '', authorNames: [], publisher: '', tags: '', isbn: '', pubdate: null, rating: null, series: '', series_index: '', notes: '', pageCount: '' }
}

const datedStatus = status => status === 'read' || status === 'reading'

/**
 * Erros antes de enviar → { campo: chave do i18n }; vazio quando está tudo
 * certo. O servidor confere de novo (utils/bookFormErrors.js traduz a volta).
 */
export function validateBookForm(form, { status, statusDate, today = new Date() }) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'bookForm.errors.titleRequired'
  if (form.authorNames.length === 0) errors.authors = 'bookForm.errors.authorsRequired'
  const volume = String(form.series_index ?? '').trim()
  if (volume) {
    const number = Number(volume.replace(',', '.'))
    if (!Number.isFinite(number) || number < 0 || number > 9999) errors.seriesIndex = 'bookForm.errors.volume'
  }
  const pages = String(form.pageCount ?? '').trim()
  if (pages && (!/^\d{1,5}$/.test(pages) || Number(pages) < 1 || Number(pages) > 20000)) {
    errors.pageCount = 'bookForm.errors.pages'
  }
  // Compara só o dia (texto YYYY-MM-DD), sem a hora
  if (statusDate && datedStatus(status) && toApiDate(statusDate) > toApiDate(today)) {
    errors.statusDate = 'bookForm.errors.futureDate'
  }
  return errors
}

/**
 * Dados achados pelo ISBN ou pela busca por título: preenche só os campos
 * vazios (o que a pessoa já digitou tem prioridade). `found` no formato da
 * API: { title, authors, publisher, pubDate, isbn13, pages }.
 */
export function fillEmptyFields(form, found) {
  if (!form.title.trim() && found.title) form.title = found.title
  if (form.authorNames.length === 0 && found.authors?.length) form.authorNames = [...found.authors]
  if (!form.publisher.trim() && found.publisher) form.publisher = found.publisher
  if (!form.pubdate && found.pubDate) form.pubdate = localDate(found.pubDate)
  if (!form.isbn.trim() && found.isbn13) form.isbn = found.isbn13
  if (!String(form.pageCount).trim() && found.pages) form.pageCount = String(found.pages)
}

/**
 * Corpo do POST /library (multipart). `openLibrary`: as chaves achadas pelo
 * ISBN, só quando ainda valem para o ISBN do formulário; `cover`: o arquivo
 * escolhido (tem prioridade sobre a capa do Open Library).
 */
export function createBookData(form, { readDate, openLibrary, cover }) {
  const data = new FormData()
  data.append('title', form.title.trim())
  // Um campo "authors" por autor: nomes podem conter vírgula.
  form.authorNames.forEach(name => data.append('authors', name))
  data.append('publisher', form.publisher || '')
  data.append('isbn', form.isbn || '')
  data.append('tags', form.tags || '')
  if (form.pubdate) data.append('pubDate', toApiDate(form.pubdate))
  if (readDate) data.append('readDate', readDate)
  if (form.rating) data.append('rating', String(form.rating))
  if (form.series?.trim()) data.append('series', form.series.trim())
  if (String(form.series_index ?? '').trim()) data.append('seriesIndex', String(form.series_index).trim())
  if (form.notes?.trim()) data.append('notes', form.notes)
  if (String(form.pageCount).trim()) data.append('pageCount', String(form.pageCount).trim())

  if (openLibrary) {
    if (openLibrary.olWorkKey) data.append('olWorkKey', openLibrary.olWorkKey)
    if (openLibrary.olEditionKey) data.append('olEditionKey', openLibrary.olEditionKey)
    if (!cover && openLibrary.coverId) data.append('olCoverId', String(openLibrary.coverId))
  }
  if (cover) data.append('coverImage', cover)
  return data
}

/** Corpo do PUT /library/:id (JSON) */
export function updateBookPayload(form, { readDate }) {
  return {
    title: form.title.trim(),
    authors: form.authorNames,
    publisher: form.publisher,
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    isbn: form.isbn,
    rating: form.rating,
    pubDate: toApiDate(form.pubdate),
    readDate,
    series: (form.series || '').trim(),
    seriesIndex: String(form.series_index ?? '').trim() || null,
    notes: form.notes || '',
    pageCount: String(form.pageCount ?? '').trim() || null
  }
}
