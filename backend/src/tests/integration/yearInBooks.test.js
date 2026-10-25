import request from 'supertest'
import app from '../../app.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const YEAR = 2025

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
}

async function book(user, title, authors, extra = {}) {
  const res = await request(app).post('/library').set(auth(user)).field({ title, authors, ...extra })
  return res.body.bookId
}

const read = (user, id, body) => request(app).post(`/library/${id}/readings`).set(auth(user)).send(body)
const year = (user, value) => request(app).get(`/dashboard/year/${value}`).set(auth(user))

beforeAll(async () => {
  await clearDatabase()
  await signUp('ana')
  await signUp('bia')

  const curto = await book('ana', 'Curto', 'Autora A', { pageCount: 100, tags: 'Contos' })
  const longo = await book('ana', 'Longo', 'Autora A', { pageCount: 900, tags: 'Contos' })
  const semPaginas = await book('ana', 'Sem páginas', 'Autor B')
  const relido = await book('ana', 'Relido', 'Autor C', { pageCount: 300 })

  await read('ana', curto, { startedOn: `${YEAR}-01-01`, finishedOn: `${YEAR}-01-03`, rating: 3 })
  await read('ana', longo, { startedOn: `${YEAR}-02-01`, finishedOn: `${YEAR}-03-20`, rating: 5 })
  await read('ana', semPaginas, { finishedOn: `${YEAR}-03-05` })
  // Relido: uma leitura no ano anterior e outra neste
  await read('ana', relido, { finishedOn: `${YEAR - 1}-06-01`, rating: 4 })
  await read('ana', relido, { startedOn: `${YEAR}-11-01`, finishedOn: `${YEAR}-11-10`, rating: 4 })
  await request(app).put('/dashboard/goal').set(auth('ana')).send({ year: YEAR, target: 10 })

  await book('bia', 'Da Bia', 'Outra')
})

afterAll(async () => {
  await closeDatabase()
})

describe('GET /dashboard/year/:year', () => {
  it('soma as leituras terminadas no ano (releitura conta)', async () => {
    const res = await year('ana', YEAR)
    expect(res.statusCode).toBe(200)
    const data = res.body
    expect(data).toMatchObject({ year: YEAR, isCurrentYear: false, previousYear: 1, goal: { target: 10, done: 4 } })
    expect(data.totals).toEqual({ readings: 4, books: 4, rereads: 1, pages: 1300, pagesMissing: 1, averageRating: 4, rated: 3, reviews: 0 })
    expect(data.months).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0])
    expect(data.busiestMonth).toEqual({ month: 3, count: 2 })
    expect(data.years).toEqual(expect.arrayContaining([YEAR, YEAR - 1, new Date().getFullYear()]))
  })

  it('destaques: mais bem avaliados, recordes, autores e categorias', async () => {
    const data = (await year('ana', YEAR)).body
    expect(data.topRated.map(b => [b.title, b.rating])).toEqual([['Longo', 5], ['Relido', 4], ['Curto', 3]])
    expect(data.longest).toMatchObject({ title: 'Longo', pages: 900 })
    expect(data.shortest).toMatchObject({ title: 'Curto', pages: 100 })
    expect(data.fastest).toMatchObject({ title: 'Curto', days: 2 })
    expect(data.averageDays).toBe(Math.round((2 + 47 + 9) / 3))
    expect(data.first).toMatchObject({ title: 'Curto', finishedOn: `${YEAR}-01-03` })
    expect(data.last).toMatchObject({ title: 'Relido', finishedOn: `${YEAR}-11-10` })
    expect(data.authors[0]).toEqual({ name: 'Autora A', count: 2 })
    expect(data.tags).toEqual([{ name: 'Contos', count: 2 }])
    expect(data.covers.map(c => c.title)).toEqual(['Longo', 'Relido', 'Curto', 'Sem páginas'])
  })

  it('ano vazio, ano inválido e sem login', async () => {
    const empty = (await year('bia', YEAR)).body
    expect(empty.totals.readings).toBe(0)
    expect(empty).toMatchObject({ busiestMonth: null, first: null, longest: null, fastest: null, goal: null, topRated: [] })
    expect((await year('ana', 'abc')).body.code).toBe('YEAR_INVALID')
    expect((await year('ana', 99)).statusCode).toBe(400)
    expect((await request(app).get(`/dashboard/year/${YEAR}`)).statusCode).toBe(401)
  })
})
