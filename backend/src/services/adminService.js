import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { db } from '../database/connection.js'
import { ADMIN_QUERIES as q } from '../database/queries.js'
import { pendingMigrations } from '../database/migrate.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import * as reviewService from './reviewService.js'
import { verifyCurrentPassword, resendVerification } from './authService.js'
import { sendMail, mailConfig } from './mailService.js'
import * as metrics from '../utils/metrics.js'
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
const USER_STATUSES = ['all', 'suspended', 'unverified']
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
  const [{ rows: [totals] }, { rows: weeks }, { rows: [eng] }] = await Promise.all([
    db.query(q.STATS), db.query(q.SIGNUPS_BY_WEEK), db.query(q.ENGAGEMENT)
  ])
  return {
    users: {
      total: totals.users,
      verified: totals.verified,
      active7: totals.active7,
      active30: totals.active30,
      staleSignups: totals.stale_signups,
      signups7: totals.signups7,
      signups30: totals.signups30,
      suspended: totals.suspended
    },
    community: { publicLibraries: totals.public_libraries, members: totals.community },
    content: { books: totals.books, reviews: totals.reviews, hiddenReviews: totals.hidden_reviews, lists: totals.lists },
    moderation: { openReports: totals.open_reports },
    signupsByWeek: weeks.map(row => ({ week: row.week, total: row.total })),
    engagement: {
      funnel: { signedUp: eng.users, verified: eng.verified, withBook: eng.with_book, with10Books: eng.with_10_books },
      returned: eng.returned,
      olderThanWeek: eng.older_than_week,
      books7: eng.books7,
      books30: eng.books30,
      finished30: eng.finished30,
      reviews30: eng.reviews30
    }
  }
}

// ------------------------------------------------------------------ uso dos recursos

// Eventos contados no servidor (utils/metrics.js) que aparecem em "Uso"
const USAGE_EVENTS = ['book.add', 'isbn.typed', 'isbn.scan', 'search.title', 'cover.upload', 'import.csv', 'export.json', 'export.csv', 'year.view']

async function counters(days) {
  const { rows } = await db.query(q.COUNTERS, [days])
  return Object.fromEntries(rows.map(row => [row.event, row.total]))
}

export async function usage() {
  await metrics.flushMetrics()
  const [{ rows: [adoption] }, last7, last30] = await Promise.all([db.query(q.ADOPTION), counters(7), counters(30)])
  return {
    adoption: {
      users: adoption.users,
      lists: adoption.lists,
      reviews: adoption.reviews,
      goals: adoption.goals,
      series: adoption.series,
      notes: adoption.notes,
      readingNow: adoption.reading_now,
      rereads: adoption.rereads,
      publicLibrary: adoption.public_library,
      community: adoption.community,
      acceptsFollowers: adoption.accepts_followers,
      following: adoption.following,
      followEmails: adoption.follow_emails,
      blocks: adoption.blocks,
      indexing: adoption.indexing
    },
    events: USAGE_EVENTS.map(event => ({ event, last7: last7[event] || 0, last30: last30[event] || 0 }))
  }
}

// ------------------------------------------------------------------ sistema

let uploadCache = { at: 0, value: null }
const UPLOAD_CACHE_MS = 5 * 60 * 1000

async function uploadStats() {
  if (uploadCache.value && Date.now() - uploadCache.at < UPLOAD_CACHE_MS) return uploadCache.value
  let files = 0
  let bytes = 0
  try {
    const names = await fs.readdir(UPLOAD_DIR)
    for (let i = 0; i < names.length; i += 200) {
      const stats = await Promise.all(names.slice(i, i + 200).map(name => fs.stat(path.join(UPLOAD_DIR, name)).catch(() => null)))
      for (const stat of stats) if (stat?.isFile()) { files++; bytes += stat.size }
    }
  } catch {
    uploadCache = { at: Date.now(), value: { files: null, bytes: null } }
    return uploadCache.value
  }
  uploadCache = { at: Date.now(), value: { files, bytes } }
  return uploadCache.value
}

async function diskStats() {
  try {
    const stat = await fs.statfs(UPLOAD_DIR)
    return { total: stat.blocks * stat.bsize, free: stat.bavail * stat.bsize }
  } catch {
    return { total: null, free: null }
  }
}

async function database() {
  const started = performance.now()
  try {
    const { rows: [info] } = await db.query(q.DB_INFO)
    const latencyMs = Math.round(performance.now() - started)
    const [{ rows: [last] }, pending] = await Promise.all([db.query(q.LAST_MIGRATION), pendingMigrations()])
    return {
      ok: true,
      latencyMs,
      version: info.version,
      size: Number(info.size),
      connections: info.connections,
      pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount },
      lastMigration: last ? { version: last.version, appliedAt: last.applied_at } : null,
      pendingMigrations: pending
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

const OL_EVENTS = ['openlibrary.ok', 'openlibrary.error', 'openlibrary.timeout']

export async function system() {
  await metrics.flushMetrics()
  const memory = process.memoryUsage()
  const [dbInfo, uploads, disk, last7, today, { rows: series }, { rows: [olBooks] }] = await Promise.all([
    database(), uploadStats(), diskStats(), counters(7), counters(1),
    db.query(q.COUNTER_SERIES, [OL_EVENTS, 14]), db.query(q.OPENLIBRARY_BOOKS)
  ])
  const byPrefix = (source, prefix) => Object.entries(source)
    .filter(([event]) => event.startsWith(prefix))
    .map(([event, total]) => ({ code: event.slice(prefix.length), total }))
    .sort((a, b) => b.total - a.total)

  const olDays = new Map()
  for (const row of series) {
    const day = olDays.get(row.day) || { day: row.day, ok: 0, error: 0, timeout: 0 }
    day[row.event.split('.')[1]] = row.total
    olDays.set(row.day, day)
  }
  const ol7 = { ok: last7['openlibrary.ok'] || 0, error: last7['openlibrary.error'] || 0, timeout: last7['openlibrary.timeout'] || 0 }
  const olTotal = ol7.ok + ol7.error + ol7.timeout

  return {
    service: {
      startedAt: metrics.processStartedAt().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.APP_VERSION?.trim() || null,
      node: process.version,
      environment: process.env.NODE_ENV || 'development',
      memory: { rss: memory.rss, heapUsed: memory.heapUsed },
      load: os.loadavg().map(n => Math.round(n * 100) / 100),
      cpus: os.cpus().length
    },
    database: dbInfo,
    storage: { uploads, disk },
    config: {
      appUrl: process.env.APP_URL?.trim() || null,
      openLibraryContact: Boolean(process.env.OPENLIBRARY_CONTACT?.trim()),
      cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
      trustProxy: process.env.TRUST_PROXY ?? null
    },
    email: {
      ...mailConfig(),
      sent7: last7['email.sent'] || 0,
      failed7: last7['email.failed'] || 0,
      lastSuccessAt: metrics.lastSuccess('email'),
      lastFailure: metrics.lastFailure('email')
    },
    openLibrary: {
      last7: ol7,
      errorRate: olTotal ? Math.round(((ol7.error + ol7.timeout) / olTotal) * 1000) / 10 : null,
      latency: metrics.timingStats('openlibrary'),
      lastFailure: metrics.lastFailure('openlibrary'),
      daily: [...olDays.values()],
      books: { linked: olBooks.linked, linkable: olBooks.linkable, unlinked: olBooks.unlinked }
    },
    rateLimits: {
      today: byPrefix(today, 'ratelimit.'),
      last7: byPrefix(last7, 'ratelimit.'),
      topIps: metrics.topRateLimitedIps()
    },
    errors: {
      today: today['error.500'] || 0,
      last7: last7['error.500'] || 0,
      recent: metrics.recentErrors()
    }
  }
}

/** POST /admin/email/test — manda um e-mail para o próprio admin. */
export async function sendTestEmail(adminId) {
  const { rows: [admin] } = await db.query('SELECT email FROM librishelf.users WHERE id = $1', [adminId])
  const config = mailConfig()
  try {
    await sendMail({
      to: admin.email,
      subject: 'Librishelf — e-mail de teste',
      text: `Este é um e-mail de teste enviado pela área administrativa em ${new Date().toISOString()}.\nSe chegou, o envio está funcionando.`,
      html: `<p>Este é um e-mail de teste enviado pela área administrativa em ${new Date().toISOString()}.</p><p>Se chegou, o envio está funcionando.</p>`
    })
  } catch (err) {
    await log(adminId, 'email.test', { details: { ok: false } })
    throw httpError(`O servidor de e-mail recusou: ${err.message}`.slice(0, 300), 502, 'EMAIL_TEST_FAILED', { message: String(err.message).slice(0, 200) })
  }
  await log(adminId, 'email.test', { details: { ok: true } })
  return { sent: config.configured, to: admin.email, smtp: config.configured }
}

// ------------------------------------------------------------------ moderação: sinais

const toPerson = row => ({ id: row.id, username: row.name, active: row.active, createdAt: row.created_at })

export async function moderationInsights() {
  const [{ rows: serial }, { rows: fresh }, { rows: most }] = await Promise.all([
    db.query(q.SERIAL_REPORTERS), db.query(q.NEW_REPORTED), db.query(q.MOST_REPORTED)
  ])
  return {
    serialReporters: serial.map(row => ({ ...toPerson(row), reports: row.reports, upheld: row.upheld, rejected: row.rejected, last7: row.last7 })),
    newAccountsReported: fresh.map(row => ({ ...toPerson(row), reports: row.reports, reviewsReported: row.reviews_reported })),
    mostReported: most.map(row => ({ ...toPerson(row), reports: row.reports, reviewsReported: row.reviews_reported, hidden: row.hidden }))
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

/** GET /admin/users/:id — tudo de uma conta (menos senha, livros e anotações). */
export async function user(id) {
  const [{ rows: [row] }, { rows: reviews }, { rows: history }] = await Promise.all([
    db.query(q.USER_DETAIL, [id]), db.query(q.USER_REPORTED_REVIEWS, [id]), db.query(q.USER_ACTIONS, [id])
  ])
  if (!row) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  return {
    id: row.id,
    username: row.name,
    email: row.email,
    isAdmin: row.role === 'admin',
    active: row.active,
    suspendedAt: row.suspended_at,
    suspendedReason: row.suspended_reason,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastSeenAt: row.last_seen_at,
    emailVerifiedAt: row.email_verified_at,
    emailLocale: row.email_locale,
    privacy: {
      isPublic: row.is_public,
      showInCommunity: row.show_in_community,
      showActivity: row.show_activity,
      allowIndexing: row.allow_indexing,
      followEmails: row.follow_emails
    },
    totals: {
      books: row.books,
      readBooks: row.read_books,
      lastBookAt: row.last_book_at,
      reviews: row.reviews,
      hiddenReviews: row.hidden_reviews,
      lists: row.lists,
      publicLists: row.public_lists,
      followers: row.followers,
      following: row.following,
      blocksMade: row.blocks_made,
      blockedBy: row.blocked_by,
      reportsReceived: row.reports_received,
      reportsMade: row.reports_made
    },
    reportedReviews: reviews.map(item => ({
      id: item.id, book: item.title, hidden: item.hidden, hiddenReason: item.hidden_reason,
      reports: item.reports, open: item.open, lastReportAt: item.last_report_at
    })),
    history: history.map(item => ({
      id: item.id, action: item.action, admin: item.admin, targetReviewId: item.target_review_id,
      details: item.details, createdAt: item.created_at
    }))
  }
}

/** POST /admin/users/:id/resend-verification — cadastros parados. */
export async function resendUserVerification(adminId, id) {
  const { rows: [target] } = await db.query(q.USER_TARGET, [id])
  if (!target) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (!target.active) throw httpError('Esta conta está suspensa.', STATUS.CONFLICT, 'ACCOUNT_ALREADY_SUSPENDED')
  if (target.email_verified_at) throw httpError('Esta conta já confirmou o e-mail.', STATUS.CONFLICT, 'EMAIL_ALREADY_VERIFIED')
  await resendVerification(id, target.email_locale)
  await log(adminId, 'user.resend_verification', { userId: id })
  return { sent: true }
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
