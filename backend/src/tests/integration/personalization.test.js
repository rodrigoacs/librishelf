import fs from 'node:fs/promises'
import request from 'supertest'
import sharp from 'sharp'
import app from '../../app.js'
import { profileCoverPath } from '../../utils/imageProcessor.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Personalização (pacote 29): com Pro escreve; sem Pro lê e a troca é recusada.
const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const book = async (name, title, cover = 1) =>
  (await db.query('INSERT INTO librishelf.books (title, user_id, cover_version) VALUES ($1, $2, $3) RETURNING id', [title, ids[name], cover])).rows[0].id

const books = {}

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['pro', 'livre', 'outra']) await signUp(name)
  await db.query(
    `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
     VALUES ($1, 'trial', 'trial', 'active', now() - interval '1 day', now() + interval '10 days')`, [ids.pro])
  await db.query('UPDATE librishelf.users SET is_public = true WHERE id = $1', [ids.pro])
  books.capa = await book('pro', 'Com capa')
  books.semCapa = await book('pro', 'Sem capa', null)
  books.alheio = await book('outra', 'Alheio')
})

afterAll(closeDatabase)

const put = (name, body) => request(app).put('/personalization').set(auth(name)).send(body)

describe('personalização', () => {
  test('padrão: nada escolhido, também no /auth/me', async () => {
    const me = await request(app).get('/auth/me').set(auth('livre'))
    expect(me.body.user.personalization).toEqual({ palette: null, accent: null, appIcon: null, profileCover: null })
  })

  test('com Pro: muda só o que foi enviado', async () => {
    let res = await put('pro', { palette: 'paper', accent: 'teal' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ palette: 'paper', accent: 'teal', appIcon: null, profileCover: null })

    res = await put('pro', { appIcon: 'night', profileCoverBookId: books.capa })
    expect(res.body).toEqual({ palette: 'paper', accent: 'teal', appIcon: 'night', profileCover: { kind: 'book', bookId: books.capa, version: 1 } })

    const me = await request(app).get('/auth/me').set(auth('pro'))
    expect(me.body.user.personalization.palette).toBe('paper')
  })

  test('opções inválidas e capa que não serve', async () => {
    expect((await put('pro', { palette: 'neon' })).body).toMatchObject({ code: 'PERSONALIZATION_INVALID', params: { field: 'palette' } })
    expect((await put('pro', { accent: 'blue' })).body.code).toBe('PERSONALIZATION_INVALID') // as grátis ficam no aparelho
    expect((await put('pro', { profileCoverBookId: books.semCapa })).body.code).toBe('PROFILE_COVER_INVALID')
    expect((await put('pro', { profileCoverBookId: books.alheio })).body.code).toBe('PROFILE_COVER_INVALID')
  })

  test('perfil público mostra a capa de fundo', async () => {
    const res = await request(app).get('/library/public/u/pro/profile')
    expect(res.status).toBe(200)
    expect(res.body.profileCover).toEqual({ kind: 'book', bookId: books.capa, version: 1 })
  })

  test('lista de capas: só livros da pessoa com capa', async () => {
    const res = await request(app).get('/personalization/covers').set(auth('pro'))
    expect(res.body).toEqual([{ bookId: books.capa, title: 'Com capa', version: 1 }])
  })

  test('sem Pro: o escolhido continua valendo, a troca recebe PRO_REQUIRED', async () => {
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() - interval '1 minute' WHERE user_id = $1", [ids.pro])

    const res = await put('pro', { palette: 'slate' })
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'PRO_REQUIRED', params: { feature: 'personalization' } })
    expect((await request(app).get('/personalization').set(auth('pro'))).body.palette).toBe('paper')
    expect((await request(app).get('/library/public/u/pro/profile')).body.profileCover).toEqual({ kind: 'book', bookId: books.capa, version: 1 })

    expect((await put('livre', { accent: 'pink' })).body.code).toBe('PRO_REQUIRED')
  })

  test('voltar ao padrão é permitido sem Pro', async () => {
    let res = await request(app).delete('/personalization/accent').set(auth('pro'))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ palette: 'paper', accent: null, appIcon: 'night' })
    res = await request(app).delete('/personalization/profileCover').set(auth('pro'))
    expect(res.body.profileCover).toBeNull()
    expect((await request(app).delete('/personalization/fonte').set(auth('pro'))).body.code).toBe('PERSONALIZATION_INVALID')
  })

  test('livro da capa excluído: a capa some do perfil', async () => {
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() + interval '10 days' WHERE user_id = $1", [ids.pro])
    const extra = await book('pro', 'Outra capa', 3)
    await put('pro', { profileCoverBookId: extra })
    expect((await request(app).delete(`/library/${extra}`).set(auth('pro'))).status).toBeLessThan(300)
    expect((await request(app).get('/personalization').set(auth('pro'))).body.profileCover).toBeNull()
  })
})

describe('capa de fundo por imagem enviada', () => {
  // Foto "de celular" larga, com GPS no EXIF
  const image = () => sharp({ create: { width: 3200, height: 1800, channels: 3, background: '#335577' } })
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '19/1 40/1 0/1' } })
    .jpeg().toBuffer()
  const send = async name => request(app).put('/personalization/cover-image').set(auth(name)).attach('image', await image(), 'capa.jpg')
  const file = (url, headers = {}) => request(app).get(url).set(headers).buffer(true).parse((r, cb) => {
    const chunks = []
    r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)))
  })

  test('com Pro: qualquer imagem vira a capa, no tamanho certo e sem EXIF', async () => {
    const res = await send('pro')
    expect(res.status).toBe(200)
    expect(res.body.profileCover).toEqual({ kind: 'image', version: 1 })

    const got = await file('/profile-covers/pro/cover.jpg?v=1')
    expect(got.status).toBe(200)
    expect(got.headers['content-type']).toMatch(/image\/jpeg/)
    expect(got.headers['cache-control']).toMatch(/^public/)
    const meta = await sharp(got.body).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 900])
    expect(meta.exif).toBeUndefined()

    expect((await request(app).get('/library/public/u/pro/profile')).body.profileCover).toEqual({ kind: 'image', version: 1 })
    expect((await send('pro')).body.profileCover).toEqual({ kind: 'image', version: 2 })
  })

  test('biblioteca privada: só a dona vê o arquivo', async () => {
    await db.query('UPDATE librishelf.users SET is_public = false WHERE id = $1', [ids.pro])
    try {
      expect((await file('/profile-covers/pro/cover.jpg')).status).toBe(404)
      expect((await file('/profile-covers/pro/cover.jpg', auth('outra'))).status).toBe(404)
      const own = await file('/profile-covers/pro/cover.avif', auth('pro'))
      expect(own.status).toBe(200)
      expect(own.headers['cache-control']).toMatch(/^private/)
    } finally {
      await db.query('UPDATE librishelf.users SET is_public = true WHERE id = $1', [ids.pro])
    }
    expect((await file('/profile-covers/pro/outro.jpg')).status).toBe(404)
    expect((await file('/profile-covers/ninguem/cover.jpg')).status).toBe(404)
  })

  test('arquivo que não é imagem e conta sem Pro são recusados', async () => {
    const bad = await request(app).put('/personalization/cover-image').set(auth('pro'))
      .attach('image', Buffer.from('não é imagem'), { filename: 'x.jpg', contentType: 'image/jpeg' })
    expect(bad.body.code).toBe('IMAGE_INVALID')
    expect((await request(app).put('/personalization/cover-image').set(auth('pro'))).body.code).toBe('IMAGE_REQUIRED')
    expect((await send('livre')).body.code).toBe('PRO_REQUIRED')
  })

  test('escolher um livro troca a imagem e tira o arquivo do disco', async () => {
    const extra = await book('pro', 'Capa nova', 2)
    const res = await put('pro', { profileCoverBookId: extra })
    expect(res.body.profileCover).toEqual({ kind: 'book', bookId: extra, version: 2 })
    await expect(fs.access(profileCoverPath(ids.pro, 'jpg'))).rejects.toThrow()
    expect((await file('/profile-covers/pro/cover.jpg')).status).toBe(404)
  })

  test('tirar a capa (sem Pro também) apaga a imagem', async () => {
    expect((await send('pro')).status).toBe(200)
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() - interval '1 minute' WHERE user_id = $1", [ids.pro])
    try {
      // Sem Pro a imagem continua aparecendo; só a troca é recusada
      expect((await request(app).get('/library/public/u/pro/profile')).body.profileCover).toMatchObject({ kind: 'image' })
      expect((await send('pro')).body.code).toBe('PRO_REQUIRED')
      const res = await request(app).delete('/personalization/profileCover').set(auth('pro'))
      expect(res.body.profileCover).toBeNull()
      await expect(fs.access(profileCoverPath(ids.pro, 'avif'))).rejects.toThrow()
    } finally {
      await db.query("UPDATE librishelf.entitlements SET ends_at = now() + interval '10 days' WHERE user_id = $1", [ids.pro])
    }
  })
})
