import request from 'supertest'
import app from '../../app.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let token

beforeAll(async () => {
  await clearDatabase()

  await request(app).post('/auth/register').send({ username: 'pubtester', password: '123', email: 'pubtester@example.com' })
  const loginRes = await request(app).post('/auth/login').send({ username: 'pubtester', password: '123' })
  token = loginRes.body.token

  await request(app).post('/library').set('Authorization', `Bearer ${token}`).field({
    title: 'It', author: 'Stephen King', publisher: 'Viking Press', tags: 'horror', pubDate: '1986-09-15', isbn: '333'
  })

  await request(app).post('/library').set('Authorization', `Bearer ${token}`).field({
    title: 'The Hobbit', author: 'J.R.R. Tolkien', publisher: 'Allen & Unwin', tags: 'fantasy', pubDate: '1937-09-21', isbn: '444'
  })
})

afterAll(async () => {
  await closeDatabase()
})

describe('Publisher Endpoints', () => {

  it('should list all publishers', async () => {
    const res = await request(app)
      .get('/publisher')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    const names = res.body.map(p => p.name)
    expect(names).toContain('Viking Press')
    expect(names).toContain('Allen & Unwin')
  })

  it('should filter publishers by author', async () => {
    const res = await request(app)
      .get('/publisher?authors=Stephen King')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Viking Press')
  })

  it('should handle multiple authors in filter', async () => {
    const res = await request(app)
      .get('/publisher?authors=Stephen King,J.R.R. Tolkien')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveLength(2)
  })

  it('should not leak publishers from other users sharing the same author', async () => {
    await request(app).post('/auth/register').send({ username: 'pubtester2', password: '123', email: 'pubtester2@example.com' })
    const loginRes2 = await request(app).post('/auth/login').send({ username: 'pubtester2', password: '123' })
    const token2 = loginRes2.body.token

    // mesmo autor ("Stephen King") do primeiro usuário, editora diferente
    await request(app).post('/library').set('Authorization', `Bearer ${token2}`).field({
      title: 'Livro de outro usuário', author: 'Stephen King', publisher: 'Editora Estranha', tags: 'x', pubDate: '2000-01-01', isbn: '999-other-user-pub'
    })

    const res = await request(app)
      .get('/publisher?authors=Stephen King')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    const names = res.body.map(p => p.name)
    expect(names).toContain('Viking Press')
    expect(names).not.toContain('Editora Estranha')
  })
})