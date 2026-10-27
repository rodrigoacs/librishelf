import request from 'supertest'
import app from '../../app.js'
import { rankingCache } from '../../services/communityService.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Classificações da comunidade ficam em cache (A3/M9); privacidade, bloqueio,
// "seguir" e "já tenho" continuam valendo na hora.
const tokens = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name, community = true) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  await confirmEmail(name)
  if (community) await request(app).patch('/auth/me/visibility').set(auth(name)).send({ isPublic: true, showInCommunity: true, showActivity: true })
}

const addBook = async (name, title, isbn) =>
  (await request(app).post('/library').set(auth(name)).field({ title, authors: `Autor ${title}`, isbn })).body.bookId

const find = (who, q) => request(app).get('/community/readers').set(auth(who)).query(q ? { q } : {})
const recs = who => request(app).get('/community/recommendations').set(auth(who))

beforeAll(async () => {
  await clearDatabase()
  rankingCache.readers.ttlMs = 60 * 1000
  rankingCache.books.ttlMs = 60 * 1000

  await signUp('eu', false)
  await signUp('rita')
  await signUp('caio')
  await addBook('eu', 'Duna', '9780441013593')
  await addBook('rita', 'Duna', '9780441013593')
  await addBook('rita', 'Solaris', '9780156027601')
  await addBook('caio', 'Neuromancer', '9780441569595')
})

afterAll(async () => {
  rankingCache.readers.ttlMs = 0
  rankingCache.books.ttlMs = 0
  await closeDatabase()
})

describe('cache da busca de leitores', () => {
  it('guarda a classificação: leitor novo só aparece quando o cache vence', async () => {
    expect((await find('eu')).body.map(r => r.username)).toEqual(['rita', 'caio'])
    await signUp('nina')
    await addBook('nina', 'Duna', '9780441013593')
    expect((await find('eu')).body.map(r => r.username)).toEqual(['rita', 'caio'])

    rankingCache.readers.clear()
    // em comum, depois total de livros: rita (1 / 2), nina (1 / 1), caio (0 / 1)
    expect((await find('eu')).body.map(r => r.username)).toEqual(['rita', 'nina', 'caio'])
  })

  it('"seguir" e bloqueio valem na hora, com o cache cheio', async () => {
    await find('eu')
    await request(app).post('/social/follow/rita').set(auth('eu'))
    expect((await find('eu')).body.find(r => r.username === 'rita').followStatus).toBe('pending')

    await request(app).post('/social/blocks/eu').set(auth('caio'))
    expect((await find('eu')).body.map(r => r.username)).not.toContain('caio')
    await request(app).delete('/social/blocks/eu').set(auth('caio'))
  })

  it('quem sai da comunidade some na hora', async () => {
    await find('eu')
    await request(app).patch('/auth/me/visibility').set(auth('nina')).send({ showInCommunity: false })
    expect((await find('eu')).body.map(r => r.username)).not.toContain('nina')
  })
})

describe('cache das recomendações', () => {
  it('livro posto na estante sai na hora; dono que fecha a biblioteca também', async () => {
    const first = (await recs('eu')).body
    expect(first.map(r => r.title)).toEqual(expect.arrayContaining(['Solaris', 'Neuromancer']))
    expect(first.every(r => r.coverVersion === null)).toBe(true)

    const solaris = first.find(r => r.title === 'Solaris')
    expect((await request(app).post(`/community/books/${solaris.bookId}/want`).set(auth('eu'))).statusCode).toBe(201)
    expect((await recs('eu')).body.map(r => r.title)).not.toContain('Solaris')

    await recs('eu')
    await request(app).patch('/auth/me/visibility').set(auth('caio')).send({ isPublic: false })
    expect((await recs('eu')).body.map(r => r.title)).not.toContain('Neuromancer')
  })
})
