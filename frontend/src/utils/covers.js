import { API_URL } from '../config/site.js'

const PLACEHOLDER_SVG =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232a2a2a%22%2F%3E%3Cpath%20d%3D%22M100%20180%20L150%20130%20L200%20180%22%20stroke%3D%22%23444%22%20stroke-width%3D%225%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E"

/**
 * URL da capa (AVIF). `version` é o books.cover_version do payload:
 *   - número → tem capa; vira ?v= na URL (muda quando a capa é trocada)
 *   - null → o livro não tem capa: devolve null e quem chama desenha uma,
 *     sem pedir nada ao servidor
 *   - undefined → não sabemos (payload sem o campo): tenta a imagem
 */
export function coverUrl(bookId, version) {
  if (!bookId) return PLACEHOLDER_SVG
  if (version === null) return null
  const query = version ? `?v=${version}` : ''
  return `${API_URL}/uploads/${bookId}.avif${query}`
}

export function coverFileUrl(filename) {
  return `${API_URL}/uploads/${encodeURIComponent(filename)}`
}

/**
 * @error de <img> para quem desenha a capa quando não há imagem: tenta o JPG
 * uma vez e devolve true quando não há mais o que tentar.
 */
export function coverFallbackExhausted(event) {
  const img = event.target
  if (img.src.includes('.avif') && img.dataset.coverFallback !== 'jpg') {
    img.dataset.coverFallback = 'jpg'
    img.src = img.src.replace('.avif', '.jpg')
    return false
  }
  return true
}
