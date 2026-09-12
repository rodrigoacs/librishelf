const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'

if (process.env.COOKIE_SECURE === undefined) {
  console.log('[System] COOKIE_SECURE não definido, usando padrão de desenvolvimento (false). Defina COOKIE_SECURE=true em produção (HTTPS).')
}

const AUTH_COOKIE_NAME = 'token'
const AUTH_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7 dias

const authCookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
  maxAge: AUTH_COOKIE_MAX_AGE
}

export { AUTH_COOKIE_NAME, authCookieOptions }