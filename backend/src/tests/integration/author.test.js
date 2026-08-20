import request from 'supertest'
import app from '../../app.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let token

beforeAll(async () => {
  await clearDatabase()

  await request(app).post('/auth/register').send({ username: 'authortester', password: '123', email: 'authortester@example.com' })
  const loginRes = await request(app).post('/auth/login').send({ username: 'authortester', password: '123' })
  token = loginRes.body.token

  await request(app).post('/library').set('Authorization', `Bearer ${token}`).field({
    title: 'Harry Potter', author: 'J.K. Rowling', publisher: 'Bloomsbury', tags: 'magic', pubDate: '1997-06-26', isbn: '111'
  })

  await request(app).post('/library').set('Authorization', `Bearer ${token}`).field({
    title: 'Foundation', author: 'Isaac Asimov', publisher: 'Gnome Press', tags: 'scifi', pubDate: '1951-01-01', isbn: '222'
  })
})

afterAll(async () => {
  await closeDatabase()
})

describe('Author Endpoints', () => {

  it('should list all authors', async () => {
    const res = await request(app)
      .get('/author')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveLength(2)
    const names = res.body.map(a => a.name)
    expect(names).toContain('J.K. Rowling')
    expect(names).toContain('Isaac Asimov')
  })

  it('should filter authors by publisher', async () => {
    const res = await request(app)
      .get('/author?publishers=Bloomsbury')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('J.K. Rowling')
  })

  it('should return empty list for unused publisher', async () => {
    const res = await request(app)
      .get('/author?publishers=EditoraInexistente')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toEqual([])
  })

  it('should fail without authentication', async () => {
    const res = await request(app).get('/author')
    expect(res.statusCode).toEqual(403)
  })

  it('should not leak authors from other users sharing the same publisher', async () => {
    await request(app).post('/auth/register').send({ username: 'authortester2', password: '123', email: 'authortester2@example.com' })
    const loginRes2 = await request(app).post('/auth/login').send({ username: 'authortester2', password: '123' })
    const token2 = loginRes2.body.token

    // mesmo publisher ("Bloomsbury") do primeiro usuário, autor diferente
    await request(app).post('/library').set('Authorization', `Bearer ${token2}`).field({
      title: 'Livro de outro usuário', author: 'Autor Estranho', publisher: 'Bloomsbury', tags: 'x', pubDate: '2000-01-01', isbn: '999-other-user'
    })

    const res = await request(app)
      .get('/author?publishers=Bloomsbury')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    const names = res.body.map(a => a.name)
    expect(names).toContain('J.K. Rowling')
    expect(names).not.toContain('Autor Estranho')
  })
})