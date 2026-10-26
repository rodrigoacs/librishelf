import { db } from '../database/connection.js'
import { REVIEW_QUERIES as q } from '../database/queries.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import { sendMail } from './mailService.js'
import { reviewReportEmail } from './emailTemplates.js'
import { signId, readSignedId } from '../utils/signedToken.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'
import logger from '../utils/logger.js'

/**
 * Resenhas públicas: um texto por livro da estante, que outros leitores podem
 * ler (as anotações continuam privadas).
 *
 *   visibility "public"    → quem vê a biblioteca pública; na comunidade do
 *                            livro, se o autor participa da comunidade
 *   visibility "followers" → só seguidores aprovados
 *   has_spoiler            → o texto aparece borrado até a pessoa pedir
 *
 * Curtidas e denúncias são de leitores logados que podem ver a resenha.
 * Denúncia vai por e-mail para ADMIN_EMAIL (com link para revisar); com
 * AUTO_HIDE_REPORTS pessoas diferentes denunciando, ela some até a revisão.
 */
export const MAX_BODY = 5000
const MAX_NOTE = 500
const AUTO_HIDE_REPORTS = 3
const PROFILE_LIMIT = 6
const COMMUNITY_LIMIT = 20
const VISIBILITIES = ['public', 'followers']
const REASONS = ['spoiler', 'offensive', 'spam', 'other']
const MODERATION_PURPOSE = 'moderate:review'

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

export function toApi(row, { own = false } = {}) {
  if (!row) return null
  const review = {
    id: row.id,
    bookId: row.book_id,
    body: row.body,
    hasSpoiler: row.has_spoiler,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: { username: row.username, isPublic: row.is_public },
    book: { title: row.title, authors: row.authors, rating: row.rating },
    likeCount: row.like_count,
    likedByMe: row.liked_by_me
  }
  if (own) review.hidden = row.hidden
  return review
}

async function ensureOwner(bookId, userId) {
  const owner = await libraryRepository.getBookOwner(bookId)
  if (!owner) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
  if (owner.user_id !== userId) throw httpError('Sem permissão.', STATUS.FORBIDDEN, 'PERMISSION_DENIED')
}

function reviewInput(body = {}) {
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim() : ''
  if (!text) throw httpError('Escreva a resenha.', STATUS.BAD_REQUEST, 'REVIEW_EMPTY')
  if (text.length > MAX_BODY) {
    throw httpError(`A resenha pode ter no máximo ${MAX_BODY} caracteres.`, STATUS.BAD_REQUEST, 'REVIEW_TOO_LONG', { max: MAX_BODY })
  }
  const visibility = body.visibility ?? 'public'
  if (!VISIBILITIES.includes(visibility)) {
    throw httpError("Campo 'visibility' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'visibility' })
  }
  if (body.hasSpoiler !== undefined && typeof body.hasSpoiler !== 'boolean') {
    throw httpError("Campo 'hasSpoiler' precisa ser true ou false.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'hasSpoiler' })
  }
  return { body: text, hasSpoiler: Boolean(body.hasSpoiler), visibility }
}

// ------------------------------------------------------------------ dono

export async function getOwn(bookId, userId) {
  await ensureOwner(bookId, userId)
  const { rows } = await db.query(q.OWN, [bookId, userId])
  return toApi(rows[0], { own: true })
}

/** PUT /library/:id/review — cria ou altera a resenha do livro. */
export async function save(bookId, userId, raw) {
  await ensureOwner(bookId, userId)
  const input = reviewInput(raw)
  await db.query(q.UPSERT, [bookId, userId, input.body, input.hasSpoiler, input.visibility])
  return getOwn(bookId, userId)
}

export async function remove(bookId, userId) {
  await ensureOwner(bookId, userId)
  await db.query(q.DELETE_OWN, [bookId, userId])
}

// ------------------------------------------------------------------ leitores

/** Resenha do livro aberto na biblioteca pública (ou null). */
export async function forPublicBook(bookId, viewerId) {
  const { rows } = await db.query(q.OF_BOOK_FOR_VIEWER, [bookId, viewerId ?? null])
  return toApi(rows[0])
}

/** As mais recentes do autor no perfil público + total visível. */
export async function forProfile(authorId, viewerId) {
  const [list, count] = await Promise.all([
    db.query(q.OF_USER_FOR_VIEWER, [authorId, viewerId ?? null, PROFILE_LIMIT]),
    db.query(q.COUNT_OF_USER_FOR_VIEWER, [authorId, viewerId ?? null])
  ])
  return { total: count.rows[0].total, items: list.rows.map(row => toApi(row)) }
}

/** Resenhas de outros leitores do mesmo livro (comunidade do livro). */
export async function forSameBook(bookId, viewerId) {
  const { rows } = await db.query(q.OF_SAME_BOOK, [bookId, viewerId, COMMUNITY_LIMIT])
  return rows.map(row => toApi(row))
}

async function visibleTo(reviewId, viewerId) {
  const { rows } = await db.query(q.VISIBLE_TO, [reviewId, viewerId])
  if (!rows[0]) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
  return rows[0]
}

export async function like(reviewId, viewerId, liked) {
  const review = await visibleTo(reviewId, viewerId)
  if (review.user_id === viewerId) throw httpError('Você não pode curtir a sua própria resenha.', STATUS.BAD_REQUEST, 'REVIEW_OWN')
  await db.query(liked ? q.LIKE : q.UNLIKE, [reviewId, viewerId])
  const { rows } = await db.query(q.LIKE_COUNT, [reviewId])
  return { liked, likeCount: rows[0].total }
}

// ------------------------------------------------------------------ denúncias

export function moderationLink(reviewId) {
  return `${siteUrl()}/moderation?token=${encodeURIComponent(signId(MODERATION_PURPOSE, reviewId))}`
}

/** POST /reviews/:id/report — { reason, note? }. Uma denúncia por pessoa. */
export async function report(reviewId, viewerId, raw = {}) {
  const review = await visibleTo(reviewId, viewerId)
  if (review.user_id === viewerId) throw httpError('Você não pode denunciar a sua própria resenha.', STATUS.BAD_REQUEST, 'REVIEW_OWN')
  if (!REASONS.includes(raw.reason)) {
    throw httpError("Campo 'reason' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'reason' })
  }
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : ''

  const { rows } = await db.query(q.REPORT, [reviewId, viewerId, raw.reason, note || null])
  if (rows.length === 0) return { reported: true, duplicate: true }

  const { rows: [{ total }] } = await db.query(q.OPEN_REPORTS, [reviewId])
  let hidden = false
  if (total >= AUTO_HIDE_REPORTS) {
    hidden = (await db.query(q.AUTO_HIDE, [reviewId])).rows.length > 0
  }

  void notifyAdmin(reviewId, { reason: raw.reason, note, total, hidden })
  return { reported: true, duplicate: false }
}

async function notifyAdmin(reviewId, { reason, note, total, hidden }) {
  const to = process.env.ADMIN_EMAIL?.trim()
  if (!to) {
    logger.warn('Resenha denunciada (ADMIN_EMAIL não definido: sem e-mail)', { reviewId, reason, total, hidden, link: moderationLink(reviewId) })
    return
  }
  try {
    const { rows: [row] } = await db.query(q.FOR_MODERATION, [reviewId])
    if (!row) return
    const mail = reviewReportEmail({
      name: 'moderação',
      link: moderationLink(reviewId),
      locale: 'pt',
      author: row.username,
      title: row.title,
      excerpt: row.body.length > 600 ? `${row.body.slice(0, 600)}…` : row.body,
      reason,
      note,
      total,
      hidden
    })
    await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html })
  } catch (err) {
    logger.error('E-mail de denúncia não foi enviado', { reviewId, message: err.message })
  }
}

// ------------------------------------------------------------------ moderação

function moderationId(token) {
  const id = readSignedId(MODERATION_PURPOSE, token)
  if (!id) throw httpError('Link de moderação inválido.', STATUS.BAD_REQUEST, 'MODERATION_TOKEN_INVALID')
  return id
}

export async function forModeration(token) {
  return forModerationById(moderationId(token))
}

/** Resenha com as denúncias, para revisar (link do e-mail ou área administrativa). */
export async function forModerationById(id) {
  const { rows: [row] } = await db.query(q.FOR_MODERATION, [id])
  if (!row) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
  const { rows: reports } = await db.query(q.REPORTS_OF, [id])
  return {
    review: { ...toApi(row), hidden: row.hidden, hiddenReason: row.hidden_reason, reviewedAt: row.reviewed_at },
    reports: reports.map(item => ({ reason: item.reason, note: item.note, createdAt: item.created_at, reporter: item.reporter }))
  }
}

/** Ocultar (hide = true) ou manter visível (hide = false, zera as denúncias). */
export async function moderate(token, hide) {
  return moderateById(moderationId(token), hide)
}

export async function moderateById(id, hide) {
  const { rows } = await db.query(hide ? q.HIDE : q.SHOW, [id])
  if (!rows[0]) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
  return forModerationById(id)
}
