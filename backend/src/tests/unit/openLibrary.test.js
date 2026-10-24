import { configureForTests, lookupIsbn, fetchCover, parsePublishDate, searchBooks, normalizeSearchQuery } from '../../services/openLibraryService.js'
import { createOpenLibraryMock } from '../helpers/openLibraryMock.js'

describe('parsePublishDate', () => {
  it.each([
    ['October 1, 1988', '1988-10-01'],
    ['Oct 1988', '1988-10-01'],
    ['1988', '1988-01-01'],
    ['1988-10-05', '1988-10-05'],
    ['5 de outubro de 1988', '1988-10-05'],
    ['março de 2001', '2001-03-01'],
    ['sem data', null],
    [null, null]
  ])('%s → %s', (input, expected) => {
    expect(parsePublishDate(input)).toBe(expected)
  })
})

describe('lookupIsbn', () => {
  let mock

  beforeEach(() => {
    mock = createOpenLibraryMock()
    configureForTests({ fetch: mock.fetch })
  })

  it('monta o livro a partir da edição, da obra e dos autores', async () => {
    const book = await lookupIsbn('0-14-032872-6')
    expect(book).toEqual({
      isbn13: '9780140328721',
      title: 'Fantastic Mr. Fox',
      authors: ['Roald Dahl'],
      publisher: 'Puffin',
      pubDate: '1988-10-01',
      olWorkKey: '/works/OL45804W',
      olEditionKey: '/books/OL7353617M',
      coverId: 15152634,
      pages: 96
    })
  })

  it('usa os autores da obra quando a edição não tem; junta subtítulo', async () => {
    const book = await lookupIsbn('9788535914849')
    expect(book.authors).toEqual(['José Saramago'])
    expect(book.title).toBe('Ensaio sobre a cegueira: romance')
    expect(book.pubDate).toBe('1995-01-01')
    expect(book.coverId).toBeNull()
  })

  it('ignora autor com nome de mentira e usa os da obra (seguindo redirect)', async () => {
    const book = await lookupIsbn('9788501401380')
    expect(book.authors).toEqual(['Sarah J. Maas'])
    expect(book.title).toBe('Trono de Vidro: Trono de Vidro #1')
    expect(book.pubDate).toBe('2013-08-06')
  })

  it('ISBN desconhecido → null; inválido → 400', async () => {
    await expect(lookupIsbn('9780000000002')).resolves.toBeNull()
    await expect(lookupIsbn('12345')).rejects.toMatchObject({ status: 400 })
  })

  it('guarda em cache (não repete as chamadas)', async () => {
    await lookupIsbn('9780140328721')
    const callsAfterFirst = mock.calls.length
    await lookupIsbn('9780140328721')
    expect(mock.calls.length).toBe(callsAfterFirst)
  })

  it('envia User-Agent identificando o app', async () => {
    await lookupIsbn('9780140328721')
    expect(mock.calls[0].userAgent).toMatch(/^Librishelf\/1\.0/)
  })

  it('serviço fora do ar → 502', async () => {
    configureForTests({ fetch: createOpenLibraryMock({ down: true }).fetch })
    await expect(lookupIsbn('9780140328721')).rejects.toMatchObject({ status: 502 })
  })

  it('respeita o intervalo mínimo entre requisições', async () => {
    configureForTests({ fetch: mock.fetch, minInterval: 60 })
    const started = Date.now()
    await lookupIsbn('9780140328721') // 3 chamadas: edição, obra, autor
    expect(Date.now() - started).toBeGreaterThanOrEqual(110)
  })
})

describe('fetchCover', () => {
  it('baixa a capa por ID e devolve null quando não existe', async () => {
    configureForTests({ fetch: createOpenLibraryMock().fetch })
    const image = await fetchCover(15152634)
    expect(Buffer.isBuffer(image)).toBe(true)
    await expect(fetchCover(999)).resolves.toBeNull()
    await expect(fetchCover('abc')).rejects.toMatchObject({ status: 400 })
  })

  it('miniatura (M) vem do tamanho M e tem cache próprio', async () => {
    const mock = createOpenLibraryMock()
    configureForTests({ fetch: mock.fetch })
    expect(Buffer.isBuffer(await fetchCover(15152634, 'M'))).toBe(true)
    expect(mock.calls[0].url).toContain('/b/id/15152634-M.jpg')
    await fetchCover(15152634, 'L')
    expect(mock.calls[1].url).toContain('/b/id/15152634-L.jpg')
    await fetchCover(15152634, 'M')
    expect(mock.calls.length).toBe(2)
  })
})

describe('searchBooks', () => {
  let mock

  beforeEach(() => {
    mock = createOpenLibraryMock()
    configureForTests({ fetch: mock.fetch })
  })

  it('usa a edição encontrada (ISBN-13, editora, capa) e os dados da obra', async () => {
    const { results, total } = await searchBooks('  Dom   Casmurro ', 'pt')
    expect(total).toBe(3)
    expect(results[0]).toEqual({
      title: 'Dom Casmurro',
      authors: ['Machado de Assis'],
      publisher: 'Ática',
      pubDate: '2008-01-01',
      year: 2008,
      firstPublishYear: 1899,
      isbn13: '9788508099993',
      pages: 256,
      language: 'por',
      editionCount: 120,
      olWorkKey: '/works/OL1W',
      olEditionKey: '/books/OL10M',
      coverId: 222
    })
  })

  it('sem edição: título com subtítulo, sem ISBN, autores limpos; tira repetidos e sem título', async () => {
    const { results } = await searchBooks('dom casmurro')
    expect(results).toHaveLength(2)
    expect(results[1]).toMatchObject({
      title: 'Dom Casmurro: edição comentada',
      authors: ['Machado de Assis'],
      isbn13: null,
      publisher: null,
      year: 2015,
      olEditionKey: null,
      coverId: null
    })
  })

  it('pede só os campos necessários, com limite e idioma', async () => {
    await searchBooks('Dom Casmurro', 'en')
    const url = new URL(mock.calls[0].url)
    expect(url.pathname).toBe('/search.json')
    expect(url.searchParams.get('q')).toBe('Dom Casmurro')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('lang')).toBe('en')
    expect(url.searchParams.get('fields')).toContain('editions.isbn')
    expect(mock.calls[0].userAgent).toMatch(/^Librishelf\/1\.0/)
  })

  it('idioma fora da lista vira pt; cache ignora maiúsculas e espaços', async () => {
    await searchBooks('Dom Casmurro', 'xx')
    expect(new URL(mock.calls[0].url).searchParams.get('lang')).toBe('pt')
    await searchBooks('dom  CASMURRO', 'pt')
    expect(mock.calls.length).toBe(1)
  })

  it('nada encontrado → lista vazia', async () => {
    await expect(searchBooks('livro inexistente')).resolves.toEqual({ results: [], total: 0 })
  })

  it('texto curto/longo → 400 com código; serviço fora → 502', async () => {
    await expect(searchBooks('a')).rejects.toMatchObject({ status: 400, errorCode: 'SEARCH_QUERY_INVALID' })
    await expect(searchBooks('x'.repeat(201))).rejects.toMatchObject({ status: 400 })
    await expect(searchBooks(undefined)).rejects.toMatchObject({ status: 400 })
    configureForTests({ fetch: createOpenLibraryMock({ down: true }).fetch })
    await expect(searchBooks('dom casmurro')).rejects.toMatchObject({ status: 502, errorCode: 'OPENLIBRARY_UNAVAILABLE' })
  })

  it('normalizeSearchQuery', () => {
    expect(normalizeSearchQuery('  a  b ')).toBe('a b')
    expect(normalizeSearchQuery(' ')).toBeNull()
    expect(normalizeSearchQuery(42)).toBeNull()
  })
})