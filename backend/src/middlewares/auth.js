import jwt from 'jsonwebtoken'
import { AUTH_COOKIE_NAME } from '../config/cookieOptions.js'
import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import * as authRepository from '../repositories/authRepository.js'

const SECRET_KEY = process.env.SECRET_KEY

function extractToken(req) {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME]
  if (cookieToken) return cookieToken

  const authHeader = req.headers['authorization']
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1]
  }

  return null
}

/**
 * Resolve a sessão da requisição.
 * → { user } válido, ou { error } com o motivo (sem token, inválido, expirado,
 *   conta excluída ou token anterior à última troca de senha).
 */
export async function resolveSession(req) {
  const token = extractToken(req)
  if (!token) return { error: 'Faça login para continuar.', code: 'AUTH_REQUIRED' }

  let decoded
  try {
    decoded = jwt.verify(token, SECRET_KEY)
  } catch (err) {
    return err.name === 'TokenExpiredError'
      ? { error: 'Sua sessão expirou. Entre de novo.', code: 'SESSION_EXPIRED' }
      : { error: 'Sessão inválida. Entre de novo.', code: 'SESSION_INVALID' }
  }

  const session = await authRepository.getSessionById(decoded.id)
  if (!session) return { error: 'Sua sessão foi encerrada. Entre de novo.', code: 'SESSION_REVOKED' }

  if (session.password_changed_at) {
    // iat tem resolução de segundos; compara no mesmo grão.
    const changedAtSeconds = Math.floor(new Date(session.password_changed_at).getTime() / 1000)
    if (decoded.iat < changedAtSeconds) return { error: 'Sua sessão foi encerrada. Entre de novo.', code: 'SESSION_REVOKED' }
  }

  // O papel vem do banco a cada requisição: rebaixar alguém vale na hora.
  return { user: { ...decoded, role: session.role || 'user' } }
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
