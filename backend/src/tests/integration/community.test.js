import fs from 'fs'
import path from 'path'
import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import UPLOAD_DIR from '../../config/uploadDir.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { normalizeIsbn13 } from '../../utils/isbn.js'
import { configureForTests } from '../../services/openLibraryService.js'
import { createOpenLibraryMock } from '../helpers/openLibraryMock.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  const res = await request(app).post('/auth/login').send({ username: name, password: 'senha12345' })
  tokens[name] = tokenFrom(res)
}

async function addBook(user, fields, authors = ['Autor Teste']) {
  const req = request(app).post('/library').set(auth(user)).field(fields)
  for (const name of authors) req.field('authors', name)
  const res = await req
  if (res.statusCode !== 201) throw new Error(`addBook ${res.statusCode}: ${JSON.stringify(res.body)}`)
  return res.body.bookId
}

const privacy = (user, body) => request(app).patch('/auth/me/visibility').set(auth(user)).send(body)

beforeAll(async () => {
  await clearDatabase()
  configureForTests({ fetch: createOpenLibraryMock().fetch })
  for (const name of ['ana', 'bia', 'caio']) await signUp(name)
})

afterAll(async () => {
  await closeDatabase()
})

describe('ISBN: banco e JS calculam igual', () => {
  it('normalize_isbn13 (SQL) == normalizeIsbn13 (JS)', async () => {
    const samples = ['9780140328721', '0140328726', '080442957X', '978-85-359-1484-9', '9788535914849',
      '12345', '9780140328722', '0140328727', '', 'abc', '979-10-90636-07-1', '1234567890123']
    const { rows } = await db.query('SELECT s, librishelf.normalize_isbn13(s) AS n FROM unnest($1::text[]) s', [samples])
    for (const row of rows) expect(row.n).toBe(normalizeIsbn13(row.s))
  })
})

describe('Nomes por usuário', () => {
  it('o mesmo autor em duas contas são registros separados', async () => {
    await addBook('ana', { title: 'O Hobbit' }, ['Tolkien'])
    await addBook('bia', { title: 'O Silmarillion' }, ['Tolkien'])

    const { rows } = await db.query(`SELECT user_id FROM librishelf.authors WHERE lower(name) = 'tolkien' ORDER BY user_id`)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(r => r.user_id)).size).toBe(2)
  })

  it('maiúsculas diferentes viram o mesmo autor (mantém a 1ª grafia)', async () => {
    await addBook('ana', { title: 'O Senhor dos Anéis' }, ['TOLKIEN'])
    const res = await request(app).get('/author').set(auth('ana'))
    expect(res.body.filter(a => a.name.toLowerCase() === 'tolkien')).toEqual([{ name: 'Tolkien', count: 2, read: 0 }])
  })

  it('excluir o último livro de um autor tira o autor da lista', async () => {
    const id = await addBook('ana', { title: 'Livro Único', publisher: 'Editora Solitária', tags: 'tag-solitária' }, ['Autor Solitário'])
    await request(app).delete(`/library/${id}`).set(auth('ana'))

    const [authors, publishers, tags] = await Promise.all([
      request(app).get('/author').set(auth('ana')),
      request(app).get('/publisher').set(auth('ana')),
      request(app).get('/tags').set(auth('ana'))
    ])
    expect(authors.body.map(a => a.name)).not.toContain('Autor Solitário')
    expect(publishers.body.map(p => p.name)).not.toContain('Editora Solitária')
    expect(tags.body.map(t => t.name)).not.toContain('tag-solitária')
  })
})

describe('Avaliação', () => {
  let bookId

  beforeAll(async () => {
    bookId = await addBook('ana', { title: 'Avaliável', rating: '3' })
  })

  it('aceita nota no cadastro e no PATCH rápido', async () => {
    let book = await request(app).get(`/library/${bookId}`).set(auth('ana'))
    expect(book.body.rating).toBe(3)

    const patch = await request(app).patch(`/library/${bookId}/rating`).set(auth('ana')).send({ rating: 5 })
    expect(patch.body).toEqual({ rating: 5 })

    book = await request(app).get(`/library/${bookId}`).set(auth('ana'))
    expect(book.body.rating).toBe(5)
  })

  it('remove a nota com null e recusa fora de 1–5', async () => {
    expect((await request(app).patch(`/library/${bookId}/rating`).set(auth('ana')).send({ rating: null })).body).toEqual({ rating: null })
    expect((await request(app).patch(`/library/${bookId}/rating`).set(auth('ana')).send({ rating: 6 })).statusCode).toBe(400)
    expect((await request(app).patch(`/library/${bookId}/rating`).set(auth('ana')).send({ rating: 2.5 })).statusCode).toBe(400)
  })

  it('editar sem mandar "rating" mantém a nota; mandar null apaga', async () => {
    await request(app).patch(`/library/${bookId}/rating`).set(auth('ana')).send({ rating: 4 })
    const base = { title: 'Avaliável', authors: ['Autor Teste'] }

    expect((await request(app).put(`/library/${bookId}`).set(auth('ana')).send(base)).statusCode).toBe(200)
    expect((await request(app).get(`/library/${bookId}`).set(auth('ana'))).body.rating).toBe(4)

    await request(app).put(`/library/${bookId}`).set(auth('ana')).send({ ...base, rating: null })
    expect((await request(app).get(`/library/${bookId}`).set(auth('ana'))).body.rating).toBe(null)
  })

    it('não deixa avaliar livro de outra pessoa (404, como livro inexistente)', async () => {
    expect((await request(app).patch(`/library/${bookId}/rating`).set(auth('bia')).send({ rating: 1 })).statusCode).toBe(404)
  })

  it('ordena por nota com os sem nota no fim', async () => {
    await addBook('caio', { title: 'Nota 2', rating: '2' })
    await addBook('caio', { title: 'Sem nota' })
    await addBook('caio', { title: 'Nota 5', rating: '5' })
    const res = await request(app).get('/library').query({ sort: 'rating', order: 'desc' }).set(auth('caio'))
    expect(res.body.result.map(b => b.title)).toEqual(['Nota 5', 'Nota 2', 'Sem nota'])
  })
})

describe('ISBN inválido', () => {
  it('marca isbn_valid e filtra os livros a corrigir', async () => {
    await addBook('bia', { title: 'ISBN ruim', isbn: '12345' })
    await addBook('bia', { title: 'ISBN bom', isbn: '0-14-032872-6' })

    const all = await request(app).get('/library').set(auth('bia'))
    const byTitle = Object.fromEntries(all.body.result.map(b => [b.title, b]))
    expect(byTitle['ISBN ruim'].isbn_valid).toBe(false)
    expect(byTitle['ISBN bom'].isbn_valid).toBe(true)
    expect(byTitle['ISBN bom'].isbn13).toBe('9780140328721')

    const invalid = await request(app).get('/library').query({ isbn: 'invalid' }).set(auth('bia'))
    expect(invalid.body.result.map(b => b.title)).toEqual(['ISBN ruim'])

    const stats = await request(app).get('/dashboard/stats').set(auth('bia'))
    expect(stats.body.invalidIsbn).toBe(1)
  })
})

describe('Busca por ISBN (Open Library)', () => {
  it('exige login', async () => {
    expect((await request(app).get('/isbn/9780140328721')).statusCode).toBe(401)
  })

  it('preenche os dados do livro', async () => {
    const res = await request(app).get('/isbn/0140328726').set(auth('ana'))
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'], olWorkKey: '/works/OL45804W', coverId: 15152634 })
  })

  it('404 para desconhecido, 400 para inválido', async () => {
    expect((await request(app).get('/isbn/9780000000002').set(auth('ana'))).statusCode).toBe(404)
    expect((await request(app).get('/isbn/12345').set(auth('ana'))).statusCode).toBe(400)
  })

  it('busca por título: rota antes de /:isbn, com login e validação', async () => {
    expect((await request(app).get('/isbn/search?q=dom+casmurro')).statusCode).toBe(401)
    const res = await request(app).get('/isbn/search').query({ q: 'Dom Casmurro', lang: 'pt' }).set(auth('ana'))
    expect(res.statusCode).toBe(200)
    expect(res.body.results[0]).toMatchObject({ title: 'Dom Casmurro', isbn13: '9788508099993', olWorkKey: '/works/OL1W' })
    const short = await request(app).get('/isbn/search?q=a').set(auth('ana'))
    expect(short.statusCode).toBe(400)
    expect(short.body.code).toBe('SEARCH_QUERY_INVALID')
  })

  it('miniatura da capa com ?size=M', async () => {
    const res = await request(app).get('/isbn/cover/15152634?size=M').set(auth('ana'))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/jpeg/)
  })

  it('serve a capa pelo próprio servidor', async () => {
    const res = await request(app).get('/isbn/cover/15152634').set(auth('ana'))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/jpeg/)
  })

  it('cadastro com olCoverId salva a capa e as chaves do Open Library', async () => {
    const res = await request(app).post('/library').set(auth('ana'))
      .field({ title: 'Fantastic Mr. Fox', authors: 'Roald Dahl', isbn: '9780140328721', olCoverId: '15152634', olWorkKey: '/works/OL45804W', olEditionKey: '/books/OL7353617M' })
    expect(res.statusCode).toBe(201)
    expect(res.body.coverSaved).toBe(true)
    expect(fs.existsSync(path.join(UPLOAD_DIR, `${res.body.bookId}.avif`))).toBe(true)

    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth('ana'))
    expect(book.body.ol_work_key).toBe('/works/OL45804W')
  })

  it('recusa chave do Open Library malformada', async () => {
    const res = await request(app).post('/library').set(auth('ana')).field({ title: 'X', authors: 'Y', olWorkKey: 'DROP TABLE' })
    expect(res.statusCode).toBe(400)
  })

  it('trocar o ISBN na edição apaga a chave antiga da obra', async () => {
    const id = await addBook('ana', { title: 'Vai mudar', isbn: '9788535914849', olWorkKey: '/works/OL100W' })
    await request(app).put(`/library/${id}`).set(auth('ana')).send({ title: 'Vai mudar', authors: ['Autor'], isbn: '0140328726' })
    const { rows: [row] } = await db.query('SELECT ol_work_key FROM librishelf.books WHERE id = $1', [id])
    expect(row.ol_work_key).toBeNull()

    const keep = await addBook('ana', { title: 'Mantém', isbn: '9788535914849', olWorkKey: '/works/OL100W' })
    await request(app).put(`/library/${keep}`).set(auth('ana')).send({ title: 'Mantém (editado)', authors: ['Autor'], isbn: '978-85-359-1484-9' })
    const { rows: [kept] } = await db.query('SELECT ol_work_key FROM librishelf.books WHERE id = $1', [keep])
    expect(kept.ol_work_key).toBe('/works/OL100W')
  })
})

describe('Privacidade', () => {
  it('começa tudo desligado', async () => {
    const me = await request(app).get('/auth/me').set(auth('bia'))
    expect(me.body.user).toMatchObject({ isPublic: false, showInCommunity: false, showActivity: false })
  })

  it('altera só o que vier e valida os tipos', async () => {
    expect((await privacy('bia', {})).statusCode).toBe(400)
    expect((await privacy('bia', { showActivity: 'sim' })).statusCode).toBe(400)

    const res = await privacy('bia', { showActivity: true })
    expect(res.body).toEqual({ isPublic: false, showInCommunity: false, showActivity: true, allowIndexing: false })
    await privacy('bia', { showActivity: false })
  })
})

describe('Comunidade', () => {
  let anaDune

  beforeAll(async () => {
    anaDune = await addBook('ana', { title: 'Duna', isbn: '9788576573135', rating: '4' }, ['Frank Herbert'])
    await addBook('bia', { title: 'Duna (bia)', isbn: '978-85-7657-313-5', rating: '5' }, ['Frank Herbert'])
    await addBook('bia', { title: 'Fundação', isbn: '9788576570493' }, ['Isaac Asimov'])
    // Edição diferente (outro ISBN), mesma obra no Open Library.
    await addBook('caio', { title: 'Dune', isbn: '9780441172719', olWorkKey: '/works/OL893415W', rating: '3' }, ['Frank Herbert'])
    await db.query(`UPDATE librishelf.books SET ol_work_key = '/works/OL893415W' WHERE id = $1`, [anaDune])
  })

  const community = () => request(app).get(`/community/books/${anaDune}`).set(auth('ana'))

  it('ninguém aparece enquanto os outros não optarem', async () => {
    const res = await community()
    expect(res.body.readerCount).toBe(0)
    expect(res.body.alsoHave).toEqual([])
  })

  it('biblioteca pública sozinha não basta: precisa de "aparecer para outros leitores"', async () => {
    await privacy('bia', { isPublic: true })
    expect((await community()).body.readerCount).toBe(0)

    await privacy('bia', { showInCommunity: true })
    const res = await community()
    expect(res.body.readerCount).toBe(1)
    expect(res.body.readers).toEqual([{ username: 'bia', hasRead: false, rating: 5, avatarVersion: null }])
  })

  it('"aparecer para outros leitores" sem biblioteca pública não expõe ninguém', async () => {
    await privacy('caio', { showInCommunity: true })
    expect((await community()).body.readerCount).toBe(1)
  })

  it('mesma obra com ISBN diferente também conta; nota média dos outros', async () => {
    await privacy('caio', { isPublic: true })
    const res = await community()
    expect(res.body.readerCount).toBe(2)
    expect(res.body.averageRating).toBe(4)
    expect(res.body.ratingCount).toBe(2)
  })

  it('"quem tem também tem" sugere o que a pessoa ainda não tem', async () => {
    const res = await community()
    expect(res.body.alsoHave.map(b => b.title)).toEqual(['Fundação'])
    expect(res.body.alsoHave[0]).toMatchObject({ authors: 'Isaac Asimov', readers: 1, owner: 'bia' })

    await addBook('ana', { title: 'Fundação (ana)', isbn: '9788576570493' }, ['Isaac Asimov'])
    expect((await community()).body.alsoHave).toEqual([])
  })

  it('não mostra painel de livro de outra pessoa', async () => {
    expect((await request(app).get(`/community/books/${anaDune}`).set(auth('bia'))).statusCode).toBe(404)
  })
})

describe('Perfil público', () => {
  it('estatísticas para visitante anônimo', async () => {
    const res = await request(app).get('/library/public/u/bia/profile')
    expect(res.statusCode).toBe(200)
    expect(res.body.stats).toMatchObject({ totalBooks: 5, averageRating: 5, ratedBooks: 1 })
    expect(res.body.stats.topAuthors[0]).toHaveProperty('name')
    expect(res.body.viewer).toBeNull()
  })

  it('logado: livros em comum e situação de seguir', async () => {
    const res = await request(app).get('/library/public/u/bia/profile').set(auth('ana'))
    expect(res.body.viewer).toMatchObject({ isOwner: false, followStatus: null, commonCount: 3 })
    expect(res.body.viewer.commonBooks.map(b => b.title).sort()).toEqual(['Duna (bia)', 'Fundação', 'ISBN bom'].sort())
  })

  it('o próprio dono é reconhecido', async () => {
    const res = await request(app).get('/library/public/u/bia/profile').set(auth('bia'))
    expect(res.body.viewer).toEqual({ isOwner: true })
  })

  it('sem "aparecer para outros leitores", não calcula em comum', async () => {
    await privacy('bia', { showInCommunity: false })
    const res = await request(app).get('/library/public/u/bia/profile').set(auth('ana'))
    expect(res.body.viewer.commonCount).toBeNull()
    expect(res.body.viewer.commonBooks).toEqual([])
    await privacy('bia', { showInCommunity: true })
  })

  it('biblioteca privada → 404', async () => {
    expect((await request(app).get('/library/public/u/ana/profile')).statusCode).toBe(404)
  })
})

describe('Seguir com aprovação e feed', () => {
  const follow = (from, to) => request(app).post(`/social/follow/${to}`).set(auth(from))

  it('não dá para seguir quem não aceita seguidores (mesmo erro de usuário inexistente)', async () => {
    const closed = await follow('ana', 'bia')
    const ghost = await follow('ana', 'ninguem')
    expect(closed.statusCode).toBe(404)
    expect(ghost.statusCode).toBe(404)
    expect(closed.body.error).toBe(ghost.body.error)
  })

  it('não dá para seguir a si mesmo', async () => {
    await privacy('ana', { showActivity: true })
    expect((await follow('ana', 'ana')).statusCode).toBe(400)
  })

  it('pedido fica pendente até ser aceito; feed vazio enquanto isso', async () => {
    await privacy('bia', { showActivity: true })
    const res = await follow('ana', 'bia')
    expect(res.body).toEqual({ username: 'bia', status: 'pending' })

    const count = await request(app).get('/social/requests/count').set(auth('bia'))
    expect(count.body).toEqual({ count: 1 })

    const conn = await request(app).get('/social/connections').set(auth('bia'))
    expect(conn.body.requests.map(r => r.username)).toEqual(['ana'])

    const feed = await request(app).get('/social/feed').set(auth('ana'))
    expect(feed.body.events).toEqual([])
  })

  it('aceito: feed mostra livros adicionados e lidos', async () => {
    const bookId = (await request(app).get('/library').query({ search: 'Fundação' }).set(auth('bia'))).body.result[0].book_id
    await request(app).patch(`/library/${bookId}/read`).set(auth('bia'))

    expect((await request(app).post('/social/requests/ana/accept').set(auth('bia'))).statusCode).toBe(200)

    const feed = await request(app).get('/social/feed').set(auth('ana'))
    expect(feed.body.events.length).toBeGreaterThan(0)
    expect(feed.body.events.every(e => e.username === 'bia')).toBe(true)
    expect(feed.body.events.some(e => e.type === 'read' && e.title === 'Fundação')).toBe(true)
    expect(feed.body.events.some(e => e.type === 'added')).toBe(true)

    const profile = await request(app).get('/library/public/u/bia/profile').set(auth('ana'))
    expect(profile.body.viewer.followStatus).toBe('accepted')
  })

  it('kinds=all: resenhas (sem as ocultadas) e listas públicas com livros; sem kinds, o feed de sempre', async () => {
    const biaId = (await db.query("SELECT id FROM librishelf.users WHERE name = 'bia'")).rows[0].id
    const books = (await db.query('SELECT id FROM librishelf.books WHERE user_id = $1 ORDER BY id LIMIT 2', [biaId])).rows.map(r => r.id)
    const longBody = 'Final surpreendente. '.repeat(20)
    const { rows: [review] } = await db.query(
      'INSERT INTO librishelf.reviews (book_id, user_id, body, has_spoiler) VALUES ($1, $2, $3, true) RETURNING id', [books[0], biaId, longBody])
    const { rows: [hidden] } = await db.query(
      "INSERT INTO librishelf.reviews (book_id, user_id, body, hidden_at) VALUES ($1, $2, 'oculta', now()) RETURNING id", [books[1], biaId])
    const { rows: [list] } = await db.query("INSERT INTO librishelf.lists (user_id, title, is_public) VALUES ($1, 'Melhores do ano', true) RETURNING id", [biaId])
    await db.query('INSERT INTO librishelf.list_items (list_id, book_id, position) VALUES ($1, $2, 1), ($1, $3, 2)', [list.id, books[0], books[1]])
    await db.query("INSERT INTO librishelf.lists (user_id, title, is_public) VALUES ($1, 'Vazia', true), ($1, 'Privada', false)", [biaId])

    try {
      const plain = await request(app).get('/social/feed').set(auth('ana'))
      expect(plain.body.events.every(e => ['added', 'read'].includes(e.type))).toBe(true)

      const all = await request(app).get('/social/feed').query({ kinds: 'all' }).set(auth('ana'))
      const reviews = all.body.events.filter(e => e.type === 'review')
      expect(reviews.map(e => e.review.id)).toEqual([review.id])
      expect(reviews.some(e => e.review.id === hidden.id)).toBe(false)
      expect(reviews[0]).toMatchObject({ bookId: books[0], username: 'bia', review: { hasSpoiler: true, truncated: true } })
      expect(reviews[0].review.body).toHaveLength(280)

      const lists = all.body.events.filter(e => e.type === 'list')
      expect(lists.map(e => e.title)).toEqual(['Melhores do ano'])
      expect(lists[0].list).toMatchObject({ id: list.id, ranked: true, count: 2 })
      expect(lists[0].list.books.map(b => b.bookId)).toEqual(books)
      expect(lists[0].bookId).toBeNull()
    } finally {
      await db.query('DELETE FROM librishelf.reviews WHERE id = ANY($1)', [[review.id, hidden.id]])
      await db.query('DELETE FROM librishelf.lists WHERE user_id = $1', [biaId])
    }
  })

  it('desligar "mostrar atividade" esconde o feed sem desfazer o vínculo', async () => {
    await privacy('bia', { showActivity: false })
    expect((await request(app).get('/social/feed').set(auth('ana'))).body.events).toEqual([])
    await privacy('bia', { showActivity: true })
    expect((await request(app).get('/social/feed').set(auth('ana'))).body.events.length).toBeGreaterThan(0)
  })

  it('quem é seguido pode remover o seguidor; recusar pedido apaga', async () => {
    expect((await request(app).delete('/social/followers/ana').set(auth('bia'))).statusCode).toBe(204)
    expect((await request(app).get('/social/feed').set(auth('ana'))).body.events).toEqual([])

    await follow('ana', 'bia')
    expect((await request(app).delete('/social/requests/ana').set(auth('bia'))).statusCode).toBe(204)
    const conn = await request(app).get('/social/connections').set(auth('ana'))
    expect(conn.body.following).toEqual([])
  })

  it('cancelar o próprio pedido', async () => {
    await follow('ana', 'bia')
    const res = await request(app).delete('/social/follow/bia').set(auth('ana'))
    expect(res.body).toEqual({ username: 'bia', status: null })
  })

  it('excluir a conta apaga vínculos e nomes da pessoa', async () => {
    await privacy('caio', { showActivity: true })
    await follow('caio', 'bia')
    await request(app).post('/social/requests/caio/accept').set(auth('bia'))

    const del = await request(app).delete('/auth/me').set(auth('caio')).send({ password: 'senha12345' })
    expect(del.statusCode).toBe(204)

    const conn = await request(app).get('/social/connections').set(auth('bia'))
    expect(conn.body.followers.map(f => f.username)).not.toContain('caio')

    const { rows } = await db.query(`
      SELECT (SELECT count(*) FROM librishelf.authors a LEFT JOIN librishelf.users u ON u.id = a.user_id WHERE u.id IS NULL)::int AS orphan_authors,
             (SELECT count(*) FROM librishelf.follows f LEFT JOIN librishelf.users u ON u.id = f.follower_id WHERE u.id IS NULL)::int AS orphan_follows`)
    expect(rows[0]).toEqual({ orphan_authors: 0, orphan_follows: 0 })
  })
})
