import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name, { publicLibrary = false, community = false, followers = false } = {}) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  await confirmEmail(name)
  const privacy = {}
  if (publicLibrary) privacy.isPublic = true
  if (community) privacy.showInCommunity = true
  if (followers) privacy.showActivity = true
  if (Object.keys(privacy).length) await request(app).patch('/auth/me/visibility').set(auth(name)).send(privacy)
}

let n = 0
async function addBook(name, title, isbn, extra = {}) {
  n++
  const res = await request(app).post('/library').set(auth(name)).field({ title, authors: `Autor ${title}`, isbn, ...extra })
  expect(res.statusCode).toBe(201)
  return res.body.bookId
}

const ISBN = {
  duna: '9780441013593',
  fundacao: '9788576570653',
  neuromancer: '9780441569595',
  hobbit: '9780547928227',
  solaris: '9780156027601'
}

beforeAll(async () => {
  await clearDatabase()
  await signUp('eu')
  await signUp('ana.leitora', { publicLibrary: true, community: true, followers: true })
  await signUp('bruno', { publicLibrary: true, community: true })
  await signUp('anabela', { publicLibrary: true, community: true })
  await signUp('escondida', { publicLibrary: true }) // pública, mas fora da comunidade
  await signUp('privada')

  await addBook('eu', 'Duna', ISBN.duna)
  await addBook('eu', 'Fundação', ISBN.fundacao)

  // ana tem 2 em comum comigo; bruno, 1; anabela, nenhum.
  await addBook('ana.leitora', 'Duna', ISBN.duna)
  await addBook('ana.leitora', 'Fundação', ISBN.fundacao)
  await addBook('ana.leitora', 'Neuromancer', ISBN.neuromancer, { rating: 5 })
  await addBook('bruno', 'Duna', ISBN.duna)
  await addBook('bruno', 'Neuromancer', ISBN.neuromancer)
  await addBook('bruno', 'O Hobbit', ISBN.hobbit)
  await addBook('anabela', 'Solaris', ISBN.solaris)
  await addBook('escondida', 'O Hobbit', ISBN.hobbit)
  await addBook('privada', 'Solaris', ISBN.solaris)
})

afterAll(async () => {
  await closeDatabase()
})

describe('Encontrar leitores', () => {
  const find = (q, who = 'eu') => request(app).get('/community/readers').set(auth(who)).query(q === undefined ? {} : { q })

  it('sem texto sugere por livros em comum; só quem está na comunidade', async () => {
    const res = await find()
    expect(res.statusCode).toBe(200)
    expect(res.body.map(r => r.username)).toEqual(['ana.leitora', 'bruno', 'anabela'])
    expect(res.body[0]).toEqual({ username: 'ana.leitora', acceptsFollowers: true, totalBooks: 3, readBooks: 0, commonBooks: 2, followStatus: null })
  })

  it('busca pelo nome sem diferenciar maiúsculas; nome exato vem primeiro', async () => {
    expect((await find('ANA')).body.map(r => r.username)).toEqual(['ana.leitora', 'anabela'])
    expect((await find('anabela')).body.map(r => r.username)).toEqual(['anabela'])
    expect((await find('escondida')).body).toEqual([])
    expect((await find('privada')).body).toEqual([])
    expect((await find('%')).body).toEqual([])
  })

  it('mostra se já sigo', async () => {
    await request(app).post('/social/follow/ana.leitora').set(auth('eu'))
    expect((await find('ana.leitora')).body[0].followStatus).toBe('pending')
  })

  it('exige login', async () => {
    expect((await request(app).get('/community/readers')).statusCode).toBe(401)
  })
})

describe('Recomendações', () => {
  it('livros da comunidade que eu não tenho, primeiro os de quem lê parecido', async () => {
    const res = await request(app).get('/community/recommendations').set(auth('eu'))
    expect(res.statusCode).toBe(200)
    const titles = res.body.map(r => r.title)
    expect(titles[0]).toBe('Neuromancer') // ana e bruno (ambos em comum comigo), nota 5
    expect(titles).toEqual(expect.arrayContaining(['O Hobbit', 'Solaris']))
    expect(titles).not.toContain('Duna')
    expect(res.body[0]).toMatchObject({ readers: 2, similarReaders: 2, averageRating: 5, owner: 'ana.leitora' })
  })

  it('quem não tem nada em comum recebe as populares; bibliotecas fora da comunidade não entram', async () => {
    await signUp('novato')
    const res = await request(app).get('/community/recommendations').set(auth('novato'))
    expect(res.body.map(r => r.title)).toEqual(expect.arrayContaining(['Duna', 'Neuromancer']))
    // "privada" e "escondida" não aparecem como dona de exemplo
    expect(res.body.every(r => !['privada', 'escondida'].includes(r.owner))).toBe(true)
  })

  it('"Quero ler" copia o livro para a minha estante e ele sai das recomendações', async () => {
    const rec = (await request(app).get('/community/recommendations').set(auth('eu'))).body[0]
    const add = await request(app).post(`/community/books/${rec.bookId}/want`).set(auth('eu'))
    expect(add.statusCode).toBe(201)

    const book = (await request(app).get(`/library/${add.body.bookId}`).set(auth('eu'))).body
    expect(book).toMatchObject({ title: 'Neuromancer', reading_status: 'want', isbn: ISBN.neuromancer })
    expect(book.rating).toBeNull()

    const again = await request(app).post(`/community/books/${rec.bookId}/want`).set(auth('eu'))
    expect(again.statusCode).toBe(409)
    expect((await request(app).get('/community/recommendations').set(auth('eu'))).body.map(r => r.title)).not.toContain('Neuromancer')
  })

  it('não copia de biblioteca privada ou fora da comunidade', async () => {
    const hidden = (await request(app).get('/library').set(auth('escondida'))).body.result[0].book_id
    expect((await request(app).post(`/community/books/${hidden}/want`).set(auth('eu'))).statusCode).toBe(404)
    const own = (await request(app).get('/library').set(auth('eu'))).body.result[0].book_id
    expect((await request(app).post(`/community/books/${own}/want`).set(auth('eu'))).statusCode).toBe(404)
  })
})
