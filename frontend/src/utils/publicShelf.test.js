import { describe, expect, it } from 'vitest'
import { isDefaultShelf, readPublicQuery, shelfParams, writePublicQuery } from './publicShelf.js'

describe('readPublicQuery', () => {
  it('padrões e valores inválidos', () => {
    expect(readPublicQuery({})).toEqual({ tab: 'shelf', status: 'all', search: '', sort: 'recent' })
    expect(readPublicQuery({ tab: 'x', status: 'lido', sort: 'toString' })).toEqual({ tab: 'shelf', status: 'all', search: '', sort: 'recent' })
  })

  it('lê aba, status, busca e ordem', () => {
    expect(readPublicQuery({ tab: 'lists', status: 'read', q: '  asimov ', sort: 'rating' }))
      .toEqual({ tab: 'lists', status: 'read', search: 'asimov', sort: 'rating' })
    expect(readPublicQuery({ q: 'x'.repeat(300) }).search).toHaveLength(100)
  })
})

describe('writePublicQuery', () => {
  it('tira os padrões e mantém o resto', () => {
    expect(writePublicQuery({ book: '12', tab: 'stats' }, { tab: 'shelf', status: 'all', search: '', sort: 'recent' })).toEqual({ book: '12' })
    expect(writePublicQuery({}, { tab: 'reviews', status: 'want', search: ' duna ', sort: 'title' }))
      .toEqual({ tab: 'reviews', status: 'want', q: 'duna', sort: 'title' })
  })
})

describe('shelfParams', () => {
  it('traduz para a API', () => {
    expect(shelfParams({ status: 'all', search: '', sort: 'recent' }, 1, 20)).toEqual({ page: 1, limit: 20, sort: 'recent', order: 'desc' })
    expect(shelfParams({ status: 'read', search: 'duna', sort: 'title' }, 2, 20))
      .toEqual({ page: 2, limit: 20, sort: 'title', order: 'asc', readState: 'read', search: 'duna' })
  })

  it('estante padrão', () => {
    expect(isDefaultShelf({ status: 'all', search: '', sort: 'recent' })).toBe(true)
    expect(isDefaultShelf({ status: 'read', search: '', sort: 'recent' })).toBe(false)
  })
})
