import { db } from '../database/connection.js'
import { AVATAR_QUERIES as q } from '../database/queries.js'
import * as authRepository from '../repositories/authRepository.js'
import { saveAvatar, deleteAvatar } from '../utils/imageProcessor.js'
import { sendMail } from './mailService.js'
import { avatarReportEmail } from './emailTemplates.js'
import { signId, readSignedId } from '../utils/signedToken.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'
import logger from '../utils/logger.js'

/**
 * Foto de perfil (migration 017).
 *
 * - Enviar exige e-mail confirmado (a foto aparece para outras pessoas).
 * - Quem vê: avatar_visibility = 'everyone' | 'followers' | 'nobody'; quem não
 *   pode ver recebe avatarVersion null e o app mostra a inicial. O arquivo
 *   (routes/avatars.js) segue a mesma regra e responde 404 para os outros.
 * - Denúncia: como nas resenhas — uma por pessoa e por foto, aviso por e-mail
 *   para ADMIN_EMAIL com link assinado de moderação, e AUTO_HIDE_REPORTS
 *   denúncias de contas confiáveis tiram a foto do ar até a revisão.
 *   Trocar a foto começa do zero (as denúncias valem para a versão).
 */
export const VISIBILITIES = ['everyone', 'followers', 'nobody']
export const REASONS = ['offensive', 'impersonation', 'spam', 'other']
const AUTO_HIDE_REPORTS = 3
const AUTO_HIDE_MIN_ACCOUNT_DAYS = 7
const MAX_NOTE = 500
const MODERATION_PURPOSE = 'avatar-moderation'
const MODERATION_LINK_DAYS = 30

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

function ownState(row) {
  return {
    avatarVersion: row?.avatar_version ?? null,
    avatarVisibility: row?.avatar_visibility || 'followers',
    avatarHidden: Boolean(row?.avatar_hidden_at)
  }
}

function checkVisibility(value) {
  if (value === undefined || value === null || value === '') return null
  if (!VISIBILITIES.includes(value)) {
    throw httpError("Campo 'visibility' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'visibility' })
  }
  return value
}

/** Versão da foto de userId que viewerId (ou null) pode ver, ou null. */
export async function visibleAvatar(userId, viewerId) {
  const { rows: [row] } = await db.query(q.VISIBLE, [userId, viewerId ?? null])
  return row?.avatar_version ?? null
}

/** Para routes/avatars.js: { userId, version } se viewerId pode ver a foto de username. */
export async function fileAccess(username, viewerId) {
  if (typeof username !== 'string' || username.length > 255) return null
  const { rows: [row] } = await db.query(q.ACCESS_BY_NAME, [username, viewerId ?? null])
  if (!row?.avatar_version) return null
  return { userId: row.id, version: row.avatar_version, public: row.avatar_visibility === 'everyone' }
}

// ------------------------------------------------------------------ dono

/** PUT /auth/me/avatar — arquivo já recortado pelo app; visibility opcional. */
export async function upload(userId, buffer, rawVisibility) {
  const user = await authRepository.getUserById(userId)
  if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (!user.email_verified_at) {
    throw httpError('Confirme seu e-mail para pôr uma foto de perfil.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_AVATAR')
  }
  if (!buffer?.length) throw httpError('Envie uma imagem.', STATUS.BAD_REQUEST, 'IMAGE_REQUIRED')
  const visibility = checkVisibility(rawVisibility)
  await saveAvatar(buffer, userId)
  const { rows: [row] } = await db.query(q.SET, [userId, visibility])
  return ownState(row)
}

/** DELETE /auth/me/avatar — volta à inicial. */
export async function remove(userId) {
  await db.query(q.CLEAR, [userId])
  await deleteAvatar(userId)
  const user = await authRepository.getUserById(userId)
  return ownState(user)
}

/** PATCH /auth/me/avatar — { visibility }. */
export async function setVisibility(userId, rawVisibility) {
  const visibility = checkVisibility(rawVisibility)
  if (!visibility) throw httpError("Campo 'visibility' é obrigatório.", STATUS.BAD_REQUEST, 'FIELD_REQUIRED', { field: 'visibility' })
  const { rows: [row] } = await db.query(q.SET_VISIBILITY, [userId, visibility])
  if (!row) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  return ownState(row)
}

/** Exclusão de conta: os arquivos ficam fora do banco. */
export async function removeFiles(userId) {
  await deleteAvatar(userId)
}

// ------------------------------------------------------------------ denúncia

export function moderationLink(version) {
  const token = signId(MODERATION_PURPOSE, version, { ttlDays: MODERATION_LINK_DAYS })
  return `${siteUrl()}/moderation?avatar=${encodeURIComponent(token)}`
}

/** POST /avatars/:username/report — { reason, note? }. Uma por pessoa e por foto. */
export async function report(username, reporterId, raw = {}) {
  const reporter = await authRepository.getUserById(reporterId)
  if (!reporter?.email_verified_at) {
    throw httpError('Confirme seu e-mail para denunciar.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_REPORT')
  }
  const access = await fileAccess(username, reporterId)
  // Sem foto visível para quem denuncia: mesmo erro de usuário inexistente
  if (!access) throw httpError('Foto não encontrada.', STATUS.NOT_FOUND, 'AVATAR_NOT_FOUND')
  if (access.userId === reporterId) throw httpError('Você não pode denunciar a sua própria foto.', STATUS.BAD_REQUEST, 'AVATAR_OWN')
  if (!REASONS.includes(raw.reason)) {
    throw httpError("Campo 'reason' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'reason' })
  }
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : ''

  const { rows } = await db.query(q.REPORT, [access.userId, access.version, reporterId, raw.reason, note || null])
  if (rows.length === 0) return { reported: true, duplicate: true }

  const { rows: [{ total, trusted }] } = await db.query(q.OPEN_REPORTS, [access.userId, access.version, AUTO_HIDE_MIN_ACCOUNT_DAYS])
  let hidden = false
  if (trusted >= AUTO_HIDE_REPORTS) {
    hidden = (await db.query(q.AUTO_HIDE, [access.userId, access.version])).rows.length > 0
  }

  void notifyAdmin(access.version, { username, reason: raw.reason, note, total, hidden })
  return { reported: true, duplicate: false }
}

async function notifyAdmin(version, { username, reason, note, total, hidden }) {
  const to = process.env.ADMIN_EMAIL?.trim()
  const link = moderationLink(version)
  if (!to) {
    logger.warn('Foto de perfil denunciada (ADMIN_EMAIL não definido: sem e-mail)', { username, reason, total, hidden, link })
    return
  }
  try {
    const mail = avatarReportEmail({ name: 'moderação', link, locale: 'pt', username, reason, note, total, hidden })
    await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html })
  } catch (err) {
    logger.error('E-mail de denúncia de foto não foi enviado', { username, message: err.message })
  }
}

// ------------------------------------------------------------------ moderação

function toModeration(row, reports) {
  return {
    avatar: {
      userId: row.id,
      username: row.name,
      version: row.avatar_version,
      visibility: row.avatar_visibility,
      hidden: Boolean(row.avatar_hidden_at),
      hiddenReason: row.avatar_hidden_reason,
      reviewedAt: row.avatar_reviewed_at,
      active: row.active
    },
    reports: reports.map(item => ({ reason: item.reason, note: item.note, createdAt: item.created_at, reporter: item.reporter }))
  }
}

/** Foto atual de userId com as denúncias dela (área administrativa). */
export async function forModerationById(userId) {
  const { rows: [row] } = await db.query(q.BY_USER, [userId])
  if (!row) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (!row.avatar_version) return toModeration(row, [])
  const { rows: reports } = await db.query(q.REPORTS_OF, [row.id, row.avatar_version])
  return toModeration(row, reports)
}

/** Manter (zera as denúncias e volta ao ar) ou remover (apaga a foto). */
export async function moderateById(userId, action) {
  if (action === 'keep') {
    const { rows } = await db.query(q.KEEP, [userId])
    if (!rows[0]) throw httpError('Esta conta não tem foto.', STATUS.NOT_FOUND, 'AVATAR_NOT_FOUND')
  } else if (action === 'remove') {
    const { rows } = await db.query(q.CLEAR, [userId])
    if (!rows[0]) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
    await deleteAvatar(userId)
  } else {
    throw httpError('Ação inválida.', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'action' })
  }
  return forModerationById(userId)
}

function versionFromToken(token) {
  const version = readSignedId(MODERATION_PURPOSE, token, { requireExpiry: true })
  if (!version) throw httpError('Link de moderação inválido ou vencido.', STATUS.BAD_REQUEST, 'MODERATION_TOKEN_INVALID')
  return version
}

/** Usuário dono da foto do link; foto trocada ou removida depois → 404. */
async function userFromToken(token) {
  const { rows: [row] } = await db.query(q.BY_VERSION, [versionFromToken(token)])
  if (!row) throw httpError('Esta foto já foi trocada ou removida.', STATUS.NOT_FOUND, 'AVATAR_NOT_FOUND')
  return row
}

function withoutReporters(result) {
  return { ...result, reports: result.reports.map(({ reporter, ...item }) => item) }
}

/** Pelo link do e-mail (sem login): sem os nomes de quem denunciou. */
export async function forModeration(token) {
  const row = await userFromToken(token)
  return withoutReporters(await forModerationById(row.id))
}

export async function moderate(token, action) {
  const row = await userFromToken(token)
  return withoutReporters(await moderateById(row.id, action))
}

/** Para o link de moderação ver a foto mesmo oculta: { userId } ou null. */
export async function moderationFileAccess(token) {
  try {
    const row = await userFromToken(token)
    return { userId: row.id, version: row.avatar_version }
  } catch {
    return null
  }
}

/** Fila da área administrativa. */
export async function queue(status = 'open') {
  if (!['open', 'hidden', 'all'].includes(status)) {
    throw httpError("Parâmetro 'status' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'status' })
  }
  const { rows } = await db.query(q.QUEUE, [status])
  return rows.map(row => ({
    userId: row.id,
    username: row.username,
    version: row.avatar_version,
    hidden: Boolean(row.avatar_hidden_at),
    hiddenReason: row.avatar_hidden_reason,
    reviewedAt: row.avatar_reviewed_at,
    active: row.active,
    reports: { open: row.open_count, total: row.total_count, lastAt: row.last_report_at, reasons: row.reasons }
  }))
}
