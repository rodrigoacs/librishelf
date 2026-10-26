/**
 * Erros do servidor no formulário de livro → campo e mensagem traduzida.
 * O backend responde { error, code, params }: pelo código o erro vai para
 * embaixo do campo certo (e não num toast que some em poucos segundos). Sem
 * código (servidor antigo), o texto original ainda é reconhecido. O que não
 * for reconhecido volta null e vira toast, como antes.
 */

/** Ordem dos campos na tela: o primeiro com erro recebe o foco. */
export const FIELD_ORDER = ['cover', 'isbn', 'title', 'authors', 'publisher', 'pubDate', 'series', 'seriesIndex', 'pageCount', 'tags', 'statusDate', 'rating', 'notes']

const RULES = [
  { field: 'isbn', test: (msg, status) => status === 409 || /isbn/i.test(msg), key: status => (status === 409 ? 'bookForm.errors.isbnDuplicate' : 'isbn.invalid') },
  { field: 'title', test: msg => /^title\b/i.test(msg), key: () => 'bookForm.errors.titleRequired' },
  { field: 'authors', test: msg => /^authors\b|autor/i.test(msg), key: null },
  { field: 'tags', test: msg => /\btags?\b/i.test(msg), key: null },
  { field: 'pubDate', test: msg => /pubDate/.test(msg), key: () => 'bookForm.errors.invalidDate' },
  { field: 'statusDate', test: msg => /leitura não pode estar no futuro|readDate/i.test(msg), key: () => 'bookForm.errors.futureDate' },
  { field: 'seriesIndex', test: msg => /volume/i.test(msg), key: () => 'bookForm.errors.volume' },
  { field: 'series', test: msg => /série|series/i.test(msg), key: null },
  { field: 'notes', test: msg => /anotação|notes/i.test(msg), key: null },
  { field: 'rating', test: msg => /nota|rating/i.test(msg), key: () => 'bookForm.errors.rating' },
  { field: 'cover', test: msg => /imagem|image|arquivo/i.test(msg), key: () => 'bookForm.errors.coverInvalid' }
]

// Código da API → campo do formulário (null: o campo vem em params.field)
const CODE_FIELDS = {
  ISBN_TAKEN: 'isbn',
  ISBN_INVALID: 'isbn',
  AUTHORS_REQUIRED: 'authors',
  NAMES_TOO_MANY: 'authors',
  NAME_TOO_LONG: 'authors',
  READ_DATE_FUTURE: 'statusDate',
  VOLUME_INVALID: 'seriesIndex',
  PAGE_COUNT_INVALID: 'pageCount',
  READING_DATES_ORDER: 'statusDate',
  SERIES_TOO_LONG: 'series',
  NOTES_TOO_LONG: 'notes',
  RATING_INVALID: 'rating',
  IMAGE_INVALID: 'cover',
  IMAGE_ONLY: 'cover',
  IMAGE_TOO_LARGE: 'cover'
}

// params.field da API → campo do formulário
const PARAM_FIELDS = {
  title: 'title',
  isbn: 'isbn',
  publisher: 'publisher',
  pubDate: 'pubDate',
  publicationDate: 'pubDate',
  readDate: 'statusDate',
  startedAt: 'statusDate',
  startedOn: 'statusDate',
  finishedOn: 'statusDate',
  series: 'series',
  notes: 'notes'
}

function fieldFromCode(error) {
  const code = error?.code
  if (!code) return null
  if (CODE_FIELDS[code]) return CODE_FIELDS[code]
  const param = error.body?.params?.field
  if (['FIELD_REQUIRED', 'FIELD_INVALID', 'FIELD_TOO_LONG', 'DATE_INVALID', 'DATE_OUT_OF_RANGE'].includes(code) && PARAM_FIELDS[param]) return PARAM_FIELDS[param]
  return null
}

export function fieldErrorFromApi(error, t) {
  const status = error?.status
  if (status !== 400 && status !== 409) return null

  // Já traduzida pelo fetchClient a partir do código
  const byCode = fieldFromCode(error)
  if (byCode) return { field: byCode, message: error.message }

  const message = String(error?.body?.error || error?.message || '')
  const rule = RULES.find(item => item.test(message, status))
  if (!rule) return null
  return { field: rule.field, message: rule.key ? t(rule.key(status)) : message }
}
