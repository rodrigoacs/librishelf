import { db } from '../database/connection.js'
import { ADMIN_QUERIES as q } from '../database/queries.js'
import * as reviewService from './reviewService.js'
import { verifyCurrentPassword } from './authService.js'
import { resolvePagination } from '../utils/pagination.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'
import logger from '../utils/logger.js'

/**
 * Área administrativa: números gerais, fila de denúncias, contas
 * (suspender/reativar) e o registro de tudo o que foi feito aqui.
 *
 * Suspender usa users.is_active = false: a sessão cai na próxima requisição
 * (resolveSession), o login recusa com ACCOUNT_SUSPENDED e o conteúdo público
 * some (biblioteca, perfil, resenhas, listas, comunidade, feed). Reativar
 * devolve tudo como estava; nada é apagado.
 */
const QUEUE_STATUSES = ['open', 'hidden', 'all']
const USER_STATUSES = ['all', 'suspended']
const MAX_REASON = 500
const MAX_QUERY = 100

async function log(adminId, action, { userId = null, reviewId = null, details = {} } = {}) {
  await db.query(q.LOG, [adminId, action, userId, reviewId, details])
  logger.info('Ação administrativa', { adminId, action, userId, reviewId })
}

export async function logUnlock(adminId) {
  await log(adminId, 'admin.unlock')
}

// ------------------------------------------------------------------ números

export async function stats() {
  const [{ rows: [totals] }, { rows: weeks }] = await Promise.all([db.query(q.STATS), db.query(q.SIGNUPS_BY_WEEK)])
  return {
    users: {
      total: totals.users,
      verified: totals.verified,
      active30: totals.active30,
      signups7: totals.signups7,
      signups30: totals.signups30,
      suspended: totals.suspended
    },
    community: { publicLibraries: totals.public_libraries, members: totals.community },
    content: { books: totals.books, reviews: totals.reviews, hiddenReviews: totals.hidden_reviews, lists: totals.lists },
    moderation: { openReports: totals.open_reports },
    signupsByWeek: weeks.map(row => ({ week: row.week, total: row.total }))
  }
}

// ------------------------------------------------------------------ moderação

export async function reportQueue(status = 'open') {
  if (!QUEUE_STATUSES.includes(status)) {
    throw httpError("Parâmetro 'status' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'status' })
  }
  const { rows } = await db.query(q.REPORT_QUEUE, [status])
  return rows.map(row => ({
    id: row.id,
    excerpt: row.body.length > 280 ? `${row.body.slice(0, 280)}…` : row.body,
    hasSpoiler: row.has_spoiler,
    visibility: row.visibility,
    createdAt: row.created_at,
    hidden: row.hidden_at !== null,
    hiddenReason: row.hidden_reason,
    reviewedAt: row.reviewed_at,
    author: { username: row.username, active: row.author_active },
    book: { title: row.title },
    reports: { open: row.open_count, total: row.total_count, lastAt: row.last_report_at, reasons: row.reasons }
  }))
}

export async function review(id) {
  const data = await reviewService.forModerationById(id)
  const { rows: [target] } = await db.query(q.REVIEW_TARGET, [id])
  const { rows: [author] } = await db.query(q.USER_TARGET, [target.user_id])
  return { ...data, author: { id: author.id, username: author.name, active: author.active } }
}

export async function moderateReview(adminId, id, hide) {
  const { rows: [target] } = await db.query(q.REVIEW_TARGET, [id])
  if (!target) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
  await reviewService.moderateById(id, hide)
  await log(adminId, hide ? 'review.hide' : 'review.show', {
    userId: target.user_id,
    reviewId: id
  })
  return review(id)
}

// ------------------------------------------------------------------ contas

function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`
}

export async function users({ q: text, status = 'all', page, limit } = {}) {
  if (!USER_STATUSES.includes(status)) {
    throw httpError("Parâmetro 'status' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'status' })
  }
  const search = typeof text === 'string' ? text.trim().slice(0, MAX_QUERY) : ''
  const pagination = resolvePagination(page, limit)
  const { rows } = await db.query(q.USERS, [search ? likePattern(search) : null, status, pagination.limit, pagination.offset])
  return {
    total: rows[0]?.total ?? 0,
    page: pagination.page,
    limit: pagination.limit,
    users: rows.map(row => ({
      id: row.id,
      username: row.name,
      email: row.email,
      isAdmin: row.role === 'admin',
      active: row.active,
      suspendedAt: row.suspended_at,
      suspendedReason: row.suspended_reason,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      emailVerified: row.email_verified,
      isPublic: row.is_public,
      books: row.books,
      reviews: row.reviews,
      reportsReceived: row.reports_received
    }))
  }
}

async function targetUser(adminId, id) {
  const { rows: [target] } = await db.query(q.USER_TARGET, [id])
  if (!target) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (target.id === adminId) throw httpError('Você não pode suspender a sua própria conta.', STATUS.BAD_REQUEST, 'ADMIN_SELF')
  if (target.role === 'admin') throw httpError('Contas de administração não podem ser suspensas por aqui.', STATUS.BAD_REQUEST, 'ADMIN_TARGET')
  return target
}

/** POST /admin/users/:id/suspend — { password, reason }. */
export async function suspend(adminId, id, { password, reason } = {}) {
  await verifyCurrentPassword(adminId, password)
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (text.length < 3 || text.length > MAX_REASON) {
    throw httpError('Explique o motivo (de 3 a 500 caracteres).', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'reason', min: 3, max: MAX_REASON })
  }
  await targetUser(adminId, id)
  const { rows } = await db.query(q.SUSPEND, [id, text])
  if (!rows[0]) throw httpError('Esta conta já está suspensa.', STATUS.CONFLICT, 'ACCOUNT_ALREADY_SUSPENDED')
  await log(adminId, 'user.suspend', { userId: id, details: { reason: text } })
  return { suspended: true }
}

/** POST /admin/users/:id/reactivate — { password }. */
export async function reactivate(adminId, id, { password } = {}) {
  await verifyCurrentPassword(adminId, password)
  await targetUser(adminId, id)
  const { rows } = await db.query(q.REACTIVATE, [id])
  if (!rows[0]) throw httpError('Esta conta não está suspensa.', STATUS.CONFLICT, 'ACCOUNT_NOT_SUSPENDED')
  await log(adminId, 'user.reactivate', { userId: id })
  return { suspended: false }
}

// ------------------------------------------------------------------ registro

export async function actions({ page, limit } = {}) {
  const pagination = resolvePagination(page, limit)
  const { rows } = await db.query(q.ACTIONS, [pagination.limit, pagination.offset])
  return {
    total: rows[0]?.total ?? 0,
    page: pagination.page,
    limit: pagination.limit,
    actions: rows.map(row => ({
      id: row.id,
      action: row.action,
      admin: row.admin,
      targetUser: row.target_user,
      targetReviewId: row.target_review_id,
      book: row.book,
      details: row.details,
      createdAt: row.created_at
    }))
  }
}
