import * as socialRepository from '../repositories/socialRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'

const FEED_PAGE_SIZE = 30

// Mesmo erro para "não existe" e "não aceita seguidores": não confirma contas.
const NOT_AVAILABLE = 'Leitor não encontrado ou não aceita seguidores.'

async function findUser(username) {
  if (typeof username !== 'string' || !username.trim()) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
  const user = await authRepository.getUserByName(username.trim())
  if (!user) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
  return user
}

export async function requestFollow(viewerId, username) {
  const target = await findUser(username)
  if (target.id === viewerId) throw httpError('Você não pode seguir a si mesmo.', STATUS.BAD_REQUEST, 'FOLLOW_SELF')
  if (!target.show_activity) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')

  // Bloqueado por ele: mesma resposta de "não aceita seguidores" (não revela o bloqueio).
  // Bloqueado por mim: aviso claro, para a pessoa saber que precisa desbloquear.
  const { blockedByMe, blockedMe } = await socialRepository.blockState(viewerId, target.id)
  if (blockedMe) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
  if (blockedByMe) throw httpError('Você bloqueou este leitor. Desbloqueie para seguir.', STATUS.CONFLICT, 'READER_BLOCKED_BY_YOU')

  const viewer = await authRepository.getUserById(viewerId)
  if (!viewer?.email_verified_at) {
    throw httpError('Confirme seu e-mail para seguir outros leitores.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_FOLLOW')
  }

  const status = await socialRepository.requestFollow(viewerId, target.id)
  return { username: target.name, status }
}

/** Cancela o pedido pendente ou deixa de seguir. */
export async function unfollow(viewerId, username) {
  const target = await findUser(username)
  await socialRepository.deleteFollow(viewerId, target.id, ['pending', 'accepted'])
  return { username: target.name, status: null }
}

export async function acceptRequest(viewerId, username) {
  const follower = await findUser(username)
  const accepted = await socialRepository.acceptFollow(follower.id, viewerId)
  if (!accepted) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND, 'REQUEST_NOT_FOUND')
  return { username: follower.name, status: 'accepted' }
}

export async function rejectRequest(viewerId, username) {
  const follower = await findUser(username)
  const removed = await socialRepository.deleteFollow(follower.id, viewerId, ['pending'])
  if (!removed) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND, 'REQUEST_NOT_FOUND')
}

export async function removeFollower(viewerId, username) {
  const follower = await findUser(username)
  const removed = await socialRepository.deleteFollow(follower.id, viewerId, ['accepted'])
  if (!removed) throw httpError('Seguidor não encontrado.', STATUS.NOT_FOUND, 'FOLLOWER_NOT_FOUND')
}

/**
 * Bloquear: o outro deixa de ver você na comunidade (e você a ele), os
 * vínculos de seguir somem e ele não consegue pedir para seguir de novo.
 * Ele não é avisado.
 */
export async function blockUser(viewerId, username) {
  const target = await findUser(username)
  if (target.id === viewerId) throw httpError('Você não pode bloquear a si mesmo.', STATUS.BAD_REQUEST, 'BLOCK_SELF')
  await socialRepository.block(viewerId, target.id)
  return { username: target.name, blocked: true }
}

export async function unblockUser(viewerId, username) {
  const target = await findUser(username)
  await socialRepository.unblock(viewerId, target.id)
  return { username: target.name, blocked: false }
}

export async function blockedUsers(viewerId) {
  const rows = await socialRepository.blockedList(viewerId)
  return { blocked: rows.map(row => ({ username: row.username, since: row.created_at })) }
}

export async function connections(viewerId) {
  const rows = await socialRepository.connections(viewerId)
  const pick = kind => rows
    .filter(row => row.kind === kind)
    .map(row => ({ username: row.username, status: row.status, isPublic: row.is_public, since: row.created_at }))

  return { following: pick('following'), followers: pick('follower'), requests: pick('request') }
}

export async function pendingCount(viewerId) {
  return { count: await socialRepository.pendingCount(viewerId) }
}

export async function feed(viewerId, page) {
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1)
  const rows = await socialRepository.feed(viewerId, FEED_PAGE_SIZE + 1, (pageNumber - 1) * FEED_PAGE_SIZE)

  return {
    page: pageNumber,
    hasMore: rows.length > FEED_PAGE_SIZE,
    events: rows.slice(0, FEED_PAGE_SIZE).map(row => ({
      type: row.type,
      reread: Boolean(row.reread),
      at: row.at,
      username: row.username,
      isPublic: row.is_public,
      bookId: row.book_id,
      title: row.title,
      authors: row.authors,
      rating: row.rating
    }))
  }
}
