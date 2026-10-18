import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let auth
let otherAuth
const year = new Date().getFullYear()
const today = new Date().toISOString().slice(0, 10)

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  return { Authorization: `Bearer ${tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))}` }
}

async function addBook(title, extra = {}) {
  const res = await request(app).post('/library').set(auth).field({ title, authors: 'Autora', ...extra })
  expect(res.statusCode).toBe(201)
  return res.body.bookId
}

const setStatus = (id, status, date, who = auth) =>
  request(app).patch(`/library/${id}/status`).set(who).send(date ? { status, date } : { status })

const getBook = async id => (await request(app).get(`/library/${id}`).set(auth)).body
const titles = async query => (await request(app).get('/library').set(auth).query({ sort: 'title', order: 'asc', ...query })).body.result.map(b => b.title)

beforeAll(async () => {
  await clearDatabase()
  auth = await signUp('leitora')
  otherAuth = await signUp('intrusa')
})

afterAll(async () => {
  await closeDatabase()
})

describe('Status de leitura', () => {
  let a, b, c

  it('"Quero ler", "Lendo" e "Lido" aparecem no livro e na lista', async () => {
    a = await addBook('Alfa')
    b = await addBook('Beta')
    c = await addBook('Gama')

    expect((await setStatus(a, 'want')).body).toEqual({ status: 'want', readDate: null, startedAt: null })
    const reading = await setStatus(b, 'reading', '2026-01-10')
    expect(reading.body).toEqual({ status: 'reading', readDate: null, startedAt: '2026-01-10' })
    expect((await setStatus(c, 'read')).body).toMatchObject({ status: 'read', readDate: today })

    const book = await getBook(b)
    expect(book.reading_status).toBe('reading')

    const list = (await request(app).get('/library').set(auth)).body.result
    expect(list.find(x => x.title === 'Alfa').reading_status).toBe('want')
  })

  it('filtra por "Lendo" e por "Quero ler"', async () => {
    expect(await titles({ readState: 'reading' })).toEqual(['Beta'])
    expect(await titles({ readState: 'want' })).toEqual(['Alfa'])
    expect(await titles({ readState: 'true' })).toEqual(['Gama'])
    expect(await titles({ readState: 'false' })).toEqual(['Alfa', 'Beta'])
  })

  it('marcar como lido tira de "Lendo"; "Lendo" de novo num livro lido é releitura', async () => {
    await request(app).patch(`/library/${b}/read`).set(auth).send({ readDate: today })
    expect((await getBook(b)).reading_status).toBeNull()

    const reread = await setStatus(b, 'reading')
    expect(reread.body.status).toBe('reading')
    expect(reread.body.readDate).toBe(today) // a leitura anterior fica registrada
  })

  it('"Lendo" de novo sem data mantém o dia em que começou', async () => {
    await setStatus(a, 'reading', '2026-02-01')
    expect((await setStatus(a, 'reading')).body.startedAt).toBe('2026-02-01')
  })

  it('"Quero ler" e "nenhum" apagam a data de leitura', async () => {
    expect((await setStatus(c, 'want')).body).toEqual({ status: 'want', readDate: null, startedAt: null })
    expect((await setStatus(c, 'none')).body).toEqual({ status: 'none', readDate: null, startedAt: null })
  })

  it('editar a data de leitura no formulário tira de "Quero ler"', async () => {
    await setStatus(c, 'want')
    await request(app).put(`/library/${c}`).set(auth).send({ title: 'Gama', authors: ['Autora'], readDate: today })
    const book = await getBook(c)
    expect(book.reading_status).toBeNull()
  })

  it('valida status, data e dono', async () => {
    expect((await setStatus(a, 'talvez')).statusCode).toBe(400)
    expect((await setStatus(a, 'reading', 'ontem')).statusCode).toBe(400)
    expect((await setStatus(a, 'read', '2999-01-01')).statusCode).toBe(400)
    expect((await setStatus(a, 'want', null, otherAuth)).statusCode).toBe(403)
    expect((await request(app).get('/library').set(auth).query({ readState: 'qualquer' })).statusCode).toBe(400)
  })
})

describe('Filtro por mês de leitura', () => {
  it('ano + mês filtram a lista; mês inválido → 400', async () => {
    const d = await addBook('Delta', { readDate: `${year - 1}-03-15` })
    expect(d).toBeTruthy()
    expect(await titles({ readYear: year - 1, readMonth: 3 })).toEqual(['Delta'])
    expect(await titles({ readYear: year - 1, readMonth: 4 })).toEqual([])
    expect((await request(app).get('/library').set(auth).query({ readYear: year, readMonth: 13 })).statusCode).toBe(400)
  })
})

describe('Painel', () => {
  it('conta "Lendo" e "Quero ler", mês a mês do ano pedido, editoras e histórico completo', async () => {
    for (const y of [year - 9, year - 8, year - 7, year - 6, year - 5]) {
      await addBook(`Antigo ${y}`, { readDate: `${y}-06-01`, publisher: 'Editora Velha' })
    }

    const stats = (await request(app).get('/dashboard/stats').set(auth).query({ year: year - 1 })).body
    expect(stats.year).toBe(year - 1)
    expect(stats.readingBooks).toBe(2)
    expect(stats.wantBooks).toBe(0)
    expect(stats.readingByMonth).toHaveLength(12)
    expect(stats.readingByMonth[2]).toEqual({ month: 3, count: 1 })
    expect(stats.readingByYear.length).toBeGreaterThanOrEqual(7) // sem o antigo limite de 5 anos
    expect(stats.topPublishers[0]).toEqual({ name: 'Editora Velha', count: 5 })
    expect(stats.goal).toBeNull()
  })

  it('ano inválido → 400; sem ano usa o atual', async () => {
    expect((await request(app).get('/dashboard/stats').set(auth).query({ year: 'abc' })).statusCode).toBe(400)
    expect((await request(app).get('/dashboard/stats').set(auth)).body.year).toBe(year)
  })
})

describe('Meta anual', () => {
  it('cria, atualiza, aparece no painel e remove', async () => {
    expect((await request(app).put('/dashboard/goal').set(auth).send({ year, target: 12 })).body).toEqual({ year, target: 12 })
    expect((await request(app).put('/dashboard/goal').set(auth).send({ year, target: 20 })).body.target).toBe(20)
    expect((await request(app).get('/dashboard/stats').set(auth)).body.goal).toBe(20)

    // A meta é de cada um.
    expect((await request(app).get('/dashboard/stats').set(otherAuth)).body.goal).toBeNull()

    expect((await request(app).delete(`/dashboard/goal/${year}`).set(auth)).statusCode).toBe(204)
    expect((await request(app).get('/dashboard/stats').set(auth)).body.goal).toBeNull()
  })

  it('meta inválida → 400', async () => {
    for (const target of [0, -1, 1001, 2.5, 'dez', null]) {
      expect((await request(app).put('/dashboard/goal').set(auth).send({ year, target })).statusCode).toBe(400)
    }
    expect((await request(app).put('/dashboard/goal').set(auth).send({ year: 99, target: 5 })).statusCode).toBe(400)
  })
})
