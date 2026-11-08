import fs from 'fs/promises'
import request from 'supertest'
import sharp from 'sharp'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'
import { drain } from '../../jobs/worker.js'
import { photoPath } from '../../services/collectionService.js'

// Coleção (pacote 28): empréstimo grátis; exemplar, fotos e lembrete são Pro.
const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const W = 'teste-colecao'

async function signUp(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const book = async (name, title) =>
  (await db.query('INSERT INTO librishelf.books (title, user_id) VALUES ($1, $2) RETURNING id', [title, ids[name]])).rows[0].id

const grantPro = name => db.query(
  `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
   VALUES ($1, 'trial', 'trial', 'active', now() - interval '1 day', now() + interval '30 days')`, [ids[name]])
const endPro = name => db.query(
  "UPDATE librishelf.entitlements SET ends_at = now() - interval '1 minute' WHERE user_id = $1", [ids[name]])
const restorePro = name => db.query(
  "UPDATE librishelf.entitlements SET ends_at = now() + interval '30 days' WHERE user_id = $1", [ids[name]])

// Foto "de celular": 2400×1200 com EXIF girando 90° e coordenadas de GPS
const photo = () => sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#a33' } })
  .withMetadata({ orientation: 6, exif: { IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '20/1 30/1 0/1' } } })
  .jpeg().toBuffer()

const upload = async (name, bookId) =>
  request(app).post(`/collection/books/${bookId}/photos`).set(auth(name)).attach('photo', await photo(), 'foto.jpg')

const iso = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

const books = {}

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['dona', 'livre', 'outra']) await signUp(name)
  await grantPro('dona')
  books.duna = await book('dona', 'Duna')
  books.fundacao = await book('dona', 'Fundação')
  books.livre = await book('livre', 'Grátis')
  books.alheio = await book('outra', 'Alheio')
})

afterAll(async () => {
  await fs.rm(photoPath(ids.dona, 0, 0, 'x').replace(/\/[^/]+$/, ''), { recursive: true, force: true })
  await closeDatabase()
})

describe('empréstimo básico (grátis)', () => {
  let loanId

  test('sem Pro empresta, lista, muda e devolve', async () => {
    let res = await request(app).post(`/collection/books/${books.livre}/loan`).set(auth('livre'))
      .send({ borrower: '  Marina ', lentOn: '2026-10-01', dueOn: '2026-10-31' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ borrower: 'Marina', lentOn: '2026-10-01', dueOn: '2026-10-31', returnedOn: null, remind: false })
    loanId = res.body.id

    res = await request(app).post(`/collection/books/${books.livre}/loan`).set(auth('livre')).send({ borrower: 'Caio' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('LOAN_ALREADY_OPEN')

    res = await request(app).get('/collection/loans').set(auth('livre'))
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ title: 'Grátis', borrower: 'Marina', overdue: true })

    res = await request(app).patch(`/collection/loans/${loanId}`).set(auth('livre')).send({ borrower: 'Marina L.', dueOn: '2026-12-01' })
    expect(res.body).toMatchObject({ borrower: 'Marina L.', lentOn: '2026-10-01', dueOn: '2026-12-01' })

    res = await request(app).post(`/collection/loans/${loanId}/return`).set(auth('livre')).send({ returnedOn: '2026-11-02' })
    expect(res.body.returnedOn).toBe('2026-11-02')
    expect((await request(app).post(`/collection/loans/${loanId}/return`).set(auth('livre'))).body.code).toBe('LOAN_ALREADY_RETURNED')

    res = await request(app).get(`/collection/books/${books.livre}`).set(auth('livre'))
    expect(res.body.loan).toBeNull()
    expect(res.body.history).toHaveLength(1)
    expect((await request(app).get('/collection/loans?status=returned').set(auth('livre'))).body).toHaveLength(1)
    expect((await request(app).get('/collection/loans').set(auth('livre'))).body).toHaveLength(0)
  })

  test('validação', async () => {
    const lend = body => request(app).post(`/collection/books/${books.livre}/loan`).set(auth('livre')).send(body)
    expect((await lend({ borrower: ' ' })).body.code).toBe('LOAN_BORROWER_REQUIRED')
    expect((await lend({ borrower: 'A', lentOn: '2026-02-30' })).body).toMatchObject({ code: 'LOAN_DATE_INVALID', params: { field: 'lentOn' } })
    expect((await lend({ borrower: 'A', lentOn: '2026-05-10', dueOn: '2026-05-01' })).body.code).toBe('LOAN_DUE_BEFORE_LENT')
    expect((await lend({ borrower: 'x'.repeat(121) })).body.code).toBe('FIELD_TOO_LONG')
  })

  test('livro e empréstimo de outra pessoa: 404', async () => {
    expect((await request(app).post(`/collection/books/${books.alheio}/loan`).set(auth('livre')).send({ borrower: 'A' })).status).toBe(404)
    expect((await request(app).get(`/collection/books/${books.alheio}`).set(auth('livre'))).body.code).toBe('BOOK_NOT_FOUND')
    expect((await request(app).delete(`/collection/loans/${loanId}`).set(auth('outra'))).body.code).toBe('LOAN_NOT_FOUND')
  })

  test('excluir o registro', async () => {
    expect((await request(app).delete(`/collection/loans/${loanId}`).set(auth('livre'))).status).toBe(204)
    expect((await request(app).get(`/collection/books/${books.livre}`).set(auth('livre'))).body.history).toEqual([])
  })
})

describe('exemplar (Pro)', () => {
  test('com Pro salva local, preço e valor; tudo vazio exclui o registro', async () => {
    let res = await request(app).put(`/collection/books/${books.duna}/copy`).set(auth('dona'))
      .send({ location: 'Estante da sala, 2ª prateleira', priceCents: 8990, valueCents: 15000, acquiredOn: '2024-06-01' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ location: 'Estante da sala, 2ª prateleira', priceCents: 8990, valueCents: 15000, currency: 'BRL', acquiredOn: '2024-06-01' })

    await request(app).put(`/collection/books/${books.fundacao}/copy`).set(auth('dona')).send({ priceCents: 4500 })
    res = await request(app).get('/collection/summary').set(auth('dona'))
    expect(res.body.totals).toEqual([{ currency: 'BRL', books: 2, paidCents: 13490, valueCents: 19500 }])
    expect(res.body.located).toBe(1)

    res = await request(app).put(`/collection/books/${books.fundacao}/copy`).set(auth('dona')).send({})
    expect(res.body.priceCents).toBeNull()
    expect((await db.query('SELECT 1 FROM librishelf.book_copies WHERE book_id = $1', [books.fundacao])).rowCount).toBe(0)
  })

  test('valores inválidos', async () => {
    const put = body => request(app).put(`/collection/books/${books.duna}/copy`).set(auth('dona')).send(body)
    expect((await put({ priceCents: -1 })).body).toMatchObject({ code: 'COPY_VALUE_INVALID', params: { field: 'priceCents' } })
    expect((await put({ priceCents: 10.5 })).body.code).toBe('COPY_VALUE_INVALID')
    expect((await put({ currency: 'reais' })).body.code).toBe('COPY_CURRENCY_INVALID')
  })

  test('sem Pro: lê o que já tem, a escrita recebe PRO_REQUIRED e nada some', async () => {
    await endPro('dona')
    try {
      const res = await request(app).get(`/collection/books/${books.duna}`).set(auth('dona'))
      expect(res.status).toBe(200)
      expect(res.body.copy.location).toBe('Estante da sala, 2ª prateleira')

      const refused = await request(app).put(`/collection/books/${books.duna}/copy`).set(auth('dona')).send({ location: 'Outra' })
      expect(refused.status).toBe(403)
      expect(refused.body).toMatchObject({ code: 'PRO_REQUIRED', params: { feature: 'collector' } })
      expect((await upload('dona', books.duna)).body.code).toBe('PRO_REQUIRED')

      // O empréstimo básico continua grátis
      expect((await request(app).post(`/collection/books/${books.fundacao}/loan`).set(auth('dona')).send({ borrower: 'Caio' })).status).toBe(201)
      expect((await request(app).get(`/collection/books/${books.duna}`).set(auth('dona'))).body.copy.priceCents).toBe(8990)
    } finally {
      await restorePro('dona')
    }
  })

  test('quem nunca teve Pro também recebe PRO_REQUIRED', async () => {
    const res = await request(app).put(`/collection/books/${books.livre}/copy`).set(auth('livre')).send({ location: 'Caixa' })
    expect(res.body.code).toBe('PRO_REQUIRED')
  })
})

describe('fotos do exemplar (Pro, com cota)', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env.COPY_PHOTO_QUOTA = env.COPY_PHOTO_QUOTA
    process.env.COPY_PHOTOS_PER_BOOK = env.COPY_PHOTOS_PER_BOOK
    if (env.COPY_PHOTO_QUOTA === undefined) delete process.env.COPY_PHOTO_QUOTA
    if (env.COPY_PHOTOS_PER_BOOK === undefined) delete process.env.COPY_PHOTOS_PER_BOOK
  })

  test('envia, gira pela câmera, tira o GPS e serve só para a dona', async () => {
    const res = await upload('dona', books.duna)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ width: 800, height: 1600 })

    const file = await request(app).get(`${res.body.url}?size=lg`).set(auth('dona')).buffer(true).parse((r, cb) => {
      const chunks = []
      r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(file.status).toBe(200)
    expect(file.headers['content-type']).toMatch(/image\/jpeg/)
    const meta = await sharp(file.body).metadata()
    expect([meta.width, meta.height]).toEqual([800, 1600])
    expect(meta.exif).toBeUndefined()
    expect((await sharp(await fs.readFile(photoPath(ids.dona, books.duna, res.body.id, 'sm'))).metadata()).height).toBe(400)

    expect((await request(app).get(res.body.url).set(auth('outra'))).status).toBe(404)
    expect((await request(app).get(`${res.body.url}?size=xl`).set(auth('dona'))).status).toBe(404)
  })

  test('a cota por conta e por livro é respeitada', async () => {
    process.env.COPY_PHOTOS_PER_BOOK = '2'
    expect((await upload('dona', books.duna)).status).toBe(201) // 2ª neste livro
    let res = await upload('dona', books.duna)
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'COPY_PHOTO_BOOK_LIMIT', params: { max: 2 } })

    process.env.COPY_PHOTO_QUOTA = '3'
    expect((await upload('dona', books.fundacao)).status).toBe(201) // 3ª da conta
    res = await upload('dona', books.fundacao)
    expect(res.body).toMatchObject({ code: 'COPY_PHOTO_QUOTA', params: { max: 3 } })

    const info = await request(app).get(`/collection/books/${books.fundacao}`).set(auth('dona'))
    expect(info.body.quota).toEqual({ used: 3, max: 3, inBook: 1, perBook: 2 })
  })

  test('dois envios ao mesmo tempo não passam da cota', async () => {
    process.env.COPY_PHOTO_QUOTA = '4'
    const results = await Promise.all([upload('dona', books.fundacao), upload('dona', books.fundacao)])
    expect(results.map(r => r.status).sort()).toEqual([201, 409])
    expect((await db.query('SELECT count(*)::int AS n FROM librishelf.copy_photos WHERE user_id = $1', [ids.dona])).rows[0].n).toBe(4)
  })

  test('imagem inválida', async () => {
    const res = await request(app).post(`/collection/books/${books.duna}/photos`).set(auth('dona'))
      .attach('photo', Buffer.from('não é imagem'), { filename: 'x.jpg', contentType: 'image/jpeg' })
    expect(res.body.code).toBe('IMAGE_INVALID')
  })

  test('excluir a foto tira o arquivo; excluir o livro tira as fotos dele', async () => {
    const { body } = await request(app).get(`/collection/books/${books.fundacao}`).set(auth('dona'))
    const [first] = body.photos
    expect((await request(app).delete(`/collection/books/${books.fundacao}/photos/${first.id}`).set(auth('dona'))).status).toBe(204)
    await expect(fs.access(photoPath(ids.dona, books.fundacao, first.id, 'lg'))).rejects.toThrow()

    const left = (await db.query('SELECT id FROM librishelf.copy_photos WHERE book_id = $1', [books.fundacao])).rows
    expect(left.length).toBeGreaterThan(0)
    expect((await request(app).delete(`/library/${books.fundacao}`).set(auth('dona'))).status).toBeLessThan(300)
    for (const { id } of left) await expect(fs.access(photoPath(ids.dona, books.fundacao, id, 'sm'))).rejects.toThrow()
    // As do outro livro continuam
    const duna = (await db.query('SELECT id FROM librishelf.copy_photos WHERE book_id = $1', [books.duna])).rows
    await expect(fs.access(photoPath(ids.dona, books.duna, duna[0].id, 'lg'))).resolves.toBeUndefined()
  })

  test('sem Pro: enviar é recusado, mas excluir a própria foto continua permitido', async () => {
    // Foto extra só para este teste: sai no fim e o Duna volta a ter as 2
    // que a exportação, mais abaixo, conta
    const added = await upload('dona', books.duna)
    expect(added.status).toBe(201)
    const own = { id: added.body.id }
    await endPro('dona')
    try {
      expect((await upload('dona', books.duna)).body.code).toBe('PRO_REQUIRED')
      expect((await request(app).delete(`/collection/books/${books.duna}/photos/${own.id}`).set(auth('outra'))).status).toBe(404)
      expect((await request(app).delete(`/collection/books/${books.duna}/photos/${own.id}`).set(auth('dona'))).status).toBe(204)
      await expect(fs.access(photoPath(ids.dona, books.duna, own.id, 'lg'))).rejects.toThrow()
    } finally {
      await restorePro('dona')
    }
  })
})

describe('lembrete de empréstimo por e-mail (Pro)', () => {
  let loanId
  const sendJobs = () => drain(W, { types: ['email.send'] })
  const reminders = () => testOutbox().filter(mail => mail.to === 'dona@example.com' && /emprestado/.test(mail.subject))
  const runNow = () => db.query("UPDATE librishelf.jobs SET run_at = now() WHERE type = 'email.send' AND done_at IS NULL AND failed_at IS NULL")

  beforeAll(async () => {
    testOutbox().length = 0
    const res = await request(app).post(`/collection/books/${books.duna}/loan`).set(auth('dona'))
      .send({ borrower: 'Marina', dueOn: iso(5) })
    loanId = res.body.id
  })

  test('sem prazo não liga; sem Pro é recusado', async () => {
    const other = await request(app).post(`/collection/books/${books.livre}/loan`).set(auth('livre')).send({ borrower: 'A', dueOn: iso(3) })
    expect((await request(app).put(`/collection/loans/${other.body.id}/reminder`).set(auth('livre')).send({ remind: true })).body.code).toBe('PRO_REQUIRED')

    const fresh = await book('dona', 'Sem prazo')
    const open = await request(app).post(`/collection/books/${fresh}/loan`).set(auth('dona')).send({ borrower: 'B' })
    expect((await request(app).put(`/collection/loans/${open.body.id}/reminder`).set(auth('dona')).send({ remind: true })).body.code).toBe('LOAN_DUE_REQUIRED')
  })

  test('agenda para o dia do prazo, um só por prazo, e envia', async () => {
    const res = await request(app).put(`/collection/loans/${loanId}/reminder`).set(auth('dona')).send({ remind: true })
    expect(res.body.remind).toBe(true)
    await request(app).put(`/collection/loans/${loanId}/reminder`).set(auth('dona')).send({ remind: true })

    const jobs = (await db.query("SELECT payload, run_at, dedupe_key FROM librishelf.jobs WHERE type = 'email.send'")).rows
    expect(jobs).toHaveLength(1)
    expect(jobs[0].dedupe_key).toBe(`email:loan-reminder:${loanId}:${iso(5)}`)
    expect(new Date(jobs[0].run_at).toISOString()).toBe(`${iso(5)}T12:00:00.000Z`)

    expect(await sendJobs()).toEqual([]) // ainda não é a hora
    await runNow()
    const [done] = await sendJobs()
    expect(done.result).toEqual({ sent: 'loan_reminder' })
    const [mail] = reminders()
    expect(mail.subject).toBe('Lembrete: “Duna” está emprestado')
    expect(mail.text).toContain('Olá, dona.')
    expect(mail.text).toContain('Marina')
    expect(mail.text).toContain('/loans')
  })

  test('prazo mudou: o aviso antigo não sai, o novo sai', async () => {
    testOutbox().length = 0
    await request(app).patch(`/collection/loans/${loanId}`).set(auth('dona')).send({ borrower: 'Marina', dueOn: iso(9) })
    await db.query("UPDATE librishelf.jobs SET done_at = NULL, run_at = now() WHERE dedupe_key = $1", [`email:loan-reminder:${loanId}:${iso(5)}`])
    await runNow()
    const results = await sendJobs()
    expect(results.map(r => r.result).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      { sent: 'loan_reminder' },
      { skipped: 'loan_reminder', reason: 'prazo mudou' }
    ])
    expect(reminders()).toHaveLength(1)
  })

  test('devolvido ou sem Pro na hora de enviar: não sai', async () => {
    testOutbox().length = 0
    await request(app).patch(`/collection/loans/${loanId}`).set(auth('dona')).send({ borrower: 'Marina', dueOn: iso(12) })
    await endPro('dona')
    await runNow()
    expect((await sendJobs())[0].result).toEqual({ skipped: 'loan_reminder', reason: 'sem Pro' })
    await restorePro('dona')

    await request(app).patch(`/collection/loans/${loanId}`).set(auth('dona')).send({ borrower: 'Marina', dueOn: iso(15) })
    await request(app).post(`/collection/loans/${loanId}/return`).set(auth('dona')).send({})
    await runNow()
    expect((await sendJobs())[0].result).toEqual({ skipped: 'loan_reminder', reason: 'livro devolvido' })
    expect(reminders()).toHaveLength(0)
  })
})

describe('exportação', () => {
  test('dataService.exportJson inclui a coleção', async () => {
    const { exportJson } = await import('../../services/dataService.js')
    const data = await exportJson(ids.dona)
    expect(data.collection.copies).toEqual([expect.objectContaining({ title: 'Duna', location: 'Estante da sala, 2ª prateleira', photos: 2 })])
    expect(data.collection.loans.map(loan => loan.borrower)).toEqual(expect.arrayContaining(['Marina', 'B']))
  })
})
