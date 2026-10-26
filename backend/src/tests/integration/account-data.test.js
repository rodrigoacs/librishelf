import request from 'supertest'
import app from '../../app.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'
import { parseCsv } from '../../utils/csv.js'
import { splitSeries } from '../../services/dataService.js'
import { db } from '../../database/connection.js'

const PASSWORD = 'senha12345'
let auth

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
  const res = await request(app).post('/auth/login').send({ username: name, password: PASSWORD })
  return { Authorization: `Bearer ${tokenFrom(res)}` }
}

const books = async (query = {}) => (await request(app).get('/library').set(auth).query({ limit: 100, sort: 'title', order: 'asc', ...query })).body.result

const GOODREADS_HEADER = 'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies'

const GOODREADS_CSV = [
  GOODREADS_HEADER,
  '234225,"Dune (Dune, #1)",Frank Herbert,"Herbert, Frank",,"=""0441013597""","=""9780441013593""",5,4.27,Ace Books,Paperback,688,2005,1965,2019/05/14,2019/01/02,"favoritos, sci-fi","favoritos (#1), sci-fi (#3)",read,Incrível.<br/>Reler.,,Emprestei pro João,1,0',
  '11,"O Guia do Mochileiro",Douglas Adams,"Adams, Douglas",,"=""""","=""""",0,4.2,Arqueiro,Paperback,200,2009,1979,,2024/03/10,currently-reading,currently-reading (#1),currently-reading,,,,0,0',
  '12,"Bons Presságios",Neil Gaiman,"Gaiman, Neil",Terry Pratchett,"=""""","=""""",0,4.2,Bertrand,Paperback,400,2019,1990,,2024/03/11,to-read,to-read (#1),to-read,,,,0,0',
  '13,,Sem Título,"Título, Sem",,"=""""","=""""",0,0,,,,,,,2024/03/11,,,read,,,,0,0'
].join('\n')

beforeAll(async () => {
  await clearDatabase()
  testOutbox().length = 0
  auth = await signUp('leitor')
})

afterAll(async () => {
  await closeDatabase()
})

describe('Importar do Goodreads', () => {
  it('separa a série do título', () => {
    expect(splitSeries('Dune (Dune, #1)')).toEqual({ title: 'Dune', series: 'Dune', seriesIndex: '1' })
    expect(splitSeries('O Hobbit (A Terra-média #0.5)')).toEqual({ title: 'O Hobbit', series: 'A Terra-média', seriesIndex: '0.5' })
    expect(splitSeries('Livro (edição especial)')).toEqual({ title: 'Livro (edição especial)', series: null, seriesIndex: null })
  })

  it('importa livros, status, nota, prateleiras, série e anotação; aponta a linha com erro', async () => {
    const res = await request(app).post('/library/import').set(auth)
      .attach('file', Buffer.from(GOODREADS_CSV), { filename: 'goodreads_library_export.csv', contentType: 'text/csv' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ format: 'goodreads', total: 4, imported: 3, duplicates: 0, failed: 1 })
    expect(res.body.errors).toEqual([expect.objectContaining({ line: 5 })])

    const list = await books()
    expect(list.map(b => b.title)).toEqual(['Bons Presságios', 'Dune', 'O Guia do Mochileiro'])

    const dune = list.find(b => b.title === 'Dune')
    expect(dune.isbn).toBe('9780441013593')
    expect(dune.rating).toBe(5)
    expect(dune.series).toBe('Dune')
    expect(dune.series_index).toBe(1)
    expect(dune.tag_names).toEqual(['favoritos', 'sci fi'])
    expect(new Date(dune.read_date).getUTCFullYear()).toBe(2019)

    const full = (await request(app).get(`/library/${dune.book_id}`).set(auth)).body
    expect(full.notes).toBe('Emprestei pro João\n\nIncrível.\nReler.')

    expect(list.find(b => b.title === 'O Guia do Mochileiro').reading_status).toBe('reading')
    const omens = list.find(b => b.title === 'Bons Presságios')
    expect(omens.reading_status).toBe('want')
    expect(omens.author_names).toEqual(['Neil Gaiman', 'Terry Pratchett'])
  })

  it('importar de novo não duplica', async () => {
    const res = await request(app).post('/library/import').set(auth)
      .attach('file', Buffer.from(GOODREADS_CSV), { filename: 'export.csv', contentType: 'text/csv' })
    expect(res.body).toMatchObject({ imported: 0, duplicates: 3 })
  })

  it('recusa formato desconhecido, arquivo vazio e não-CSV', async () => {
    const unknown = await request(app).post('/library/import').set(auth).attach('file', Buffer.from('a,b\n1,2\n'), { filename: 'x.csv', contentType: 'text/csv' })
    expect(unknown.statusCode).toBe(400)
    expect((await request(app).post('/library/import').set(auth)).statusCode).toBe(400)
    const image = await request(app).post('/library/import').set(auth).attach('file', Buffer.from('xx'), { filename: 'x.png', contentType: 'image/png' })
    expect(image.statusCode).toBe(400)
  })
})

describe('Exportar', () => {
  it('JSON com conta, metas e livros (inclusive anotação)', async () => {
    await request(app).put('/dashboard/goal').set(auth).send({ year: 2026, target: 10 })
    const res = await request(app).get('/auth/me/export').set(auth)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="librishelf-\d{4}-\d{2}-\d{2}\.json"/)
    expect(res.body.account).toMatchObject({ username: 'leitor', email: 'leitor@example.com' })
    expect(res.body.account).not.toHaveProperty('password_hash')
    expect(res.body.readingGoals).toEqual([{ year: 2026, target: 10 }])
    const dune = res.body.books.find(b => b.title === 'Dune')
    expect(dune).toMatchObject({ authors: ['Frank Herbert'], status: 'read', series: 'Dune', volume: 1, rating: 5 })
    expect(dune.notes).toContain('Emprestei')
  })

  it('CSV com cabeçalho e que volta igual na importação', async () => {
    const res = await request(app).get('/auth/me/export').set(auth).query({ format: 'csv' }).buffer(true).parse((r, cb) => {
      let data = ''
      r.setEncoding('utf8')
      r.on('data', chunk => { data += chunk })
      r.on('end', () => cb(null, data))
    })
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    const rows = parseCsv(res.body)
    expect(rows[0]).toEqual(['title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date', 'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at', 'read_dates', 'pages', 'review', 'review_spoiler', 'review_visibility'])
    expect(rows).toHaveLength(4)

    // A outra conta importa o CSV exportado e fica com os mesmos livros.
    const other = await signUp('copia')
    const imported = await request(app).post('/library/import').set(other)
      .attach('file', Buffer.from(res.body), { filename: 'librishelf.csv', contentType: 'text/csv' })
    expect(imported.body).toMatchObject({ format: 'librishelf', imported: 3, failed: 0 })
    const copy = (await request(app).get('/library').set(other).query({ sort: 'title', order: 'asc' })).body.result
    expect(copy.map(b => [b.title, b.reading_status, Boolean(b.read_date)])).toEqual([
      ['Bons Presságios', 'want', false],
      ['Dune', null, true],
      ['O Guia do Mochileiro', 'reading', false]
    ])
    expect(copy.find(b => b.title === 'Bons Presságios').author_names).toEqual(['Neil Gaiman', 'Terry Pratchett'])
  })

  it('exige login', async () => {
    expect((await request(app).get('/auth/me/export')).statusCode).toBe(401)
  })

  it('JSON version 2: seguir, pedidos, bloqueios, curtidas, denúncias e avisos (LGPD)', async () => {
    const amiga = await signUp('amiga')
    await signUp('pedinte')
    await signUp('chato')
    const id = async name => (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
    const [leitorId, amigaId, pedinteId, chatoId] = await Promise.all(['leitor', 'amiga', 'pedinte', 'chato'].map(id))

    await db.query("INSERT INTO librishelf.follows (follower_id, followee_id, status, accepted_at) VALUES ($1, $2, 'accepted', now())", [leitorId, amigaId])
    await db.query("INSERT INTO librishelf.follows (follower_id, followee_id, status) VALUES ($1, $2, 'pending')", [pedinteId, leitorId])
    await db.query('INSERT INTO librishelf.blocks (blocker_id, blocked_id) VALUES ($1, $2)', [leitorId, chatoId])
    const bookId = (await request(app).post('/library').set(amiga).field({ title: 'Livro da Amiga', authors: 'Autora' })).body.bookId
    const { rows: [review] } = await db.query("INSERT INTO librishelf.reviews (book_id, user_id, body) VALUES ($1, $2, 'Gostei') RETURNING id", [bookId, amigaId])
    await db.query('INSERT INTO librishelf.review_likes (review_id, user_id) VALUES ($1, $2)', [review.id, leitorId])
    await db.query("INSERT INTO librishelf.review_reports (review_id, reporter_id, reason, note) VALUES ($1, $2, 'spoiler', 'conta o fim')", [review.id, leitorId])
    await db.query("UPDATE librishelf.users SET follow_emails = true, email_locale = 'en' WHERE id = $1", [leitorId])

    const data = (await request(app).get('/auth/me/export').set(auth)).body
    expect(data.version).toBe(2)
    expect(data.following).toEqual([{ username: 'amiga', since: expect.any(String) }])
    expect(data.followers).toEqual([])
    expect(data.requests).toEqual({ sent: [], received: [{ username: 'pedinte', requestedAt: expect.any(String) }] })
    expect(data.blocked).toEqual([{ username: 'chato', blockedAt: expect.any(String) }])
    expect(data.likesGiven).toEqual([{ review: { author: 'amiga', book: 'Livro da Amiga' }, likedAt: expect.any(String) }])
    expect(data.reportsMade).toEqual([{ review: { author: 'amiga', book: 'Livro da Amiga' }, reason: 'spoiler', note: 'conta o fim', reportedAt: expect.any(String) }])
    expect(data.notifications).toEqual({ followEmails: true, locale: 'en' })
    expect(data.account).toHaveProperty('lastLoginAt')
    expect(data.account).toHaveProperty('lastSeenAt')
    // Só acréscimos: o que a version 1 tinha continua
    expect(Object.keys(data)).toEqual(expect.arrayContaining(['account', 'readingGoals', 'books', 'lists']))
  })
})

describe('Trocar e-mail', () => {
  it('pede a senha, o e-mail novo começa sem confirmação e o antigo recebe aviso', async () => {
    await confirmEmail('leitor')
    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'novo@example.com', password: 'errada' })).statusCode).toBe(401)

    const before = testOutbox().length
    const res = await request(app).patch('/auth/me/email').set(auth).send({ email: 'novo@example.com', password: PASSWORD, locale: 'pt' })
    expect(res.statusCode).toBe(200)
    expect(res.body.user).toMatchObject({ email: 'novo@example.com', emailVerified: false })

    const sent = testOutbox().slice(before)
    expect(sent.map(m => m.to).sort()).toEqual(['leitor@example.com', 'novo@example.com'])
    const notice = sent.find(m => m.to === 'leitor@example.com')
    expect(notice.subject).toBe('O e-mail da sua conta no Librishelf mudou')
    expect(notice.text).toContain('no•••@example.com')
    expect(notice.text).not.toContain('novo@example.com')
  })

  it('valida formato, igual ao atual e em uso por outra conta', async () => {
    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'sem-arroba', password: PASSWORD })).statusCode).toBe(400)
    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'NOVO@example.com', password: PASSWORD })).statusCode).toBe(400)
    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'Copia@Example.com', password: PASSWORD })).statusCode).toBe(409)
  })
})

describe('Trocar nome de usuário', () => {
  it('troca, devolve sessão nova e o login passa a ser pelo nome novo', async () => {
    const res = await request(app).patch('/auth/me/username').set(auth).send({ username: 'leitor.novo', password: PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(res.body.user.name).toBe('leitor.novo')
    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i)

    expect((await request(app).post('/auth/login').send({ username: 'leitor', password: PASSWORD })).statusCode).toBe(401)
    expect((await request(app).post('/auth/login').send({ username: 'leitor.novo', password: PASSWORD })).statusCode).toBe(200)
  })

  it('valida regras do cadastro, senha e nome em uso (sem diferenciar maiúsculas)', async () => {
    const send = body => request(app).patch('/auth/me/username').set(auth).send({ password: PASSWORD, ...body })
    expect((await send({ username: 'com espaço' })).statusCode).toBe(400)
    expect((await send({ username: 'a'.repeat(51) })).statusCode).toBe(400)
    expect((await send({ username: '' })).statusCode).toBe(400)
    expect((await send({ username: 'COPIA' })).statusCode).toBe(409)
    expect((await send({ username: 'outro', password: 'errada' })).statusCode).toBe(401)
    // Só mudar maiúsculas do próprio nome pode.
    expect((await send({ username: 'Leitor.Novo' })).statusCode).toBe(200)
  })
})
