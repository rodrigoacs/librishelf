import { API_URL } from '../config/site.js'
import { coverUrl } from './covers.js'

/**
 * URL da capa de fundo do perfil público (Pro: personalization).
 * `cover` vem do payload (personalization.profileCover ou profile.profileCover):
 *   { kind: 'book', bookId, version } → capa do livro
 *   { kind: 'image', version }        → imagem enviada pela pessoa
 *   null                              → sem capa (devolve null)
 */
export function profileCoverUrl(username, cover, ext = 'jpg') {
  if (!cover) return null
  if (cover.kind === 'image') {
    if (!username || !Number.isFinite(cover.version)) return null
    return `${API_URL}/profile-covers/${encodeURIComponent(username)}/cover.${ext}?v=${cover.version}`
  }
  return cover.bookId ? coverUrl(cover.bookId, cover.version) : null
}
