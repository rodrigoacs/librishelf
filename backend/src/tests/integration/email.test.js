import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'

const PASSWORD = 'senha12345'

function lastLink(to, path) {
  const mail = [...testOutbox()].reverse().find(m => m.to === to && m.text.includes(path))
  if (!mail) return null
  const match = mail.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`))
  return { mail, token: match?.[1] }
}

async function register(name, locale) {
  const res = await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com`, locale })
  expect(res.statusCode).toBe(201)
  return res.body.user
}

async function login(name, password = PASSWORD) {
  return request(app).post('/auth/login').send({ username: name, password })
}

beforeAll(async () => {
  await clearDatabase()
  testOutbox().length = 0
})

afterAll(async () => {
  await closeDatabase()
})

describe('Confirmação de e-mail', () => {
  it('cadastro envia o link e a conta começa sem confirmação', async () => {
    const user = await register('ana', 'pt')
    expect(user.emailVerified).toBe(false)

    const link = lastLink('ana@example.com', '/verify-email')
    expect(link.mail.subject).toBe('Confirme seu e-mail no Librishelf')
    expect(link.mail.html).toContain('Confirmar e-mail')
    expect(link.token).toHaveLength(43)
  })

  it('e-mail em inglês quando o cadastro vem em inglês', async () => {
    await register('bob', 'en')
    expect(lastLink('bob@example.com', '/verify-email').mail.subject).toBe('Confirm your email on Librishelf')
  })

  it('sem confirmar: usa a biblioteca, mas não liga opções públicas nem segue ninguém', async () => {
    const token = tokenFrom(await login('ana'))
    const auth = { Authorization: `Bearer ${token}` }

    const book = await request(app).post('/library').set(auth).field({ title: 'Livro', authors: 'Autor' })
    expect(book.statusCode).toBe(201)

    const pub = await request(app).patch('/auth/me/visibility').set(auth).send({ isPublic: true })
    expect(pub.statusCode).toBe(403)
    expect(pub.body.error).toMatch(/Confirme seu e-mail/)

    // Desligar sempre pode.
    expect((await request(app).patch('/auth/me/visibility').set(auth).send({ isPublic: false })).statusCode).toBe(200)

    await db.query("UPDATE librishelf.users SET show_activity = true, email_verified_at = now() WHERE name = 'bob'")
    const follow = await request(app).post('/social/follow/bob').set(auth)
    expect(follow.statusCode).toBe(403)
  })

  it('o link confirma uma vez só', async () => {
    const { token } = lastLink('ana@example.com', '/verify-email')
    expect((await request(app).post('/auth/email/verify').send({ token })).statusCode).toBe(200)
    expect((await request(app).post('/auth/email/verify').send({ token })).statusCode).toBe(400)

    const me = await request(app).get('/auth/me').set({ Authorization: `Bearer ${tokenFrom(await login('ana'))}` })
    expect(me.body.user.emailVerified).toBe(true)

    const auth = { Authorization: `Bearer ${tokenFrom(await login('ana'))}` }
    expect((await request(app).patch('/auth/me/visibility').set(auth).send({ isPublic: true })).statusCode).toBe(200)
    expect((await request(app).post('/social/follow/bob').set(auth)).statusCode).toBe(200)
  })

  it('reenviar gera um link novo e invalida o anterior', async () => {
    await register('caio')
    const first = lastLink('caio@example.com', '/verify-email').token
    const auth = { Authorization: `Bearer ${tokenFrom(await login('caio'))}` }

    const res = await request(app).post('/auth/email/verify/resend').set(auth).send({ locale: 'pt' })
    expect(res.body).toEqual({ alreadyVerified: false })
    const second = lastLink('caio@example.com', '/verify-email').token
    expect(second).not.toBe(first)

    expect((await request(app).post('/auth/email/verify').send({ token: first })).statusCode).toBe(400)
    expect((await request(app).post('/auth/email/verify').send({ token: second })).statusCode).toBe(200)

    const again = await request(app).post('/auth/email/verify/resend').set(auth)
    expect(again.body).toEqual({ alreadyVerified: true })
  })

  it('link inválido, malformado ou vencido → 400', async () => {
    expect((await request(app).post('/auth/email/verify').send({ token: 'x' })).statusCode).toBe(400)
    expect((await request(app).post('/auth/email/verify').send({})).statusCode).toBe(400)

    await register('dani')
    const { token } = lastLink('dani@example.com', '/verify-email')
    await db.query("UPDATE librishelf.user_tokens SET expires_at = now() - interval '1 minute' WHERE purpose = 'verify_email'")
    expect((await request(app).post('/auth/email/verify').send({ token })).statusCode).toBe(400)
  })

  it('o banco guarda só o hash do link', async () => {
    const { token } = lastLink('dani@example.com', '/verify-email')
    const { rows } = await db.query('SELECT token_hash FROM librishelf.user_tokens')
    expect(rows.some(r => r.token_hash === token)).toBe(false)
    expect(rows.every(r => /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true)
  })
})

describe('Esqueci minha senha', () => {
  it('mesma resposta para e-mail com e sem conta; só envia para quem tem', async () => {
    const before = testOutbox().length
    const known = await request(app).post('/auth/password/forgot').send({ email: 'ANA@example.com' })
    const unknown = await request(app).post('/auth/password/forgot').send({ email: 'ninguem@example.com' })

    expect(known.statusCode).toBe(200)
    expect(unknown.statusCode).toBe(200)
    expect(known.body).toEqual(unknown.body)
    expect(testOutbox().length).toBe(before + 1)
    expect(lastLink('ana@example.com', '/reset-password').mail.subject).toBe('Redefinir sua senha do Librishelf')
  })

  it('e-mail malformado → 400', async () => {
    expect((await request(app).post('/auth/password/forgot').send({ email: 'abc' })).statusCode).toBe(400)
  })

  it('redefine a senha, derruba as sessões abertas e o link não serve de novo', async () => {
    const oldSession = tokenFrom(await login('ana'))
    await new Promise(resolve => setTimeout(resolve, 1100)) // iat tem resolução de segundos

    const { token } = lastLink('ana@example.com', '/reset-password')

    const weak = await request(app).post('/auth/password/reset').send({ token, newPassword: '123' })
    expect(weak.statusCode).toBe(400)

    const res = await request(app).post('/auth/password/reset').send({ token, newPassword: 'novaSenha2026' })
    expect(res.statusCode).toBe(200)

    expect((await request(app).get('/auth/me').set({ Authorization: `Bearer ${oldSession}` })).statusCode).toBe(401)
    expect((await login('ana')).statusCode).toBe(401)
    expect((await login('ana', 'novaSenha2026')).statusCode).toBe(200)

    const reuse = await request(app).post('/auth/password/reset').send({ token, newPassword: 'outraSenha2026' })
    expect(reuse.statusCode).toBe(400)
  })

  it('só o último link vale; vencido não serve', async () => {
    await request(app).post('/auth/password/forgot').send({ email: 'bob@example.com' })
    const first = lastLink('bob@example.com', '/reset-password').token
    await request(app).post('/auth/password/forgot').send({ email: 'bob@example.com' })
    const second = lastLink('bob@example.com', '/reset-password').token

    expect((await request(app).post('/auth/password/reset').send({ token: first, newPassword: 'novaSenha2026' })).statusCode).toBe(400)

    await db.query("UPDATE librishelf.user_tokens SET expires_at = now() - interval '1 second' WHERE purpose = 'reset_password' AND used_at IS NULL")
    expect((await request(app).post('/auth/password/reset').send({ token: second, newPassword: 'novaSenha2026' })).statusCode).toBe(400)
  })

  it('redefinir pelo e-mail também confirma o e-mail', async () => {
    await register('edu')
    await request(app).post('/auth/password/forgot').send({ email: 'edu@example.com' })
    const { token } = lastLink('edu@example.com', '/reset-password')
    await request(app).post('/auth/password/reset').send({ token, newPassword: 'novaSenha2026' })

    const me = await request(app).get('/auth/me').set({ Authorization: `Bearer ${tokenFrom(await login('edu', 'novaSenha2026'))}` })
    expect(me.body.user.emailVerified).toBe(true)
  })
})

describe('Data de leitura no futuro', () => {
  it('recusa no cadastro, na edição e no "marcar como lido"', async () => {
    const auth = { Authorization: `Bearer ${tokenFrom(await login('caio'))}` }
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    const created = await request(app).post('/library').set(auth).field({ title: 'Futuro', authors: 'Autor', readDate: future })
    expect(created.statusCode).toBe(400)
    expect(created.body.error).toMatch(/futuro/)

    const ok = await request(app).post('/library').set(auth).field({ title: 'Hoje', authors: 'Autor', readDate: today })
    expect(ok.statusCode).toBe(201)
    const id = ok.body.bookId

    const edit = await request(app).put(`/library/${id}`).set(auth).send({ title: 'Hoje', authors: ['Autor'], readDate: future })
    expect(edit.statusCode).toBe(400)

    const mark = await request(app).patch(`/library/${id}/read`).set(auth).send({ readDate: future })
    expect(mark.statusCode).toBe(400)
  })
})
