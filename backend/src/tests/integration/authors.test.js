import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let token

beforeAll(async () => {
  await clearDatabase()
  await request(app).post('/auth/register').send({ username: 'multiautor', password: 'senha12345', email: 'multiautor@example.com' })
  const res = await request(app).post('/auth/login').send({ username: 'multiautor', password: 'senha12345' })
  token = tokenFrom(res)
})

afterAll(async () => {
  await closeDatabase()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

async function create(fields, authors) {
  const req = request(app).post('/library').set(auth()).field(fields)
  // Campo repetido no multipart: um "authors" por autor.
  for (const name of authors) req.field('authors', name)
  return req
}

describe('Vários autores por livro', () => {
  let bookId

  it('cria com dois autores (campo repetido) e mantém a ordem', async () => {
    const res = await create({ title: 'Belas Maldições' }, ['Terry Pratchett', 'Neil Gaiman'])
    expect(res.statusCode).toBe(201)
    bookId = res.body.bookId

    const book = await request(app).get(`/library/${bookId}`).set(auth())
    expect(book.body.author_names).toEqual(['Terry Pratchett', 'Neil Gaiman'])
    expect(book.body.authors).toBe('Terry Pratchett, Neil Gaiman')
  })

  it('cada autor aparece separado na lista de autores', async () => {
    const res = await request(app).get('/author').set(auth())
    const names = res.body.map(a => a.name)
    expect(names).toEqual(expect.arrayContaining(['Terry Pratchett', 'Neil Gaiman']))
    expect(names).not.toContain('Terry Pratchett, Neil Gaiman')
  })

  it('um único texto com vírgula é UM autor (não é separado)', async () => {
    const res = await create({ title: 'Formato sobrenome' }, ['Tolkien, J.R.R.'])
    expect(res.statusCode).toBe(201)

    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth())
    expect(book.body.author_names).toEqual(['Tolkien, J.R.R.'])
  })

  it('PUT aceita lista JSON, troca a ordem e remove autor', async () => {
    const res = await request(app)
      .put(`/library/${bookId}`)
      .set(auth())
      .send({ title: 'Belas Maldições', authors: ['Neil Gaiman', 'Terry Pratchett'] })
    expect(res.statusCode).toBe(200)
    expect(res.body.book.author_names).toEqual(['Neil Gaiman', 'Terry Pratchett'])

    const single = await request(app)
      .put(`/library/${bookId}`)
      .set(auth())
      .send({ title: 'Belas Maldições', authors: ['Neil Gaiman'] })
    expect(single.body.book.author_names).toEqual(['Neil Gaiman'])
  })

  it('lista vazia ou só com espaços é recusada', async () => {
    const res = await request(app)
      .put(`/library/${bookId}`)
      .set(auth())
      .send({ title: 'X', authors: ['  ', ''] })
    expect(res.statusCode).toBe(400)
  })

  it('autores repetidos são deduplicados', async () => {
    const res = await create({ title: 'Repetido' }, ['Ana Silva', 'ana silva', 'Ana Silva'])
    expect(res.statusCode).toBe(201)
    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth())
    expect(book.body.author_names).toEqual(['Ana Silva'])
  })
})

describe('Nomes com vírgula nos filtros', () => {
  beforeAll(async () => {
    await create({ title: 'Piquenique na Estrada', publisher: 'Editora A, B & Cia' }, ['Strugátski, Boris'])
    await create({ title: 'Outro livro' }, ['Boris'])
  })

  it('filtrar por autor com vírgula encontra o livro', async () => {
    const res = await request(app).get('/library').query({ author: 'Strugátski, Boris' }).set(auth())
    expect(res.statusCode).toBe(200)
    expect(res.body.result.map(b => b.title)).toEqual(['Piquenique na Estrada'])
  })

  it('filtrar por editora com vírgula encontra o livro', async () => {
    const res = await request(app).get('/library').query({ publisher: 'Editora A, B & Cia' }).set(auth())
    expect(res.body.result.map(b => b.title)).toEqual(['Piquenique na Estrada'])
  })

  it('vários autores no filtro via parâmetro repetido', async () => {
    const res = await request(app)
      .get('/library')
      .query('author=Strugátski%2C%20Boris&author=Boris&sort=title&order=asc')
      .set(auth())
    expect(res.body.result.map(b => b.title)).toEqual(['Outro livro', 'Piquenique na Estrada'])
  })

  it('editoras de um autor com vírgula', async () => {
    const res = await request(app).get('/publisher').query({ authors: 'Strugátski, Boris' }).set(auth())
    expect(res.body.map(p => p.name)).toEqual(['Editora A, B & Cia'])
  })
})

describe('Tags e conflitos', () => {
  it('tag repetida não vira "ISBN já existe"', async () => {
    const res = await create({ title: 'Tags repetidas', tags: 'ficção, ficção, Ficção' }, ['Autor T'])
    expect(res.statusCode).toBe(201)
    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth())
    expect(book.body.tag_names).toEqual(['ficção'])
  })

  it('ISBN duplicado continua sendo 409', async () => {
    await create({ title: 'Com ISBN', isbn: '978-0000000001' }, ['Autor I'])
    const res = await create({ title: 'Mesmo ISBN', isbn: '978-0000000001' }, ['Autor I'])
    expect(res.statusCode).toBe(409)
  })

  it('criações simultâneas com o mesmo autor novo não falham', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => create({ title: `Paralelo ${i}` }, ['Autor Novíssimo']))
    )
    expect(results.map(r => r.statusCode)).toEqual([201, 201, 201, 201, 201])

    const authors = await request(app).get('/author').set(auth())
    expect(authors.body.filter(a => a.name === 'Autor Novíssimo')).toEqual([{ name: 'Autor Novíssimo', count: 5 }])
  })
})
