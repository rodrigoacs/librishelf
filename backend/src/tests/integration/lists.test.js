import request from 'supertest'
import app from '../../app.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import * as metaService from '../../services/metaService.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })

async function signUp(name, visibility) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  if (visibility) await request(app).patch('/auth/me/visibility').set(auth(name)).send(visibility)
}

async function addBook(user, title) {
  const res = await request(app).post('/library').set(auth(user)).field({ title, authors: 'Autora Teste' })
  return res.body.bookId
}

const createList = (user, body) => request(app).post('/lists').set(auth(user)).send(body)
const getList = (user, id) => request(app).get(`/lists/${id}`).set(auth(user))
const addItem = (user, id, bookId) => request(app).post(`/lists/${id}/items`).set(auth(user)).send({ bookId })
const order = (user, id, bookIds) => request(app).put(`/lists/${id}/order`).set(auth(user)).send({ bookIds })
const titles = list => list.items.map(item => item.title)

const books = {}
let listId

beforeAll(async () => {
  await clearDatabase()
  await signUp('ana', { isPublic: true })
  await signUp('bia')
  for (const title of ['Primeiro', 'Segundo', 'Terceiro', 'Quarto']) books[title] = await addBook('ana', title)
  books.daBia = await addBook('bia', 'Livro da Bia')
})

afterAll(async () => {
  await closeDatabase()
})

describe('Criar e editar', () => {
  it('valida nome, descrição e campos', async () => {
    expect((await createList('ana', { title: '   ' })).body.code).toBe('LIST_TITLE_REQUIRED')
    expect((await createList('ana', { title: 'x'.repeat(101) })).body).toMatchObject({ code: 'LIST_TITLE_TOO_LONG', params: { max: 100 } })
    expect((await createList('ana', { title: 'ok', description: 'x'.repeat(1001) })).body.code).toBe('LIST_DESCRIPTION_TOO_LONG')
    expect((await createList('ana', { title: 'ok', isPublic: 'sim' })).body).toMatchObject({ code: 'FIELD_INVALID', params: { field: 'isPublic' } })
  })

  it('cria privada e numerada por padrão; já com um livro', async () => {
    const res = await createList('ana', { title: '  Melhores   de 2026 ', bookId: books.Segundo })
    expect(res.statusCode).toBe(201)
    expect(res.body.list).toMatchObject({ title: 'Melhores de 2026', description: null, isPublic: false, ranked: true, itemCount: 1 })
    expect(titles(res.body.list)).toEqual(['Segundo'])
    listId = res.body.list.id
  })

  it('edita só o que veio; descrição vazia vira null', async () => {
    let res = await request(app).patch(`/lists/${listId}`).set(auth('ana')).send({ description: '  Os favoritos  ' })
    expect(res.body.list).toMatchObject({ title: 'Melhores de 2026', description: 'Os favoritos' })
    res = await request(app).patch(`/lists/${listId}`).set(auth('ana')).send({ description: '', ranked: false })
    expect(res.body.list).toMatchObject({ description: null, ranked: false })
  })

  it('lista de outra pessoa é 404 (não revela que existe)', async () => {
    expect((await getList('bia', listId)).statusCode).toBe(404)
    expect((await request(app).patch(`/lists/${listId}`).set(auth('bia')).send({ title: 'x' })).statusCode).toBe(404)
    expect((await request(app).delete(`/lists/${listId}`).set(auth('bia'))).statusCode).toBe(404)
    expect((await request(app).get('/lists/abc').set(auth('ana'))).statusCode).toBe(400)
    expect((await request(app).get('/lists')).statusCode).toBe(401)
  })
})

describe('Livros e ordem', () => {
  it('adiciona no fim, ignora repetido e recusa livro de outra estante', async () => {
    expect((await addItem('ana', listId, books.Primeiro)).body).toEqual({ added: true })
    expect((await addItem('ana', listId, books.Terceiro)).body).toEqual({ added: true })
    expect((await addItem('ana', listId, books.Primeiro)).body).toEqual({ added: false })
    expect((await addItem('ana', listId, books.daBia)).statusCode).toBe(404)
    expect((await addItem('ana', listId, 'abc')).body.code).toBe('FIELD_INVALID')
    expect(titles((await getList('ana', listId)).body.list)).toEqual(['Segundo', 'Primeiro', 'Terceiro'])
  })

  it('reordena com todos os livros; lista desatualizada dá 409', async () => {
    const res = await order('ana', listId, [books.Primeiro, books.Segundo, books.Terceiro])
    expect(res.statusCode).toBe(200)
    expect(titles(res.body.list)).toEqual(['Primeiro', 'Segundo', 'Terceiro'])
    expect(res.body.list.items.map(item => item.position)).toEqual([1, 2, 3])

    expect((await order('ana', listId, [books.Primeiro, books.Segundo])).body.code).toBe('LIST_ORDER_MISMATCH')
    expect((await order('ana', listId, [books.Primeiro, books.Primeiro, books.Terceiro])).statusCode).toBe(409)
    expect((await order('ana', listId, [books.Primeiro, books.Segundo, books.Quarto])).statusCode).toBe(409)
    expect((await order('ana', listId, 'x')).statusCode).toBe(400)
  })

  it('tira da lista; apagar o livro da estante tira de todas as listas', async () => {
    expect((await request(app).delete(`/lists/${listId}/items/${books.Segundo}`).set(auth('ana'))).body).toEqual({ removed: true })
    await request(app).delete(`/library/${books.Terceiro}`).set(auth('ana'))
    expect(titles((await getList('ana', listId)).body.list)).toEqual(['Primeiro'])
  })

  it('?book= marca as listas que têm o livro', async () => {
    await createList('ana', { title: 'Outra' })
    const lists = (await request(app).get(`/lists?book=${books.Primeiro}`).set(auth('ana'))).body.lists
    expect(lists.map(list => [list.title, list.hasBook])).toEqual([['Outra', false], ['Melhores de 2026', true]])
    expect(lists[1]).toMatchObject({ itemCount: 1, covers: [{ bookId: books.Primeiro, title: 'Primeiro', authors: 'Autora Teste' }] })
  })
})

describe('Página pública', () => {
  it('só lista pública de biblioteca pública', async () => {
    const url = `/library/public/u/ana/lists/${listId}`
    expect((await request(app).get(url)).statusCode).toBe(404)

    await request(app).patch(`/lists/${listId}`).set(auth('ana')).send({ isPublic: true })
    const res = await request(app).get(url)
    expect(res.statusCode).toBe(200)
    expect(res.body.list).toMatchObject({ title: 'Melhores de 2026', owner: { username: 'ana' }, itemCount: 1 })
    expect(res.body.list.items[0]).toMatchObject({ title: 'Primeiro', authors: 'Autora Teste' })

    // No perfil: só as públicas com livros
    const profile = (await request(app).get('/library/public/u/ana/profile')).body
    expect(profile.lists.map(list => list.title)).toEqual(['Melhores de 2026'])

    // Biblioteca privada: a lista some também
    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ isPublic: false })
    expect((await request(app).get(url)).statusCode).toBe(404)
    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ isPublic: true })

    expect((await request(app).get(`/library/public/u/bia/lists/${listId}`)).statusCode).toBe(404)
  })

  it('prévia do link com título e livros; privada cai no padrão', async () => {
    const head = await metaService.listHead('ana', String(listId))
    expect(head).toContain('content="Melhores de 2026 · lista de ana"')
    expect(head).toContain('1 livro: Primeiro. Lista de ana no Librishelf.')
    expect(head).toContain('noindex')
    const other = (await createList('ana', { title: 'Secreta', bookId: books.Primeiro })).body.list
    expect(await metaService.listHead('ana', String(other.id))).toContain('content="Librishelf"')
    expect(await metaService.listHead('ana', 'abc')).toContain('content="Librishelf"')
  })

  it('exportação JSON leva as listas na ordem', async () => {
    const data = (await request(app).get('/auth/me/export').set(auth('ana'))).body
    const list = data.lists.find(item => item.title === 'Melhores de 2026')
    expect(list).toMatchObject({ isPublic: true, ranked: false, books: [{ title: 'Primeiro', isbn: null }] })
  })

  it('apaga a lista', async () => {
    expect((await request(app).delete(`/lists/${listId}`).set(auth('ana'))).body).toEqual({ deleted: true })
    expect((await getList('ana', listId)).statusCode).toBe(404)
  })
})
