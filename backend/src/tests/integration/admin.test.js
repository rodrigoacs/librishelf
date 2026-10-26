import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'
import * as metrics from '../../utils/metrics.js'

const PASSWORD = 'senha12345'
const tokens = {}
let unlock = ''
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const asAdmin = () => ({ ...auth('chefe'), Cookie: unlock })

async function signUp(name, visibility) {
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  if (visibility) await request(app).patch('/auth/me/visibility').set(auth(name)).send(visibility)
}

const unlockCookie = res => (res.headers['set-cookie'] || []).find(c => c.startsWith('admin_unlock='))?.split(';')[0] || ''
const userId = async name => (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id

const ids = {}

beforeAll(async () => {
  await clearDatabase()
  // Contadores e erros de outras suítes não entram aqui
  await db.query('TRUNCATE librishelf.usage_counters')
  metrics.resetMetrics()
  await signUp('chefe')
  await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'chefe'")
  await signUp('ana', { isPublic: true, showInCommunity: true, showActivity: true })
  for (const name of ['bia', 'caio', 'davi']) await signUp(name, { isPublic: true, showActivity: true })
  const book = await request(app).post('/library').set(auth('ana')).field({ title: 'Fantastic Mr. Fox', authors: 'Roald Dahl', isbn: '9780140328721' })
  ids.book = book.body.bookId
  await request(app).put(`/library/${ids.book}/review`).set(auth('ana')).send({ body: 'Uma resenha qualquer.', visibility: 'public' })
  ids.review = (await db.query('SELECT id FROM librishelf.reviews LIMIT 1')).rows[0].id
  ids.ana = await userId('ana')
  ids.chefe = await userId('chefe')
})

afterAll(closeDatabase)

describe('acesso', () => {
  test('sem login: 401; leitor comum: 403 ADMIN_REQUIRED', async () => {
    expect((await request(app).get('/admin/session')).status).toBe(401)
    const res = await request(app).get('/admin/stats').set(auth('bia'))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ADMIN_REQUIRED')
  })

  test('/auth/me diz quem é admin', async () => {
    expect((await request(app).get('/auth/me').set(auth('chefe'))).body.user.isAdmin).toBe(true)
    expect((await request(app).get('/auth/me').set(auth('bia'))).body.user.isAdmin).toBe(false)
  })

  test('admin sem liberar: ADMIN_LOCKED; senha errada não libera', async () => {
    const locked = await request(app).get('/admin/stats').set(auth('chefe'))
    expect(locked.status).toBe(403)
    expect(locked.body.code).toBe('ADMIN_LOCKED')
    expect((await request(app).get('/admin/session').set(auth('chefe'))).body.unlocked).toBe(false)

    const wrong = await request(app).post('/admin/unlock').set(auth('chefe')).send({ password: 'errada123' })
    expect(wrong.status).toBe(401)
    expect(wrong.body.code).toBe('CURRENT_PASSWORD_WRONG')
    expect(unlockCookie(wrong)).toBe('')
  })

  test('senha certa libera (cookie httpOnly) e fica registrado', async () => {
    const res = await request(app).post('/admin/unlock').set(auth('chefe')).send({ password: PASSWORD })
    expect(res.status).toBe(200)
    const raw = res.headers['set-cookie'].find(c => c.startsWith('admin_unlock='))
    expect(raw).toMatch(/HttpOnly/i)
    unlock = unlockCookie(res)
    expect((await request(app).get('/admin/session').set(asAdmin())).body.unlocked).toBe(true)
    const { rows } = await db.query("SELECT count(*)::int AS n FROM librishelf.admin_actions WHERE action = 'admin.unlock'")
    expect(rows[0].n).toBe(1)
  })

  test('a liberação de um admin não serve para outra conta', async () => {
    await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'davi'")
    const res = await request(app).get('/admin/stats').set({ ...auth('davi'), Cookie: unlock })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ADMIN_LOCKED')
    await db.query("UPDATE librishelf.users SET role = 'user' WHERE name = 'davi'")
  })

  test('rebaixado no banco perde o acesso na hora', async () => {
    await db.query("UPDATE librishelf.users SET role = 'user' WHERE name = 'chefe'")
    expect((await request(app).get('/admin/stats').set(asAdmin())).status).toBe(403)
    await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'chefe'")
  })
})

describe('números', () => {
  test('totais e 12 semanas de cadastros', async () => {
    const res = await request(app).get('/admin/stats').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.users.total).toBe(5)
    expect(res.body.users.verified).toBe(5)
    expect(res.body.users.active30).toBe(5)
    expect(res.body.content.books).toBe(1)
    expect(res.body.content.reviews).toBe(1)
    expect(res.body.signupsByWeek).toHaveLength(12)
    expect(res.body.signupsByWeek.at(-1).total).toBe(5)
  })
})

describe('moderação', () => {
  test('denúncias aparecem na fila aberta', async () => {
    expect((await request(app).get(`/library/public/u/ana/book/${ids.book}`)).body.review).toBeTruthy()
    await request(app).post(`/reviews/${ids.review}/report`).set(auth('bia')).send({ reason: 'spam' })
    await request(app).post(`/reviews/${ids.review}/report`).set(auth('caio')).send({ reason: 'offensive', note: 'ofensivo' })
    const res = await request(app).get('/admin/reports?status=open').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ id: ids.review, hidden: false, author: { username: 'ana', active: true }, reports: { open: 2, total: 2 } })
    expect(res.body[0].reports.reasons.sort()).toEqual(['offensive', 'spam'])
    expect((await request(app).get('/admin/stats').set(asAdmin())).body.moderation.openReports).toBe(1)
  })

  test('status inválido: 400', async () => {
    expect((await request(app).get('/admin/reports?status=x').set(asAdmin())).status).toBe(400)
  })

  test('detalhe traz as denúncias e quem denunciou', async () => {
    const res = await request(app).get(`/admin/reviews/${ids.review}`).set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.reports.map(r => r.reporter).sort()).toEqual(['bia', 'caio'])
    expect(res.body.author).toMatchObject({ username: 'ana', active: true })
    expect((await request(app).get('/admin/reviews/99999').set(asAdmin())).status).toBe(404)
  })

  test('ocultar tira da fila aberta, some do público e vai para o registro', async () => {
    const res = await request(app).post(`/admin/reviews/${ids.review}/hide`).set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.review.hidden).toBe(true)
    expect((await request(app).get('/admin/reports?status=open').set(asAdmin())).body).toHaveLength(0)
    expect((await request(app).get('/admin/reports?status=hidden').set(asAdmin())).body).toHaveLength(1)
    const pub = await request(app).get(`/library/public/u/ana/book/${ids.book}`)
    expect(pub.status).toBe(200)
    expect(pub.body.review).toBeNull()
  })

  test('reexibir volta ao normal', async () => {
    const res = await request(app).post(`/admin/reviews/${ids.review}/show`).set(asAdmin())
    expect(res.body.review.hidden).toBe(false)
    expect((await request(app).get('/admin/reports?status=all').set(asAdmin())).body[0].reports.open).toBe(0)
  })
})

describe('contas', () => {
  test('lista e busca por nome ou e-mail (curinga escapado)', async () => {
    const all = await request(app).get('/admin/users').set(asAdmin())
    expect(all.body.total).toBe(5)
    const ana = all.body.users.find(u => u.username === 'ana')
    expect(ana).toMatchObject({ email: 'ana@example.com', active: true, books: 1, reviews: 1, reportsReceived: 2 })
    expect((await request(app).get('/admin/users?q=BIA@exa').set(asAdmin())).body.users.map(u => u.username)).toEqual(['bia'])
    expect((await request(app).get('/admin/users?q=%25').set(asAdmin())).body.total).toBe(0)
  })

  test('suspender pede senha e motivo; não vale para si mesmo nem para outro admin', async () => {
    const noPass = await request(app).post(`/admin/users/${ids.ana}/suspend`).set(asAdmin()).send({ reason: 'spam' })
    expect(noPass.body.code).toBe('CURRENT_PASSWORD_REQUIRED')
    const noReason = await request(app).post(`/admin/users/${ids.ana}/suspend`).set(asAdmin()).send({ password: PASSWORD })
    expect(noReason.body.code).toBe('FIELD_INVALID')
    const self = await request(app).post(`/admin/users/${ids.chefe}/suspend`).set(asAdmin()).send({ password: PASSWORD, reason: 'teste' })
    expect(self.body.code).toBe('ADMIN_SELF')
    expect((await request(app).post('/admin/users/99999/suspend').set(asAdmin()).send({ password: PASSWORD, reason: 'teste' })).status).toBe(404)
  })

  test('suspensa: sessão cai, login recusa e o conteúdo público some', async () => {
    const res = await request(app).post(`/admin/users/${ids.ana}/suspend`).set(asAdmin()).send({ password: PASSWORD, reason: 'Spam repetido' })
    expect(res.status).toBe(200)

    expect((await request(app).get('/auth/me').set(auth('ana'))).status).toBe(401)
    const login = await request(app).post('/auth/login').send({ username: 'ana', password: PASSWORD })
    expect(login.status).toBe(403)
    expect(login.body.code).toBe('ACCOUNT_SUSPENDED')
    // Senha errada continua dizendo só "inválidos": não revela a suspensão
    expect((await request(app).post('/auth/login').send({ username: 'ana', password: 'errada123' })).body.code).toBe('INVALID_CREDENTIALS')

    expect((await request(app).get('/library/public/u/ana')).status).toBe(404)
    expect((await request(app).get('/library/public/u/ana/profile')).status).toBe(404)
    expect((await request(app).post('/social/follow/ana').set(auth('bia'))).status).toBe(404)

    const again = await request(app).post(`/admin/users/${ids.ana}/suspend`).set(asAdmin()).send({ password: PASSWORD, reason: 'de novo' })
    expect(again.body.code).toBe('ACCOUNT_ALREADY_SUSPENDED')

    const list = await request(app).get('/admin/users?status=suspended').set(asAdmin())
    expect(list.body.users).toHaveLength(1)
    expect(list.body.users[0]).toMatchObject({ username: 'ana', active: false, suspendedReason: 'Spam repetido' })
    expect((await request(app).get('/admin/stats').set(asAdmin())).body.users.suspended).toBe(1)
    expect((await request(app).get('/admin/reports?status=all').set(asAdmin())).body[0].author.active).toBe(false)
  })

  test('reativar devolve tudo', async () => {
    const res = await request(app).post(`/admin/users/${ids.ana}/reactivate`).set(asAdmin()).send({ password: PASSWORD })
    expect(res.status).toBe(200)
    expect((await request(app).post('/auth/login').send({ username: 'ana', password: PASSWORD })).status).toBe(200)
    expect((await request(app).get('/library/public/u/ana')).status).toBe(200)
    const again = await request(app).post(`/admin/users/${ids.ana}/reactivate`).set(asAdmin()).send({ password: PASSWORD })
    expect(again.body.code).toBe('ACCOUNT_NOT_SUSPENDED')
  })
})

describe('engajamento, cadastros parados e conta individual', () => {
  test('funil e último acesso', async () => {
    const res = await request(app).get('/admin/stats').set(asAdmin())
    expect(res.body.engagement.funnel).toEqual({ signedUp: 5, verified: 5, withBook: 1, with10Books: 0 })
    expect(res.body.engagement.books7).toBe(1)
    expect(res.body.users.active7).toBe(5)
    const { rows } = await db.query("SELECT last_seen_at FROM librishelf.users WHERE name = 'bia'")
    expect(rows[0].last_seen_at).not.toBeNull()
  })

  test('cadastro parado: aparece no filtro e dá para reenviar a confirmação', async () => {
    await db.query("UPDATE librishelf.users SET email_verified_at = NULL, created_at = now() - interval '10 days' WHERE name = 'caio'")
    expect((await request(app).get('/admin/stats').set(asAdmin())).body.users.staleSignups).toBe(1)
    const list = await request(app).get('/admin/users?status=unverified').set(asAdmin())
    expect(list.body.users.map(u => u.username)).toEqual(['caio'])

    testOutbox().length = 0
    const caio = await userId('caio')
    const res = await request(app).post(`/admin/users/${caio}/resend-verification`).set(asAdmin())
    expect(res.status).toBe(200)
    expect(testOutbox().map(m => m.to)).toEqual(['caio@example.com'])
    const again = await request(app).post(`/admin/users/${ids.ana}/resend-verification`).set(asAdmin())
    expect(again.body.code).toBe('EMAIL_ALREADY_VERIFIED')
    await db.query("UPDATE librishelf.users SET email_verified_at = now() WHERE name = 'caio'")
  })

  test('conta individual: totais, resenhas denunciadas e histórico', async () => {
    const res = await request(app).get(`/admin/users/${ids.ana}`).set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ username: 'ana', email: 'ana@example.com', active: true, privacy: { isPublic: true, showInCommunity: true } })
    expect(res.body.totals).toMatchObject({ books: 1, reviews: 1, reportsReceived: 2, reportsMade: 0 })
    expect(res.body.reportedReviews).toEqual([expect.objectContaining({ id: ids.review, book: 'Fantastic Mr. Fox', reports: 2, open: 0 })])
    expect(res.body.history.map(h => h.action)).toEqual(['user.reactivate', 'user.suspend', 'review.show', 'review.hide'])
    expect(res.body).not.toHaveProperty('password_hash')
    expect((await request(app).get('/admin/users/99999').set(asAdmin())).status).toBe(404)
  })
})

describe('uso, sistema e sinais de moderação', () => {
  test('uso dos recursos: contas por recurso e contadores do servidor', async () => {
    const res = await request(app).get('/admin/usage').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.adoption).toMatchObject({ users: 5, reviews: 1, publicLibrary: 4, community: 1, lists: 0 })
    expect(res.body.events.find(e => e.event === 'book.add').last7).toBe(1)
  })

  test('sistema: banco, migrations, e-mail, limites e erros 500', async () => {
    metrics.serverError({ method: 'GET', path: '/library/12345', context: 'teste', message: 'falha simulada' })
    metrics.rateLimited('RATE_LIMIT_LOGIN', '203.0.113.9')
    const res = await request(app).get('/admin/system').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.database).toMatchObject({ ok: true, pendingMigrations: [] })
    expect(res.body.database.lastMigration.version).toMatch(/^\d{3}_/)
    expect(res.body.email).toMatchObject({ configured: false })
    expect(res.body.errors.recent[0]).toMatchObject({ path: '/library/:id', message: 'falha simulada' })
    expect(res.body.errors.today).toBeGreaterThanOrEqual(1)
    expect(res.body.rateLimits.topIps[0]).toMatchObject({ ip: '203.0.113.9', total: 1 })
    expect(res.body.rateLimits.today).toEqual([{ code: 'RATE_LIMIT_LOGIN', total: 1 }])
    expect(res.body.openLibrary.books).toEqual({ linked: 0, linkable: 1, unlinked: 0 })
  })

  test('e-mail de teste vai para o próprio admin', async () => {
    testOutbox().length = 0
    const res = await request(app).post('/admin/email/test').set(asAdmin())
    expect(res.status).toBe(200)
    expect(testOutbox()[0]).toMatchObject({ to: 'chefe@example.com', subject: 'Librishelf — e-mail de teste' })
  })

  test('sinais: contas novas denunciadas e as mais denunciadas', async () => {
    const res = await request(app).get('/admin/moderation/insights').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.serialReporters).toEqual([])
    expect(res.body.newAccountsReported).toEqual([expect.objectContaining({ username: 'ana', reports: 2, reviewsReported: 1 })])
    expect(res.body.mostReported[0]).toMatchObject({ username: 'ana', reports: 2, hidden: 0 })
  })
})

describe('registro', () => {
  test('lista o que foi feito, do mais novo ao mais antigo', async () => {
    const res = await request(app).get('/admin/actions').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.actions.map(a => a.action)).toEqual(['email.test', 'user.resend_verification', 'user.reactivate', 'user.suspend', 'review.show', 'review.hide', 'admin.unlock'])
    expect(res.body.actions[3]).toMatchObject({ admin: 'chefe', targetUser: 'ana', details: { reason: 'Spam repetido' } })
    expect(res.body.actions[5]).toMatchObject({ action: 'review.hide', targetUser: 'ana', targetReviewId: ids.review, book: 'Fantastic Mr. Fox' })
  })

  test('conta excluída: o registro deixa de apontar para ela e não guarda nada dela', async () => {
    const davi = await userId('davi')
    await request(app).post(`/admin/users/${davi}/suspend`).set(asAdmin()).send({ password: PASSWORD, reason: 'teste de exclusão' })
    await request(app).post(`/admin/users/${davi}/reactivate`).set(asAdmin()).send({ password: PASSWORD })
    tokens.davi = tokenFrom(await request(app).post('/auth/login').send({ username: 'davi', password: PASSWORD }))
    expect((await request(app).delete('/auth/me').set(auth('davi')).send({ password: PASSWORD })).status).toBe(204)
    const res = await request(app).get('/admin/actions').set(asAdmin())
    expect(res.body.actions.slice(0, 2).map(a => a.targetUser)).toEqual([null, null])
    expect(JSON.stringify(res.body)).not.toMatch(/davi/)
  })

  test('bloquear de novo e sair apagam a liberação', async () => {
    const lock = await request(app).post('/admin/lock').set(asAdmin())
    expect(lock.headers['set-cookie'].some(c => /^admin_unlock=;/.test(c))).toBe(true)
    const out = await request(app).post('/auth/logout').set(asAdmin())
    expect(out.headers['set-cookie'].some(c => /^admin_unlock=;/.test(c))).toBe(true)
  })
})
