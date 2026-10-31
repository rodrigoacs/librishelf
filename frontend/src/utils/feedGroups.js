/**
 * Feed da comunidade agrupado por dia, juntando eventos repetidos:
 * "@lalmeida adicionou 4 livros" em vez de quatro linhas iguais.
 *
 * events: [{ type, at, date?, username, isPublic, bookId, title, authors, rating, review?, list? }]
 * (do mais novo para o mais antigo, como vem de GET /social/feed). Leituras
 * trazem `date` ('YYYY-MM-DD', o dia escolhido): agrupam por ele, não por
 * `at` (meia-noite UTC, que no Brasil cai na véspera).
 *
 * Devolve [{ key, date, items: [{ key, type, username, isPublic, at, books: [evento…] }] }]
 */
function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Dia local do evento: `date` (leituras) ou o instante `at` no fuso do aparelho. */
function eventDay(event) {
  const match = typeof event.date === 'string' && event.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(event.at)
}

export function groupFeed(events = []) {
  const days = []
  const byDay = new Map()

  for (const event of events) {
    const at = eventDay(event)
    if (Number.isNaN(at.getTime())) continue
    const key = dayKey(at)

    let day = byDay.get(key)
    if (!day) {
      day = { key, date: at, items: [], byActor: new Map() }
      byDay.set(key, day)
      days.push(day)
    }

    // Mesma pessoa + mesma ação no mesmo dia viram um item só; resenhas e
    // listas (feed do celular) são sempre um cartão cada
    const own = event.type === 'review' ? `|${event.review?.id}` : event.type === 'list' ? `|${event.list?.id}` : ''
    const actorKey = `${event.username}|${event.type}${own}`
    let item = day.byActor.get(actorKey)
    if (!item) {
      item = { key: `${key}|${actorKey}`, type: event.type, username: event.username, isPublic: event.isPublic, at: event.at, books: [] }
      day.byActor.set(actorKey, item)
      day.items.push(item)
    }
    item.books.push(event)
  }

  return days.map(({ byActor, ...day }) => day)
}

/** "Hoje", "Ontem" ou a data por extenso (com o ano só se não for o ano atual). */
export function dayLabel(date, { t, locale, now = new Date() }) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = Math.round((today - that) / 86400000)
  if (diff === 0) return t('communityView.today')
  if (diff === 1) return t('communityView.yesterday')
  const options = { day: 'numeric', month: 'long' }
  if (that.getFullYear() !== today.getFullYear()) options.year = 'numeric'
  return that.toLocaleDateString(locale, options)
}
