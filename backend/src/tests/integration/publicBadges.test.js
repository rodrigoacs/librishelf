import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const PASSWORD = 'senha12345'

async function publicUser(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  const token = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  await request(app).patch('/auth/me/visibility').set({ Authorization: `Bearer ${token}` }).send({ isPublic: true })
  return (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

beforeAll(clearDatabase)
afterAll(closeDatabase)

test('perfil público mostra os selos da conta', async () => {
  const ana = await publicUser('ana')
  await publicUser('bia')
  await db.query("INSERT INTO librishelf.user_badges (user_id, badge) VALUES ($1, 'vanguarda') ON CONFLICT DO NOTHING", [ana])

  expect((await request(app).get('/library/public/u/ana/profile')).body.badges).toEqual(['vanguarda'])
  expect((await request(app).get('/library/public/u/bia/profile')).body.badges).toEqual([])
})
