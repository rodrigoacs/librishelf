import logger from '../utils/logger.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Sem valor explícito, segue o ambiente: em produção o cookie de sessão nunca
// sai sem a flag Secure por esquecimento. COOKIE_SECURE=false só para testar
// a imagem de produção sem HTTPS.
const COOKIE_SECURE = process.env.COOKIE_SECURE === undefined || process.env.COOKIE_SECURE === ''
  ? IS_PRODUCTION
  : process.env.COOKIE_SECURE === 'true'

if (process.env.COOKIE_SECURE === undefined) {
  logger.info('COOKIE_SECURE não definido; usando o padrão do ambiente', { secure: COOKIE_SECURE })
}

const AUTH_COOKIE_NAME = 'token'
const AUTH_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7 dias, mesmo prazo do JWT

const authCookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
  maxAge: AUTH_COOKIE_MAX_AGE
}

export { AUTH_COOKIE_NAME, authCookieOptions }