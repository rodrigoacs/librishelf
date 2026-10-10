import { normalizeIsbn13, isbn13CheckDigit } from '../../utils/isbn.js'

describe('normalizeIsbn13', () => {
  it('aceita ISBN-13 válido com ou sem hífen', () => {
    expect(normalizeIsbn13('9780140328721')).toBe('9780140328721')
    expect(normalizeIsbn13('978-0-14-032872-1')).toBe('9780140328721')
    expect(normalizeIsbn13(' 978 0140 328721 ')).toBe('9780140328721')
  })

  it('converte ISBN-10 válido para ISBN-13', () => {
    expect(normalizeIsbn13('0140328726')).toBe('9780140328721')
    expect(normalizeIsbn13('0-14-032872-6')).toBe('9780140328721')
  })

  it('aceita X como dígito verificador do ISBN-10', () => {
    expect(normalizeIsbn13('080442957X')).toBe('9780804429573')
  })

  it('recusa dígito verificador errado', () => {
    expect(normalizeIsbn13('9780140328722')).toBeNull()
    expect(normalizeIsbn13('0140328727')).toBeNull()
  })

  it('recusa tamanhos e prefixos inválidos', () => {
    for (const bad of ['12345', '97801403287', '978014032872112', '1234567890123', '', 'abc', null, undefined]) {
      expect(normalizeIsbn13(bad)).toBeNull()
    }
  })

  it('calcula o dígito verificador do ISBN-13', () => {
    expect(isbn13CheckDigit('978014032872')).toBe('1')
  })
})
