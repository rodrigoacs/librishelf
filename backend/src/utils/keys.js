import crypto from 'node:crypto'

/**
 * Uma chave por finalidade, derivada da SECRET_KEY com HKDF (RFC 5869):
 * o token de uma finalidade não confere com a chave de outra, e vazar uma
 * chave derivada não entrega a SECRET_KEY nem as demais.
 *
 *   sessão (JWT do login)      → SECRET_KEY direto (não muda: ninguém é deslogado)
 *   liberação da área admin    → purposeKey('admin-unlock')
 *   links assinados (moderação, descadastro) → purposeKey('link:<finalidade>')
 *
 * A SECRET_KEY é lida a cada chamada (os testes trocam o valor); o cache só
 * evita refazer o HKDF a cada requisição.
 */
const cache = new Map()

export function purposeKey(purpose) {
  const secret = process.env.SECRET_KEY || ''
  const cacheKey = `${purpose}\u0000${secret}`
  let key = cache.get(cacheKey)
  if (!key) {
    key = Buffer.from(crypto.hkdfSync('sha256', secret, 'librishelf', `librishelf:${purpose}`, 32))
    if (cache.size > 50) cache.clear()
    cache.set(cacheKey, key)
  }
  return key
}

/** Chave das sessões (JWT do cookie de login). */
export function sessionKey() {
  return process.env.SECRET_KEY
}

/** Algoritmo fixo nos JWT: o verify não aceita outro que venha no cabeçalho. */
export const JWT_ALGORITHMS = ['HS256']
