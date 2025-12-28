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
})