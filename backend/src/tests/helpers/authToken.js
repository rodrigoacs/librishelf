import { AUTH_COOKIE_NAME } from '../../config/cookieOptions.js'

/**
 * Desde a migração para cookie httpOnly o login não devolve mais o token no
 * corpo. Os testes extraem o JWT do Set-Cookie para continuar usando
 * `Authorization: Bearer <token>` (o middleware aceita os dois).
 */
export function tokenFrom(res) {
  const cookies = res.headers['set-cookie'] || []
  const prefix = `${AUTH_COOKIE_NAME}=`
  const authCookie = cookies.find(cookie => cookie.startsWith(prefix))

  if (!authCookie) {
    throw new Error(`Resposta sem cookie "${AUTH_COOKIE_NAME}" (status ${res.statusCode}): ${JSON.stringify(res.body)}`)
  }

  return decodeURIComponent(authCookie.slice(prefix.length).split(';')[0])
}
