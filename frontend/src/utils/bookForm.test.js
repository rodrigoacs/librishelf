import { describe, expect, it } from 'vitest'
import { blankBookForm, createBookData, fillEmptyFields, updateBookPayload, validateBookForm } from './bookForm.js'

const form = (fields = {}) => ({ ...blankBookForm(), title: 'Vidas Secas', authorNames: ['Graciliano Ramos'], ...fields })
const TODAY = new Date(2026, 10, 9, 15, 30)

describe('validateBookForm', () => {
  const check = (fields, extra = {}) => validateBookForm(form(fields), { status: 'none', statusDate: null, today: TODAY, ...extra })

  it('formulário mínimo passa', () => {
    expect(check({})).toEqual({})
  })

  it('título e autor obrigatórios', () => {
    expect(check({ title: '  ', authorNames: [] })).toEqual({
      title: 'bookForm.errors.titleRequired',
      authors: 'bookForm.errors.authorsRequired'
    })
  })

  it('volume: número de 0 a 9999, com vírgula ou ponto', () => {
    expect(check({ series_index: '1,5' })).toEqual({})
    expect(check({ series_index: '0' })).toEqual({})
    expect(check({ series_index: 'abc' })).toEqual({ seriesIndex: 'bookForm.errors.volume' })
    expect(check({ series_index: '10000' })).toEqual({ seriesIndex: 'bookForm.errors.volume' })
  })

  it('páginas: inteiro de 1 a 20000', () => {
    expect(check({ pageCount: '256' })).toEqual({})
    for (const pageCount of ['0', '20001', '12.5', 'abc', '123456']) {
      expect(check({ pageCount })).toEqual({ pageCount: 'bookForm.errors.pages' })
    }
  })

  it('data de leitura no futuro só conta com "Lido" ou "Lendo"', () => {
    const tomorrow = new Date(2026, 10, 10)
    expect(check({}, { status: 'read', statusDate: tomorrow })).toEqual({ statusDate: 'bookForm.errors.futureDate' })
    expect(check({}, { status: 'reading', statusDate: tomorrow })).toEqual({ statusDate: 'bookForm.errors.futureDate' })
    expect(check({}, { status: 'want', statusDate: tomorrow })).toEqual({})
    // Hoje, mesmo numa hora depois da atual, vale
    expect(check({}, { status: 'read', statusDate: new Date(2026, 10, 9, 23, 0) })).toEqual({})
  })
})

describe('fillEmptyFields', () => {
  const found = { title: 'Achado', authors: ['A. Autor'], publisher: 'Editora', pubDate: '1938-05-01', isbn13: '9788501000000', pages: 176 }

  it('preenche os campos vazios', () => {
    const target = blankBookForm()
    fillEmptyFields(target, found)
    expect(target).toMatchObject({ title: 'Achado', authorNames: ['A. Autor'], publisher: 'Editora', isbn: '9788501000000', pageCount: '176' })
    expect([target.pubdate.getFullYear(), target.pubdate.getMonth(), target.pubdate.getDate()]).toEqual([1938, 4, 1])
  })

  it('não troca o que a pessoa já digitou', () => {
    const target = form({ publisher: 'Minha', isbn: '123', pageCount: '10' })
    fillEmptyFields(target, found)
    expect(target).toMatchObject({ title: 'Vidas Secas', authorNames: ['Graciliano Ramos'], publisher: 'Minha', isbn: '123', pageCount: '10' })
  })

  it('não divide a lista de autores com o resultado', () => {
    const target = blankBookForm()
    fillEmptyFields(target, found)
    target.authorNames.push('Outro')
    expect(found.authors).toEqual(['A. Autor'])
  })
})

describe('createBookData', () => {
  it('campos do formulário, um "authors" por autor', () => {
    const data = createBookData(form({ authorNames: ['Silva, João', 'Ana'], pubdate: new Date(1938, 4, 1), rating: 4, series: ' Série ', series_index: ' 2 ', notes: 'nota', pageCount: '176' }), { readDate: '2026-11-09' })
    expect(data.getAll('authors')).toEqual(['Silva, João', 'Ana'])
    expect(Object.fromEntries([...data.entries()].filter(([key]) => key !== 'authors'))).toEqual({
      title: 'Vidas Secas', publisher: '', isbn: '', tags: '', pubDate: '1938-05-01', readDate: '2026-11-09',
      rating: '4', series: 'Série', seriesIndex: '2', notes: 'nota', pageCount: '176'
    })
  })

  it('opcionais vazios ficam de fora', () => {
    const keys = [...createBookData(form(), {}).keys()]
    expect(keys).toEqual(['title', 'authors', 'publisher', 'isbn', 'tags'])
  })

  it('chaves e capa do Open Library; arquivo escolhido tem prioridade', () => {
    const openLibrary = { olWorkKey: '/works/OL1W', olEditionKey: '/books/OL2M', coverId: 99 }
    const withOl = createBookData(form(), { openLibrary })
    expect([withOl.get('olWorkKey'), withOl.get('olEditionKey'), withOl.get('olCoverId')]).toEqual(['/works/OL1W', '/books/OL2M', '99'])

    const cover = new Blob(['x'], { type: 'image/png' })
    const withFile = createBookData(form(), { openLibrary, cover })
    expect(withFile.has('olCoverId')).toBe(false)
    expect(withFile.get('coverImage')).toBeInstanceOf(Blob)
  })
})

describe('updateBookPayload', () => {
  it('categorias viram lista; vazios viram null', () => {
    expect(updateBookPayload(form({ tags: 'Ficção, , Clássicos ', notes: '' }), { readDate: null })).toEqual({
      title: 'Vidas Secas',
      authors: ['Graciliano Ramos'],
      publisher: '',
      tags: ['Ficção', 'Clássicos'],
      isbn: '',
      rating: null,
      pubDate: null,
      readDate: null,
      series: '',
      seriesIndex: null,
      notes: '',
      pageCount: null
    })
  })
})
