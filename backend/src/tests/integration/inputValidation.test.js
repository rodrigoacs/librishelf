import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const thisYear = new Date().getUTCFullYear()

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
}

async function addBook(user, fields = {}) {
  const res = await request(app).post('/library').set(auth(user)).field({ title: 'Livro', authors: 'Autora', ...fields })
  return res
}

const put = (user, id, body) => request(app).put(`/library/${id}`).set(auth(user)).send({ title: 'Livro', authors: ['Autora'], ...body })
const addReading = (user, id, body) => request(app).post(`/library/${id}/readings`).set(auth(user)).send(body)

let bookId

beforeAll(async () => {
  await clearDatabase()
  await signUp('ana')
  await signUp('bia')
  bookId = (await addBook('ana')).body.bookId
})

afterAll(async () => {
  await closeDatabase()
})

describe('A5 · datas', () => {
  it.each([
    ['10000-01-01', 'DATE_INVALID'],
    ['-000001-01-01', 'DATE_INVALID'],
    ['2020-02-31', 'DATE_INVALID'],
    ['2021-02-29', 'DATE_INVALID'],
    ['2020-1-1', 'DATE_INVALID'],
    ['ontem', 'DATE_INVALID'],
    ['0999-12-31', 'DATE_OUT_OF_RANGE'],
    ['2101-01-01', 'DATE_OUT_OF_RANGE']
  ])('publicação %s → 400 %s', async (pubDate, code) => {
    const res = await put('ana', bookId, { pubDate })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe(code)
  })

  it('publicação válida (inclusive 29/02 em ano bissexto e 1000–2100) continua igual', async () => {
    for (const pubDate of ['2020-02-29', '1000-01-01', '2100-12-31']) {
      expect((await put('ana', bookId, { pubDate })).statusCode).toBe(200)
    }
  })

  it.each([
    ['-000010-05-05', 'DATE_INVALID'],
    ['0200-01-01', 'DATE_OUT_OF_RANGE'],
    ['1899-12-31', 'DATE_OUT_OF_RANGE']
  ])('leitura terminada em %s → 400 %s', async (finishedOn, code) => {
    const res = await addReading('ana', bookId, { finishedOn })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe(code)
  })

  it('leitura de 1900 em diante vale; o perfil não ganha anos absurdos', async () => {
    expect((await addReading('ana', bookId, { finishedOn: '1900-01-01' })).statusCode).toBe(201)
    const { rows } = await db.query('SELECT min(finished_on)::text AS first FROM librishelf.readings')
    expect(rows[0].first).toBe('1900-01-01')
  })
})

describe('A5 · tamanho dos campos', () => {
  it.each([
    ['title', 501],
    ['isbn', 33],
    ['publisher', 201]
  ])('%s com %i caracteres → 400 FIELD_TOO_LONG (antes: 500 do índice)', async (field, length) => {
    const value = 'x'.repeat(length)
    const created = await addBook('ana', { [field]: value })
    expect(created.statusCode).toBe(400)
    expect(created.body).toMatchObject({ code: 'FIELD_TOO_LONG', params: { field } })

    const updated = await put('ana', bookId, { [field]: value })
    expect(updated.statusCode).toBe(400)
    expect(updated.body.code).toBe('FIELD_TOO_LONG')
  })

  it('4.000 caracteres aleatórios no título não derrubam a API', async () => {
    const res = await addBook('ana', { title: Array.from({ length: 4000 }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join('') })
    expect(res.statusCode).toBe(400)
  })

  it('no limite passa', async () => {
    const res = await addBook('ana', { title: 't'.repeat(500), publisher: 'p'.repeat(200), isbn: '9780140328721' })
    expect(res.statusCode).toBe(201)
  })

  it('campo multipart acima de 100 KB → 400 FIELD_TOO_LONG', async () => {
    const res = await addBook('ana', { notes: 'n'.repeat(101 * 1024) })
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ code: 'FIELD_TOO_LONG', params: { field: 'notes' } })
  })
})

describe('B1 · livro de outra pessoa responde como inexistente', () => {
  it('GET, PUT, DELETE, nota, status, leituras e resenha: todos 404', async () => {
    const calls = [
      request(app).get(`/library/${bookId}`).set(auth('bia')),
      put('bia', bookId, {}),
      request(app).delete(`/library/${bookId}`).set(auth('bia')),
      request(app).patch(`/library/${bookId}/rating`).set(auth('bia')).send({ rating: 3 }),
      request(app).patch(`/library/${bookId}/status`).set(auth('bia')).send({ status: 'want' }),
      request(app).get(`/library/${bookId}/readings`).set(auth('bia')),
      request(app).put(`/library/${bookId}/review`).set(auth('bia')).send({ body: 'oi' })
    ]
    for (const res of await Promise.all(calls)) {
      expect(res.statusCode).toBe(404)
    }
  })
})

describe('B2 · todo erro com código', () => {
  it('JSON quebrado → 400 JSON_INVALID em português', async () => {
    const res = await request(app).put(`/library/${bookId}`).set(auth('ana')).set('Content-Type', 'application/json').send('{"title": ')
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'O corpo da requisição não é um JSON válido.', code: 'JSON_INVALID' })
  })

  it('rota inexistente → 404 ROUTE_NOT_FOUND em JSON', async () => {
    const res = await request(app).get('/nao-existe')
    expect(res.statusCode).toBe(404)
    expect(res.body.code).toBe('ROUTE_NOT_FOUND')
  })

  it('cadastro sem campos → REGISTER_FIELDS_REQUIRED', async () => {
    const res = await request(app).post('/auth/register').send({})
    expect(res.body.code).toBe('REGISTER_FIELDS_REQUIRED')
  })

  it('capa que não é imagem no POST /:id/cover → IMAGE_INVALID', async () => {
    const res = await request(app).post(`/library/${bookId}/cover`).set(auth('ana'))
      .attach('coverImage', Buffer.from('não sou imagem'), { filename: 'capa.png', contentType: 'image/png' })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('IMAGE_INVALID')
  })

  it('ISBN repetido → 409 ISBN_TAKEN', async () => {
    const res = await addBook('ana', { isbn: '9780140328721' })
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('ISBN_TAKEN')
  })
})

describe('M2 · feed manda o dia da leitura', () => {
  it('evento de leitura traz date = o dia escolhido', async () => {
    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ showActivity: true })
    await request(app).post('/social/follow/ana').set(auth('bia'))
    await request(app).post('/social/requests/bia/accept').set(auth('ana'))
    await request(app).patch(`/library/${bookId}/read`).set(auth('ana')).send({ readDate: '2026-10-24' })

    const { events } = (await request(app).get('/social/feed').set(auth('bia'))).body
    const read = events.find(event => event.type === 'read' && event.bookId === bookId)
    expect(read.date).toBe('2026-10-24')
    expect(events.filter(event => event.type === 'added').every(event => event.date === undefined)).toBe(true)
  })
})

describe('M10 · data do aparelho', () => {
  it('lote "Lendo" usa a data enviada e não muda o início de quem já está lendo', async () => {
    const other = (await addBook('ana', { title: 'Outro' })).body.bookId
    let res = await request(app).post('/library/batch').set(auth('ana')).send({ ids: [other], action: 'status', status: 'reading', date: '2026-01-02' })
    expect(res.statusCode).toBe(200)
    const started = async () => (await db.query('SELECT started_on::text AS d FROM librishelf.readings WHERE book_id = $1 AND finished_on IS NULL', [other])).rows[0].d
    expect(await started()).toBe('2026-01-02')

    res = await request(app).post('/library/batch').set(auth('ana')).send({ ids: [other], action: 'status', status: 'reading', date: '2026-01-05' })
    expect(res.statusCode).toBe(200)
    expect(await started()).toBe('2026-01-02')
  })

  it('retrospectiva: "ano corrente" segue o ano do aparelho (±1 do servidor)', async () => {
    const next = (await request(app).get(`/dashboard/year/${thisYear + 1}?current=${thisYear + 1}`).set(auth('ana'))).body
    expect(next.isCurrentYear).toBe(true)
    const server = (await request(app).get(`/dashboard/year/${thisYear}`).set(auth('ana'))).body
    expect(server.isCurrentYear).toBe(true)
    const far = (await request(app).get(`/dashboard/year/${thisYear}?current=${thisYear + 5}`).set(auth('ana'))).body
    expect(far.isCurrentYear).toBe(true)
  })
})
