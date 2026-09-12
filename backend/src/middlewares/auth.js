import jwt from 'jsonwebtoken'
import { AUTH_COOKIE_NAME } from '../config/cookieOptions.js'

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

export function authenticateToken(req, res, next) {
  const token = extractToken(req)

  if (!token) {
    return res.status(403).json({ error: 'Token is required or invalid format' })
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' })
  }
}