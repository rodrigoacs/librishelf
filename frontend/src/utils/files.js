import { MAX_UPLOAD_MB } from '../config/site.js'

/**
 * Valida a imagem escolhida antes do upload. Devolve a chave i18n do erro
 * (com params) ou null quando está ok.
 */
export function validateImageFile(file) {
  if (!file) return null

  if (!file.type.startsWith('image/')) {
    return { key: 'book.file_not_image' }
  }

  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return { key: 'book.file_too_large', params: { mb: MAX_UPLOAD_MB } }
  }

  return null
}

/**
 * Preview de arquivo local que libera o object URL anterior (sem isso cada
 * troca de capa vazava um blob na memória da aba).
 */
export function createPreviewHandle() {
  let current = null

  return {
    set(file) {
      this.clear()
      current = file ? URL.createObjectURL(file) : null
      return current
    },
    clear() {
      if (current) URL.revokeObjectURL(current)
      current = null
    }
  }
}
