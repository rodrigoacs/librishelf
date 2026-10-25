import crypto from 'node:crypto'

/**
 * Token "<id>.<assinatura>" para links sem login (ex.: moderação de resenha
 * no e-mail de denúncia): HMAC do id + finalidade com a SECRET_KEY. Não dá
 * para trocar o id nem usar o token de uma finalidade em outra.
 */
function signature(purpose, id) {
  return crypto
    .createHmac('sha256', process.env.SECRET_KEY || '')
    .update(`${purpose}:${id}`)
    .digest('base64url')
    .slice(0, 32)
}

export function signId(purpose, id) {
  return `${id}.${signature(purpose, id)}`
}

/** → id, ou null se o token não confere com a finalidade. */
export function readSignedId(purpose, token) {
  if (typeof token !== 'string' || token.length > 64) return null
  const match = token.match(/^(\d{1,10})\.([A-Za-z0-9_-]{32})$/)
  if (!match) return null
  const id = Number(match[1])
  const expected = Buffer.from(signature(purpose, id))
  const given = Buffer.from(match[2])
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
  return id
}
