import { describe, expect, it } from 'vitest'
import { profileCoverUrl } from './profileCover.js'
import { coverUrl } from './covers.js'

describe('profileCoverUrl', () => {
  it('sem capa: null', () => {
    expect(profileCoverUrl('ana', null)).toBeNull()
  })

  it('imagem enviada: rota própria com versão', () => {
    expect(profileCoverUrl('ana maria', { kind: 'image', version: 3 })).toMatch(/\/profile-covers\/ana%20maria\/cover\.jpg\?v=3$/)
    expect(profileCoverUrl('ana', { kind: 'image', version: 3 }, 'avif')).toMatch(/cover\.avif\?v=3$/)
    expect(profileCoverUrl('', { kind: 'image', version: 3 })).toBeNull()
  })

  it('livro: a capa do livro', () => {
    expect(profileCoverUrl('ana', { kind: 'book', bookId: 7, version: 2 })).toBe(coverUrl(7, 2))
  })
})
