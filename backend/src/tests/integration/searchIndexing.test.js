import request from 'supertest'
import app from '../../app.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { ROBOTS_INDEX, ROBOTS_NOINDEX } from '../../services/metaService.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const visibility = (user, body) => request(app).patch('/auth/me/visibility').set(auth(user)).send(body)
const head = name => request(app).get(`/meta/u/${encodeURIComponent(name)}`)
// O trecho começa pela tag robots; depois vêm as tags Open Graph
const robotsOf = res => res.text.match(/^<meta name="robots"[^>]*>/)?.[0]

async function signUp(name, confirm = true) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  if (confirm) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
}

beforeAll(async () => {
  await clearDatabase()
  await signUp('nina')
  await signUp('otto', false)
})

afterAll(async () => {
  await closeDatabase()
})

describe('Aparecer em buscadores', () => {
  it('começa desligado e aparece no perfil da conta', async () => {
    const me = await request(app).get('/auth/me').set(auth('nina'))
    expect(me.body.user).toMatchObject({ allowIndexing: false })
  })

  it('meta: noindex para inexistente, privada e pública sem a opção', async () => {
    for (const name of ['ninguem', 'nina']) {
      const res = await head(name)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/html/)
      expect(robotsOf(res)).toBe(ROBOTS_NOINDEX)
    }
    await visibility('nina', { isPublic: true })
    expect(robotsOf(await head('nina'))).toBe(ROBOTS_NOINDEX)
  })

  it('ligar a opção libera o index só enquanto a biblioteca for pública', async () => {
    const res = await visibility('nina', { allowIndexing: true })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ isPublic: true, allowIndexing: true })
    expect(robotsOf(await head('nina'))).toBe(ROBOTS_INDEX)

    const profile = await request(app).get('/library/public/u/nina/profile')
    expect(profile.body.indexable).toBe(true)

    await visibility('nina', { isPublic: false })
    expect(robotsOf(await head('nina'))).toBe(ROBOTS_NOINDEX)
    await visibility('nina', { isPublic: true, allowIndexing: false })
    expect(robotsOf(await head('nina'))).toBe(ROBOTS_NOINDEX)
  })

  it('valida o tipo e exige e-mail confirmado para ligar', async () => {
    expect((await visibility('nina', { allowIndexing: 'sim' })).statusCode).toBe(400)
    const res = await visibility('otto', { allowIndexing: true })
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED_PUBLIC')
  })

  it('nome com caracteres fora do padrão não consulta nada', async () => {
    expect(robotsOf(await head('a"b<c'))).toBe(ROBOTS_NOINDEX)
  })
})
