import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Onboarding (pacote 42): estado no servidor, pular e retomar.
const PASSWORD = 'senha12345'
const tokens = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
}

const patch = (name, body) => request(app).patch('/onboarding').set(auth(name)).send(body)

beforeAll(async () => {
  await clearDatabase()
  await signUp('nova')
}, 30_000)

afterAll(closeDatabase)

test('conta nova começa pendente, no primeiro passo; vai no /auth/me', async () => {
  const me = await request(app).get('/auth/me').set(auth('nova'))
  expect(me.body.user.onboarding).toEqual({ status: 'pending', step: 'start', start: null })

  const res = await request(app).get('/onboarding').set(auth('nova'))
  expect(res.status).toBe(200)
  expect(res.body).toMatchObject({ status: 'pending', step: 'start', start: null, books: 0, firstBooks: 3, isPublic: false })
  expect(res.body.vanguarda).toMatchObject({ has: false, minBooks: 10 })
})

test('escolhe como começar, avança, pula e retoma no mesmo passo', async () => {
  let res = await patch('nova', { start: 'search', step: 'books' })
  expect(res.body).toMatchObject({ status: 'pending', step: 'books', start: 'search' })

  await request(app).post('/library').set(auth('nova')).field({ title: 'Primeiro', authors: 'Alguém' })
  res = await patch('nova', { status: 'skipped' })
  expect(res.body).toMatchObject({ status: 'skipped', step: 'books', start: 'search', books: 1 })

  res = await patch('nova', { status: 'pending' })
  expect(res.body.step).toBe('books')

  res = await patch('nova', { step: 'finish', status: 'done' })
  expect(res.body).toMatchObject({ status: 'done', step: 'finish' })
  expect((await request(app).get('/auth/me').set(auth('nova'))).body.user.onboarding.status).toBe('done')
})

test('valores fora da lista e corpo vazio são 400', async () => {
  for (const body of [{ status: 'talvez' }, { step: 'meta' }, { start: 'goodreads' }]) {
    const res = await patch('nova', body)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('FIELD_INVALID')
  }
  expect((await patch('nova', {})).body.code).toBe('FIELD_REQUIRED')
  expect((await patch('nova', { start: null })).body.start).toBeNull()
})

test('sem sessão é 401', async () => {
  expect((await request(app).get('/onboarding')).status).toBe(401)
})

test('o padrão da coluna é pending (as contas antigas ficaram como done na migration)', async () => {
  const { rows: [col] } = await db.query(`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'librishelf' AND table_name = 'users' AND column_name = 'onboarding_status'`)
  expect(col.column_default).toContain('pending')
})
