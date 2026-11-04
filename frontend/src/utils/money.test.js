import { describe, expect, it } from 'vitest'
import { parseCents, centsToInput, formatMoney } from './money.js'

describe('dinheiro em centavos', () => {
  it('lê o que a pessoa digita', () => {
    expect(parseCents('89,90')).toBe(8990)
    expect(parseCents('89.9')).toBe(8990)
    expect(parseCents('R$ 1.234,56')).toBe(123456)
    expect(parseCents('1,234.56')).toBe(123456)
    expect(parseCents('150')).toBe(15000)
    expect(parseCents('')).toBeNull()
    expect(parseCents(null)).toBeNull()
    expect(parseCents('-3')).toBeNaN()
  })

  it('volta para o campo e formata', () => {
    expect(centsToInput(8990, 'pt-BR')).toBe('89,90')
    expect(centsToInput(123456, 'en-US')).toBe('1234.56')
    expect(centsToInput(null)).toBe('')
    expect(formatMoney(8990, 'pt-BR').replace(/\s/g, ' ')).toBe('R$ 89,90')
    expect(formatMoney(null)).toBe('—')
  })
})
