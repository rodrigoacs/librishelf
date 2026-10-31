import { describe, expect, it } from 'vitest'
import { groupFeed, dayLabel } from './feedGroups.js'

const t = key => ({ 'communityView.today': 'Hoje', 'communityView.yesterday': 'Ontem' })[key]

describe('groupFeed', () => {
  it('leitura agrupa pelo dia escolhido (date), não pela meia-noite UTC de at', () => {
    // at = 2026-10-20T00:00Z é 19/10 21h em Brasília; o dia certo é 20/10
    const [day] = groupFeed([{ type: 'read', at: '2026-10-20T00:00:00.000Z', date: '2026-10-20', username: 'ana', bookId: 1 }])
    expect([day.date.getMonth(), day.date.getDate()]).toEqual([9, 20])
  })

  it('mesma pessoa e mesma ação no dia viram um item com vários livros', () => {
    const days = groupFeed([
      { type: 'added', at: '2026-10-20T15:00:00Z', username: 'ana', bookId: 1 },
      { type: 'added', at: '2026-10-20T14:00:00Z', username: 'ana', bookId: 2 },
      { type: 'read', at: '2026-10-20T00:00:00Z', date: '2026-10-20', username: 'ana', bookId: 3 },
      { type: 'added', at: '2026-10-20T13:00:00Z', username: 'bia', bookId: 4 },
      { type: 'added', at: '2026-10-18T13:00:00Z', username: 'ana', bookId: 5 }
    ])
    expect(days).toHaveLength(2)
    expect(days[0].items.map(i => [i.username, i.type, i.books.map(b => b.bookId)])).toEqual([
      ['ana', 'added', [1, 2]],
      ['ana', 'read', [3]],
      ['bia', 'added', [4]]
    ])
    expect(days[1].items[0].books.map(b => b.bookId)).toEqual([5])
  })

  it('resenhas e listas da mesma pessoa no dia ficam em cartões separados', () => {
    const [day] = groupFeed([
      { type: 'review', at: '2026-10-20T15:00:00Z', username: 'ana', bookId: 1, review: { id: 10 } },
      { type: 'review', at: '2026-10-20T14:00:00Z', username: 'ana', bookId: 2, review: { id: 11 } },
      { type: 'list', at: '2026-10-20T13:00:00Z', username: 'ana', bookId: null, list: { id: 7 } },
      { type: 'list', at: '2026-10-20T12:00:00Z', username: 'ana', bookId: null, list: { id: 8 } }
    ])
    expect(day.items.map(i => [i.type, i.books.length])).toEqual([['review', 1], ['review', 1], ['list', 1], ['list', 1]])
  })

  it('ignora evento sem data válida e lista vazia', () => {
    expect(groupFeed([{ type: 'added', at: 'x', username: 'ana' }])).toEqual([])
    expect(groupFeed()).toEqual([])
  })
})

describe('dayLabel', () => {
  const now = new Date(2026, 9, 26, 10)
  it('hoje, ontem e data por extenso (ano só se for outro)', () => {
    expect(dayLabel(new Date(2026, 9, 26, 23), { t, locale: 'pt-BR', now })).toBe('Hoje')
    expect(dayLabel(new Date(2026, 9, 25), { t, locale: 'pt-BR', now })).toBe('Ontem')
    expect(dayLabel(new Date(2026, 9, 1), { t, locale: 'pt-BR', now })).toBe('1 de outubro')
    expect(dayLabel(new Date(2025, 11, 31), { t, locale: 'pt-BR', now })).toBe('31 de dezembro de 2025')
  })
})
