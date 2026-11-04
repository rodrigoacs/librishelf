import request from 'supertest'
import app from '../../app.js'
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
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
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
    expect(res.body).toEqual({ palette: 'paper', accent: 'teal', appIcon: 'night', profileCover: { bookId: books.capa, version: 1 } })

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
    expect(res.body.profileCover).toEqual({ bookId: books.capa, version: 1 })
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
    expect((await request(app).get('/library/public/u/pro/profile')).body.profileCover).toEqual({ bookId: books.capa, version: 1 })

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
