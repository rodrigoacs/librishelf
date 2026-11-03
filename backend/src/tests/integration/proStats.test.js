import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Estatísticas avançadas (pacote 27): Pro até para ler, porque nada é guardado.
const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function entity(table, userId, name) {
  const found = await one(`SELECT id FROM librishelf.${table} WHERE name = $1 AND user_id = $2`, [name, userId])
  return found?.id ?? (await one(`INSERT INTO librishelf.${table} (name, user_id) VALUES ($1, $2) RETURNING id`, [name, userId])).id
}

async function book(userId, { title, pages = null, author, publisher, tag, rating = null }) {
  const publisherId = publisher ? await entity('publishers', userId, publisher) : null
  const { id } = await one(
    'INSERT INTO librishelf.books (title, user_id, page_count, publisher_id, rating) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [title, userId, pages, publisherId, rating]
  )
  if (author) await db.query('INSERT INTO librishelf.books_authors_link (book_id, author_id) VALUES ($1, $2)', [id, await entity('authors', userId, author)])
  if (tag) await db.query('INSERT INTO librishelf.books_tags_link (book_id, tag_id) VALUES ($1, $2)', [id, await entity('tags', userId, tag)])
  return id
}

const reading = (bookId, startedOn, finishedOn, extra = {}) => db.query(
  `INSERT INTO librishelf.readings (book_id, started_on, finished_on, rating, progress_percent)
   VALUES ($1, $2, $3, $4, $5)`,
  [bookId, startedOn, finishedOn, extra.rating ?? null, extra.percent ?? null]
)

const grantPro = name => db.query(
  `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
   VALUES ($1, 'trial', 'trial', 'active', now() - interval '1 day', now() + interval '10 days')`,
  [ids[name]]
)

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['leitora', 'livre']) await signUp(name)
  await grantPro('leitora')

  const u = ids.leitora
  const duna = await book(u, { title: 'Duna', pages: 600, author: 'Frank Herbert', publisher: 'Aleph', tag: 'Ficção', rating: 5 })
  const fundacao = await book(u, { title: 'Fundação', pages: 240, author: 'Isaac Asimov', publisher: 'Aleph', tag: 'Ficção' })
  const curta = await book(u, { title: 'Curta', pages: 100, author: 'Isaac Asimov', publisher: 'Outra' })
  const andamento = await book(u, { title: 'Andamento', pages: 400 })

  await reading(duna, '2025-01-01', '2025-01-30')                 // 30 dias, 2025
  await reading(fundacao, '2025-03-01', '2025-03-10', { rating: 4 }) // 10 dias, 2025
  await reading(duna, '2026-02-01', '2026-02-20')                 // releitura, 20 dias, 2026
  await reading(curta, '2026-02-05', '2026-02-05', { rating: 3 })   // 1 dia, 2026
  await reading(andamento, new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10), null, { percent: 50 })

  // Livro de outra pessoa não entra em nada
  const alheio = await book(ids.livre, { title: 'Alheio', pages: 999, author: 'Frank Herbert' })
  await reading(alheio, '2026-02-01', '2026-02-02')
})

afterAll(closeDatabase)

const ROUTES = [
  '/dashboard/pro/compare?aFrom=2025-01-01&aTo=2025-12-31&bFrom=2026-01-01&bTo=2026-12-31',
  '/dashboard/pro/pace?year=2026',
  '/dashboard/pro/over-years?dimension=authors',
  '/dashboard/pro/chart?metric=readings&group=month&from=2026-01-01&to=2026-03-31'
]

describe('acesso', () => {
  test('sem Pro até a leitura recebe PRO_REQUIRED', async () => {
    for (const url of ROUTES) {
      const res = await request(app).get(url).set(auth('livre'))
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'PRO_REQUIRED', params: { feature: 'stats_advanced' } })
    }
  })

  test('sem login: 401', async () => {
    expect((await request(app).get(ROUTES[0])).status).toBe(401)
  })

  test('com Pro responde', async () => {
    for (const url of ROUTES) expect((await request(app).get(url).set(auth('leitora'))).status).toBe(200)
  })

  test('o Pro acabou: volta a recusar', async () => {
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() - interval '1 minute' WHERE user_id = $1", [ids.leitora])
    expect((await request(app).get(ROUTES[1]).set(auth('leitora'))).body.code).toBe('PRO_REQUIRED')
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() + interval '10 days' WHERE user_id = $1", [ids.leitora])
  })
})

describe('comparar períodos', () => {
  test('2025 × 2026', async () => {
    const { body } = await request(app).get(ROUTES[0]).set(auth('leitora'))
    expect(body.a).toMatchObject({
      from: '2025-01-01', to: '2025-12-31', readings: 2, books: 2, pages: 840, avgRating: 4.5, avgDays: 20, rereads: 0
    })
    expect(body.b).toMatchObject({ readings: 2, books: 2, pages: 700, avgDays: 10.5, rereads: 1 })
    expect(body.b.topAuthors).toEqual([{ name: 'Frank Herbert', count: 1 }, { name: 'Isaac Asimov', count: 1 }])
    expect(body.a.topPublishers).toEqual([{ name: 'Aleph', count: 2 }])
    expect(body.a.topCategories).toEqual([{ name: 'Ficção', count: 2 }])
  })

  test('período vazio vem zerado', async () => {
    const { body } = await request(app)
      .get('/dashboard/pro/compare?aFrom=2010-01-01&aTo=2010-12-31&bFrom=2026-01-01&bTo=2026-01-31')
      .set(auth('leitora'))
    expect(body.a).toMatchObject({ readings: 0, pages: 0, avgRating: null, avgDays: null, topAuthors: [] })
  })

  test('datas inválidas', async () => {
    let res = await request(app).get('/dashboard/pro/compare?aFrom=2025-02-30&aTo=2025-12-31&bFrom=2026-01-01&bTo=2026-12-31').set(auth('leitora'))
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'STATS_DATE_INVALID', params: { field: 'a.from' } })

    res = await request(app).get('/dashboard/pro/compare?aFrom=2025-12-31&aTo=2025-01-01&bFrom=2026-01-01&bTo=2026-12-31').set(auth('leitora'))
    expect(res.body.code).toBe('STATS_PERIOD_INVALID')
  })
})

describe('ritmo', () => {
  test('ano com média, mediana, páginas por dia e extremos', async () => {
    const { body } = await request(app).get('/dashboard/pro/pace?year=2026').set(auth('leitora'))
    expect(body).toMatchObject({ year: 2026, finished: 2, timed: 2, avgDays: 10.5, medianDays: 10.5 })
    expect(body.pagesPerDay).toBe(33.3) // 700 páginas em 21 dias
    expect(body.fastest).toMatchObject({ title: 'Curta', days: 1 })
    expect(body.slowest).toMatchObject({ title: 'Duna', days: 20 })
    expect(body.byMonth).toHaveLength(12)
    expect(body.byMonth[1]).toEqual({ month: 2, readings: 2, pages: 700, avgDays: 10.5 })
    expect(body.byMonth[0]).toEqual({ month: 1, readings: 0, pages: 0, avgDays: null })
  })

  test('previsão de término pelo ritmo da leitura em andamento', async () => {
    const { body } = await request(app).get('/dashboard/pro/pace?year=2026').set(auth('leitora'))
    expect(body.current).toHaveLength(1)
    const [now] = body.current
    expect(now).toMatchObject({ title: 'Andamento', days: 10, percent: 50 })
    const today = new Date((await one('SELECT CURRENT_DATE::text AS d')).d + 'T00:00:00Z')
    expect(now.expectedOn).toBe(new Date(today.getTime() + 10 * 86400000).toISOString().slice(0, 10))
  })

  test('ano inválido', async () => {
    expect((await request(app).get('/dashboard/pro/pace?year=20').set(auth('leitora'))).body.code).toBe('YEAR_INVALID')
  })
})

describe('ao longo dos anos', () => {
  test('autores por ano e descobertas', async () => {
    const { body } = await request(app).get('/dashboard/pro/over-years?dimension=authors').set(auth('leitora'))
    expect(body.years).toEqual([2025, 2026])
    expect(body.series).toEqual([
      { name: 'Frank Herbert', total: 2, counts: [1, 1] },
      { name: 'Isaac Asimov', total: 2, counts: [1, 1] }
    ])
    expect(body.discovered).toEqual([2, 0])
    expect(body.distinct).toEqual([2, 2])
  })

  test('editoras', async () => {
    const { body } = await request(app).get('/dashboard/pro/over-years?dimension=publishers&limit=1').set(auth('leitora'))
    expect(body.series).toEqual([{ name: 'Aleph', total: 3, counts: [2, 1] }])
    expect(body.discovered).toEqual([1, 1])
  })

  test('sem leituras: listas vazias; opção inválida recusada', async () => {
    await grantPro('livre')
    await db.query('DELETE FROM librishelf.readings WHERE book_id IN (SELECT id FROM librishelf.books WHERE user_id = $1)', [ids.livre])
    const { body } = await request(app).get('/dashboard/pro/over-years').set(auth('livre'))
    expect(body).toEqual({ dimension: 'authors', years: [], series: [], discovered: [], distinct: [] })

    const res = await request(app).get('/dashboard/pro/over-years?dimension=tags').set(auth('leitora'))
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'STATS_OPTION_INVALID', params: { field: 'dimension' } })
  })
})

describe('gráfico personalizado', () => {
  const chart = query => request(app).get(`/dashboard/pro/chart?${query}`).set(auth('leitora'))

  test('mês a mês com os meses zerados', async () => {
    const { body } = await chart('metric=pages&group=month&from=2025-12-15&to=2026-02-28')
    expect(body.points).toEqual([
      { key: '2025-12', value: 0 },
      { key: '2026-01', value: 0 },
      { key: '2026-02', value: 700 }
    ])
  })

  test('média por categoria some com o que não tem valor', async () => {
    const { body } = await chart('metric=rating&group=author&from=2025-01-01&to=2026-12-31')
    expect(body.points).toEqual([
      { key: 'Frank Herbert', value: 5 },
      { key: 'Isaac Asimov', value: 3.5 }
    ])
  })

  test('tamanho, nota e dia da semana têm as chaves fixas', async () => {
    let { body } = await chart('metric=readings&group=length&from=2025-01-01&to=2026-12-31')
    expect(body.points).toEqual([
      { key: 'short', value: 1 }, { key: 'medium', value: 1 }, { key: 'long', value: 0 }, { key: 'epic', value: 2 }
    ])
    ;({ body } = await chart('metric=days&group=rating&from=2025-01-01&to=2026-12-31'))
    expect(body.points.map(p => p.key)).toEqual(['1', '2', '3', '4', '5'])
    expect(body.points[4].value).toBe(25)
    ;({ body } = await chart('metric=readings&group=weekday&from=2025-01-01&to=2026-12-31'))
    expect(body.points).toHaveLength(7)
    expect(body.points.reduce((sum, p) => sum + p.value, 0)).toBe(4)
  })

  test('sem período: os últimos 12 meses', async () => {
    const { body } = await chart('group=month')
    expect(body.points).toHaveLength(12)
    expect(body.metric).toBe('readings')
  })

  test('opções e períodos inválidos', async () => {
    expect((await chart('metric=preco')).body).toMatchObject({ code: 'STATS_OPTION_INVALID', params: { field: 'metric' } })
    expect((await chart('group=isbn')).body).toMatchObject({ code: 'STATS_OPTION_INVALID', params: { field: 'group' } })
    expect((await chart('group=month&from=2000-01-01&to=2026-01-01')).body).toMatchObject({ code: 'STATS_RANGE_TOO_LONG', params: { max: 120 } })
    expect((await chart('group=year&from=2000-01-01&to=2026-01-01')).status).toBe(200)
  })
})
