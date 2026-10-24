import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
}

async function addBook(user, fields) {
  const res = await request(app).post('/library').set(auth(user)).field({ authors: 'Autor', ...fields })
  if (res.statusCode !== 201) throw new Error(`addBook ${res.statusCode}: ${JSON.stringify(res.body)}`)
  return res.body.bookId
}

const getBook = (user, id) => request(app).get(`/library/${id}`).set(auth(user)).then(res => res.body)
const readings = (user, id) => request(app).get(`/library/${id}/readings`).set(auth(user)).then(res => res.body.readings)
const status = (user, id, body) => request(app).patch(`/library/${id}/status`).set(auth(user)).send(body)
const progress = (user, id, body) => request(app).patch(`/library/${id}/progress`).set(auth(user)).send(body)
const day = value => (value ? new Date(value).toISOString().slice(0, 10) : null)

beforeAll(async () => {
  await clearDatabase()
  await signUp('lia')
  await signUp('teo')
})

afterAll(async () => {
  await closeDatabase()
})

describe('Releituras', () => {
  let bookId

  it('cadastro com data de leitura cria a primeira leitura', async () => {
    bookId = await addBook('lia', { title: 'Duna', readDate: '2023-05-10', pageCount: '600' })
    const book = await getBook('lia', bookId)
    expect(book).toMatchObject({ page_count: 600, read_count: 1, reading_status: null, current_page: null })
    expect(day(book.read_date)).toBe('2023-05-10')
    expect(await readings('lia', bookId)).toEqual([
      expect.objectContaining({ startedOn: null, finishedOn: '2023-05-10', rating: null })
    ])
  })

  it('"Ler de novo" abre uma leitura nova e mantém a anterior', async () => {
    const res = await status('lia', bookId, { status: 'reading', date: '2025-01-02' })
    expect(res.body).toEqual({ status: 'reading', readDate: '2023-05-10', startedAt: '2025-01-02' })
    const list = await readings('lia', bookId)
    expect(list.map(r => [r.startedOn, r.finishedOn])).toEqual([['2025-01-02', null], [null, '2023-05-10']])
    // De novo "Lendo" sem data: continua a mesma leitura
    await status('lia', bookId, { status: 'reading' })
    expect(await readings('lia', bookId)).toHaveLength(2)
  })

  it('editar o livro durante a releitura não fecha a leitura em andamento', async () => {
    const res = await request(app).put(`/library/${bookId}`).set(auth('lia'))
      .send({ title: 'Duna', authors: ['Autor'], readDate: '2023-05-10' })
    expect(res.statusCode).toBe(200)
    const list = await readings('lia', bookId)
    expect(list.map(r => r.finishedOn)).toEqual([null, '2023-05-10'])
  })

  it('progresso: página com total → %, % sem total, página além do total, sem leitura', async () => {
    let res = await progress('lia', bookId, { page: 150 })
    expect(res.statusCode).toBe(200)
    expect(res.body.reading).toMatchObject({ currentPage: 150, progressPercent: 25 })
    expect(res.body.pageCount).toBe(600)

    res = await progress('lia', bookId, { percent: 50 })
    expect(res.body.reading).toMatchObject({ currentPage: 300, progressPercent: 50 })

    res = await progress('lia', bookId, { totalPages: 400 })
    expect(res.body).toMatchObject({ pageCount: 400, reading: { currentPage: 300, progressPercent: 75 } })

    res = await progress('lia', bookId, { page: 401 })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('PROGRESS_PAGE_OVER')
    expect((await progress('lia', bookId, { percent: 101 })).body.code).toBe('PROGRESS_INVALID')
    expect((await progress('lia', bookId, {})).statusCode).toBe(400)

    const book = await getBook('lia', bookId)
    expect(book).toMatchObject({ current_page: 300, progress_percent: 75, page_count: 400 })

    const other = await addBook('lia', { title: 'Sem leitura' })
    expect((await progress('lia', other, { page: 10 })).body.code).toBe('NOT_READING')
  })

  it('concluir fecha a releitura: duas leituras, data nova', async () => {
    const res = await status('lia', bookId, { status: 'read', date: '2025-02-20' })
    expect(res.body).toEqual({ status: 'read', readDate: '2025-02-20', startedAt: null })
    const book = await getBook('lia', bookId)
    expect(book).toMatchObject({ read_count: 2, current_page: null })
    const list = await readings('lia', bookId)
    expect(list.map(r => [r.startedOn, r.finishedOn])).toEqual([['2025-01-02', '2025-02-20'], [null, '2023-05-10']])
  })

  it('painel e filtros contam as duas leituras', async () => {
    const stats = (await request(app).get('/dashboard/stats').set(auth('lia')).query({ year: 2025 })).body
    const byYear = Object.fromEntries((stats.readingByYear ?? stats.reading_by_year).map(r => [r.year, r.count]))
    expect(byYear).toMatchObject({ 2023: 1, 2025: 1 })
    const byMonth = stats.readingByMonth ?? stats.reading_by_month
    expect(byMonth.find(m => m.month === 2).count).toBe(1)

    for (const year of [2023, 2025]) {
      const list = (await request(app).get('/library').set(auth('lia')).query({ readYear: year })).body.result
      expect(list.map(b => b.title)).toEqual(['Duna'])
    }
    const feb = (await request(app).get('/library').set(auth('lia')).query({ readYear: 2025, readMonth: 2 })).body.result
    expect(feb).toHaveLength(1)
  })

  it('histórico: registrar, editar nota/datas e apagar uma leitura', async () => {
    let res = await request(app).post(`/library/${bookId}/readings`).set(auth('lia'))
      .send({ startedOn: '2019-03-01', finishedOn: '2019-04-01', rating: 4 })
    expect(res.statusCode).toBe(201)
    const id = res.body.reading.id
    expect(res.body.book).toMatchObject({ status: 'read', readDate: '2025-02-20' })
    expect((await getBook('lia', bookId)).read_count).toBe(3)

    res = await request(app).patch(`/library/${bookId}/readings/${id}`).set(auth('lia')).send({ rating: 5 })
    expect(res.body.reading).toMatchObject({ rating: 5, startedOn: '2019-03-01' })

    res = await request(app).patch(`/library/${bookId}/readings/${id}`).set(auth('lia')).send({ startedOn: '2019-05-01' })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('READING_DATES_ORDER')

    // Data no futuro
    res = await request(app).post(`/library/${bookId}/readings`).set(auth('lia')).send({ finishedOn: '2999-01-01' })
    expect(res.body.code).toBe('READ_DATE_FUTURE')

    res = await request(app).delete(`/library/${bookId}/readings/${id}`).set(auth('lia'))
    expect(res.statusCode).toBe(200)
    expect((await readings('lia', bookId)).map(r => r.finishedOn)).toEqual(['2025-02-20', '2023-05-10'])
    expect((await request(app).delete(`/library/${bookId}/readings/${id}`).set(auth('lia'))).statusCode).toBe(404)
  })

  it('só uma leitura em andamento por livro', async () => {
    await status('lia', bookId, { status: 'reading', date: '2025-06-01' })
    let res = await request(app).post(`/library/${bookId}/readings`).set(auth('lia')).send({ startedOn: '2025-06-02' })
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('READING_ALREADY_OPEN')
    // Reabrir uma concluída com outra em andamento também não pode
    const done = (await readings('lia', bookId)).find(r => r.finishedOn === '2025-02-20')
    res = await request(app).patch(`/library/${bookId}/readings/${done.id}`).set(auth('lia')).send({ finishedOn: null })
    expect(res.body.code).toBe('READING_ALREADY_OPEN')
    // Apagar a em andamento volta para "Lido"
    const open = (await readings('lia', bookId)).find(r => r.finishedOn === null)
    res = await request(app).delete(`/library/${bookId}/readings/${open.id}`).set(auth('lia'))
    expect(res.body.book).toEqual({ status: 'read', readDate: '2025-02-20', startedAt: null })
  })

  it('desmarcar lido apaga só a última leitura', async () => {
    const res = await request(app).delete(`/library/${bookId}/read`).set(auth('lia'))
    expect(res.body).toMatchObject({ status: 'read', readDate: '2023-05-10' })
    expect(await readings('lia', bookId)).toHaveLength(1)
  })

  it('marcar lido no card (PATCH /read) e em lote não duplicam leituras', async () => {
    await request(app).patch(`/library/${bookId}/read`).set(auth('lia')).send({ readDate: '2023-06-01' })
    expect((await readings('lia', bookId)).map(r => r.finishedOn)).toEqual(['2023-06-01'])
    await request(app).post('/library/batch').set(auth('lia')).send({ ids: [bookId], action: 'status', status: 'read', date: '2024-01-01' })
    expect((await readings('lia', bookId)).map(r => r.finishedOn)).toEqual(['2023-06-01'])
  })

  it('"Quero ler" apaga o histórico e fica como Quero ler', async () => {
    const res = await status('lia', bookId, { status: 'want' })
    expect(res.body).toEqual({ status: 'want', readDate: null, startedAt: null })
    expect(await readings('lia', bookId)).toEqual([])
    // Começar a ler um "Quero ler" tira de "Quero ler"
    const started = await status('lia', bookId, { status: 'reading', date: '2026-01-01' })
    expect(started.body.status).toBe('reading')
  })

  it('PUT com readDate: null explícito tira o "lido" e mantém a leitura em andamento', async () => {
    const id = await addBook('lia', { title: 'Releitura PUT', readDate: '2022-01-01' })
    await status('lia', id, { status: 'reading', date: '2026-02-01' })
    await request(app).put(`/library/${id}`).set(auth('lia')).send({ title: 'Releitura PUT', authors: ['Autor'], readDate: null })
    const book = await getBook('lia', id)
    expect(book).toMatchObject({ read_date: null, reading_status: 'reading', read_count: 0 })
  })

  it('páginas inválidas e livro de outra pessoa', async () => {
    const res = await request(app).post('/library').set(auth('lia')).field({ title: 'X', authors: 'A', pageCount: '0' })
    expect(res.body.code).toBe('PAGE_COUNT_INVALID')
    expect((await request(app).get(`/library/${bookId}/readings`).set(auth('teo'))).statusCode).toBe(403)
    expect((await progress('teo', bookId, { page: 1 })).statusCode).toBe(403)
    expect((await request(app).get('/library/999999/readings').set(auth('lia'))).statusCode).toBe(404)
  })
})

describe('Exportar e importar leituras', () => {
  it('JSON traz o histórico; CSV leva read_dates e pages e volta igual', async () => {
    const id = await addBook('teo', { title: 'Relido', readDate: '2020-01-15', pageCount: '320' })
    await status('teo', id, { status: 'reading', date: '2024-03-01' })
    await status('teo', id, { status: 'read', date: '2024-04-01' })

    const json = (await request(app).get('/auth/me/export').set(auth('teo'))).body
    const book = json.books.find(b => b.title === 'Relido')
    expect(book.pages).toBe(320)
    expect(book.readings.map(r => r.finishedOn)).toEqual(['2020-01-15', '2024-04-01'])

    const csv = await request(app).get('/auth/me/export').set(auth('teo')).query({ format: 'csv' }).buffer(true)
      .parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', c => { d += c }); r.on('end', () => cb(null, d)) })

    await db.query("DELETE FROM librishelf.books WHERE title = 'Relido'")
    const imported = await request(app).post('/library/import').set(auth('teo'))
      .attach('file', Buffer.from(csv.body), { filename: 'librishelf.csv', contentType: 'text/csv' })
    expect(imported.body).toMatchObject({ imported: 1, failed: 0 })
    const copy = (await request(app).get('/library').set(auth('teo'))).body.result.find(b => b.title === 'Relido')
    expect(copy).toMatchObject({ read_count: 2, page_count: 320 })
    expect(day(copy.read_date)).toBe('2024-04-01')
  })
})
