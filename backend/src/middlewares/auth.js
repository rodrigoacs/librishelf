import jwt from 'jsonwebtoken'

const SECRET_KEY = 'your_jwt_secret_key'

export function authenticateToken(req, res, next) {
  const token = req.headers['authorization']

  if (!token) {
    return res.status(403).json({ error: 'Token is required' })
  }

  try {
    const decoded = jwt.verify(token.split(' ')[1], SECRET_KEY)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' })
  }
}
