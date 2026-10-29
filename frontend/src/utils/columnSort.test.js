import { describe, it, expect } from 'vitest'
import { nextColumnSort } from './columnSort.js'

describe('nextColumnSort', () => {
  it('coluna nova: título de A a Z, o resto do maior para o menor', () => {
    expect(nextColumnSort('title', { sortField: 'recent', sortOrder: 'desc' })).toEqual({ field: 'title', order: 'asc' })
    expect(nextColumnSort('readDate', { sortField: 'title', sortOrder: 'asc' })).toEqual({ field: 'readDate', order: 'desc' })
    expect(nextColumnSort('rating', { sortField: 'title', sortOrder: 'asc' })).toEqual({ field: 'rating', order: 'desc' })
  })

  it('mesma coluna: inverte a ordem', () => {
    expect(nextColumnSort('title', { sortField: 'title', sortOrder: 'asc' })).toEqual({ field: 'title', order: 'desc' })
    expect(nextColumnSort('pubDate', { sortField: 'pubDate', sortOrder: 'desc' })).toEqual({ field: 'pubDate', order: 'asc' })
  })
})
