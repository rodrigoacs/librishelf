import { confirmEmail } from '../helpers/confirmEmail.js'
import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const owner = { username: 'owner', password: 'senha12345', email: 'owner@example.com' }
const other = { username: 'other', password: 'senha12345', email: 'other@example.com' }

async function registerAndLogin(user) {
  await request(app).post('/auth/register').send(user)
  await confirmEmail(user.username)
  const res = await request(app).post('/auth/login').send({ username: user.username, password: user.password })
  return tokenFrom(res)
}

async function createBook(token, title) {
  const res = await request(app)
    .post('/library')
    .set('Authorization', `Bearer ${token}`)
    .field({ title, authors: 'Autor Conta' })
  return res.body.bookId
}

let ownerToken
let otherToken
let bookId

beforeAll(async () => {
  await clearDatabase()
  ownerToken = await registerAndLogin(owner)
  otherToken = await registerAndLogin(other)
  bookId = await createBook(ownerToken, 'Livro Público')
})

afterAll(async () => {
  await closeDatabase()
})

describe('Biblioteca pública (opt-in)', () => {
  it('começa privada: /auth/me informa isPublic=false', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${ownerToken}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.user.isPublic).toBe(false)
  })

  it('biblioteca privada responde 404, igual a usuário inexistente', async () => {
    const priv = await request(app).get('/library/public/u/owner')
    const ghost = await request(app).get('/library/public/u/ninguem')
    expect(priv.statusCode).toBe(404)
    expect(ghost.statusCode).toBe(404)
    expect(priv.body.error).toBe(ghost.body.error)
  })

  it('livro de biblioteca privada não é acessível pela rota pública', async () => {
    const res = await request(app).get(`/library/public/u/owner/book/${bookId}`)
    expect(res.statusCode).toBe(404)
  })

  it('rejeita isPublic que não seja booleano', async () => {
    const res = await request(app)
      .patch('/auth/me/visibility')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isPublic: 'sim' })
    expect(res.statusCode).toBe(400)
  })

  it('ao ligar, a biblioteca e o livro ficam visíveis', async () => {
    const toggle = await request(app)
      .patch('/auth/me/visibility')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isPublic: true })
    expect(toggle.statusCode).toBe(200)
    expect(toggle.body.isPublic).toBe(true)

    const lib = await request(app).get('/library/public/u/owner')
    expect(lib.statusCode).toBe(200)
    expect(lib.body.result).toHaveLength(1)

    const book = await request(app).get(`/library/public/u/owner/book/${bookId}`)
    expect(book.statusCode).toBe(200)
    expect(book.body.title).toBe('Livro Público')
  })

  it('livro de um usuário não aparece pela URL pública de outro', async () => {
    const res = await request(app).get(`/library/public/u/other/book/${bookId}`)
    expect(res.statusCode).toBe(404)
  })
})

describe('Troca de senha', () => {
  it('exige a senha atual correta', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ currentPassword: 'errada123', newPassword: 'novaSenha123' })
    expect(res.statusCode).toBe(401)
  })

  it('aplica a política de senha na nova senha', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ currentPassword: other.password, newPassword: 'curta1' })
    expect(res.statusCode).toBe(400)
  })

  it('troca a senha, mantém a sessão atual e derruba as anteriores', async () => {
    // Garante que o token antigo tenha iat num segundo anterior à troca.
    await new Promise(resolve => setTimeout(resolve, 1100))

    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ currentPassword: other.password, newPassword: 'novaSenha123' })
    expect(res.statusCode).toBe(200)

    const newToken = tokenFrom(res)

    const oldSession = await request(app).get('/auth/me').set('Authorization', `Bearer ${otherToken}`)
    expect(oldSession.statusCode).toBe(401)

    const newSession = await request(app).get('/auth/me').set('Authorization', `Bearer ${newToken}`)
    expect(newSession.statusCode).toBe(200)

    const oldLogin = await request(app).post('/auth/login').send({ username: other.username, password: other.password })
    expect(oldLogin.statusCode).toBe(401)

    const newLogin = await request(app).post('/auth/login').send({ username: other.username, password: 'novaSenha123' })
    expect(newLogin.statusCode).toBe(200)

    otherToken = tokenFrom(newLogin)
  })
})

describe('Exclusão de conta', () => {
  it('exige a senha', async () => {
    const res = await request(app)
      .delete('/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ password: 'errada123' })
    expect(res.statusCode).toBe(401)

    const stillThere = await request(app).get('/auth/me').set('Authorization', `Bearer ${ownerToken}`)
    expect(stillThere.statusCode).toBe(200)
  })

  it('apaga usuário e livros, limpa o cookie e invalida o token', async () => {
    const res = await request(app)
      .delete('/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ password: owner.password })
    expect(res.statusCode).toBe(204)
    expect(res.headers['set-cookie'].join(';')).toMatch(/token=;/)

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${ownerToken}`)
    expect(me.statusCode).toBe(401)

    const lib = await request(app).get('/library/public/u/owner')
    expect(lib.statusCode).toBe(404)

    const login = await request(app).post('/auth/login').send({ username: owner.username, password: owner.password })
    expect(login.statusCode).toBe(401)
  })

  it('não afeta outros usuários', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${otherToken}`)
    expect(res.statusCode).toBe(200)
  })
})

describe('Validações de livro', () => {
  it('PUT exige título e autores, como o POST', async () => {
    const id = await createBook(otherToken, 'Livro Válido')

    const noTitle = await request(app)
      .put(`/library/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: '  ', authors: 'X' })
    expect(noTitle.statusCode).toBe(400)

    const noAuthors = await request(app)
      .put(`/library/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'X', authors: '' })
    expect(noAuthors.statusCode).toBe(400)

    const ok = await request(app)
      .put(`/library/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Novo Título', authors: 'Novo Autor' })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.book.title).toBe('Novo Título')
  })

  it('imagem inválida no POST não cria o livro', async () => {
    const before = await request(app).get('/library').set('Authorization', `Bearer ${otherToken}`)

    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${otherToken}`)
      .field({ title: 'Com Capa Ruim', authors: 'Autor' })
      .attach('coverImage', Buffer.from('isto não é uma imagem'), { filename: 'capa.png', contentType: 'image/png' })
    expect(res.statusCode).toBe(400)

    const after = await request(app).get('/library').set('Authorization', `Bearer ${otherToken}`)
    expect(after.body.total).toBe(before.body.total)
  })

  it('filtro de editoras repetido na query não derruba o endpoint', async () => {
    const res = await request(app)
      .get('/author?publishers=a&publishers=b')
      .set('Authorization', `Bearer ${otherToken}`)
    expect(res.statusCode).toBe(200)
  })
})
