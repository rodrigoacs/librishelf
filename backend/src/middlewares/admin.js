import jwt from 'jsonwebtoken'
import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import { authCookieOptions } from '../config/cookieOptions.js'
import { purposeKey, JWT_ALGORITHMS } from '../utils/keys.js'

/**
 * Área administrativa: além de role = 'admin' (lido do banco em
 * resolveSession), pede a senha de novo e libera por 30 minutos sem uso.
 * A liberação é um JWT próprio num cookie httpOnly separado, renovado a cada
 * requisição; sair da conta ou bloquear de novo apaga o cookie. A chave é
 * só desta finalidade: o token não serve como sessão nem o contrário.
 */
export const ADMIN_UNLOCK_COOKIE = 'admin_unlock'
export const ADMIN_UNLOCK_MINUTES = 30
const PURPOSE = 'admin-unlock'

const unlockCookieOptions = { ...authCookieOptions, maxAge: ADMIN_UNLOCK_MINUTES * 60 * 1000 }

export function setUnlockCookie(res, userId) {
  const token = jwt.sign({ id: userId, purpose: PURPOSE }, purposeKey(PURPOSE), { expiresIn: `${ADMIN_UNLOCK_MINUTES}m`, algorithm: 'HS256' })
  res.cookie(ADMIN_UNLOCK_COOKIE, token, unlockCookieOptions)
  return new Date(Date.now() + ADMIN_UNLOCK_MINUTES * 60 * 1000).toISOString()
}

export function clearUnlockCookie(res) {
  res.clearCookie(ADMIN_UNLOCK_COOKIE, { ...authCookieOptions, maxAge: undefined })
}

/** true se o cookie de liberação é válido para este usuário. */
export function isUnlocked(req) {
  const token = req.cookies?.[ADMIN_UNLOCK_COOKIE]
  if (!token || !req.user) return false
  try {
    const decoded = jwt.verify(token, purposeKey(PURPOSE), { algorithms: JWT_ALGORITHMS })
    return decoded.purpose === PURPOSE && decoded.id === req.user.id
  } catch {
    return false
  }
}

/** Depois de authenticateToken. Quem não é admin recebe 403 sem detalhes. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(STATUS.FORBIDDEN).json(errorBody('Sem permissão.', 'ADMIN_REQUIRED'))
  }
  next()
}

/** Depois de requireAdmin: exige a senha recente e renova o prazo. */
export function requireUnlocked(req, res, next) {
  if (!isUnlocked(req)) {
    return res.status(STATUS.FORBIDDEN).json(errorBody('Confirme sua senha para continuar.', 'ADMIN_LOCKED'))
  }
  res.locals.adminUnlockedUntil = setUnlockCookie(res, req.user.id)
  next()
}
