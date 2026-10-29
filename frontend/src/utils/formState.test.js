import { describe, expect, it } from 'vitest'
import { formSnapshot, hasChanges } from './formState.js'
import { bookIdFromQuery, withBook, withoutBook, closeWithBack } from './bookQuery.js'

describe('alterações não salvas (formState)', () => {
  const book = () => ({
    title: 'Duna',
    authorNames: ['Frank Herbert'],
    isbn: '9788576573135',
    pubdate: new Date(1965, 7, 1),
    rating: 4,
    series_index: 2,
    notes: '',
    status: 'read',
    statusDate: new Date(2025, 0, 10)
  })

  it('formulário recém-aberto não tem alterações', () => {
    const snap = formSnapshot(book())
    expect(hasChanges(snap, book())).toBe(false)
  })

  it('mudar o ISBN, a nota, um autor ou o status conta como alteração', () => {
    const snap = formSnapshot(book())
    expect(hasChanges(snap, { ...book(), isbn: '9780000000000' })).toBe(true)
    expect(hasChanges(snap, { ...book(), rating: 5 })).toBe(true)
    expect(hasChanges(snap, { ...book(), authorNames: ['Frank Herbert', 'Brian Herbert'] })).toBe(true)
    expect(hasChanges(snap, { ...book(), status: 'want' })).toBe(true)
    expect(hasChanges(snap, { ...book(), statusDate: new Date(2025, 0, 11) })).toBe(true)
  })

  it('ignora o que não muda o que seria salvo', () => {
    const snap = formSnapshot(book())
    // espaços nas pontas, número × texto, hora da data, null × ''
    expect(hasChanges(snap, { ...book(), title: '  Duna ' })).toBe(false)
    expect(hasChanges(snap, { ...book(), series_index: '2' })).toBe(false)
    expect(hasChanges(snap, { ...book(), pubdate: new Date(1965, 7, 1, 15, 30) })).toBe(false)
    expect(hasChanges(snap, { ...book(), notes: null })).toBe(false)
  })

  it('apagar um campo e digitar de novo o mesmo valor não conta', () => {
    const snap = formSnapshot(book())
    const edited = book()
    edited.isbn = ''
    expect(hasChanges(snap, edited)).toBe(true)
    edited.isbn = '9788576573135'
    expect(hasChanges(snap, edited)).toBe(false)
  })

  it('a ordem das chaves não importa e sem fotografia não há alteração', () => {
    expect(formSnapshot({ a: 1, b: 'x' })).toBe(formSnapshot({ b: 'x', a: 1 }))
    expect(hasChanges(null, { a: 1 })).toBe(false)
  })

  it('resenha e lista: texto, opção e visibilidade', () => {
    const review = { body: 'Ótimo', hasSpoiler: false, visibility: 'public' }
    const snap = formSnapshot(review)
    expect(hasChanges(snap, { ...review, hasSpoiler: true })).toBe(true)
    expect(hasChanges(snap, { ...review, visibility: 'followers' })).toBe(true)
    expect(hasChanges(snap, { ...review, body: 'Ótimo\n' })).toBe(false)
  })
})

describe('livro aberto na URL (?book=)', () => {
  it('lê o id da query', () => {
    expect(bookIdFromQuery({ book: '42' })).toBe(42)
    expect(bookIdFromQuery({ book: ['7', '8'] })).toBe(7)
    expect(bookIdFromQuery({})).toBe(null)
    expect(bookIdFromQuery({ book: 'abc' })).toBe(null)
    expect(bookIdFromQuery({ book: '0' })).toBe(null)
    expect(bookIdFromQuery({ book: '-3' })).toBe(null)
  })

  it('ida e volta mantém filtros e modo de exibição', () => {
    const query = { q: 'asimov', view: 'list', tags: ['Ficção', 'Clássicos'] }
    const opened = withBook(query, 42)
    expect(opened).toEqual({ q: 'asimov', view: 'list', tags: ['Ficção', 'Clássicos'], book: '42' })
    expect(bookIdFromQuery(opened)).toBe(42)
    expect(withoutBook(opened)).toEqual(query)
    // não altera o objeto original
    expect(query.book).toBeUndefined()
  })

  it('fecha com voltar só se a entrada anterior for a mesma tela sem o livro', () => {
    // aberto pelo app: /books?q=x → /books?q=x&book=42
    expect(closeWithBack({ back: '/books?q=x' }, '/books?q=x&book=42', '/books?q=x')).toBe(true)
    // chegou pelo link/recarregou: a entrada anterior é outra tela (ou nenhuma)
    expect(closeWithBack({ back: '/authors' }, '/books?book=42', '/books')).toBe(false)
    expect(closeWithBack({ back: null }, '/books?book=42', '/books')).toBe(false)
    expect(closeWithBack(null, '/books?book=42', '/books')).toBe(false)
  })
})
