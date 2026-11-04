import { db } from '../database/connection.js'
import { PERSONALIZATION_QUERIES as q } from '../database/queries.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'

/**
 * Personalização (Pro: personalization). Os temas claro/escuro e as 6 cores
 * de destaque continuam grátis e ficam no aparelho; aqui só o que é do Pro.
 * Sem Pro, o que foi escolhido continua valendo (a rota recusa só a troca).
 * Voltar ao padrão (reset) não usa nada do Pro e é sempre permitido.
 */
export const PALETTES = Object.freeze(['paper', 'amoled', 'slate', 'forest'])
export const ACCENTS = Object.freeze(['teal', 'pink', 'indigo'])
export const ICONS = Object.freeze(['night', 'paper', 'mono'])
export const ITEMS = Object.freeze(['palette', 'accent', 'appIcon', 'profileCover'])

const out = row => ({
  palette: row?.ui_palette ?? null,
  accent: row?.ui_accent ?? null,
  appIcon: row?.app_icon ?? null,
  profileCover: row?.profile_cover_book_id && row.profile_cover_version !== null
    ? { bookId: row.profile_cover_book_id, version: row.profile_cover_version }
    : null
})

export async function get(userId) {
  const { rows: [row] } = await db.query(q.GET, [userId])
  return out(row)
}

function pick(body, key, allowed) {
  if (!(key in body)) return { set: false, value: null }
  const value = body[key]
  if (value === null || value === '') return { set: true, value: null }
  if (!allowed.includes(value)) {
    throw httpError('Opção de personalização inválida.', STATUS.BAD_REQUEST, 'PERSONALIZATION_INVALID', { field: key })
  }
  return { set: true, value }
}

/** Muda só os campos enviados ({ palette, accent, appIcon, profileCoverBookId }). */
export async function update(userId, body = {}) {
  const palette = pick(body, 'palette', PALETTES)
  const accent = pick(body, 'accent', ACCENTS)
  const icon = pick(body, 'appIcon', ICONS)
  const cover = { set: 'profileCoverBookId' in body, value: null }

  if (cover.set && body.profileCoverBookId !== null && body.profileCoverBookId !== '') {
    const id = Number(body.profileCoverBookId)
    const found = Number.isInteger(id) && id > 0 && (await db.query(q.BOOK_WITH_COVER, [id, userId])).rowCount > 0
    if (!found) throw httpError('Escolha um livro seu que tenha capa.', STATUS.BAD_REQUEST, 'PROFILE_COVER_INVALID')
    cover.value = id
  }

  await db.query(q.UPDATE, [userId, palette.value, accent.value, icon.value, cover.value, palette.set, accent.set, icon.set, cover.set])
  return get(userId)
}

/** Volta um item ao padrão grátis. */
export async function reset(userId, item) {
  if (!ITEMS.includes(item)) throw httpError('Opção de personalização inválida.', STATUS.BAD_REQUEST, 'PERSONALIZATION_INVALID', { field: item })
  const key = item === 'profileCover' ? 'profileCoverBookId' : item
  // Sem validação de Pro: limpar não usa o recurso
  const flags = ITEMS.map(name => name === item)
  await db.query(q.UPDATE, [userId, null, null, null, null, ...flags])
  return { ...(await get(userId)), reset: key }
}

/** Livros com capa, para escolher a capa de fundo do perfil. */
export async function covers(userId) {
  const { rows } = await db.query(q.COVERS, [userId])
  return rows.map(row => ({ bookId: row.id, title: row.title, version: row.cover_version }))
}

/** Para o perfil público: { bookId, version } ou null. */
export async function publicCover(userId) {
  const { rows: [row] } = await db.query(q.PUBLIC_COVER, [userId])
  return row ? { bookId: row.id, version: row.cover_version } : null
}
