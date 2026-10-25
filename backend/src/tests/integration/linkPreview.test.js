import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import sharp from 'sharp'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Pasta de capas só deste teste: as capas de outros testes (ou do seu banco
// local, se o .env.test não define UPLOAD_DIR) não entram no mosaico, e as
// suas não são tocadas. O app é importado depois de trocar a variável.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'librishelf-preview-'))
process.env.UPLOAD_DIR = uploadDir
const { default: app } = await import('../../app.js')

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const head = name => request(app).get(`/meta/u/${name}`).then(res => res.text)
const tag = (html, property) => html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`))?.[1]

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
}

async function addBook(user, title, readDate) {
  const res = await request(app).post('/library').set(auth(user)).field({ title, authors: 'Autor', ...(readDate ? { readDate } : {}) })
  return res.body.bookId
}

async function uploadCover(user, bookId, color) {
  const image = await sharp({ create: { width: 300, height: 450, channels: 3, background: color } }).jpeg().toBuffer()
  const res = await request(app).post(`/library/${bookId}/cover`).set(auth(user)).attach('coverImage', image, { filename: 'capa.jpg', contentType: 'image/jpeg' })
  expect(res.statusCode).toBe(200)
}

beforeAll(async () => {
  await clearDatabase()
  await signUp('lu')
  await signUp('oculta')
})

afterAll(async () => {
  await closeDatabase()
  fs.rmSync(uploadDir, { recursive: true, force: true })
})

describe('Prévia das bibliotecas públicas (Open Graph)', () => {
  it('privada ou inexistente: tags genéricas e noindex', async () => {
    for (const name of ['oculta', 'ninguem']) {
      const html = await head(name)
      expect(tag(html, 'robots')).toBe('noindex, nofollow')
      expect(tag(html, 'og:title')).toBe('Librishelf')
      expect(tag(html, 'og:type')).toBe('website')
      expect(html).not.toContain('profile:username')
    }
    expect((await request(app).get('/meta/u/oculta/image.jpg')).statusCode).toBe(404)
  })

  it('pública sem capas: título e números, imagem padrão', async () => {
    await request(app).patch('/auth/me/visibility').set(auth('lu')).send({ isPublic: true })
    let html = await head('lu')
    expect(tag(html, 'og:title')).toBe('Biblioteca de lu · Librishelf')
    expect(tag(html, 'og:description')).toBe('Veja a biblioteca de lu no Librishelf.')
    expect(tag(html, 'og:url')).toMatch(/\/u\/lu$/)

    await addBook('lu', 'Um', '2024-01-01')
    await addBook('lu', 'Dois')
    html = await head('lu')
    expect(tag(html, 'og:description')).toBe('2 livros na estante · 1 lido. Veja a biblioteca de lu no Librishelf.')
    expect(tag(html, 'og:image')).toMatch(/\/bookshelf\.png$/)
    expect(tag(html, 'twitter:card')).toBe('summary')
    expect((await request(app).get('/meta/u/lu/image.jpg')).statusCode).toBe(404)
  })

  it('com capas: mosaico 1200×630 leve, versão muda com capa nova', async () => {
    const ids = []
    for (const color of ['#7a2e2e', '#1e3a5f', '#2f5d3a']) {
      const id = await addBook('lu', `Livro ${color}`)
      await uploadCover('lu', id, color)
      ids.push(id)
    }
    const html = await head('lu')
    const image = tag(html, 'og:image')
    expect(image).toMatch(/\/api\/meta\/u\/lu\/image\.jpg\?v=[0-9a-z]+$/)
    expect(tag(html, 'og:image:width')).toBe('1200')
    expect(tag(html, 'og:image:height')).toBe('630')
    expect(tag(html, 'twitter:card')).toBe('summary_large_image')

    const res = await request(app).get('/meta/u/lu/image.jpg')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/jpeg/)
    expect(res.headers['cache-control']).toMatch(/max-age/)
    expect(res.body.length).toBeLessThan(300 * 1024)
    const meta = await sharp(res.body).metadata()
    expect([meta.width, meta.height]).toEqual([1200, 630])

    // Capa nova (last_modified muda) → URL nova
    await new Promise(resolve => setTimeout(resolve, 1100))
    await uploadCover('lu', ids[0], '#5b2b6e')
    expect(tag(await head('lu'), 'og:image')).not.toBe(image)
  })

  it('robots acompanha a opção "aparecer em buscadores"', async () => {
    await request(app).patch('/auth/me/visibility').set(auth('lu')).send({ allowIndexing: true })
    expect(tag(await head('lu'), 'robots')).toBe('index, follow')
  })
})
