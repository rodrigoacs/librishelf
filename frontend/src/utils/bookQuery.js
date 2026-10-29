/**
 * Livro aberto na URL (?book=<id>), como na biblioteca pública: o voltar do
 * celular fecha o livro em vez de sair da tela, e dá para recarregar ou
 * mandar o link com o livro aberto.
 *
 * Abrir faz router.push (uma entrada nova no histórico); fechar volta uma
 * entrada quando foi o próprio app que abriu, e só tira o ?book= (replace)
 * quando a página já chegou com ele (recarregada ou link).
 */

/** Id do livro na query, ou null se não houver um id válido. */
export function bookIdFromQuery(query = {}) {
  const raw = Array.isArray(query.book) ? query.book[0] : query.book
  if (raw === undefined || raw === null || raw === '') return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Query com o livro aberto (mantém filtros e modo de exibição). */
export function withBook(query = {}, id) {
  return { ...query, book: String(id) }
}

/** Query sem o livro. */
export function withoutBook(query = {}) {
  const { book, ...rest } = query
  return rest
}

/**
 * Fechar com router.back()? Só se a entrada anterior do histórico for esta
 * mesma tela sem o livro (o vue-router guarda em history.state.back o
 * endereço anterior). Senão (chegou pelo link), router.replace sem o ?book=.
 */
export function closeWithBack(historyState, currentFullPath, fullPathWithoutBook) {
  if (!historyState || typeof historyState.back !== 'string') return false
  return historyState.back === fullPathWithoutBook && historyState.back !== currentFullPath
}
