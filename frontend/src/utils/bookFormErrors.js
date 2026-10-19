/**
 * Erros do servidor no formulário de livro → campo e mensagem traduzida.
 * O backend responde { error: 'texto' } com o status HTTP; aqui o texto é
 * reconhecido para mostrar o erro embaixo do campo certo (e não num toast
 * que some em poucos segundos). O que não for reconhecido volta null e vira
 * toast, como antes.
 */

/** Ordem dos campos na tela: o primeiro com erro recebe o foco. */
export const FIELD_ORDER = ['cover', 'isbn', 'title', 'authors', 'publisher', 'pubDate', 'series', 'seriesIndex', 'tags', 'statusDate', 'rating', 'notes']

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

export function fieldErrorFromApi(error, t) {
  const status = error?.status
  if (status !== 400 && status !== 409) return null
  const message = String(error?.message || '')
  const rule = RULES.find(item => item.test(message, status))
  if (!rule) return null
  return { field: rule.field, message: rule.key ? t(rule.key(status)) : message }
}
