import request from 'supertest'
import app from '../../app.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let token

beforeAll(async () => {
  await clearDatabase()

  await request(app).post('/auth/register').send({ username: 'contracttester', password: '123', email: 'contracttester@example.com' })
  const res = await request(app).post('/auth/login').send({ username: 'contracttester', password: '123' })
  token = res.body.token
})

afterAll(async () => {
  await closeDatabase()
})

describe('Book payload contract (item 12 — authors/pubDate/readDate unificados entre criar e editar)', () => {

  it('should create a book using the unified field names', async () => {
    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field({
        title: 'Livro Contrato Unico',
        authors: 'Autor Unico',
        publisher: 'Editora Unica',
        tags: 'x',
        pubDate: '2020-01-01'
      })

    expect(res.statusCode).toEqual(201)

    const check = await request(app).get(`/library/${res.body.bookId}`).set('Authorization', `Bearer ${token}`)
    expect(check.body.authors).toBe('Autor Unico')
  })

  it('should update a book using the exact same field names used to create it', async () => {
    const createRes = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field({ title: 'Livro Para Editar', authors: 'Autor Original', publisher: 'Editora Original', tags: 'y', pubDate: '2019-01-01' })

    const bookId = createRes.body.bookId

    const updateRes = await request(app)
      .put(`/library/${bookId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Livro Editado',
        authors: 'Autor Editado',
        publisher: 'Editora Editada',
        tags: 'editado',
        pubDate: '2021-05-05',
        readDate: null
      })

    expect(updateRes.statusCode).toEqual(200)

    const check = await request(app).get(`/library/${bookId}`).set('Authorization', `Bearer ${token}`)
    expect(check.body.title).toBe('Livro Editado')
    expect(check.body.authors).toBe('Autor Editado')
  })

  it('should ignore legacy field names (author, pubdate, read_date) now that the contract is unified', async () => {
    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field({
        title: 'Livro Com Nome Antigo Ignorado',
        author: 'Nao Deveria Aparecer',
        publisher: 'Editora Z',
        tags: 'z',
        pubDate: '2020-01-01'
      })

    expect(res.statusCode).toEqual(201)

    const check = await request(app).get(`/library/${res.body.bookId}`).set('Authorization', `Bearer ${token}`)
    expect(check.body.authors).not.toBe('Nao Deveria Aparecer')
  })

  it('should clear the read date with an explicit readDate: null', async () => {
    const createRes = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field({ title: 'Livro Marcar Como Nao Lido', authors: 'Autor V', publisher: 'Editora V', tags: 'v', pubDate: '2017-01-01' })

    const bookId = createRes.body.bookId

    await request(app).patch(`/library/${bookId}/read`).set('Authorization', `Bearer ${token}`)

    const updateRes = await request(app)
      .put(`/library/${bookId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Livro Marcar Como Nao Lido',
        authors: 'Autor V',
        publisher: 'Editora V',
        tags: 'v',
        pubDate: '2017-01-01',
        readDate: null
      })

    expect(updateRes.statusCode).toEqual(200)

    const check = await request(app).get(`/library/${bookId}`).set('Authorization', `Bearer ${token}`)
    expect(check.body.read_date).toBeNull()
  })
})