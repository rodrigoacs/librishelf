import { describe, expect, it } from 'vitest'
import { dateTag, fromApiDate, monthNames, toApiDate } from './dates.js'

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

describe('dateTag', () => {
  it('inglês → en-US; o resto → pt-BR', () => {
    expect(dateTag('en')).toBe('en-US')
    expect(dateTag('pt')).toBe('pt-BR')
    expect(dateTag(undefined)).toBe('pt-BR')
  })
})

describe('monthNames', () => {
  it('doze meses, curtos sem o ponto', () => {
    expect(monthNames('pt-BR')).toHaveLength(12)
    expect(monthNames('pt-BR')[0]).toBe('janeiro')
    expect(monthNames('pt-BR', 'short')[1]).toBe('fev')
    expect(monthNames('en-US', 'short')[11]).toBe('Dec')
    expect(monthNames('pt-BR', 'narrow')[0]).toBe('J')
  })
})
