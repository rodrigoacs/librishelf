import { db } from '../database/connection.js'
import { PROFILE_PAGE_QUERIES as q } from '../database/queries.js'
import * as authRepository from '../repositories/authRepository.js'
import { canUse } from './entitlementService.js'
import * as personalizationService from './personalizationService.js'
import { REASONS } from './avatarService.js'
import { sendMail } from './mailService.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Página pública (pacote 33).
 *
 *   Bio: até 160 caracteres, uma ou duas linhas, exige e-mail confirmado
 *   (aparece para qualquer um). Denunciável como a foto: 3 denúncias de
 *   contas confiáveis ocultam sozinhas; o admin mantém ou remove.
 *
 *   Favoritos: até 5 livros da própria estante, na ordem escolhida.
 *
 *   Lendo agora: até 3 livros com status "Lendo" e o progresso deles.
 *
 *   Tema (Pro: personalization): paleta e cor de destaque do dono valem na
 *   página dele, para quem visita. Sem Pro, a página usa o tema de quem vê.
 */

export const MAX_BIO = 160
export const MAX_FAVORITES = 5
const MAX_BIO_LINES = 2
const AUTO_HIDE_REPORTS = 3
const AUTO_HIDE_MIN_ACCOUNT_DAYS = 7
const MAX_NOTE = 500

function normalizeBio(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw httpError("'bio' precisa ser texto.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'bio' })
  const lines = value.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (lines.length > MAX_BIO_LINES) {
    throw httpError(`A apresentação pode ter até ${MAX_BIO_LINES} linhas.`, STATUS.BAD_REQUEST, 'BIO_TOO_MANY_LINES', { max: MAX_BIO_LINES })
  }
  const bio = lines.join('\n')
  if ([...bio].length > MAX_BIO) {
    throw httpError(`A apresentação pode ter até ${MAX_BIO} caracteres.`, STATUS.BAD_REQUEST, 'BIO_TOO_LONG', { max: MAX_BIO })
  }
  return bio || null
}

const book = row => ({
  bookId: row.book_id,
  title: row.title,
  authors: row.authors,
  coverVersion: row.cover_version
})

async function favoritesOf(userId) {
  const { rows } = await db.query(q.FAVORITES, [userId])
  return rows.map(book)
}

/** GET /profile-page — o que o dono editou. */
export async function get(userId) {
  const { rows: [row] } = await db.query(q.BIO, [userId])
  if (!row) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  return {
    bio: row.bio,
    bioHidden: Boolean(row.bio_hidden_at),
    favorites: await favoritesOf(userId)
  }
}

/** PUT /profile-page/bio — { bio: string | null } */
export async function setBio(userId, raw) {
  const bio = normalizeBio(raw?.bio)
  if (bio) {
    const user = await authRepository.getUserById(userId)
    if (!user?.email_verified_at) {
      throw httpError('Confirme seu e-mail para escrever uma apresentação.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_BIO')
    }
  }
  await db.query(q.SET_BIO, [userId, bio])
  return get(userId)
}

/** PUT /profile-page/favorites — { bookIds: number[] } (até 5, da própria estante) */
export async function setFavorites(userId, raw) {
  const list = raw?.bookIds
  if (!Array.isArray(list) || list.some(id => !Number.isInteger(id) || id <= 0)) {
    throw httpError("'bookIds' precisa ser uma lista de ids.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'bookIds' })
  }
  const ids = [...new Set(list)]
  if (ids.length > MAX_FAVORITES) {
    throw httpError(`Escolha até ${MAX_FAVORITES} favoritos.`, STATUS.BAD_REQUEST, 'FAVORITES_TOO_MANY', { max: MAX_FAVORITES })
  }
  if (ids.length) {
    const { rows } = await db.query(q.OWNED_BOOKS, [userId, ids])
    if (rows.length !== ids.length) throw httpError('Livro não encontrado na sua estante.', STATUS.BAD_REQUEST, 'FAVORITE_INVALID')
  }
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(q.CLEAR_FAVORITES, [userId])
    if (ids.length) await client.query(q.ADD_FAVORITES, [userId, ids])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { })
    throw err
  } finally {
    client.release()
  }
  return get(userId)
}

/**
 * Para o perfil público: { bio, favorites, reading, theme }.
 * Bio oculta por denúncia some para os outros; o dono vê com bioHidden.
 */
export async function forPublicProfile(userId, viewerId) {
  const [{ rows: [row] }, favorites, { rows: reading }, pro] = await Promise.all([
    db.query(q.BIO, [userId]),
    favoritesOf(userId),
    db.query(q.READING, [userId]),
    canUse(userId, 'personalization')
  ])
  const own = viewerId === userId
  const hidden = Boolean(row?.bio_hidden_at)
  let theme = null
  if (pro) {
    const chosen = await personalizationService.get(userId)
    if (chosen.palette || chosen.accent) theme = { palette: chosen.palette, accent: chosen.accent }
  }
  return {
    bio: row?.bio && (!hidden || own) ? row.bio : null,
    bioHidden: own && hidden,
    favorites,
    reading: reading.map(item => ({
      ...book(item),
      pageCount: item.page_count,
      currentPage: item.current_page,
      progressPercent: item.progress_percent
    })),
    theme
  }
}

/** Para a prévia do link (og:description): bio visível ou null. */
export async function publicBio(userId) {
  const { rows: [row] } = await db.query(q.BIO, [userId])
  return row?.bio && !row.bio_hidden_at ? row.bio : null
}

// ------------------------------------------------------------------ denúncias

/** POST /profile-page/u/:username/bio/report — { reason, note? } */
export async function reportBio(username, reporterId, raw = {}) {
  const reporter = await authRepository.getUserById(reporterId)
  if (!reporter?.email_verified_at) {
    throw httpError('Confirme seu e-mail para denunciar.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_REPORT')
  }
  const owner = await authRepository.getUserByName(String(username ?? ''))
  const { rows: [row] } = owner?.is_public ? await db.query(q.BIO, [owner.id]) : { rows: [] }
  // Sem bio visível: mesmo erro de usuário inexistente
  if (!row?.bio || row.bio_hidden_at) throw httpError('Apresentação não encontrada.', STATUS.NOT_FOUND, 'BIO_NOT_FOUND')
  if (owner.id === reporterId) throw httpError('Você não pode denunciar a sua própria apresentação.', STATUS.BAD_REQUEST, 'BIO_OWN')
  if (!REASONS.includes(raw.reason)) {
    throw httpError("Campo 'reason' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'reason' })
  }
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : ''

  const { rows } = await db.query(q.REPORT, [owner.id, row.bio_version, reporterId, raw.reason, note || null])
  if (rows.length === 0) return { reported: true, duplicate: true }

  const { rows: [{ total, trusted }] } = await db.query(q.OPEN_REPORTS, [owner.id, row.bio_version, AUTO_HIDE_MIN_ACCOUNT_DAYS])
  let hidden = false
  if (trusted >= AUTO_HIDE_REPORTS) {
    hidden = (await db.query(q.AUTO_HIDE, [owner.id, row.bio_version])).rows.length > 0
  }
  void notifyAdmin({ username: owner.name, bio: row.bio, reason: raw.reason, note, total, hidden })
  return { reported: true, duplicate: false }
}

async function notifyAdmin({ username, bio, reason, note, total, hidden }) {
  const to = process.env.ADMIN_EMAIL?.trim()
  if (!to) {
    logger.warn('Apresentação denunciada (ADMIN_EMAIL não definido: sem e-mail)', { username, reason, total, hidden })
    return
  }
  const text = [
    `Apresentação de @${username} denunciada (${reason}).`,
    `Texto: ${bio}`,
    note ? `Observação: ${note}` : null,
    `Denúncias abertas: ${total}${hidden ? ' — ocultada automaticamente' : ''}.`,
    'Revise em Admin → Moderação → Apresentações.'
  ].filter(Boolean).join('\n')
  try {
    await sendMail({ to, subject: `[Librishelf] Apresentação denunciada: @${username}`, text })
  } catch (err) {
    logger.error('E-mail de denúncia de apresentação não foi enviado', { username, message: err.message })
  }
}

// ------------------------------------------------------------------ moderação (admin)

export async function queue(status = 'open') {
  if (!['open', 'hidden', 'all'].includes(status)) {
    throw httpError("Parâmetro 'status' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'status' })
  }
  const { rows } = await db.query(q.QUEUE, [status])
  return rows.map(row => ({
    userId: row.id,
    username: row.username,
    bio: row.bio,
    hidden: Boolean(row.bio_hidden_at),
    hiddenReason: row.bio_hidden_reason,
    reviewedAt: row.bio_reviewed_at,
    active: row.active,
    reports: { open: row.open_count, total: row.total_count, lastAt: row.last_report_at, reasons: row.reasons }
  }))
}

/** action: 'keep' (manter e zerar as denúncias) | 'remove' (apagar a bio) */
export async function moderate(userId, action) {
  if (action !== 'keep' && action !== 'remove') {
    throw httpError('Ação inválida.', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'action' })
  }
  const { rows } = await db.query(action === 'keep' ? q.KEEP : q.CLEAR, [userId])
  if (!rows[0]) throw httpError('Esta conta não tem apresentação.', STATUS.NOT_FOUND, 'BIO_NOT_FOUND')
  return { userId, action }
}
