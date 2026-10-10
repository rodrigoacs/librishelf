/**
 * ISBN-10 ou ISBN-13 (com ou sem hífen/espaço) → ISBN-13 validado, ou null.
 * Mesmo algoritmo da função librishelf.normalize_isbn13 do banco (que calcula
 * a coluna books.isbn13); os testes conferem que os dois concordam.
 */
export function normalizeIsbn13(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const digits = String(value).replace(/[^0-9Xx]/g, '').toUpperCase()

  if (digits.length === 10) {
    if (!/^[0-9]{9}[0-9X]$/.test(digits)) return null

    let total = 0
    for (let i = 0; i < 10; i++) {
      const digit = digits[i] === 'X' ? 10 : Number(digits[i])
      total += digit * (10 - i)
    }
    if (total % 11 !== 0) return null

    const base = `978${digits.slice(0, 9)}`
    return base + isbn13CheckDigit(base)
  }

  if (digits.length === 13 && /^97[89][0-9]{10}$/.test(digits)) {
    return isbn13CheckDigit(digits.slice(0, 12)) === digits[12] ? digits : null
  }

  return null
}

export function isbn13CheckDigit(first12) {
  let total = 0
  for (let i = 0; i < 12; i++) {
    total += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return String((10 - (total % 10)) % 10)
}
