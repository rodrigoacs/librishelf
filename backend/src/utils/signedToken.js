import crypto from 'node:crypto'
import { purposeKey } from './keys.js'

/**
 * Token para links sem login (moderação de resenha no e-mail de denúncia,
 * descadastro dos avisos por e-mail):
 *
 *   "<id>.<assinatura>"            → não expira
 *   "<id>.<expira>.<assinatura>"   → expira em <expira> (segundos Unix)
 *
 * A assinatura é um HMAC do id (e do prazo) com uma chave própria da
 * finalidade (utils/keys.js): não dá para trocar o id, estender o prazo nem
 * usar o token de uma finalidade em outra.
 */
const SIGNATURE_LENGTH = 32
const TOKEN_PATTERN = /^(\d{1,10})(?:\.(\d{1,12}))?\.([A-Za-z0-9_-]{32})$/

function signature(purpose, id, expiresAt) {
  return crypto
    .createHmac('sha256', purposeKey(`link:${purpose}`))
    .update(expiresAt ? `${id}:${expiresAt}` : String(id))
    .digest('base64url')
    .slice(0, SIGNATURE_LENGTH)
}

/** options.ttlDays: prazo do link (sem ele, não expira). */
export function signId(purpose, id, { ttlDays } = {}) {
  if (!ttlDays) return `${id}.${signature(purpose, id)}`
  const expiresAt = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 24 * 60 * 60)
  return `${id}.${expiresAt}.${signature(purpose, id, expiresAt)}`
}

/**
 * → id, ou null se o token não confere com a finalidade ou venceu.
 * options.requireExpiry: recusa tokens sem prazo (para finalidades que sempre expiram).
 */
export function readSignedId(purpose, token, { requireExpiry = false } = {}) {
  if (typeof token !== 'string' || token.length > 64) return null
  const match = token.match(TOKEN_PATTERN)
  if (!match) return null

  const id = Number(match[1])
  const expiresAt = match[2] ? Number(match[2]) : null
  if (requireExpiry && !expiresAt) return null

  const expected = Buffer.from(signature(purpose, id, expiresAt))
  const given = Buffer.from(match[3])
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
  if (expiresAt && expiresAt * 1000 < Date.now()) return null
  return id
}
