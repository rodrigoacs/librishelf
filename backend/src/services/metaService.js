import * as authRepository from '../repositories/authRepository.js'

/**
 * Trecho de <head> que o nginx do frontend injeta (SSI) no index.html de
 * /u/<usuário>. O SPA sozinho não serve: o Google pode nem executar o
 * JavaScript de uma página que chega com noindex, então a decisão de aparecer
 * em buscadores precisa estar no HTML que sai do servidor.
 *
 * Regra: só sai "index" para biblioteca pública, de conta ativa, cujo dono
 * ligou "aparecer em buscadores". Privada e inexistente dão a mesma resposta
 * (não revela quem existe).
 */
export const ROBOTS_NOINDEX = '<meta name="robots" content="noindex, nofollow">'
export const ROBOTS_INDEX = '<meta name="robots" content="index, follow">'

const USERNAME = /^[A-Za-z0-9._-]{1,40}$/

export async function libraryHead(username) {
  if (typeof username !== 'string' || !USERNAME.test(username)) return ROBOTS_NOINDEX
  const user = await authRepository.getUserByName(username)
  const indexable = Boolean(user && user.is_public && user.allow_indexing && user.is_active !== false)
  return indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX
}
