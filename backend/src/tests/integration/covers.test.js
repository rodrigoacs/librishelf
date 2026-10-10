import request from 'supertest'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import app from '../../app.js'
import UPLOAD_DIR from '../../config/uploadDir.js'
import { AUTH_COOKIE_NAME } from '../../config/cookieOptions.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const cookie = user => ({ Cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(tokens[user])}` })

let cover
let bookId

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  const res = await request(app).post('/auth/login').send({ username: name, password: 'senha12345' })
  tokens[name] = tokenFrom(res)
}

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['dona', 'outra']) await signUp(name)

  cover = await sharp({ create: { width: 60, height: 90, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg().toBuffer()
  const res = await request(app).post('/library').set(auth('dona'))
    .field('title', 'Capa Privada').field('authors', 'Autora')
    .attach('coverImage', cover, { filename: 'capa.jpg', contentType: 'image/jpeg' })
  bookId = res.body.bookId
})

afterAll(async () => {
  await closeDatabase()
})

describe('Capas com controle de acesso', () => {
  it('biblioteca privada: anônimo e outra pessoa recebem 404', async () => {
    expect((await request(app).get(`/uploads/${bookId}.avif`)).statusCode).toBe(404)
    expect((await request(app).get(`/uploads/${bookId}.jpg`)).statusCode).toBe(404)
    expect((await request(app).get(`/uploads/${bookId}.avif`).set(cookie('outra'))).statusCode).toBe(404)
  })

  it('o dono vê pelo cookie (como o <img> faz), com cache privado', async () => {
    const res = await request(app).get(`/uploads/${bookId}.avif`).set(cookie('dona'))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/avif')
    expect(res.headers['cache-control']).toBe('private, max-age=600')
    expect(res.headers['x-content-type-options']).toBe('nosniff')

    const jpg = await request(app).get(`/uploads/${bookId}.jpg`).set(auth('dona'))
    expect(jpg.statusCode).toBe(200)
    expect(jpg.headers['content-type']).toBe('image/jpeg')
  })

  it('responde 304 quando o navegador já tem a capa', async () => {
    const first = await request(app).get(`/uploads/${bookId}.avif`).set(cookie('dona'))
    const again = await request(app).get(`/uploads/${bookId}.avif`).set(cookie('dona')).set('If-None-Match', first.headers.etag)
    expect(again.statusCode).toBe(304)
  })

  it('biblioteca pública: qualquer um vê, com cache público; voltar a privada fecha de novo', async () => {
    await request(app).patch('/auth/me/visibility').set(auth('dona')).send({ isPublic: true })
    const res = await request(app).get(`/uploads/${bookId}.avif`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=600')

    await request(app).patch('/auth/me/visibility').set(auth('dona')).send({ isPublic: false })
    expect((await request(app).get(`/uploads/${bookId}.avif`)).statusCode).toBe(404)
  })

  it('nome inválido, livro inexistente ou sem arquivo → 404', async () => {
    for (const file of ['abc.avif', `${bookId}.png`, `${bookId}.avif.bak`, '..%2F..%2Fpackage.json', '999999.avif']) {
      expect((await request(app).get(`/uploads/${file}`).set(cookie('dona'))).statusCode).toBe(404)
    }

    const semCapa = await request(app).post('/library').set(auth('dona')).field('title', 'Sem capa').field('authors', 'Autora')
    expect((await request(app).get(`/uploads/${semCapa.body.bookId}.avif`).set(cookie('dona'))).statusCode).toBe(404)
  })

  it('arquivo solto na pasta sem livro no banco não é servido', async () => {
    fs.writeFileSync(path.join(UPLOAD_DIR, '987654.avif'), cover)
    try {
      expect((await request(app).get('/uploads/987654.avif')).statusCode).toBe(404)
    } finally {
      fs.unlinkSync(path.join(UPLOAD_DIR, '987654.avif'))
    }
  })
})
