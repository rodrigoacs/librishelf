import request from 'supertest'
import app from '../../app.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let token

beforeAll(async () => {
  await clearDatabase()

  await request(app).post('/auth/register').send({ username: 'libuser', password: '123', email: 'libuser@example.com' })
  const res = await request(app).post('/auth/login').send({ username: 'libuser', password: '123' })
  token = res.body.token
})

afterAll(async () => {
  await closeDatabase()
})

describe('Library Endpoints', () => {
  it('should create a new book (with image upload simulation)', async () => {
    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Livro de Teste')
      .field('author', 'Autor Teste')
      .field('publisher', 'Editora Teste')
      .field('tags', 'tag1, tag2')
      .field('isbn', '999-999')
      .field('pubDate', '2025-01-01')
    // .attach('coverImage', 'tests/fixtures/image.jpg') 

    expect(res.statusCode).toEqual(201)
    expect(res.body).toHaveProperty('bookId')
  })

  it('should list user books', async () => {
    const res = await request(app)
      .get('/library')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.result).toHaveLength(1)
    expect(res.body.result[0].title).toBe('Livro de Teste')
  })

  it('should fail without token', async () => {
    const res = await request(app).get('/library')
    expect(res.statusCode).toEqual(403)
  })
})

let createdBookId

it('should create a book', async () => {
  const res = await request(app)
    .post('/library')
    .set('Authorization', `Bearer ${token}`)
    .field({
      title: 'Livro Original',
      author: 'Autor Original',
      publisher: 'Editora Original',
      tags: 'tag1',
      isbn: 'original-isbn',
      pubDate: '2020-01-01'
    })

  expect(res.statusCode).toEqual(201)
  createdBookId = res.body.bookId
})

it('should update book details', async () => {
  const res = await request(app)
    .put(`/library/${createdBookId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Livro Atualizado',
      authors: 'Autor Novo',
      publisher: 'Editora Nova',
      tags: 'tag2, tag3',
      isbn: 'original-isbn',
      pubdate: '2021-01-01',
      read_date: null
    })

  expect(res.statusCode).toEqual(200)

  const checkRes = await request(app)
    .get(`/library/${createdBookId}`)
    .set('Authorization', `Bearer ${token}`)

  expect(checkRes.body.title).toBe('Livro Atualizado')
  expect(checkRes.body.user_owner).toBe('libuser')
})

it('should mark book as read (PATCH)', async () => {
  const res = await request(app)
    .patch(`/library/${createdBookId}/read`)
    .set('Authorization', `Bearer ${token}`)

  expect(res.statusCode).toEqual(200)

  const checkRes = await request(app).get(`/library/${createdBookId}`).set('Authorization', `Bearer ${token}`)
  expect(checkRes.body.read_date).not.toBeNull()
})

it('should mark book as unread (DELETE action)', async () => {
  const res = await request(app)
    .delete(`/library/${createdBookId}/read`)
    .set('Authorization', `Bearer ${token}`)

  expect(res.statusCode).toEqual(200)

  const checkRes = await request(app).get(`/library/${createdBookId}`).set('Authorization', `Bearer ${token}`)
  expect(checkRes.body.read_date).toBeNull()
})

it('should delete the book', async () => {
  const res = await request(app)
    .delete(`/library/${createdBookId}`)
    .set('Authorization', `Bearer ${token}`)

  expect(res.statusCode).toEqual(204)

  const checkRes = await request(app).get(`/library/${createdBookId}`).set('Authorization', `Bearer ${token}`)
  expect(checkRes.statusCode).toEqual(404)
})