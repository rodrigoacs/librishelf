import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let auth

async function addBook(fields) {
  const res = await request(app).post('/library').set(auth).field(fields)
  expect(res.statusCode).toBe(201)
  return res.body.bookId
}

async function search(text) {
  const res = await request(app).get('/library').set(auth).query({ search: text, sort: 'title', order: 'asc' })
  expect(res.statusCode).toBe(200)
  return res.body.result.map(book => book.title)
}

beforeAll(async () => {
  await clearDatabase()
  await request(app).post('/auth/register').send({ username: 'busca', password: 'senha12345', email: 'busca@example.com' })
  auth = { Authorization: `Bearer ${tokenFrom(await request(app).post('/auth/login').send({ username: 'busca', password: 'senha12345' }))}` }

  await addBook({ title: 'Fundação', authors: 'Isaac Asimov', isbn: '9788576570653' })
  await addBook({ title: 'Eu, Robô', authors: 'Isaac Asimov' })
  await addBook({ title: 'Duna', authors: 'Frank Herbert' })
  await addBook({ title: 'Bons Presságios', authors: 'Neil Gaiman, Terry Pratchett' })
  await addBook({ title: '100% Ficção', authors: 'Autora Qualquer' })
})

afterAll(async () => {
  await closeDatabase()
})

describe('Busca da biblioteca', () => {
  it('encontra pelo título e pelo ISBN, como antes', async () => {
    expect(await search('duna')).toEqual(['Duna'])
    expect(await search('8576570')).toEqual(['Fundação'])
  })

  it('encontra pelo nome do autor, sem diferenciar maiúsculas', async () => {
    expect(await search('asimov')).toEqual(['Eu, Robô', 'Fundação'])
    expect(await search('HERBERT')).toEqual(['Duna'])
  })

  it('encontra pelo segundo autor do livro', async () => {
    expect(await search('Pratchett')).toEqual(['Bons Presságios'])
  })

  it('% e _ digitados são texto, não curinga', async () => {
    expect(await search('100%')).toEqual(['100% Ficção'])
    expect(await search('%')).toEqual(['100% Ficção'])
    expect(await search('_')).toEqual([])
  })

  it('combina com os outros filtros', async () => {
    await request(app).patch(`/library/${(await request(app).get('/library').set(auth).query({ search: 'Fundação' })).body.result[0].book_id}/read`).set(auth)
    const res = await request(app).get('/library').set(auth).query({ search: 'asimov', readState: 'true' })
    expect(res.body.result.map(book => book.title)).toEqual(['Fundação'])
  })
})
