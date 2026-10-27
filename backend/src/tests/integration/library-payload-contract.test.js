import request from 'supertest'
import sharp from 'sharp'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let token

beforeAll(async () => {
  await clearDatabase()

  await request(app).post('/auth/register').send({ username: 'contracttester', password: 'testpass123', email: 'contracttester@example.com' })
  const res = await request(app).post('/auth/login').send({ username: 'contracttester', password: 'testpass123' })
  token = tokenFrom(res)
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

  it('should reject creation when only the legacy "author" field is sent, since it is no longer recognized', async () => {
    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field({
        title: 'Livro Com Nome Antigo Ignorado',
        author: 'Nao Deveria Funcionar',
        publisher: 'Editora Z',
        tags: 'z',
        pubDate: '2020-01-01'
      })

    expect(res.statusCode).toEqual(400)
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

describe('cover_version no payload do livro (M8 — substitui o coverVersions local do front)', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` })
  let image

  beforeAll(async () => {
    image = await sharp({ create: { width: 40, height: 60, channels: 3, background: { r: 20, g: 90, b: 160 } } }).jpeg().toBuffer()
  })

  it('livro sem capa: cover_version null na lista e no livro', async () => {
    const created = await request(app).post('/library').set(auth()).field({ title: 'Sem Capa', authors: 'Autor' })
    expect(created.statusCode).toBe(201)
    expect(created.body).toEqual({ bookId: expect.any(Number), coverSaved: false })

    const book = await request(app).get(`/library/${created.body.bookId}`).set(auth())
    expect(book.body).toHaveProperty('cover_version', null)

    const list = await request(app).get('/library').set(auth()).query({ search: 'Sem Capa' })
    expect(list.body.result[0]).toHaveProperty('cover_version', null)
  })

  it('capa enviada no cadastro: cover_version numérico, igual na resposta, na lista e no livro', async () => {
    const created = await request(app).post('/library').set(auth())
      .field('title', 'Com Capa').field('authors', 'Autor')
      .attach('coverImage', image, { filename: 'capa.jpg', contentType: 'image/jpeg' })
    expect(created.statusCode).toBe(201)
    expect(created.body).toEqual({ bookId: expect.any(Number), coverSaved: true, coverVersion: expect.any(Number) })

    const book = await request(app).get(`/library/${created.body.bookId}`).set(auth())
    expect(book.body.cover_version).toBe(created.body.coverVersion)

    const list = await request(app).get('/library').set(auth()).query({ search: 'Com Capa' })
    expect(list.body.result[0].cover_version).toBe(created.body.coverVersion)
  })

  it('trocar a capa devolve versão nova (maior), e o PUT devolve o livro com ela', async () => {
    const created = await request(app).post('/library').set(auth()).field({ title: 'Troca Capa', authors: 'Autor' })
    const id = created.body.bookId

    const first = await request(app).post(`/library/${id}/cover`).set(auth())
      .attach('coverImage', image, { filename: 'a.jpg', contentType: 'image/jpeg' })
    expect(first.statusCode).toBe(200)
    expect(first.body.coverVersion).toEqual(expect.any(Number))

    const second = await request(app).post(`/library/${id}/cover`).set(auth())
      .attach('coverImage', image, { filename: 'b.jpg', contentType: 'image/jpeg' })
    expect(second.body.coverVersion).toBeGreaterThan(first.body.coverVersion)

    const updated = await request(app).put(`/library/${id}`).set(auth()).send({ title: 'Troca Capa 2', authors: ['Autor'] })
    expect(updated.body.book.cover_version).toBe(second.body.coverVersion)
  })
})
