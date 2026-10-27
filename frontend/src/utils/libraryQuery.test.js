import { describe, expect, it } from 'vitest'
import { queryToFilters, filtersToQuery, queryToView, sameQuery } from './libraryQuery.js'

describe('filtros da biblioteca na URL', () => {
  it('ida e volta, sem os valores padrão', () => {
    const query = { q: 'asimov', status: 'read', year: '2025', month: '3', tags: ['Fantasia', 'Clássicos'], sort: 'title', order: 'asc' }
    const filters = queryToFilters(query)
    expect(filters).toMatchObject({ search: 'asimov', readState: 'read', readYear: '2025', readMonth: 3, tags: ['Fantasia', 'Clássicos'], sortField: 'title', sortOrder: 'asc' })
    expect(filtersToQuery(filters, 'list')).toEqual({ ...query, view: 'list' })
    expect(filtersToQuery(queryToFilters({}))).toEqual({})
  })

  it('valores inválidos voltam ao padrão; mês só vale com ano', () => {
    const filters = queryToFilters({ status: 'x', year: '25', month: '13', sort: 'drop table', order: 'up', isbn: 'sim' })
    expect(filters).toMatchObject({ readState: 'all', readYear: 'all', readMonth: null, sortField: 'recent', sortOrder: 'desc', isbnStatus: 'all' })
    expect(queryToFilters({ month: '3' }).readMonth).toBeNull()
  })

  it('autor com vírgula no nome continua um nome só', () => {
    expect(queryToFilters({ author: 'Tolkien, J. R. R.' }).author).toEqual(['Tolkien, J. R. R.'])
  })

  it('modo de exibição e comparação de queries', () => {
    expect(queryToView({ view: 'list' })).toBe('list')
    expect(queryToView({ view: 'tabela' })).toBeNull()
    expect(sameQuery({ a: '1', b: ['x'] }, { b: 'x', a: '1' })).toBe(true)
    expect(sameQuery({ a: '1' }, { a: '2' })).toBe(false)
  })
})
