import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { testOutbox } from '../../services/mailService.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { AVATAR_DIR } from '../../utils/imageProcessor.js'
import * as avatarService from '../../services/avatarService.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const ids = {}

async function signUp(name, { verify = true, privacy } = {}) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  if (verify) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  if (privacy) await request(app).patch('/auth/me/visibility').set(auth(name)).send(privacy)
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

// Foto retangular com EXIF (aparelho e GPS): o servidor tem que cortar
// quadrado e não copiar os metadados
async function photo({ width = 900, height = 600 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Make: 'Celular de Teste', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '20/1 30/1 0/1' } })
    .toBuffer()
}

const upload = async (user, buffer, fields = {}) => {
  let req = request(app).put('/auth/me/avatar').set(auth(user))
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v)
  return req.attach('avatar', buffer, { filename: 'foto.jpg', contentType: 'image/jpeg' })
}
const file = (owner, viewer, name = 'sm.jpg') => {
  const req = request(app).get(`/avatars/${owner}/${name}`)
  return viewer ? req.set(auth(viewer)) : req
}
const me = user => request(app).get('/auth/me').set(auth(user)).then(res => res.body.user)
const report = (user, owner, body) => request(app).post(`/avatars/${owner}/report`).set(auth(user)).send(body)
const backdate = names => db.query("UPDATE librishelf.users SET created_at = now() - interval '8 days' WHERE name = ANY($1)", [names])
const waitMail = async () => { for (let i = 0; i < 50 && !testOutbox().length; i++) await new Promise(r => setTimeout(r, 20)) }

beforeAll(async () => {
  process.env.ADMIN_EMAIL = 'moderacao@example.com'
  await clearDatabase()
  fs.rmSync(AVATAR_DIR, { recursive: true, force: true })
  await signUp('ana', { privacy: { isPublic: true, showInCommunity: true, showActivity: true } })
  await signUp('bia', { privacy: { showActivity: true } })
  await signUp('caio')
  await signUp('davi')
  await signUp('eva')
  await signUp('semmail', { verify: false })
  // bia segue ana (aceito)
  await request(app).post('/social/follow/ana').set(auth('bia'))
  await request(app).post('/social/requests/bia/accept').set(auth('ana'))
  testOutbox().length = 0
})

afterAll(async () => {
  delete process.env.ADMIN_EMAIL
  await closeDatabase()
})

describe('Enviar, trocar e tirar', () => {
  it('exige e-mail confirmado e imagem válida', async () => {
    expect((await upload('semmail', await photo())).body.code).toBe('EMAIL_NOT_VERIFIED_AVATAR')
    const notImage = await request(app).put('/auth/me/avatar').set(auth('ana')).attach('avatar', Buffer.from('oi'), { filename: 'a.txt', contentType: 'text/plain' })
    expect(notImage.body.code).toBe('IMAGE_ONLY')
    const broken = await request(app).put('/auth/me/avatar').set(auth('ana')).attach('avatar', Buffer.from('não é jpeg'), { filename: 'a.jpg', contentType: 'image/jpeg' })
    expect(broken.body.code).toBe('IMAGE_INVALID')
    expect((await upload('ana', await photo(), { visibility: 'todos' })).body.code).toBe('FIELD_INVALID')
    expect((await me('ana')).avatarVersion).toBeNull()
  })

  it('grava quadrada, em dois tamanhos, sem EXIF; padrão: só seguidores', async () => {
    const res = await upload('ana', await photo())
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ avatarVisibility: 'followers', avatarHidden: false })
    expect(res.body.avatarVersion).toEqual(expect.any(Number))

    for (const [size, px] of [['sm', 128], ['lg', 384]]) {
      for (const ext of ['jpg', 'avif']) {
        const meta = await sharp(path.join(AVATAR_DIR, `${ids.ana}-${size}.${ext}`)).metadata()
        expect([meta.width, meta.height]).toEqual([px, px])
        expect(meta.exif).toBeUndefined()
      }
    }
    expect(await me('ana')).toMatchObject({ avatarVersion: res.body.avatarVersion, avatarVisibility: 'followers' })
  })

  it('trocar a foto muda a versão', async () => {
    const before = (await me('ana')).avatarVersion
    const res = await upload('ana', await photo({ width: 500, height: 500 }))
    expect(res.body.avatarVersion).toBeGreaterThan(before)
  })
})

describe('Quem vê', () => {
  it('só seguidores: dono e quem segue veem; os outros e anônimos recebem 404', async () => {
    expect((await file('ana', 'ana')).statusCode).toBe(200)
    const follower = await file('ana', 'bia')
    expect(follower.statusCode).toBe(200)
    expect(follower.headers['cache-control']).toBe('private, max-age=600')
    expect(follower.headers['content-type']).toBe('image/jpeg')
    expect((await file('ana', 'caio')).statusCode).toBe(404)
    expect((await file('ana')).statusCode).toBe(404)
    expect((await file('ninguem', 'bia')).statusCode).toBe(404)
    expect((await file('ana', 'bia', 'xl.png')).statusCode).toBe(404)
  })

  it('a API manda a versão só para quem pode ver', async () => {
    const version = (await me('ana')).avatarVersion
    const feed = await request(app).get('/social/feed').set(auth('bia'))
    expect(feed.body.events.length).toBe(0) // ana ainda sem livros
    const conn = await request(app).get('/social/connections').set(auth('bia'))
    expect(conn.body.following.find(p => p.username === 'ana').avatarVersion).toBe(version)
    const profileBia = await request(app).get('/library/public/u/ana/profile').set(auth('bia'))
    expect(profileBia.body.avatarVersion).toBe(version)
    const profileCaio = await request(app).get('/library/public/u/ana/profile').set(auth('caio'))
    expect(profileCaio.body.avatarVersion).toBeNull()
    const anon = await request(app).get('/library/public/u/ana/profile')
    expect(anon.body.avatarVersion).toBeNull()
  })

  it('todos: anônimo vê, com cache público; ninguém: só a própria pessoa', async () => {
    expect((await request(app).patch('/auth/me/avatar').set(auth('ana')).send({ visibility: 'everyone' })).body.avatarVisibility).toBe('everyone')
    const anon = await file('ana', null, 'lg.avif')
    expect(anon.statusCode).toBe(200)
    expect(anon.headers['cache-control']).toBe('public, max-age=600')
    expect((await request(app).get('/library/public/u/ana/profile')).body.avatarVersion).toEqual(expect.any(Number))

    await request(app).patch('/auth/me/avatar').set(auth('ana')).send({ visibility: 'nobody' })
    expect((await file('ana', 'bia')).statusCode).toBe(404)
    expect((await file('ana', 'ana')).statusCode).toBe(200)
    expect((await request(app).patch('/auth/me/avatar').set(auth('ana')).send({ visibility: 'x' })).statusCode).toBe(400)

    await request(app).patch('/auth/me/avatar').set(auth('ana')).send({ visibility: 'everyone' })
  })
})

describe('Denunciar e moderar', () => {
  it('valida: própria foto, motivo, e-mail confirmado, foto que não vê', async () => {
    expect((await report('ana', 'ana', { reason: 'spam' })).body.code).toBe('AVATAR_OWN')
    expect((await report('caio', 'ana', { reason: 'feia' })).body.code).toBe('FIELD_INVALID')
    expect((await report('semmail', 'ana', { reason: 'spam' })).body.code).toBe('EMAIL_NOT_VERIFIED_REPORT')
    expect((await report('ana', 'bia', { reason: 'spam' })).statusCode).toBe(404) // bia sem foto
  })

  it('uma denúncia por pessoa; avisa a moderação por e-mail com link', async () => {
    testOutbox().length = 0
    expect((await report('caio', 'ana', { reason: 'offensive', note: 'Foto imprópria' })).body).toEqual({ reported: true, duplicate: false })
    expect((await report('caio', 'ana', { reason: 'spam' })).body).toEqual({ reported: true, duplicate: true })
    await waitMail()
    const mail = testOutbox().find(m => m.to === 'moderacao@example.com')
    expect(mail.subject).toBe('Foto de perfil denunciada: ana')
    expect(mail.text).toContain('Ofensiva ou imprópria')
    expect(mail.text).toMatch(/\/moderation\?avatar=/)
  })

  it('três contas confiáveis ocultam a foto até a revisão; o link de moderação mostra e decide', async () => {
    await backdate(['caio', 'davi', 'eva'])
    testOutbox().length = 0
    await report('davi', 'ana', { reason: 'offensive' })
    await report('eva', 'ana', { reason: 'impersonation' })
    expect((await file('ana', 'bia')).statusCode).toBe(404)
    expect(await me('ana')).toMatchObject({ avatarHidden: true })
    expect((await file('ana', 'ana')).statusCode).toBe(404) // oculta para todos, até para o dono
    await waitMail()
    const mail = testOutbox().find(m => m.subject.startsWith('[Oculta]'))
    const token = decodeURIComponent(mail.text.match(/avatar=([^\s]+)/)[1])

    const view = await request(app).get('/moderation/avatar').query({ token })
    expect(view.body.avatar).toMatchObject({ username: 'ana', hidden: true, hiddenReason: 'reports' })
    expect(view.body.reports).toHaveLength(3)
    expect(view.body.reports[0].reporter).toBeUndefined()
    expect((await request(app).get('/moderation/avatar/image').query({ token })).statusCode).toBe(200)

    const queue = await avatarService.queue('hidden')
    expect(queue.map(item => item.username)).toEqual(['ana'])

    const kept = await request(app).post('/moderation/avatar/keep').query({ token })
    expect(kept.body.avatar.hidden).toBe(false)
    expect((await file('ana', 'bia')).statusCode).toBe(200)
    expect(await avatarService.queue('open')).toEqual([])

    // Trocar a foto invalida o link (ele é da versão denunciada)
    await upload('ana', await photo())
    expect((await request(app).get('/moderation/avatar').query({ token })).statusCode).toBe(404)
    expect((await request(app).get('/moderation/avatar').query({ token: 'x.1.abc' })).statusCode).toBe(400)
  })

  it('remover pela moderação apaga os arquivos e volta à inicial', async () => {
    await report('caio', 'ana', { reason: 'spam' })
    const result = await avatarService.moderateById(ids.ana, 'remove')
    expect(result.avatar.version).toBeNull()
    expect(fs.existsSync(path.join(AVATAR_DIR, `${ids.ana}-sm.jpg`))).toBe(false)
    expect((await me('ana')).avatarVersion).toBeNull()
  })
})

describe('Conta', () => {
  it('tirar a foto apaga os arquivos; exportar diz se há e quem vê', async () => {
    await upload('bia', await photo(), { visibility: 'nobody' })
    const exported = await request(app).get('/auth/me/export').set(auth('bia'))
    expect(exported.body.account.avatar).toEqual({ hasPhoto: true, visibility: 'nobody' })
    const res = await request(app).delete('/auth/me/avatar').set(auth('bia'))
    expect(res.body.avatarVersion).toBeNull()
    expect(fs.existsSync(path.join(AVATAR_DIR, `${ids.bia}-lg.avif`))).toBe(false)
  })

  it('excluir a conta apaga a foto', async () => {
    await upload('eva', await photo())
    expect(fs.existsSync(path.join(AVATAR_DIR, `${ids.eva}-sm.jpg`))).toBe(true)
    expect((await request(app).delete('/auth/me').set(auth('eva')).send({ password: 'senha12345' })).statusCode).toBe(204)
    expect(fs.existsSync(path.join(AVATAR_DIR, `${ids.eva}-sm.jpg`))).toBe(false)
  })
})
