import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Página pública (pacote 33): apresentação, favoritos, lendo agora, tema do dono.
const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name, { confirm = true } = {}) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  if (confirm) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const book = async (name, title, status = null) =>
  (await db.query('INSERT INTO librishelf.books (title, user_id, reading_status) VALUES ($1, $2, $3) RETURNING id', [title, ids[name], status])).rows[0].id

const profile = (name, viewer) => {
  const req = request(app).get(`/library/public/u/${name}/profile`)
  return viewer ? req.set(auth(viewer)) : req
}

const books = {}

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['dona', 'r1', 'r2', 'r3']) await signUp(name)
  await signUp('nova', { confirm: false })
  await db.query('UPDATE librishelf.users SET is_public = true WHERE id = $1', [ids.dona])
  // Denunciantes "confiáveis": contas com mais de 7 dias
  await db.query("UPDATE librishelf.users SET created_at = now() - interval '30 days' WHERE name IN ('r1', 'r2', 'r3')")
  for (const n of [1, 2, 3, 4, 5, 6]) books[`b${n}`] = await book('dona', `Livro ${n}`)
  books.lendo = await book('dona', 'Lendo agora', 'reading')
  await db.query('INSERT INTO librishelf.readings (book_id, current_page, progress_percent, progress_updated_at) VALUES ($1, 40, 20, now())', [books.lendo])
  books.alheio = await book('r1', 'Alheio')
})

afterAll(closeDatabase)

describe('apresentação', () => {
  test('salva, limpa espaços, limita linhas e tamanho', async () => {
    let res = await request(app).put('/profile-page/bio').set(auth('dona')).send({ bio: '  Leio   ficção \r\n\r\n e ensaio  ' })
    expect(res.status).toBe(200)
    expect(res.body.bio).toBe('Leio ficção\ne ensaio')

    res = await request(app).put('/profile-page/bio').set(auth('dona')).send({ bio: 'a\nb\nc' })
    expect(res.body.code).toBe('BIO_TOO_MANY_LINES')
    res = await request(app).put('/profile-page/bio').set(auth('dona')).send({ bio: 'x'.repeat(161) })
    expect(res.body.code).toBe('BIO_TOO_LONG')
    res = await request(app).put('/profile-page/bio').set(auth('nova')).send({ bio: 'Oi' })
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED_BIO')

    expect((await profile('dona')).body.bio).toBe('Leio ficção\ne ensaio')
  })

  test('denúncia: não vale a própria; três confiáveis ocultam; dono ainda vê', async () => {
    const report = name => request(app).post('/profile-page/u/dona/bio/report').set(auth(name)).send({ reason: 'spam' })
    expect((await report('dona')).body.code).toBe('BIO_OWN')
    expect((await report('r1')).body).toEqual({ reported: true, duplicate: false })
    expect((await report('r1')).body.duplicate).toBe(true)
    await report('r2')
    expect((await profile('dona')).body.bio).toBeTruthy()
    await report('r3')

    expect((await profile('dona')).body.bio).toBeNull()
    const own = (await profile('dona', 'dona')).body
    expect(own.bio).toBeTruthy()
    expect(own.bioHidden).toBe(true)
    expect((await report('r1')).body.code).toBe('BIO_NOT_FOUND')
  })

  test('editar começa do zero (aparece de novo)', async () => {
    await request(app).put('/profile-page/bio').set(auth('dona')).send({ bio: 'Nova apresentação' })
    expect((await profile('dona')).body.bio).toBe('Nova apresentação')
  })

  test('admin: fila, manter e remover', async () => {
    await db.query("UPDATE librishelf.users SET role = 'admin' WHERE id = $1", [ids.r3])
    const unlocked = await request(app).post('/admin/unlock').set(auth('r3')).send({ password: PASSWORD })
    const cookie = (unlocked.headers['set-cookie'] || []).find(c => c.startsWith('admin_unlock='))?.split(';')[0] || ''
    const asAdmin = () => ({ ...auth('r3'), Cookie: cookie })

    await request(app).post('/profile-page/u/dona/bio/report').set(auth('r1')).send({ reason: 'offensive' })
    const queue = await request(app).get('/admin/bio-reports').set(asAdmin())
    expect(queue.status).toBe(200)
    expect(queue.body[0]).toMatchObject({ username: 'dona', bio: 'Nova apresentação', hidden: false })

    expect((await request(app).post(`/admin/bios/${ids.dona}/keep`).set(asAdmin())).status).toBe(200)
    expect((await request(app).get('/admin/bio-reports').set(asAdmin())).body).toEqual([])
    expect((await request(app).post(`/admin/bios/${ids.dona}/remove`).set(asAdmin())).status).toBe(200)
    expect((await profile('dona')).body.bio).toBeNull()
  })
})

describe('favoritos', () => {
  test('até 5, da própria estante, na ordem', async () => {
    const put = bookIds => request(app).put('/profile-page/favorites').set(auth('dona')).send({ bookIds })
    expect((await put([books.b1, books.b2, books.b3, books.b4, books.b5, books.b6])).body.code).toBe('FAVORITES_TOO_MANY')
    expect((await put([books.b1, books.alheio])).body.code).toBe('FAVORITE_INVALID')
    expect((await put(['x'])).body.code).toBe('FIELD_INVALID')

    const res = await put([books.b3, books.b1])
    expect(res.body.favorites.map(item => item.bookId)).toEqual([books.b3, books.b1])
    expect((await profile('dona')).body.favorites.map(item => item.title)).toEqual(['Livro 3', 'Livro 1'])
  })

  test('excluir o livro tira dos favoritos', async () => {
    await db.query('DELETE FROM librishelf.books WHERE id = $1', [books.b3])
    expect((await profile('dona')).body.favorites.map(item => item.bookId)).toEqual([books.b1])
  })
})

describe('lendo agora e tema', () => {
  test('lendo agora com progresso', async () => {
    const { reading } = (await profile('dona')).body
    expect(reading).toEqual([expect.objectContaining({ bookId: books.lendo, title: 'Lendo agora', currentPage: 40, progressPercent: 20 })])
  })

  test('tema do dono só com Pro', async () => {
    await db.query("UPDATE librishelf.users SET ui_palette = 'paper', ui_accent = 'teal' WHERE id = $1", [ids.dona])
    expect((await profile('dona')).body.theme).toBeNull()
    await db.query(
      `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
       VALUES ($1, 'trial', 'trial', 'active', now() - interval '1 day', now() + interval '10 days')`, [ids.dona])
    expect((await profile('dona')).body.theme).toEqual({ palette: 'paper', accent: 'teal' })
  })
})

describe('prévia do link', () => {
  test('a apresentação entra na descrição', async () => {
    await request(app).put('/profile-page/bio').set(auth('dona')).send({ bio: 'Ficção científica\ne café' })
    const head = await request(app).get('/meta/u/dona')
    expect(head.text).toContain('Ficção científica e café — ')
  })
})
