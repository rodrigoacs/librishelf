import crypto from 'node:crypto'

/**
 * Token de descadastro dos avisos por e-mail: "<id>.<assinatura>", HMAC do
 * id + finalidade com a SECRET_KEY. Não expira e não precisa de tabela; não
 * dá para forjar sem a chave (RFC 8058 pede um identificador difícil de forjar).
 *   https://www.rfc-editor.org/rfc/rfc8058
 */
const PURPOSE = 'unsubscribe:follow-emails'

function signature(userId) {
  return crypto
    .createHmac('sha256', process.env.SECRET_KEY || '')
    .update(`${PURPOSE}:${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

export function createUnsubscribeToken(userId) {
  return `${userId}.${signature(userId)}`
}

/** → id do usuário, ou null se o token não confere. */
export function readUnsubscribeToken(token) {
  if (typeof token !== 'string' || token.length > 64) return null
  const match = token.match(/^(\d{1,10})\.([A-Za-z0-9_-]{32})$/)
  if (!match) return null
  const userId = Number(match[1])
  const expected = Buffer.from(signature(userId))
  const given = Buffer.from(match[2])
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
  return userId
}
