import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

let auth
let otherAuth

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  return { Authorization: `Bearer ${tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))}` }
}

async function addBook(fields, who = auth) {
  const res = await request(app).post('/library').set(who).field(fields)
  expect(res.statusCode).toBe(201)
  return res.body.bookId
}

const getBook = async id => (await request(app).get(`/library/${id}`).set(auth)).body
const list = async query => (await request(app).get('/library').set(auth).query(query)).body.result

beforeAll(async () => {
  await clearDatabase()
  auth = await signUp('organiza')
  otherAuth = await signUp('outra')
})

afterAll(async () => {
  await closeDatabase()
})

describe('Série, volume e anotação', () => {
  let duna1, duna2

  it('grava série, volume e anotação no cadastro', async () => {
    duna2 = await addBook({ title: 'O Messias de Duna', authors: 'Frank Herbert', series: ' Duna ', seriesIndex: '2', notes: 'Melhor que o primeiro?' })
    duna1 = await addBook({ title: 'Duna', authors: 'Frank Herbert', series: 'duna', seriesIndex: '1' })
    await addBook({ title: 'Conto', authors: 'Frank Herbert', series: 'Duna', seriesIndex: '1,5' })
    await addBook({ title: 'Avulso', authors: 'Outro' })

    const book = await getBook(duna2)
    expect(book.series).toBe('Duna')
    expect(book.series_index).toBe(2)
    expect(book.notes).toBe('Melhor que o primeiro?')
  })

  it('ordena pela série e pelo volume; filtra e busca pela série', async () => {
    const sorted = await list({ sort: 'series', order: 'asc' })
    expect(sorted.map(b => b.title)).toEqual(['Duna', 'Conto', 'O Messias de Duna', 'Avulso'])

    expect((await list({ series: 'DUNA' })).length).toBe(3)
    expect((await list({ search: 'duna' })).length).toBe(3)
  })

  it('lista as séries do usuário com contagem', async () => {
    const res = await request(app).get('/library/series').set(auth)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ name: 'Duna', count: 3, read: 0 }].map(s => ({ ...s, name: expect.stringMatching(/^duna$/i) })))
  })

  it('a lista não traz a anotação; editar sem mandar os campos novos não apaga nada', async () => {
    const row = (await list({ search: 'Messias' }))[0]
    expect(row).not.toHaveProperty('notes')
    expect(row.series_index).toBe(2)

    await request(app).put(`/library/${duna2}`).set(auth).send({ title: 'O Messias de Duna', authors: ['Frank Herbert'] })
    const book = await getBook(duna2)
    expect(book.notes).toBe('Melhor que o primeiro?')
    expect(book.series).toBe('Duna')
  })

  it('editar troca e apaga os campos', async () => {
    await request(app).put(`/library/${duna1}`).set(auth).send({ title: 'Duna', authors: ['Frank Herbert'], series: '', seriesIndex: null, notes: '  Reler  ' })
    const book = await getBook(duna1)
    expect(book.series).toBeNull()
    expect(book.series_index).toBeNull()
    expect(book.notes).toBe('Reler')
  })

  it('valida tamanhos e volume', async () => {
    expect((await request(app).post('/library').set(auth).field({ title: 'X', authors: 'Y', seriesIndex: 'dois' })).statusCode).toBe(400)
    expect((await request(app).post('/library').set(auth).field({ title: 'X', authors: 'Y', seriesIndex: '-1' })).statusCode).toBe(400)
    expect((await request(app).post('/library').set(auth).field({ title: 'X', authors: 'Y', series: 'a'.repeat(201) })).statusCode).toBe(400)
    expect((await request(app).post('/library').set(auth).send({ title: 'X', authors: ['Y'], notes: 'a'.repeat(5001) })).statusCode).toBe(400)
  })

  it('a biblioteca pública nunca mostra a anotação', async () => {
    await confirmEmail('organiza')
    await request(app).patch('/auth/me/visibility').set(auth).send({ isPublic: true })
    const res = await request(app).get(`/library/public/u/organiza/book/${duna2}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.series).toBe('Duna')
    expect(res.body).not.toHaveProperty('notes')
  })
})

describe('Ações em lote', () => {
  let ids

  beforeAll(async () => {
    ids = [
      await addBook({ title: 'Lote A', authors: 'L' }),
      await addBook({ title: 'Lote B', authors: 'L', tags: 'velha' }),
      await addBook({ title: 'Lote C', authors: 'L', readDate: '2024-05-05' })
    ]
  })

  const batch = body => request(app).post('/library/batch').set(auth).send(body)

  it('marca vários como lidos sem mudar a data de quem já tinha', async () => {
    const res = await batch({ ids, action: 'status', status: 'read', date: '2026-01-02' })
    expect(res.body.updated).toBe(3)
    expect((await getBook(ids[0])).read_date).toBeTruthy()
    const c = await getBook(ids[2])
    expect(new Date(c.read_date).getUTCFullYear()).toBe(2024)
  })

  it('Quero ler / Lendo / nenhum em lote', async () => {
    await batch({ ids, action: 'status', status: 'want' })
    expect((await list({ readState: 'want', search: 'Lote' })).length).toBe(3)
    await batch({ ids: [ids[0]], action: 'status', status: 'reading' })
    expect((await getBook(ids[0])).reading_status).toBe('reading')
    await batch({ ids, action: 'status', status: 'none' })
    expect((await list({ readState: 'want', search: 'Lote' })).length).toBe(0)
  })

  it('adiciona e remove categoria', async () => {
    expect((await batch({ ids, action: 'addTag', tag: 'Emprestados' })).body.updated).toBe(3)
    expect((await list({ tags: 'Emprestados' })).length).toBe(3)
    // repetir não duplica
    expect((await batch({ ids, action: 'addTag', tag: 'emprestados' })).body.updated).toBe(0)

    expect((await batch({ ids: [ids[1]], action: 'removeTag', tag: 'velha' })).body.updated).toBe(1)
    const tags = (await request(app).get('/tags').set(auth)).body.map(t => t.name)
    expect(tags).not.toContain('velha') // categoria sem livros some
  })

  it('não mexe em livro de outra pessoa (nem nos próprios, na mesma chamada)', async () => {
    const alien = await addBook({ title: 'Alheio', authors: 'Z' }, otherAuth)
    const res = await batch({ ids: [ids[0], alien], action: 'delete' })
    expect(res.statusCode).toBe(403)
    expect((await getBook(ids[0])).title).toBe('Lote A')
  })

  it('valida ação, ids e status', async () => {
    expect((await batch({ ids, action: 'explodir' })).statusCode).toBe(400)
    expect((await batch({ ids: [], action: 'delete' })).statusCode).toBe(400)
    expect((await batch({ ids: ['x'], action: 'delete' })).statusCode).toBe(400)
    expect((await batch({ ids: Array.from({ length: 501 }, (_, i) => i + 1), action: 'delete' })).statusCode).toBe(400)
    expect((await batch({ ids, action: 'status', status: 'talvez' })).statusCode).toBe(400)
    expect((await batch({ ids, action: 'addTag', tag: '' })).statusCode).toBe(400)
  })

  it('exclui em lote', async () => {
    expect((await batch({ ids, action: 'delete' })).body.updated).toBe(3)
    expect((await request(app).get(`/library/${ids[0]}`).set(auth)).statusCode).toBe(404)
  })
})

describe('Autores, editoras e categorias: contagem, renomear e mesclar', () => {
  beforeAll(async () => {
    await addBook({ title: 'Fundação', authors: 'Asimov', publisher: 'Aleph', tags: 'ficção' })
    await addBook({ title: 'Eu, Robô', authors: 'Isaac Asimov', publisher: 'aleph ', tags: 'Ficcao' })
    await addBook({ title: 'O Fim da Eternidade', authors: ['Asimov', 'Isaac Asimov'], publisher: 'Editora Aleph', readDate: '2025-01-01', tags: 'ficção, Ficcao' })
  })

  const authors = async () => (await request(app).get('/author').set(auth)).body

  it('a lista traz lidos/total', async () => {
    const asimov = (await authors()).find(a => a.name === 'Asimov')
    expect(asimov).toEqual({ name: 'Asimov', count: 2, read: 1 })
  })

  it('renomear um autor', async () => {
    const res = await request(app).post('/author/merge').set(auth).send({ from: ['Frank Herbert'], to: 'Frank P. Herbert' })
    expect(res.body).toEqual({ name: 'Frank P. Herbert', merged: 0 })
    expect((await authors()).map(a => a.name)).toContain('Frank P. Herbert')
  })

  it('mesclar dois autores junta os livros sem duplicar no livro que tinha os dois', async () => {
    const res = await request(app).post('/author/merge').set(auth).send({ from: ['Asimov', 'Isaac Asimov'], to: 'Isaac Asimov' })
    expect(res.body).toEqual({ name: 'Isaac Asimov', merged: 1 })

    const list = await authors()
    expect(list.find(a => a.name === 'Asimov')).toBeUndefined()
    expect(list.find(a => a.name === 'Isaac Asimov')).toEqual({ name: 'Isaac Asimov', count: 3, read: 1 })

    const eternidade = (await request(app).get('/library').set(auth).query({ search: 'Eternidade' })).body.result[0]
    expect(eternidade.author_names).toEqual(['Isaac Asimov'])
  })

  it('renomear para um nome que já existe = mesclar (editoras)', async () => {
    const res = await request(app).post('/publisher/merge').set(auth).send({ from: ['Editora Aleph'], to: 'ALEPH' })
    expect(res.body.merged).toBe(1)
    const publishers = (await request(app).get('/publisher').set(auth)).body
    expect(publishers.filter(p => /aleph/i.test(p.name))).toEqual([{ name: 'ALEPH', count: 3, read: 1 }])
  })

  it('mesclar categorias', async () => {
    await request(app).post('/tags/merge').set(auth).send({ from: ['Ficcao', 'ficção'], to: 'Ficção científica' })
    const tags = (await request(app).get('/tags').set(auth)).body
    expect(tags.find(t => t.name === 'Ficção científica')).toEqual({ name: 'Ficção científica', count: 3, read: 1 })
    expect(tags.find(t => t.name === 'ficção')).toBeUndefined()
  })

  it('nome inexistente → 404; de outra pessoa não conta; vazio → 400', async () => {
    expect((await request(app).post('/author/merge').set(auth).send({ from: ['Ninguém'], to: 'X' })).statusCode).toBe(404)
    await addBook({ title: 'Dela', authors: 'Autora Dela' }, otherAuth)
    expect((await request(app).post('/author/merge').set(auth).send({ from: ['Autora Dela'], to: 'Minha' })).statusCode).toBe(404)
    expect((await request(app).post('/author/merge').set(auth).send({ from: [], to: 'X' })).statusCode).toBe(400)
    expect((await request(app).post('/tags/merge').set(auth).send({ from: ['Ficção científica'], to: '' })).statusCode).toBe(400)
  })
})
