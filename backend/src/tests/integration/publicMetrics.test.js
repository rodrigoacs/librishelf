import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { appDay } from '../../utils/appTime.js'

// Métricas da página pública (pacote 41): contagem por dono e por dia, sem visitante.
const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
let unlock = ''

async function signUp(name, extra = {}) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com`, ...extra })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const send = (username, event, viewer) => {
  const req = request(app).post(`/public-metrics/u/${username}`).send({ event })
  return viewer ? req.set(auth(viewer)) : req
}

const counts = async name => Object.fromEntries((await db.query(
  'SELECT event, count FROM librishelf.public_page_daily WHERE owner_id = $1', [ids[name]])).rows.map(row => [row.event, row.count]))

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['dona', 'fechada', 'leitor', 'chefe']) await signUp(name)
  await db.query('UPDATE librishelf.users SET is_public = true WHERE name = $1', ['dona'])
  await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'chefe'")
  const res = await request(app).post('/admin/unlock').set(auth('chefe')).send({ password: PASSWORD })
  unlock = (res.headers['set-cookie'] || []).find(c => c.startsWith('admin_unlock='))?.split(';')[0] || ''
}, 30_000) // quatro cadastros com bcrypt

afterAll(closeDatabase)

describe('contagem', () => {
  test('visita, compartilhar e convite somam no dia do dono, sem sessão', async () => {
    for (const event of ['visit', 'visit', 'share', 'invite_register', 'invite_login']) {
      expect((await send('dona', event)).status).toBe(204)
    }
    expect((await send('DONA', 'visit', 'leitor')).status).toBe(204)
    expect(await counts('dona')).toEqual({ visit: 3, share: 1, invite_register: 1, invite_login: 1 })
    const { rows: [row] } = await db.query("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM librishelf.public_page_daily LIMIT 1")
    expect(row.day).toBe(appDay())
  })

  test('não conta a visita do dono, página fechada nem quem não existe', async () => {
    expect((await send('dona', 'visit', 'dona')).status).toBe(204)
    expect((await send('fechada', 'visit')).status).toBe(204)
    expect((await send('ninguem', 'visit')).status).toBe(204)
    expect((await counts('dona')).visit).toBe(3)
    expect(await counts('fechada')).toEqual({})
  })

  test('evento desconhecido é 400 (cadastro não vem do navegador)', async () => {
    for (const event of ['signup', 'like', undefined]) {
      const res = await send('dona', event)
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('FIELD_INVALID')
    }
  })

  test('cadastro com redirect para a página conta como signup', async () => {
    await signUp('veio1', { redirect: '/u/dona?book=3' })
    await signUp('veio2', { redirect: '/books' })
    await signUp('veio3', { redirect: '/u/fechada' })
    expect((await counts('dona')).signup).toBe(1)
    expect(await counts('fechada')).toEqual({})
  }, 30_000)
})

describe('visitas da sua página (Pro)', () => {
  test('sem Pro é PRO_REQUIRED', async () => {
    const res = await request(app).get('/profile-page/visits').set(auth('dona'))
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'PRO_REQUIRED', params: { feature: 'page_visits' } })
  })

  test('com Pro: dia a dia, com zeros, e o total', async () => {
    await db.query(
      `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
       VALUES ($1, 'trial', 'trial', 'active', now() - interval '1 day', now() + interval '30 days')`, [ids.dona])
    const res = await request(app).get('/profile-page/visits?days=7').set(auth('dona'))
    expect(res.status).toBe(200)
    expect(res.body.days).toBe(7)
    expect(res.body.total).toBe(3)
    expect(res.body.series).toHaveLength(7)
    expect(res.body.series.at(-1)).toEqual({ day: appDay(), visits: 3 })
    expect(res.body.series[0].visits).toBe(0)
    expect((await request(app).get('/profile-page/visits?days=400').set(auth('dona'))).body.code).toBe('FIELD_INVALID')
  })
})

describe('admin', () => {
  test('somas, conversão página → cadastro e páginas mais visitadas', async () => {
    const res = await request(app).get('/admin/public-pages?days=7').set({ ...auth('chefe'), Cookie: unlock })
    expect(res.status).toBe(200)
    expect(res.body.totals).toEqual({ visit: 3, share: 1, invite_register: 1, invite_login: 1, signup: 1 })
    expect(res.body.conversion).toBe(33.3)
    expect(res.body.series).toHaveLength(7)
    expect(res.body.topPages).toEqual([{ username: 'dona', visits: 3, signups: 1, conversion: 33.3 }])
  })

  test('quem não é admin não vê', async () => {
    expect((await request(app).get('/admin/public-pages').set(auth('leitor'))).status).toBe(403)
  })
})
