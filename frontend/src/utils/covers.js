import { API_URL } from '../config/site.js'

const PLACEHOLDER_SVG =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232a2a2a%22%2F%3E%3Cpath%20d%3D%22M100%20180%20L150%20130%20L200%20180%22%20stroke%3D%22%23444%22%20stroke-width%3D%225%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E"

/** URL da capa (AVIF). `version` muda depois de trocar a capa, furando o cache. */
export function coverUrl(bookId, version) {
  if (!bookId) return PLACEHOLDER_SVG
  const query = version ? `?v=${version}` : ''
  return `${API_URL}/uploads/${bookId}.avif${query}`
}

export function coverFileUrl(filename) {
  return `${API_URL}/uploads/${encodeURIComponent(filename)}`
}

/**
 * @error de <img>: tenta o JPG (navegadores sem AVIF ou capa antiga) e, se
 * também falhar, mostra o placeholder. Marca o elemento para não entrar em loop.
 */
export function handleCoverError(event) {
  const img = event.target
  if (img.dataset.coverFallback === 'placeholder') return

  if (img.src.includes('.avif')) {
    img.dataset.coverFallback = 'jpg'
    img.src = img.src.replace('.avif', '.jpg')
    return
  }

  img.dataset.coverFallback = 'placeholder'
  img.src = PLACEHOLDER_SVG
}
