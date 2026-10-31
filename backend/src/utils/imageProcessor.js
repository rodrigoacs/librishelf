import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'
import UPLOAD_DIR from '../config/uploadDir.js'
import { httpError } from './httpError.js'

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
    throw httpError('Arquivo enviado não é uma imagem válida.', 400, 'IMAGE_INVALID')
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

// ------------------------------------------------------------------ foto de perfil

// Quadrada, em dois tamanhos: sm para listas e cabeçalho (até 48 px na tela,
// 2x/3x nos celulares), lg para o perfil e a folha de recorte.
export const AVATAR_SIZES = { sm: 128, lg: 384 }
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')
const MAX_AVATAR_PIXELS = 40_000_000

function avatarPath(userId, size, ext) {
  return path.join(AVATAR_DIR, `${userId}-${size}.${ext}`)
}

/**
 * O app já manda a foto recortada (quadrada); aqui ela é conferida, girada
 * conforme o EXIF e regravada do zero: o sharp não copia metadados (local da
 * foto, aparelho) para o arquivo novo. Fora do quadrado, corta no centro.
 */
async function saveAvatar(buffer, userId) {
  let meta
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_AVATAR_PIXELS }).metadata()
  } catch {
    meta = null
  }
  if (!meta?.width || !meta?.height || !meta?.format) {
    throw httpError('Arquivo enviado não é uma imagem válida.', 400, 'IMAGE_INVALID')
  }
  await fs.mkdir(AVATAR_DIR, { recursive: true })
  const base = sharp(buffer, { limitInputPixels: MAX_AVATAR_PIXELS }).rotate()
  await Promise.all(Object.entries(AVATAR_SIZES).flatMap(([size, px]) => {
    const square = base.clone().resize({ width: px, height: px, fit: 'cover', position: 'centre' })
    return [
      square.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(avatarPath(userId, size, 'jpg')),
      square.clone().avif({ quality: AVIF_QUALITY, effort: 4 }).toFile(avatarPath(userId, size, 'avif'))
    ]
  }))
}

async function deleteAvatar(userId) {
  await Promise.all(Object.keys(AVATAR_SIZES).flatMap(size => ['jpg', 'avif'].map(ext =>
    fs.unlink(avatarPath(userId, size, ext)).catch(() => { }))))
}

export { saveBookCover, deleteBookCover, isValidImage, saveAvatar, deleteAvatar, AVATAR_DIR }