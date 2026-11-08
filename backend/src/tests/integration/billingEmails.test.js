import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'
import { setFetch, API_URL } from '../../services/mercadoPago.js'
import { processPayment } from '../../services/paymentService.js'
import { scanDue, TRIAL_WARNING_DAYS } from '../../services/billingEmailService.js'
import * as quota from '../../services/emailQuota.js'
import * as queue from '../../jobs/queue.js'
import { HANDLERS, RECURRING, RetryLaterError } from '../../jobs/registry.js'
import { drain, runOnce } from '../../jobs/worker.js'

const DAY = 24 * 60 * 60 * 1000
const PASSWORD = 'senha12345'
const W = 'teste-emails'
const sendJobs = () => drain(W, { types: ['email.send'] })
const mailsTo = name => testOutbox().filter(mail => mail.to === `${name}@example.com`)
const emailJobs = async () => (await db.query("SELECT * FROM librishelf.jobs WHERE type = 'email.send' ORDER BY id")).rows
const runNow = sql => db.query(`UPDATE librishelf.jobs SET run_at = now() WHERE type = 'email.send' AND ${sql}`)

// ---------------------------------------------------------- Mercado Pago falso
const mp = { payments: new Map(), seq: 5000 }
setFetch(async (url) => {
  const path = url.replace(API_URL, '')
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const match = path.match(/^\/v1\/payments\/(\d+)$/)
  if (match && mp.payments.has(match[1])) return json(200, mp.payments.get(match[1]))
  return json(404, { message: 'not found' })
})

function mpPayment(reference, { status = 'approved', amount = 49.9, method = 'pix' } = {}) {
  const id = String(++mp.seq)
  mp.payments.set(id, {
    id: Number(id), status, external_reference: reference, transaction_amount: amount, currency_id: 'BRL',
    payment_method_id: method === 'pix' ? 'pix' : 'visa', payment_type_id: method === 'pix' ? 'bank_transfer' : 'credit_card',
    date_created: new Date().toISOString(), date_approved: status === 'approved' ? new Date().toISOString() : null
  })
  return id
}

async function user(name, { verified = true, locale = 'pt' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO librishelf.users (name, email, password_hash, email_verified_at, email_locale)
     VALUES ($1, $2, 'x', CASE WHEN $3 THEN now() END, $4) RETURNING id`,
    [name, `${name}@example.com`, verified, locale]
  )
  return rows[0].id
}

async function entitlement(userId, kind, { endsInDays = null, source = 'mercadopago', autoRenew = false, status = 'active' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at, auto_renew)
     VALUES ($1, $2, $3, $4, now() - interval '300 days', $5, $6) RETURNING id`,
    [userId, kind, source, status, endsInDays === null ? null : new Date(Date.now() + endsInDays * DAY), autoRenew]
  )
  return Number(rows[0].id)
}

async function reservation(userId, offer, { amount = 4990, preferenceId = null } = {}) {
  const reference = `ref-${offer}-${userId}-${Math.random().toString(36).slice(2)}`
  const { rows } = await db.query(
    `INSERT INTO librishelf.offer_reservations (user_id, offer_code, reference, expires_at, amount_cents, preference_id)
     VALUES ($1, $2, $3, now() + interval '1 hour', $4, $5) RETURNING id, reference`,
    [userId, offer, reference, amount, preferenceId]
  )
  return rows[0]
}

beforeAll(() => { process.env.MP_ACCESS_TOKEN = 'TEST-token' })
beforeEach(async () => {
  await clearDatabase()
  testOutbox().length = 0
  delete process.env.MAIL_DAILY_LIMIT
  delete process.env.MAIL_DIRECT_RESERVE
})
afterAll(async () => {
  delete process.env.MP_ACCESS_TOKEN
  delete process.env.MAIL_DAILY_LIMIT
  delete process.env.MAIL_DIRECT_RESERVE
  await closeDatabase()
})

describe('registro dos jobs', () => {
  test('handlers e periódicos novos existem', () => {
    for (const type of ['email.send', 'billing.reminders', 'follow-emails.sweep', 'tokens.cleanup']) {
      expect(typeof HANDLERS[type]).toBe('function')
    }
    const types = RECURRING.map(job => job.type)
    expect(types).toEqual(expect.arrayContaining(['billing.reminders', 'follow-emails.sweep', 'tokens.cleanup']))
  })

  test('limpeza de tokens roda pela fila', async () => {
    await queue.enqueue('tokens.cleanup')
    expect((await drain(W, { types: ['tokens.cleanup'] }))[0]).toMatchObject({ status: 'done', result: { removed: 0 } })
  })
})

describe('lembrete de renovação', () => {
  test('anual vencendo em 5 dias: um e-mail só, mesmo varrendo de novo', async () => {
    const ana = await user('ana')
    await entitlement(ana, 'annual', { endsInDays: 5 })

    expect((await scanDue()).renewal).toBe(1)
    expect((await scanDue()).renewal).toBe(0)
    await sendJobs()
    expect((await scanDue()).renewal).toBe(0)
    await sendJobs()

    const mails = mailsTo('ana')
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toMatch(/vence em/)
    expect(mails[0].text).toContain('/pricing?offer=annual')
    expect(mails[0].text).toContain('R$')
  })

  test('fundador anual: fala do preço de fundador', async () => {
    const bia = await user('bia')
    await entitlement(bia, 'founder_annual', { endsInDays: 6 })
    await scanDue()
    await sendJobs()
    expect(mailsTo('bia')[0].text).toMatch(/preço de fundador/)
  })

  test('não avisa: mensal, vitalício, longe do vencimento, já renovado, concessão, e-mail não confirmado', async () => {
    const caio = await user('caio')
    await entitlement(caio, 'monthly', { endsInDays: 3, autoRenew: true })
    const davi = await user('davi')
    await entitlement(davi, 'founder_lifetime')
    const eva = await user('eva')
    await entitlement(eva, 'annual', { endsInDays: 20 })
    const fabi = await user('fabi')
    await entitlement(fabi, 'annual', { endsInDays: 4 })
    await entitlement(fabi, 'annual', { endsInDays: 369 })
    const gil = await user('gil')
    await entitlement(gil, 'annual', { endsInDays: 4, source: 'grant' })
    const hugo = await user('hugo', { verified: false })
    await entitlement(hugo, 'annual', { endsInDays: 4 })

    expect((await scanDue()).renewal).toBe(0)
  })

  test('renovou depois de enfileirado: o job termina sem enviar', async () => {
    const ivo = await user('ivo')
    await entitlement(ivo, 'annual', { endsInDays: 2 })
    await scanDue()
    await entitlement(ivo, 'annual', { endsInDays: 367 })
    const [result] = await sendJobs()
    expect(result.result).toMatchObject({ skipped: 'renewal_reminder', reason: 'já renovado' })
    expect(mailsTo('ivo')).toHaveLength(0)
  })

  test('em inglês para quem escolheu en', async () => {
    const jo = await user('jo', { locale: 'en' })
    await entitlement(jo, 'annual', { endsInDays: 3 })
    await scanDue()
    await sendJobs()
    expect(mailsTo('jo')[0].subject).toMatch(/ends on/)
  })
})

describe('teste grátis', () => {
  async function signUp(name) {
    await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
    await confirmEmail(name)
    const token = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
    const id = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
    return { token, id }
  }

  test('ativar agenda o aviso antes do fim e o do fim, sem duplicar com a varredura', async () => {
    const { token, id } = await signUp('lia')
    testOutbox().length = 0
    const res = await request(app).post('/plan/trial').set({ Authorization: `Bearer ${token}` })
    expect(res.status).toBe(201)
    const endsAt = new Date(res.body.endsAt).getTime()

    const jobs = await emailJobs()
    expect(jobs.map(job => job.payload.kind)).toEqual(['trial_ending', 'trial_ended'])
    expect(Math.abs(new Date(jobs[0].run_at).getTime() - (endsAt - TRIAL_WARNING_DAYS * DAY))).toBeLessThan(2000)
    expect(Math.abs(new Date(jobs[1].run_at).getTime() - endsAt)).toBeLessThan(2000)

    // Faltando 2 dias: a varredura acha o mesmo teste, mas a chave já existe
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() + interval '2 days' WHERE user_id = $1", [id])
    expect((await scanDue()).trialEnding).toBe(0)

    await runNow("payload->>'kind' = 'trial_ending'")
    await sendJobs()
    expect(mailsTo('lia')).toHaveLength(1)
    expect(mailsTo('lia')[0].subject).toMatch(/teste do Pro termina/)

    // Acabou
    await db.query("UPDATE librishelf.entitlements SET starts_at = now() - interval '14 days', ends_at = now() - interval '1 minute' WHERE user_id = $1", [id])
    expect((await scanDue()).trialEnded).toBe(0)
    await runNow("payload->>'kind' = 'trial_ended'")
    await sendJobs()
    expect(mailsTo('lia')).toHaveLength(2)
    expect(mailsTo('lia')[1].subject).toMatch(/teste do Pro terminou/)
    expect(mailsTo('lia')[1].text).toContain('/pricing')
  })

  test('assinou durante o teste: nenhum dos dois avisos sai', async () => {
    const { token, id } = await signUp('max')
    await request(app).post('/plan/trial').set({ Authorization: `Bearer ${token}` })
    testOutbox().length = 0
    await entitlement(id, 'founder_lifetime')

    await runNow("payload->>'kind' = 'trial_ending'")
    await sendJobs()
    await db.query("UPDATE librishelf.entitlements SET starts_at = now() - interval '14 days', ends_at = now() - interval '1 minute' WHERE kind = 'trial'")
    await runNow("payload->>'kind' = 'trial_ended'")
    const results = await sendJobs()
    expect(results.every(r => r.result?.skipped)).toBe(true)
    expect(mailsTo('max')).toHaveLength(0)
  })

  test('varredura acha teste que acabou sem job agendado (ativado antes deste pacote)', async () => {
    const nina = await user('nina')
    await db.query(
      "INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at) VALUES ($1, 'trial', 'trial', now() - interval '14 days', now() - interval '3 hours')",
      [nina]
    )
    expect((await scanDue()).trialEnded).toBe(1)
    await sendJobs()
    expect(mailsTo('nina')).toHaveLength(1)
    // Velho demais: não avisa
    const otto = await user('otto')
    await db.query(
      "INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at) VALUES ($1, 'trial', 'trial', now() - interval '30 days', now() - interval '10 days')",
      [otto]
    )
    expect((await scanDue()).trialEnded).toBe(0)
  })
})

describe('pagamentos', () => {
  test('aprovado: confirmação uma vez só, mesmo processando de novo', async () => {
    const pia = await user('pia')
    const res = await reservation(pia, 'annual')
    const paymentId = mpPayment(res.reference, { method: 'card' })

    expect((await processPayment(paymentId)).result).toBe('granted')
    await processPayment(paymentId)
    await sendJobs()
    await processPayment(paymentId)
    await sendJobs()

    const mails = mailsTo('pia')
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe('Pagamento confirmado no Librishelf')
    expect(mails[0].text).toContain('Cartão')
    expect(mails[0].text).toContain('R$')
  })

  test('mensal: cada cobrança aprovada gera a sua confirmação', async () => {
    const rui = await user('rui')
    const res = await reservation(rui, 'monthly', { amount: 690, preferenceId: 'pre-rui' })
    const first = mpPayment(null, { amount: 6.9, method: 'card' })
    const second = mpPayment(null, { amount: 6.9, method: 'card' })

    expect((await processPayment(first, { preapprovalId: 'pre-rui' })).result).toBe('granted')
    expect((await processPayment(second, { preapprovalId: 'pre-rui' })).result).toBe('granted')
    await sendJobs()
    expect(mailsTo('rui')).toHaveLength(2)
    expect(res.id).toBeDefined()
  })

  test('recusado no checkout avulso: espera 30 min, um aviso por compra', async () => {
    const sol = await user('sol')
    const res = await reservation(sol, 'annual')
    await processPayment(mpPayment(res.reference, { status: 'rejected', method: 'card' }))
    await processPayment(mpPayment(res.reference, { status: 'rejected', method: 'card' }))

    const jobs = await emailJobs()
    expect(jobs).toHaveLength(1)
    expect(new Date(jobs[0].run_at).getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000)
    expect(await sendJobs()).toHaveLength(0)

    await runNow('true')
    await sendJobs()
    const mails = mailsTo('sol')
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe('Pagamento recusado no Librishelf')
    expect(mails[0].text).toMatch(/nada foi cobrado/)
  })

  test('recusado e depois pago com Pix na mesma compra: o aviso não sai', async () => {
    const tais = await user('tais')
    const res = await reservation(tais, 'annual')
    await processPayment(mpPayment(res.reference, { status: 'rejected', method: 'card' }))
    await processPayment(mpPayment(res.reference))
    await runNow("payload->>'kind' = 'payment_declined'")
    await sendJobs()
    const subjects = mailsTo('tais').map(mail => mail.subject)
    expect(subjects).toEqual(['Pagamento confirmado no Librishelf'])
  })

  test('cobrança do mensal recusada com o mês pago: avisa que o Pro continua', async () => {
    const uri = await user('uri')
    await reservation(uri, 'monthly', { amount: 690, preferenceId: 'pre-uri' })
    await processPayment(mpPayment(null, { amount: 6.9, method: 'card' }), { preapprovalId: 'pre-uri' })
    await processPayment(mpPayment(null, { status: 'rejected', amount: 6.9, method: 'card' }), { preapprovalId: 'pre-uri' })
    await processPayment(mpPayment(null, { status: 'rejected', amount: 6.9, method: 'card' }), { preapprovalId: 'pre-uri' })
    await runNow('true')
    await sendJobs()
    const declined = mailsTo('uri').filter(mail => mail.subject.includes('recusado'))
    expect(declined).toHaveLength(1)
    expect(declined[0].text).toMatch(/continua ativo/)
    expect(declined[0].text).toContain('/settings')
  })

  test('reembolsado antes de enviar: a confirmação não sai', async () => {
    const vera = await user('vera')
    const res = await reservation(vera, 'annual')
    const paymentId = mpPayment(res.reference)
    await processPayment(paymentId)
    mp.payments.get(paymentId).status = 'refunded'
    await processPayment(paymentId)
    await sendJobs()
    expect(mailsTo('vera')).toHaveLength(0)
  })
})

describe('limite de envio', () => {
  test('respeita o limite da fila e deixa a parte dos e-mails diretos livre', async () => {
    process.env.MAIL_DAILY_LIMIT = '5'
    process.env.MAIL_DIRECT_RESERVE = '2'
    expect(quota.limits()).toEqual({ daily: 5, reserve: 2, queue: 3 })

    for (const name of ['u1', 'u2', 'u3', 'u4', 'u5']) await entitlement(await user(name), 'annual', { endsInDays: 4 })
    expect((await scanDue()).renewal).toBe(5)

    const results = await sendJobs()
    expect(results.filter(r => r.status === 'done')).toHaveLength(3)
    expect(results.filter(r => r.status === 'deferred')).toHaveLength(2)
    expect(testOutbox()).toHaveLength(3)

    // Adiado não gasta tentativa nem falha; volta depois de pelo menos 1 minuto
    const waiting = (await emailJobs()).filter(job => !job.done_at)
    expect(waiting).toHaveLength(2)
    for (const job of waiting) {
      expect(job.attempts).toBe(0)
      expect(job.failed_at).toBeNull()
      expect(new Date(job.run_at).getTime()).toBeGreaterThan(Date.now() + 50_000)
    }

    // A janela de 24 h andou: os que esperavam saem, sem repetir ninguém
    await db.query("UPDATE librishelf.email_sends SET sent_at = now() - interval '25 hours'")
    await runNow('done_at IS NULL')
    await sendJobs()
    expect(testOutbox()).toHaveLength(5)
    expect(new Set(testOutbox().map(mail => mail.to)).size).toBe(5)
  })

  test('reserva concorrente não passa do limite', async () => {
    process.env.MAIL_DAILY_LIMIT = '4'
    process.env.MAIL_DIRECT_RESERVE = '0'
    const ids = await Promise.all(Array.from({ length: 10 }, () => quota.reserve('teste')))
    expect(ids.filter(Boolean)).toHaveLength(4)
    expect((await quota.usage()).last24h).toBe(4)
  })

  test('falha no SMTP devolve a vaga', async () => {
    const id = await quota.reserve('teste')
    await quota.release(id)
    expect((await quota.usage()).last24h).toBe(0)
  })

  test('RetryLaterError no worker adia sem contar tentativa', async () => {
    HANDLERS['test.later'] = async () => { throw new RetryLaterError('espera', 120) }
    try {
      const id = await queue.enqueue('test.later')
      expect((await runOnce(W, { types: ['test.later'] })).status).toBe('deferred')
      const row = (await db.query('SELECT * FROM librishelf.jobs WHERE id = $1', [id])).rows[0]
      expect(row.attempts).toBe(0)
      expect(row.locked_by).toBeNull()
      expect(new Date(row.run_at).getTime()).toBeGreaterThan(Date.now() + 100_000)
    } finally {
      delete HANDLERS['test.later']
    }
  })
})
