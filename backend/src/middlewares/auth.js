import jwt from 'jsonwebtoken'
import { AUTH_COOKIE_NAME } from '../config/cookieOptions.js'
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

function unauthorized(res, message) {
  return res.status(STATUS.UNAUTHORIZED).json({ error: message })
}

/**
 * Token ausente, inválido, expirado, de conta excluída ou emitido antes da
 * última troca de senha → 401. 403 fica para "autenticado, mas sem permissão".
 */
export async function authenticateToken(req, res, next) {
  const token = extractToken(req)

  if (!token) {
    return unauthorized(res, 'Token is required or invalid format')
  }

  let decoded
  try {
    decoded = jwt.verify(token, SECRET_KEY)
  } catch (err) {
    return unauthorized(res, err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token')
  }

  try {
    const session = await authRepository.getSessionById(decoded.id)

    if (!session) {
      return unauthorized(res, 'Session no longer valid')
    }

    if (session.password_changed_at) {
      // iat tem resolução de segundos; compara no mesmo grão.
      const changedAtSeconds = Math.floor(new Date(session.password_changed_at).getTime() / 1000)
      if (decoded.iat < changedAtSeconds) {
        return unauthorized(res, 'Session no longer valid')
      }
    }

    req.user = decoded
    next()
  } catch (err) {
    next(err)
  }
}
