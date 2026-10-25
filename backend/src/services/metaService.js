import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import * as authRepository from '../repositories/authRepository.js'
import { db } from '../database/connection.js'
import { META_QUERIES as q } from '../database/queries.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import * as listService from './listService.js'

/**
 * Trecho de <head> que o nginx do frontend injeta (SSI) no index.html de
 * /u/<usuário>. O SPA sozinho não serve:
 *   - o Google pode nem executar o JavaScript de uma página que chega com
 *     noindex, então a decisão de aparecer em buscadores precisa estar no
 *     HTML que sai do servidor;
 *   - o WhatsApp (e Facebook, Telegram, Slack…) só lê as tags Open Graph do
 *     HTML, sem rodar JavaScript.
 *
 * Biblioteca pública de conta ativa: robots (index só com "aparecer em
 * buscadores"), título/descrição com o número de livros e um mosaico das
 * capas como imagem. Privada e inexistente dão a mesma resposta genérica (não
 * revela quem existe).
 *   https://ogp.me/
 */
export const ROBOTS_NOINDEX = '<meta name="robots" content="noindex, nofollow">'
export const ROBOTS_INDEX = '<meta name="robots" content="index, follow">'

const USERNAME = /^[A-Za-z0-9._-]{1,40}$/

// Mosaico: 1200×630 (1,91:1, o formato das prévias) e JPEG enxuto — o
// WhatsApp comprime a imagem e prefere arquivos pequenos (bem abaixo de 300 KB).
export const IMAGE_WIDTH = 1200
export const IMAGE_HEIGHT = 630
const MAX_COVERS = 10
const COVER_CANDIDATES = 40
const IMAGE_CACHE_MAX = 50

const imageCache = new Map()

const escapeAttr = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

const meta = (property, content) => `<meta property="${property}" content="${escapeAttr(content)}">`
const metaName = (name, content) => `<meta name="${name}" content="${escapeAttr(content)}">`

/**
 * Tags genéricas do site — as mesmas do index.html (mantenha os dois iguais).
 * Vão para /u/<nome> de biblioteca privada ou inexistente.
 */
export function defaultTags() {
  const site = siteUrl()
  return [
    meta('og:type', 'website'),
    meta('og:site_name', 'Librishelf'),
    meta('og:title', 'Librishelf'),
    meta('og:description', 'Sua biblioteca pessoal, em todo lugar.'),
    meta('og:url', `${site}/`),
    meta('og:image', `${site}/bookshelf.png`),
    meta('og:image:alt', 'Ícone de estante de livros do Librishelf'),
    meta('og:locale', 'pt_BR'),
    meta('og:locale:alternate', 'en_US'),
    metaName('twitter:card', 'summary')
  ].join('')
}

async function findPublicLibrary(username) {
  if (typeof username !== 'string' || !USERNAME.test(username)) return null
  const user = await authRepository.getUserByName(username)
  if (!user || !user.is_public || user.is_active === false) return null
  return user
}

async function libraryStats(userId) {
  const { rows } = await db.query(q.LIBRARY_STATS, [userId])
  return rows[0]
}

/** Até `limit` capas que existem no disco (as mais bem avaliadas e lidas por último primeiro). */
async function coverFiles(userId, limit = MAX_COVERS) {
  const { rows } = await db.query(q.COVER_CANDIDATES, [userId, COVER_CANDIDATES])
  return existingCovers(rows.map(row => row.id), limit)
}

/** Dos livros `ids` (na ordem), até `limit` que têm capa enviada. */
async function existingCovers(ids, limit) {
  const files = []
  for (const id of ids) {
    const file = path.join(UPLOAD_DIR, `${id}.jpg`)
    try {
      await fs.access(file)
      files.push(file)
    } catch {
      // Livro sem capa enviada: a capa desenhada só existe no navegador
    }
    if (files.length >= limit) break
  }
  return files
}

// Muda quando a estante muda: as prévias ficam em cache (no WhatsApp também),
// então a URL da imagem leva a versão.
const versionOf = stats => `${Number(stats.changed || 0).toString(36)}${Number(stats.total || 0).toString(36)}`

function describe(name, stats) {
  const total = Number(stats.total || 0)
  const read = Number(stats.read || 0)
  if (total === 0) return `Veja a biblioteca de ${name} no Librishelf.`
  const books = total === 1 ? '1 livro na estante' : `${total} livros na estante`
  const reads = read === 0 ? '' : read === 1 ? ' · 1 lido' : ` · ${read} lidos`
  return `${books}${reads}. Veja a biblioteca de ${name} no Librishelf.`
}

/** Trecho do <head> de /u/<username>: robots + Open Graph. */
export async function libraryHead(username) {
  const user = await findPublicLibrary(username)
  if (!user) return ROBOTS_NOINDEX + defaultTags()

  const site = siteUrl()
  const [stats, covers] = await Promise.all([libraryStats(user.id), coverFiles(user.id, 1)])
  const title = `Biblioteca de ${user.name} · Librishelf`
  const url = `${site}/u/${encodeURIComponent(user.name)}`

  const tags = [
    user.allow_indexing ? ROBOTS_INDEX : ROBOTS_NOINDEX,
    meta('og:type', 'profile'),
    meta('og:site_name', 'Librishelf'),
    meta('og:title', title),
    meta('og:description', describe(user.name, stats)),
    meta('og:url', url),
    meta('og:locale', 'pt_BR'),
    meta('profile:username', user.name)
  ]

  if (covers.length > 0) {
    const image = `${site}/api/meta/u/${encodeURIComponent(user.name)}/image.jpg?v=${versionOf(stats)}`
    tags.push(
      meta('og:image', image),
      meta('og:image:type', 'image/jpeg'),
      meta('og:image:width', String(IMAGE_WIDTH)),
      meta('og:image:height', String(IMAGE_HEIGHT)),
      meta('og:image:alt', `Capas de livros da biblioteca de ${user.name}`),
      metaName('twitter:card', 'summary_large_image')
    )
  } else {
    tags.push(
      meta('og:image', `${site}/bookshelf.png`),
      meta('og:image:alt', 'Ícone de estante de livros do Librishelf'),
      metaName('twitter:card', 'summary')
    )
  }

  return tags.join('')
}

// ------------------------------------------------------------------ listas

const LIST_ID = /^\d{1,9}$/

async function findList(username, listId) {
  if (typeof username !== 'string' || !USERNAME.test(username) || !LIST_ID.test(String(listId))) return null
  return listService.findPublic(username, Number(listId))
}

// Muda quando a lista muda (ordem, livros, nome)
const listVersion = list => `${new Date(list.updatedAt).getTime().toString(36)}${list.itemCount.toString(36)}`

function describeList(name, list) {
  const count = list.itemCount === 1 ? '1 livro' : `${list.itemCount} livros`
  const first = list.items.slice(0, 3).map(item => item.title)
  const intro = list.description ? `${list.description.replace(/\s+/g, ' ').slice(0, 140)}${list.description.length > 140 ? '…' : ''} · ` : ''
  const sample = first.length ? `: ${first.join(', ')}${list.itemCount > first.length ? '…' : ''}` : ''
  return `${intro}${count}${sample}. Lista de ${name} no Librishelf.`
}

/** Trecho do <head> de /u/<username>/lists/<id>: robots + Open Graph. */
export async function listHead(username, listId) {
  const found = await findList(username, listId)
  if (!found) return ROBOTS_NOINDEX + defaultTags()
  const { user, list } = found

  const site = siteUrl()
  const url = `${site}/u/${encodeURIComponent(user.name)}/lists/${list.id}`
  const covers = await existingCovers(list.items.map(item => item.bookId), 1)
  const tags = [
    user.allow_indexing ? ROBOTS_INDEX : ROBOTS_NOINDEX,
    meta('og:type', 'website'),
    meta('og:site_name', 'Librishelf'),
    meta('og:title', `${list.title} · lista de ${user.name}`),
    meta('og:description', describeList(user.name, list)),
    meta('og:url', url),
    meta('og:locale', 'pt_BR')
  ]
  if (covers.length > 0) {
    const image = `${site}/api/meta/u/${encodeURIComponent(user.name)}/lists/${list.id}/image.jpg?v=${listVersion(list)}`
    tags.push(
      meta('og:image', image),
      meta('og:image:type', 'image/jpeg'),
      meta('og:image:width', String(IMAGE_WIDTH)),
      meta('og:image:height', String(IMAGE_HEIGHT)),
      meta('og:image:alt', `Capas dos livros da lista ${list.title}`),
      metaName('twitter:card', 'summary_large_image')
    )
  } else {
    tags.push(
      meta('og:image', `${site}/bookshelf.png`),
      meta('og:image:alt', 'Ícone de estante de livros do Librishelf'),
      metaName('twitter:card', 'summary')
    )
  }
  return tags.join('')
}

/** Mosaico das capas da lista, na ordem dela → { buffer, version } ou null. */
export async function listImage(username, listId) {
  const found = await findList(username, listId)
  if (!found) return null
  const { user, list } = found
  const version = listVersion(list)
  const key = `list:${user.id}:${list.id}:${version}`
  const cached = imageCache.get(key)
  if (cached) return { buffer: cached, version }

  const files = await existingCovers(list.items.map(item => item.bookId), MAX_COVERS)
  if (files.length === 0) return null
  const buffer = await buildMosaic(files)
  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value)
  imageCache.set(key, buffer)
  return { buffer, version }
}

// ------------------------------------------------------------------ imagem

/** Posições das capas: uma fileira (até 5) ou duas (6 a 10), centralizadas. */
export function layoutCovers(count) {
  const padX = 64
  const gap = 28
  const shelf = 12
  const rows = count > 5 ? 2 : 1
  const perRow = Math.ceil(count / rows)
  const maxHeight = rows === 1 ? 430 : 236
  let width = Math.floor((IMAGE_WIDTH - padX * 2 - gap * (perRow - 1)) / perRow)
  width = Math.min(width, Math.floor(maxHeight / 1.5))
  const height = Math.round(width * 1.5)
  const blockHeight = rows * height + (rows - 1) * (gap + shelf) + shelf
  const top = Math.round((IMAGE_HEIGHT - blockHeight) / 2)

  const slots = []
  const rowsOut = []
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(perRow, count - row * perRow)
    const rowWidth = inRow * width + (inRow - 1) * gap
    const left = Math.round((IMAGE_WIDTH - rowWidth) / 2)
    const y = top + row * (height + gap + shelf)
    rowsOut.push({ left, top: y, width: rowWidth })
    for (let col = 0; col < inRow; col++) slots.push({ left: left + col * (width + gap), top: y, width, height })
  }
  return { slots, rows: rowsOut, width, height }
}

function backgroundSvg({ rows, height }) {
  // Uma prateleira sob cada fileira
  const bars = rows.map(row => {
    const x = row.left - 36
    const w = row.width + 72
    const y = row.top + height
    return `<rect x="${x}" y="${y}" width="${w}" height="12" rx="3" fill="#3f3f46"/>` +
      `<rect x="${x}" y="${y + 12}" width="${w}" height="6" rx="2" fill="#000" opacity="0.35"/>`
  })
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}">` +
    '<defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#27272a"/><stop offset="1" stop-color="#121214"/></radialGradient></defs>' +
    `<rect width="100%" height="100%" fill="url(#g)"/>${bars.join('')}</svg>`)
}

async function buildMosaic(files) {
  const layout = layoutCovers(files.length)
  const covers = await Promise.all(files.map(async (file, i) => {
    const slot = layout.slots[i]
    const input = await sharp(file).resize(slot.width, slot.height, { fit: 'cover' }).jpeg().toBuffer()
    return { input, left: slot.left, top: slot.top }
  }))
  // Sombra leve atrás de cada capa
  const shadows = layout.slots.map(slot => ({
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${slot.width + 24}" height="${slot.height + 24}"><rect x="12" y="16" width="${slot.width}" height="${slot.height}" rx="4" fill="#000" opacity="0.45"/></svg>`),
    left: slot.left - 12,
    top: slot.top - 12
  }))

  return sharp(backgroundSvg(layout))
    .composite([...shadows, ...covers])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
}

/**
 * Mosaico das capas de uma biblioteca pública → { buffer, version } ou null
 * (privada, inexistente ou sem nenhuma capa).
 */
export async function libraryImage(username) {
  const user = await findPublicLibrary(username)
  if (!user) return null
  const stats = await libraryStats(user.id)
  const version = versionOf(stats)
  const key = `${user.id}:${version}`
  const cached = imageCache.get(key)
  if (cached) return { buffer: cached, version }

  const files = await coverFiles(user.id)
  if (files.length === 0) return null
  const buffer = await buildMosaic(files)

  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value)
  imageCache.set(key, buffer)
  return { buffer, version }
}

/** Só para testes. */
export function clearImageCache() {
  imageCache.clear()
}
