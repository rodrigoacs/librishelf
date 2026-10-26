import jwt from 'jsonwebtoken'
import { AUTH_COOKIE_NAME } from '../config/cookieOptions.js'
import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import * as authRepository from '../repositories/authRepository.js'
import { sessionKey, JWT_ALGORITHMS } from '../utils/keys.js'

// Último acesso: grava no máximo uma vez por hora por pessoa
const SEEN_EVERY_MS = 60 * 60 * 1000
const seenAt = new Map()

function markSeen(userId) {
  const now = Date.now()
  if (now - (seenAt.get(userId) || 0) < SEEN_EVERY_MS) return
  seenAt.set(userId, now)
  if (seenAt.size > 10_000) seenAt.clear()
  authRepository.markSeen(userId).catch(() => seenAt.delete(userId))
}

function extractToken(req) {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME]
  if (cookieToken) return cookieToken

  const authHeader = req.headers['authorization']
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1]
  }

  return null
}

const INVALID = { error: 'Sessão inválida. Entre de novo.', code: 'SESSION_INVALID' }
const REVOKED = { error: 'Sua sessão foi encerrada. Entre de novo.', code: 'SESSION_REVOKED' }

/**
 * Lê e confere a assinatura do JWT da sessão. → { decoded } ou { error, code }.
 * Só aceita tokens de sessão: com jti (tokens anteriores ao "Sair" que
 * encerra a sessão não têm) e sem `purpose` (tokens de outras finalidades).
 */
function decodeSession(token) {
  let decoded
  try {
    decoded = jwt.verify(token, sessionKey(), { algorithms: JWT_ALGORITHMS })
  } catch (err) {
    return err.name === 'TokenExpiredError'
      ? { error: 'Sua sessão expirou. Entre de novo.', code: 'SESSION_EXPIRED' }
      : INVALID
  }
  if (!Number.isInteger(decoded.id) || typeof decoded.jti !== 'string' || decoded.purpose !== undefined) return INVALID
  return { decoded }
}

/**
 * Resolve a sessão da requisição.
 * → { user } válido, ou { error } com o motivo (sem token, inválido, expirado,
 *   conta excluída ou suspensa, sessão encerrada em "Sair" ou token anterior
 *   à última troca de senha).
 */
export async function resolveSession(req) {
  const token = extractToken(req)
  if (!token) return { error: 'Faça login para continuar.', code: 'AUTH_REQUIRED' }

  const { decoded, ...failure } = decodeSession(token)
  if (!decoded) return failure

  const session = await authRepository.getSessionById(decoded.id, decoded.jti)
  if (!session || session.revoked) return REVOKED

  if (session.password_changed_at) {
    // iat tem resolução de segundos; compara no mesmo grão.
    const changedAtSeconds = Math.floor(new Date(session.password_changed_at).getTime() / 1000)
    if (decoded.iat < changedAtSeconds) return REVOKED
  }

  markSeen(decoded.id)
  // O papel vem do banco a cada requisição: rebaixar alguém vale na hora.
  return { user: { ...decoded, role: session.role || 'user' } }
}

/**
 * "Sair": encerra no servidor a sessão do token desta requisição (se ainda
 * for válido). O cookie copiado antes deixa de valer, mesmo dentro dos 7 dias.
 */
export async function revokeSession(req) {
  const token = extractToken(req)
  if (!token) return false
  const { decoded } = decodeSession(token)
  if (!decoded) return false
  await authRepository.revokeSession(decoded.jti, decoded.id, decoded.exp)
  return true
}

/** Exige sessão válida: 401 caso contrário (403 fica para "sem permissão"). */
export async function authenticateToken(req, res, next) {
  try {
    const { user, error, code } = await resolveSession(req)
    if (!user) return res.status(STATUS.UNAUTHORIZED).json(errorBody(error, code))
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

/** Rotas públicas que mostram algo a mais para quem está logado. Nunca recusa. */
export async function optionalAuth(req, res, next) {
  try {
    const { user } = await resolveSession(req)
    if (user) req.user = user
    next()
  } catch (err) {
    next(err)
  }
}
