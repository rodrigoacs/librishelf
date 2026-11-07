import { db } from '../database/connection.js'
import { PERSONALIZATION_QUERIES as q } from '../database/queries.js'
import * as authRepository from '../repositories/authRepository.js'
import { saveProfileCover, deleteProfileCover } from '../utils/imageProcessor.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Personalização (Pro: personalization). Os temas claro/escuro e as 6 cores
 * de destaque continuam grátis e ficam no aparelho; aqui só o que é do Pro.
 * Sem Pro, o que foi escolhido continua valendo (a rota recusa só a troca).
 * Voltar ao padrão (reset) não usa nada do Pro e é sempre permitido.
 *
 * Capa de fundo do perfil público: um livro da pessoa (que tenha capa) ou
 * uma imagem qualquer enviada por ela. Uma substitui a outra.
 *   { kind: 'book', bookId, version } | { kind: 'image', version } | null
 */
export const PALETTES = Object.freeze(['paper', 'amoled', 'slate', 'forest'])
export const ACCENTS = Object.freeze(['teal', 'pink', 'indigo'])
export const ICONS = Object.freeze(['night', 'paper', 'mono'])
export const ITEMS = Object.freeze(['palette', 'accent', 'appIcon', 'profileCover'])

function coverOf(row) {
  if (row?.profile_cover_image_version) return { kind: 'image', version: row.profile_cover_image_version }
  if (row?.profile_cover_book_id && row.profile_cover_version !== null && row.profile_cover_version !== undefined) {
    return { kind: 'book', bookId: row.profile_cover_book_id, version: row.profile_cover_version }
  }
  return null
}

const out = row => ({
  palette: row?.ui_palette ?? null,
  accent: row?.ui_accent ?? null,
  appIcon: row?.app_icon ?? null,
  profileCover: coverOf(row)
})

// A imagem antiga sai do disco quando a capa troca para livro ou nenhuma
async function dropImageFile(userId, result) {
  if (!result.rows[0]?.had_image) return
  await deleteProfileCover(userId).catch(err => logger.warn('Capa de perfil não removida do disco', { userId, message: err.message }))
}

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

  const result = await db.query(q.UPDATE, [userId, palette.value, accent.value, icon.value, cover.value, palette.set, accent.set, icon.set, cover.set])
  if (cover.set) await dropImageFile(userId, result)
  return get(userId)
}

/**
 * PUT /personalization/cover-image — imagem qualquer como capa de fundo.
 * Exige e-mail confirmado (aparece para outras pessoas na biblioteca pública).
 */
export async function uploadCoverImage(userId, file) {
  const user = await authRepository.getUserById(userId)
  if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (!user.email_verified_at) {
    throw httpError('Confirme seu e-mail para enviar uma capa de perfil.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_COVER')
  }
  if (!file?.buffer?.length) throw httpError('Envie uma imagem.', STATUS.BAD_REQUEST, 'IMAGE_REQUIRED')
  await saveProfileCover(file.buffer, userId)
  await db.query(q.SET_IMAGE, [userId])
  return get(userId)
}

/** Para routes/profileCovers.js: { userId, public } se viewerId pode ver a imagem de username. */
export async function imageAccess(username, viewerId) {
  if (typeof username !== 'string' || username.length > 255) return null
  const { rows: [row] } = await db.query(q.IMAGE_ACCESS, [username])
  if (!row) return null
  if (!row.is_public && row.id !== viewerId) return null
  return { userId: row.id, public: Boolean(row.is_public) }
}

/** Exclusão de conta: tira a imagem do disco. */
export async function removeUserFiles(userId) {
  await deleteProfileCover(userId)
}

/** Volta um item ao padrão grátis. */
export async function reset(userId, item) {
  if (!ITEMS.includes(item)) throw httpError('Opção de personalização inválida.', STATUS.BAD_REQUEST, 'PERSONALIZATION_INVALID', { field: item })
  const key = item === 'profileCover' ? 'profileCoverBookId' : item
  // Sem validação de Pro: limpar não usa o recurso
  const flags = ITEMS.map(name => name === item)
  const result = await db.query(q.UPDATE, [userId, null, null, null, null, ...flags])
  if (item === 'profileCover') await dropImageFile(userId, result)
  return { ...(await get(userId)), reset: key }
}

/** Livros com capa, para escolher a capa de fundo do perfil. */
export async function covers(userId) {
  const { rows } = await db.query(q.COVERS, [userId])
  return rows.map(row => ({ bookId: row.id, title: row.title, version: row.cover_version }))
}

/** Para o perfil público: { kind: 'book', bookId, version } | { kind: 'image', version } | null. */
export async function publicCover(userId) {
  const { rows: [row] } = await db.query(q.PUBLIC_COVER, [userId])
  if (!row) return null
  if (row.profile_cover_image_version) return { kind: 'image', version: row.profile_cover_image_version }
  return row.id ? { kind: 'book', bookId: row.id, version: row.cover_version } : null
}
