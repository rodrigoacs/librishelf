import { describe, expect, it } from 'vitest'
import { coverUrl, coverFallbackExhausted } from './covers.js'

describe('coverUrl (books.cover_version)', () => {
  it('número → URL com ?v=; null → sem capa (null); sem o campo → tenta a imagem', () => {
    expect(coverUrl(7, 12)).toBe('/api/uploads/7.avif?v=12')
    expect(coverUrl(7, null)).toBeNull()
    expect(coverUrl(7, undefined)).toBe('/api/uploads/7.avif')
  })

  it('sem livro → placeholder', () => {
    expect(coverUrl(null, 3)).toMatch(/^data:image\/svg\+xml/)
  })
})

describe('coverFallbackExhausted', () => {
  it('AVIF falhou → tenta o JPG uma vez; JPG falhou → acabou', () => {
    const img = { src: '/api/uploads/7.avif?v=2', dataset: {} }
    expect(coverFallbackExhausted({ target: img })).toBe(false)
    expect(img.src).toBe('/api/uploads/7.jpg?v=2')
    expect(coverFallbackExhausted({ target: img })).toBe(true)
  })
})
