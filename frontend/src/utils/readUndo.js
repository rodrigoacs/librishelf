/**
 * "Desfazer" do marcar/desmarcar como lido rápido (card e linha da lista).
 * Recebe o status de antes e as leituras de antes (GET /library/:id/readings)
 * e devolve os passos que voltam exatamente ao estado anterior:
 *
 *   era Lido   → desmarcar apagou a última leitura concluída: recriar igual
 *   era Lendo  → marcar fechou a leitura em andamento: reabrir (mantém início e progresso)
 *   era nada / Quero ler → marcar criou uma leitura: apagar (e voltar o "Quero ler")
 *
 * Passos: { op: 'add', reading } | { op: 'reopen', readingId } | { op: 'unread' } | { op: 'want' }
 * Sem as leituras de antes (a busca falhou) não há como desfazer: null.
 */
export function readUndoSteps(prevStatus, readingsBefore) {
  if (!Array.isArray(readingsBefore)) return null
  if (prevStatus === 'read') {
    const last = readingsBefore
      .filter(reading => reading.finishedOn)
      .sort((a, b) => (a.finishedOn === b.finishedOn ? b.id - a.id : (a.finishedOn < b.finishedOn ? 1 : -1)))[0]
    if (!last) return null
    return [{ op: 'add', reading: { startedOn: last.startedOn ?? null, finishedOn: last.finishedOn, rating: last.rating ?? null } }]
  }
  if (prevStatus === 'reading') {
    const open = readingsBefore.find(reading => !reading.finishedOn)
    return open ? [{ op: 'reopen', readingId: open.id }] : null
  }
  return prevStatus === 'want' ? [{ op: 'unread' }, { op: 'want' }] : [{ op: 'unread' }]
}
