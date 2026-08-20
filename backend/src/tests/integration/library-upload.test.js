import request from 'supertest'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import app from '../../app.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import UPLOAD_DIR from '../../config/uploadDir.js'

let token

beforeAll(async () => {
  await clearDatabase()

  await request(app).post('/auth/register').send({ username: 'uploadtester', password: '123', email: 'uploadtester@example.com' })
  const res = await request(app).post('/auth/login').send({ username: 'uploadtester', password: '123' })
  token = res.body.token
})

afterAll(async () => {
  await closeDatabase()
})

describe('Library cover upload', () => {
  it('should reject a non-image file sent as coverImage', async () => {
    const fakeFile = Buffer.from('isso aqui não é uma imagem de verdade')

    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Livro Capa Inválida')
      .field('author', 'Autor X')
      .attach('coverImage', fakeFile, { filename: 'nao-e-imagem.jpg', contentType: 'image/jpeg' })

    expect(res.statusCode).toEqual(400)
  })

  it('should generate both .jpg and .avif on upload, without needing an external script', async () => {
    const fakeCover = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: { r: 10, g: 120, b: 200 } }
    }).png().toBuffer()

    const res = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Livro Com Capa')
      .field('author', 'Autor Y')
      .attach('coverImage', fakeCover, { filename: 'capa.png', contentType: 'image/png' })

    expect(res.statusCode).toEqual(201)
    const bookId = res.body.bookId

    const jpgPath = path.join(UPLOAD_DIR, `${bookId}.jpg`)
    const avifPath = path.join(UPLOAD_DIR, `${bookId}.avif`)

    expect(fs.existsSync(jpgPath)).toBe(true)
    expect(fs.existsSync(avifPath)).toBe(true)

    const avifMeta = await sharp(avifPath).metadata()
    expect(avifMeta.width).toBeLessThanOrEqual(356)
    expect(avifMeta.height).toBeLessThanOrEqual(500)
  })

  it('should remove both .jpg and .avif when the book is deleted', async () => {
    const fakeCover = await sharp({
      create: { width: 400, height: 600, channels: 3, background: { r: 200, g: 10, b: 10 } }
    }).png().toBuffer()

    const createRes = await request(app)
      .post('/library')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Livro Para Deletar')
      .field('author', 'Autor Z')
      .attach('coverImage', fakeCover, { filename: 'capa.png', contentType: 'image/png' })

    const bookId = createRes.body.bookId
    const jpgPath = path.join(UPLOAD_DIR, `${bookId}.jpg`)
    const avifPath = path.join(UPLOAD_DIR, `${bookId}.avif`)

    expect(fs.existsSync(jpgPath)).toBe(true)
    expect(fs.existsSync(avifPath)).toBe(true)

    await request(app)
      .delete(`/library/${bookId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(fs.existsSync(jpgPath)).toBe(false)
    expect(fs.existsSync(avifPath)).toBe(false)
  })
})