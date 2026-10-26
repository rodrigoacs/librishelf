import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { purposeKey } from '../../utils/keys.js'

const PASSWORD = 'senha12345'
const register = (username, email) => request(app).post('/auth/register').send({ username, email, password: PASSWORD })
const login = username => request(app).post('/auth/login').send({ username, password: PASSWORD })
const me = token => request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  await clearDatabase()
  expect((await register('demo', 'demo@exemplo.test')).statusCode).toBe(201)
})

afterAll(async () => {
  await closeDatabase()
})

describe('A2 · usuário e e-mail sem diferenciar maiúsculas', () => {
  it('não cadastra "Demo" nem "DEMO@exemplo.test" quando "demo" existe', async () => {
    const byName = await register('Demo', 'outro@exemplo.test')
    expect(byName.statusCode).toBe(409)
    expect(byName.body.code).toBe('USERNAME_TAKEN')

    const byEmail = await register('demo2', 'DEMO@exemplo.test')
    expect(byEmail.statusCode).toBe(409)
    expect(byEmail.body.code).toBe('USERNAME_OR_EMAIL_TAKEN')
  })

  it('guarda o e-mail em minúsculas', async () => {
    const res = await register('Maria', '  Maria.Silva@Exemplo.TEST ')
    expect(res.statusCode).toBe(201)
    expect(res.body.user.email).toBe('maria.silva@exemplo.test')
    const { rows } = await db.query("SELECT email FROM librishelf.users WHERE name = 'Maria'")
    expect(rows[0].email).toBe('maria.silva@exemplo.test')
  })

  it('entra com usuário ou e-mail em qualquer caixa', async () => {
    for (const value of ['demo', 'DEMO', 'Demo', 'demo@exemplo.test', 'DEMO@exemplo.test', 'maria', 'MARIA.SILVA@exemplo.test']) {
      const res = await login(value)
      expect([value, res.statusCode]).toEqual([value, 200])
    }
  })

  it('o banco recusa duplicatas mesmo sem passar pelo serviço', async () => {
    await expect(db.query("INSERT INTO librishelf.users (name, email, password_hash) VALUES ('DEMO', 'x@exemplo.test', 'x')")).rejects.toMatchObject({ code: '23505' })
    await expect(db.query("INSERT INTO librishelf.users (name, email, password_hash) VALUES ('novo', 'Demo@exemplo.test', 'x')")).rejects.toMatchObject({ code: '23514' })
  })

  it('/u/DEMO abre a biblioteca de demo (o nome é um só)', async () => {
    await confirmEmail('demo')
    const token = tokenFrom(await login('demo'))
    await request(app).patch('/auth/me/visibility').set('Authorization', `Bearer ${token}`).send({ isPublic: true })
    const res = await request(app).get('/library/public/u/DEMO/profile')
    expect(res.statusCode).toBe(200)
  })

  it('esqueci minha senha acha a conta com o e-mail em outra caixa', async () => {
    const res = await request(app).post('/auth/password/forgot').send({ email: 'Demo@Exemplo.test' })
    expect(res.statusCode).toBe(200)
    const { rows } = await db.query("SELECT count(*)::int AS n FROM librishelf.user_tokens t JOIN librishelf.users u ON u.id = t.user_id WHERE u.name = 'demo' AND t.purpose = 'reset_password'")
    expect(rows[0].n).toBe(1)
  })
})

describe('A4 · e-mail sem caracteres de sintaxe de endereço', () => {
  it.each([
    'a"b@exemplo.test',
    'a<b@exemplo.test',
    'ab@exemplo.test>',
    'a;b@exemplo.test',
    'a(b)@exemplo.test',
    'a,b@exemplo.test',
    'a@b@exemplo.test',
    'a\\b@exemplo.test',
    'a:b@exemplo.test',
    `${'a'.repeat(250)}@exemplo.test`
  ])('recusa %s', async email => {
    const res = await register(`u${Math.random().toString(36).slice(2, 8)}`, email)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('EMAIL_INVALID')
  })
})

describe('M1 · sair encerra a sessão no servidor', () => {
  it('o token de antes do "Sair" deixa de valer; outra sessão continua', async () => {
    const first = tokenFrom(await login('demo'))
    const second = tokenFrom(await login('demo'))
    expect((await me(first)).statusCode).toBe(200)

    const out = await request(app).post('/auth/logout').set('Authorization', `Bearer ${first}`)
    expect(out.statusCode).toBe(200)

    const after = await me(first)
    expect(after.statusCode).toBe(401)
    expect(after.body.code).toBe('SESSION_REVOKED')
    expect((await me(second)).statusCode).toBe(200)
  })

  it('logout sem sessão só apaga o cookie', async () => {
    expect((await request(app).post('/auth/logout')).statusCode).toBe(200)
  })

  it('tokens sem jti (anteriores a esta versão) não valem', async () => {
    const { rows: [user] } = await db.query("SELECT id FROM librishelf.users WHERE name = 'demo'")
    const old = jwt.sign({ id: user.id, username: 'demo' }, process.env.SECRET_KEY, { expiresIn: '7d' })
    const res = await me(old)
    expect(res.statusCode).toBe(401)
    expect(res.body.code).toBe('SESSION_INVALID')
  })
})

describe('B9 · uma chave por finalidade e algoritmo fixo', () => {
  let userId

  beforeAll(async () => {
    userId = (await db.query("SELECT id FROM librishelf.users WHERE name = 'demo'")).rows[0].id
  })

  it('token de liberação da área admin não serve como sessão', async () => {
    const unlock = jwt.sign({ id: userId, purpose: 'admin-unlock', jti: 'x' }, purposeKey('admin-unlock'), { expiresIn: '30m' })
    expect((await me(unlock)).body.code).toBe('SESSION_INVALID')
    // Mesmo assinado com a chave da sessão, um token com purpose não é sessão
    const withPurpose = jwt.sign({ id: userId, purpose: 'admin-unlock', jti: 'y' }, process.env.SECRET_KEY, { expiresIn: '30m' })
    expect((await me(withPurpose)).body.code).toBe('SESSION_INVALID')
  })

  it('recusa outro algoritmo (HS512) e "none"', async () => {
    const hs512 = jwt.sign({ id: userId, jti: 'z' }, process.env.SECRET_KEY, { algorithm: 'HS512', expiresIn: '1h' })
    expect((await me(hs512)).body.code).toBe('SESSION_INVALID')
    const none = jwt.sign({ id: userId, jti: 'w' }, null, { algorithm: 'none' })
    expect((await me(none)).body.code).toBe('SESSION_INVALID')
  })

  it('o token de sessão leva jti e é HS256', async () => {
    const token = tokenFrom(await login('demo'))
    const { header, payload } = jwt.decode(token, { complete: true })
    expect(header.alg).toBe('HS256')
    expect(typeof payload.jti).toBe('string')
  })
})
