import request from 'supertest'
import app from '../../app.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  // Biblioteca pública + comunidade + aceita seguidores
  await request(app).patch('/auth/me/visibility').set(auth(name)).send({ isPublic: true, showInCommunity: true, showActivity: true })
}

async function addBook(user, title, isbn) {
  const res = await request(app).post('/library').set(auth(user)).field({ title, isbn }).field('authors', 'Autor')
  if (res.statusCode !== 201) throw new Error(`addBook ${res.statusCode}: ${JSON.stringify(res.body)}`)
  return res.body.bookId
}

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['lia', 'teo']) await signUp(name)
})

afterAll(async () => {
  await closeDatabase()
})

describe('Códigos de erro', () => {
  it('erro controlado leva code e params', async () => {
    const res = await request(app).post('/auth/register').send({ username: 'x'.repeat(60), password: 'senha12345', email: 'x@example.com' })
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ code: 'USERNAME_TOO_LONG', params: { max: expect.any(Number) } })
    expect(typeof res.body.error).toBe('string')
  })

  it('ISBN repetido → ISBN_TAKEN', async () => {
    await addBook('lia', 'Duna', '9788576570653')
    const res = await request(app).post('/library').set(auth('lia')).field({ title: 'Duna 2', isbn: '9788576570653' }).field('authors', 'Autor')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('ISBN_TAKEN')
  })

  it('id inválido → PARAM_INVALID com o nome do parâmetro', async () => {
    const res = await request(app).get('/library/abc').set(auth('lia'))
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ code: 'PARAM_INVALID', params: { param: 'id' } })
  })
})

describe('Nomes reservados', () => {
  it.each(['admin', 'Suporte', 's.u.p.o.r.t.e', 'librishelf_oficial', 'Ádmin'])('"%s" não pode ser cadastrado', async (name) => {
    const res = await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `r${Date.now()}@example.com` })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('USERNAME_RESERVED')
  })

  it('nem usado na troca de nome', async () => {
    const res = await request(app).patch('/auth/me/username').set(auth('teo')).send({ username: 'moderador', password: 'senha12345' })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('USERNAME_RESERVED')
  })
})

describe('Bloquear leitor', () => {
  it('bloquear apaga o seguir nos dois sentidos e impede novo pedido', async () => {
    await request(app).post('/social/follow/lia').set(auth('teo'))
    await request(app).post('/social/requests/teo/accept').set(auth('lia'))
    await request(app).post('/social/follow/teo').set(auth('lia'))

    const block = await request(app).post('/social/blocks/teo').set(auth('lia'))
    expect(block.statusCode).toBe(200)

    const conn = await request(app).get('/social/connections').set(auth('lia'))
    expect([...conn.body.following, ...conn.body.followers, ...conn.body.requests]).toHaveLength(0)

    // Quem foi bloqueado recebe a mesma resposta de "não aceita seguidores"
    const again = await request(app).post('/social/follow/lia').set(auth('teo'))
    expect(again.statusCode).toBe(404)
    expect(again.body.code).toBe('READER_NOT_AVAILABLE')

    // Quem bloqueou é avisado de que precisa desbloquear
    const mine = await request(app).post('/social/follow/teo').set(auth('lia'))
    expect(mine.statusCode).toBe(409)
    expect(mine.body.code).toBe('READER_BLOCKED_BY_YOU')
  })

  it('somem um para o outro na comunidade', async () => {
    const liaBook = await addBook('lia', 'Neuromancer', '9788576570912')
    const teoBook = await addBook('teo', 'Neuromancer', '9788576570912')

    const fromLia = await request(app).get(`/community/books/${liaBook}`).set(auth('lia'))
    expect(fromLia.body.readers).toEqual([])
    const fromTeo = await request(app).get(`/community/books/${teoBook}`).set(auth('teo'))
    expect(fromTeo.body.readers).toEqual([])

    const search = await request(app).get('/community/readers').query({ q: 'lia' }).set(auth('teo'))
    expect(search.body.map(r => r.username)).not.toContain('lia')
  })

  it('perfil: quem bloqueou vê blockedByMe; o bloqueado não pode seguir e não sabe', async () => {
    const asLia = await request(app).get('/library/public/u/teo/profile').set(auth('lia'))
    expect(asLia.body.viewer).toMatchObject({ blockedByMe: true, followStatus: null, commonCount: null })

    const asTeo = await request(app).get('/library/public/u/lia/profile').set(auth('teo'))
    expect(asTeo.body.acceptsFollowers).toBe(false)
    expect(asTeo.body.viewer).toMatchObject({ blockedByMe: false, commonCount: null })
  })

  it('lista e desbloqueio', async () => {
    const list = await request(app).get('/social/blocks').set(auth('lia'))
    expect(list.body.blocked.map(b => b.username)).toEqual(['teo'])

    await request(app).delete('/social/blocks/teo').set(auth('lia'))
    expect((await request(app).get('/social/blocks').set(auth('lia'))).body.blocked).toEqual([])

    const follow = await request(app).post('/social/follow/teo').set(auth('lia'))
    expect(follow.statusCode).toBe(200)
  })

  it('não dá para bloquear a si mesmo', async () => {
    const res = await request(app).post('/social/blocks/lia').set(auth('lia'))
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('BLOCK_SELF')
  })
})
