import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { configureForTests } from '../../services/openLibraryService.js'
import { createOpenLibraryMock } from '../helpers/openLibraryMock.js'
import { drain } from '../../jobs/worker.js'
import { HANDLERS, RECURRING } from '../../jobs/registry.js'
import { suggestMapping, ratingOf, dateOf, fromGeneric } from '../../services/importService.js'

const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const runImports = () => drain('teste-import', { types: ['import.run'] })
const runCovers = () => drain('teste-import', { types: ['import.covers'] })

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const upload = (name, csv, filename = 'biblioteca.csv') =>
  request(app).post('/library/imports').set(auth(name)).attach('file', Buffer.from(csv, 'utf8'), filename)
const start = (name, id, body = {}) => request(app).post(`/library/imports/${id}/start`).set(auth(name)).send(body)
const status = (name, id) => request(app).get(`/library/imports/${id}`).set(auth(name))
const books = async name => (await db.query(
  'SELECT id, title, isbn13, rating, notes, cover_version FROM librishelf.books WHERE user_id = $1 ORDER BY id', [ids[name]]
)).rows

// Exportação do Goodreads: aspas, vírgula e quebra de linha dentro do campo, ISBN como ="..."
const GOODREADS = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '1,"Fantastic Mr. Fox","Roald Dahl","Dahl, Roald",,"=""0140328726""","=""9780140328721""",4,3.9,Puffin,Paperback,96,1988,1970,2024/03/10,2024/01/02,"fantasy, kids","fantasy (#1)",read,"Gostei muito.<br/>Segunda linha, com vírgula",,"Emprestado pela Ana",2,0',
  '2,"Duna, edição especial (Crônicas de Duna, #1)","Frank Herbert","Herbert, Frank",,"=""""","=""""",0,4.2,Aleph,Hardcover,680,2017,1965,,2024/02/01,to-read,,to-read,,,,0,0',
  '3,"O Hobbit","J.R.R. Tolkien","Tolkien, J.R.R.",,"=""""","=""""",5,4.3,HarperCollins,Paperback,336,2019,1937,2023/07/01,2023/06/01,,,"read","Multilinha:',
  'parágrafo dois",,,1,0'
].join('\n')

beforeAll(async () => {
  await clearDatabase()
  configureForTests({ fetch: createOpenLibraryMock().fetch, minInterval: 0 })
  process.env.IMPORT_COVER_PAUSE_MS = '0'
  for (const name of ['ana', 'bia', 'caio']) await signUp(name)
})

afterAll(async () => {
  delete process.env.IMPORT_COVER_PAUSE_MS
  await closeDatabase()
})

describe('funções do CSV genérico', () => {
  test('sugere o mapeamento pelos nomes das colunas (pt e en, com acento)', () => {
    expect(suggestMapping(['Título', 'Autor(es)', 'ISBN-13', 'Situação', 'Nota', 'Lido em', 'Páginas'])).toEqual({
      title: 'Título', authors: 'Autor(es)', isbn: 'ISBN-13', status: 'Situação', rating: 'Nota', readDate: 'Lido em', pages: 'Páginas'
    })
  })

  test('nota e datas em formatos comuns', () => {
    expect([ratingOf('4'), ratingOf('4,5'), ratingOf('3/5'), ratingOf('★★'), ratingOf('0'), ratingOf('9'), ratingOf('')]).toEqual([4, 5, 3, 2, null, null, null])
    expect(dateOf('14/05/2024')).toBe('2024-05-14')
    expect(dateOf('05/14/2024')).toBe('2024-05-14')
    expect(dateOf('2024/5/4')).toBe('2024-05-04')
    expect(dateOf('31/02/2024')).toBeNull()
    expect(dateOf('1999', { yearOnly: true })).toBe('1999-01-01')
  })

  test('linha genérica: autores por ; e status por palavra', () => {
    const book = fromGeneric({ T: 'Duna', A: 'Herbert, Frank; Outro', S: 'Quero ler', N: '5' }, { title: 'T', authors: 'A', status: 'S', rating: 'N' })
    expect(book).toMatchObject({ title: 'Duna', authors: ['Herbert, Frank', 'Outro'], status: 'want', rating: 5 })
  })
})

describe('Goodreads', () => {
  let importId

  test('prévia: total, sem ISBN, quero ler, duplicado por isbn13', async () => {
    // Já está na estante: vira duplicado
    await request(app).post('/library').set(auth('ana')).field({ title: 'Mr Fox', authors: 'Roald Dahl', isbn: '9780140328721' })

    const res = await upload('ana', GOODREADS, 'goodreads_library_export.csv')
    expect(res.status).toBe(200)
    importId = res.body.import.id
    expect(res.body.import).toMatchObject({ status: 'draft', format: 'goodreads', total: 3, filename: 'goodreads_library_export.csv' })
    expect(res.body.preview).toMatchObject({ needsMapping: false, total: 3, duplicates: 1, withoutIsbn: 2, want: 1, rereads: 1 })
    expect(res.body.preview.sample[2].title).toBe('O Hobbit')
  })

  test('começar: roda no worker, sem "quero ler", relatório no fim', async () => {
    const res = await start('ana', importId, {})
    expect(res.status).toBe(200)
    expect(res.body.import.status).toBe('queued')
    expect((await status('ana', importId)).body.import.status).toBe('queued')

    await runImports()
    const report = (await status('ana', importId)).body.import
    expect(report).toMatchObject({ status: 'done', total: 3, processed: 3, imported: 1, duplicates: 1, skippedWant: 1, failed: 0, includeWant: false })
    expect(report.finishedAt).not.toBeNull()

    const hobbit = (await books('ana')).find(book => book.title === 'O Hobbit')
    expect(hobbit.rating).toBe(5)
    expect(hobbit.notes).toBe('Multilinha:\nparágrafo dois')
    expect((await books('ana')).some(book => book.title.startsWith('Duna'))).toBe(false)
    // O arquivo não fica guardado depois
    const { rows: [row] } = await db.query('SELECT content FROM librishelf.imports WHERE id = $1', [importId])
    expect(row.content).toBeNull()
  })

  test('com "quero ler" ligado, a nota 0 vira sem nota e a releitura conta no relatório', async () => {
    const draft = (await upload('bia', GOODREADS)).body.import
    await start('bia', draft.id, { includeWant: true })
    await runImports()
    const report = (await status('bia', draft.id)).body.import
    expect(report).toMatchObject({ imported: 3, skippedWant: 0, rereadsWithoutDate: 1 })

    const list = await books('bia')
    const duna = list.find(book => book.title === 'Duna, edição especial')
    expect(duna.rating).toBeNull()
    const fox = list.find(book => book.isbn13 === '9780140328721')
    expect(fox.rating).toBe(4)
    expect(fox.notes).toContain('Emprestado pela Ana')
    expect(fox.notes).toContain('Segunda linha, com vírgula')
    const tags = (await db.query(`SELECT t.name FROM librishelf.books_tags_link l JOIN librishelf.tags t ON t.id = l.tag_id WHERE l.book_id = $1`, [fox.id])).rows.map(r => r.name)
    expect(tags).toEqual(expect.arrayContaining(['fantasy', 'kids']))
    const readings = (await db.query('SELECT finished_on FROM librishelf.readings WHERE book_id = $1', [fox.id])).rows
    expect(readings.map(r => r.finished_on.toISOString().slice(0, 10))).toEqual(['2024-03-10'])
  })

  test('capas: job separado, pelo ID da edição no Open Library', async () => {
    await runCovers()
    const fox = (await books('bia')).find(book => book.isbn13 === '9780140328721')
    expect(fox.cover_version).not.toBeNull()
    const report = (await db.query("SELECT covers_total, covers_done, covers_found FROM librishelf.imports WHERE user_id = $1", [ids.bia])).rows[0]
    expect(report).toEqual({ covers_total: 1, covers_done: 1, covers_found: 1 })
  })

  test('Open Library fora do ar: a rodada de capas para e volta depois', async () => {
    configureForTests({ fetch: createOpenLibraryMock({ down: true }).fetch, minInterval: 0 })
    try {
      const csv = 'title,authors,isbn\nFox de novo,Roald Dahl,9780140328721\n'
      const draft = (await upload('caio', csv)).body.import
      await start('caio', draft.id, {})
      await runImports()
      const [result] = await runCovers()
      expect(result.result).toMatchObject({ paused: true })
      const next = (await db.query("SELECT run_at FROM librishelf.jobs WHERE type = 'import.covers' AND done_at IS NULL")).rows
      expect(next).toHaveLength(1)
      expect(new Date(next[0].run_at).getTime()).toBeGreaterThan(Date.now() + 60_000)
    } finally {
      configureForTests({ fetch: createOpenLibraryMock().fetch, minInterval: 0 })
    }
  })
})

describe('CSV genérico', () => {
  const GENERIC = 'Título;Autor;ISBN;Situação;Nota;Lido em\n"Memórias; póstumas";Machado de Assis;;Lido;4;10/02/2024\nCem anos;García Márquez;;quero ler;;\n'

  test('ponto e vírgula, mapeamento sugerido e importação', async () => {
    const res = await upload('caio', GENERIC)
    expect(res.body.import.format).toBe('generic')
    expect(res.body.import.mapping).toMatchObject({ title: 'Título', authors: 'Autor', status: 'Situação' })
    expect(res.body.preview).toMatchObject({ needsMapping: false, total: 2, withoutIsbn: 2, want: 1 })

    await start('caio', res.body.import.id, {})
    await runImports()
    const memorias = (await books('caio')).find(book => book.title === 'Memórias; póstumas')
    expect(memorias.rating).toBe(4)
    const readings = (await db.query('SELECT finished_on FROM librishelf.readings WHERE book_id = $1', [memorias.id])).rows
    expect(readings[0].finished_on.toISOString().slice(0, 10)).toBe('2024-02-10')
  })

  test('sem coluna reconhecida: pede o mapeamento; coluna inexistente é recusada', async () => {
    const res = await upload('caio', 'Col A,Col B\nLivro X,Autor Y\n')
    expect(res.body.preview.needsMapping).toBe(true)
    const id = res.body.import.id

    expect((await start('caio', id, {})).body.code).toBe('IMPORT_MAPPING_REQUIRED')
    const bad = await request(app).post(`/library/imports/${id}/preview`).set(auth('caio')).send({ mapping: { title: 'Nada' } })
    expect(bad.body.code).toBe('IMPORT_MAPPING_INVALID')

    const ok = await request(app).post(`/library/imports/${id}/preview`).set(auth('caio')).send({ mapping: { title: 'Col A', authors: 'Col B' } })
    expect(ok.body.preview).toMatchObject({ needsMapping: false, total: 1 })
    expect(ok.body.preview.sample[0]).toMatchObject({ title: 'Livro X', authors: ['Autor Y'] })
    expect((await start('caio', id, {})).status).toBe(200)
    await runImports()
    expect((await status('caio', id)).body.import.imported).toBe(1)
  })

  test('linha com erro vai para o relatório e não para o resto', async () => {
    const draft = (await upload('caio', 'title,authors\nSem autor,\nCom autor,Fulano\n')).body.import
    await start('caio', draft.id, {})
    await runImports()
    const report = (await status('caio', draft.id)).body.import
    expect(report).toMatchObject({ imported: 1, failed: 1 })
    expect(report.errors[0]).toMatchObject({ line: 2, title: 'Sem autor', code: 'AUTHORS_REQUIRED' })
  })
})

describe('regras', () => {
  test('uma importação andando por conta; outra pessoa não vê', async () => {
    const a = (await upload('ana', 'title,authors\nUm,Fulano\n')).body.import
    const b = (await upload('ana', 'title,authors\nDois,Fulano\n')).body.import
    expect((await start('ana', a.id, {})).status).toBe(200)
    const second = await start('ana', b.id, {})
    expect(second.status).toBe(409)
    expect(second.body.code).toBe('IMPORT_RUNNING')
    expect((await status('bia', a.id)).status).toBe(404)
    expect((await start('ana', a.id, {})).body.code).toBe('IMPORT_NOT_DRAFT')
    await runImports()
  })

  test('worker caiu no meio: continua da linha onde parou', async () => {
    const draft = (await upload('bia', 'title,authors\nPrimeiro,Fulano\nSegundo,Fulano\nTerceiro,Fulano\n')).body.import
    await start('bia', draft.id, {})
    // Simula: as duas primeiras linhas já foram processadas antes da queda
    await db.query("UPDATE librishelf.imports SET status = 'running', processed = 2, imported = 2 WHERE id = $1", [draft.id])
    await runImports()
    const report = (await status('bia', draft.id)).body.import
    expect(report).toMatchObject({ status: 'done', processed: 3, imported: 3 })
    const titles = (await books('bia')).map(book => book.title)
    expect(titles).toContain('Terceiro')
    expect(titles).not.toContain('Primeiro')
  })

  test('lista e apaga relatório; rascunho velho sai na limpeza', async () => {
    const list = await request(app).get('/library/imports').set(auth('caio'))
    expect(list.body.imports.length).toBeGreaterThan(0)
    expect(list.body.imports.every(item => item.status !== 'draft')).toBe(true)

    const draft = (await upload('caio', 'title,authors\nX,Y\n')).body.import
    await db.query("UPDATE librishelf.imports SET created_at = now() - interval '2 days' WHERE id = $1", [draft.id])
    expect(await HANDLERS['imports.cleanup']()).toMatchObject({ removed: 1 })
    expect(RECURRING.some(job => job.type === 'imports.cleanup')).toBe(true)

    const done = list.body.imports[0].id
    expect((await request(app).delete(`/library/imports/${done}`).set(auth('caio'))).status).toBe(200)
    expect((await status('caio', done)).status).toBe(404)
  })

  test('arquivo vazio ou sem livros', async () => {
    expect((await upload('caio', 'title,authors\n')).body.code).toBe('CSV_EMPTY')
    const none = await request(app).post('/library/imports').set(auth('caio'))
    expect(none.body.code).toBe('CSV_REQUIRED')
  })
})
