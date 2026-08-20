import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'
import UPLOAD_DIR from '../config/uploadDir.js'

const MAX_WIDTH = 356
const MAX_HEIGHT = 500
const AVIF_QUALITY = 65
const AVIF_EFFORT = 6
const JPEG_QUALITY = 85

async function isValidImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata()
    return Boolean(metadata.width && metadata.height && metadata.format)
  } catch {
    return false
  }
}

async function saveBookCover(buffer, bookId) {
  const valid = await isValidImage(buffer)

  if (!valid) {
    const error = new Error('Arquivo enviado não é uma imagem válida.')
    error.status = 400
    throw error
  }

  const jpgPath = path.join(UPLOAD_DIR, `${bookId}.jpg`)
  const avifPath = path.join(UPLOAD_DIR, `${bookId}.avif`)

  const resized = sharp(buffer).resize({
    width: MAX_WIDTH,
    height: MAX_HEIGHT,
    withoutEnlargement: true,
    fit: 'inside'
  })

  await Promise.all([
    resized.clone().jpeg({ quality: JPEG_QUALITY }).toFile(jpgPath),
    resized.clone().avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }).toFile(avifPath)
  ])
}

async function deleteBookCover(bookId) {
  const jpgPath = path.join(UPLOAD_DIR, `${bookId}.jpg`)
  const avifPath = path.join(UPLOAD_DIR, `${bookId}.avif`)

  await Promise.all([
    fs.unlink(jpgPath).catch(() => { }),
    fs.unlink(avifPath).catch(() => { })
  ])
}

export { saveBookCover, deleteBookCover, isValidImage }