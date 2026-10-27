import { describe, expect, it } from 'vitest'
import { slugify } from './slug.js'

describe('slugify', () => {
  it('tira acentos e pontuação', () => {
    expect(slugify('Melhores de 2026!')).toBe('melhores-de-2026')
    expect(slugify('  Ficção & Fantasia — São Paulo  ')).toBe('ficcao-fantasia-sao-paulo')
  })

  it('corta no limite sem deixar hífen no fim', () => {
    expect(slugify('abc def ghi', 4)).toBe('abc')
    expect(slugify('a'.repeat(100)).length).toBe(60)
  })

  it('vazio, só símbolos ou sem texto → string vazia', () => {
    expect(slugify('')).toBe('')
    expect(slugify('!!!')).toBe('')
    expect(slugify(null)).toBe('')
  })
})
