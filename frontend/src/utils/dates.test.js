import { describe, expect, it } from 'vitest'
import { fromApiDate, toApiDate } from './dates.js'

describe('fromApiDate', () => {
  it('lê o dia que veio da API, sem cair na véspera no fuso de Brasília', () => {
    expect(new Date('2026-03-01').getDate()).toBe(28) // o bug que a função evita
    const d = fromApiDate('2026-03-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1])
    expect(fromApiDate('2026-03-01T00:00:00.000Z').getDate()).toBe(1)
  })

  it('vazio ou inválido → null', () => {
    expect(fromApiDate(null)).toBeNull()
    expect(fromApiDate('')).toBeNull()
    expect(fromApiDate('ontem')).toBeNull()
  })
})

describe('toApiDate', () => {
  it('data local → YYYY-MM-DD sem passar por UTC', () => {
    expect(toApiDate(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31')
    expect(toApiDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('ida e volta com fromApiDate', () => {
    expect(toApiDate(fromApiDate('2024-02-29'))).toBe('2024-02-29')
  })

  it('vazio ou inválido → null', () => {
    expect(toApiDate(null)).toBeNull()
    expect(toApiDate('nada')).toBeNull()
  })
})
