import jwt from 'jsonwebtoken'
import { AUTH_COOKIE_NAME } from '../config/cookieOptions.js'
import STATUS from '../utils/statusCodes.js'

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

// Token ausente, inválido ou expirado é falta de autenticação → 401.
// 403 fica reservado para "autenticado, mas sem permissão" (ex.: livro de outro usuário).
export function authenticateToken(req, res, next) {
  const token = extractToken(req)

  if (!token) {
    return res.status(STATUS.UNAUTHORIZED).json({ error: 'Token is required or invalid format' })
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY)
    req.user = decoded
    next()
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
    return res.status(STATUS.UNAUTHORIZED).json({ error: message })
  }
}
