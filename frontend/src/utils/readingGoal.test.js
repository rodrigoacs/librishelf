import { describe, expect, it } from 'vitest'
import { goalProgress, yearFraction } from './readingGoal.js'

// 2 de julho de 2026, meio-dia: ~50% do ano
const now = new Date(2026, 6, 2, 12)

describe('yearFraction', () => {
  it('fração do ano atual; null em outro ano', () => {
    expect(yearFraction(2026, new Date(2026, 0, 1))).toBe(0)
    expect(yearFraction(2026, now)).toBeCloseTo(0.5, 2)
    expect(yearFraction(2025, now)).toBeNull()
    expect(yearFraction(2027, now)).toBeNull()
  })
})

describe('goalProgress', () => {
  it('sem meta: barra vazia e sem recado', () => {
    expect(goalProgress({ goal: null, read: 3, year: 2026, now })).toEqual({ percent: 0, pace: 50, status: null })
  })

  it('percent arredondado e limitado a 100', () => {
    expect(goalProgress({ goal: 3, read: 1, year: 2026, now }).percent).toBe(33)
    expect(goalProgress({ goal: 3, read: 9, year: 2026, now }).percent).toBe(100)
  })

  it('meta batida', () => {
    expect(goalProgress({ goal: 10, read: 10, year: 2026, now }).status).toEqual({ key: 'done', tone: 'good' })
  })

  it('ano atual: à frente, atrás ou no ritmo (esperado = piso de meta × fração)', () => {
    expect(goalProgress({ goal: 20, read: 12, year: 2026, now }).status).toEqual({ key: 'ahead', n: 2, tone: 'good' })
    expect(goalProgress({ goal: 20, read: 7, year: 2026, now }).status).toEqual({ key: 'behind', n: 3, tone: 'warn' })
    expect(goalProgress({ goal: 20, read: 10, year: 2026, now }).status).toEqual({ key: 'onTrack', tone: 'good' })
  })

  it('ano passado: quanto faltou; ano futuro: recado neutro, sem marcador', () => {
    expect(goalProgress({ goal: 12, read: 8, year: 2025, now })).toEqual({ percent: 67, pace: null, status: { key: 'missed', n: 4, tone: 'muted' } })
    expect(goalProgress({ goal: 12, read: 0, year: 2027, now }).status).toEqual({ key: 'future', tone: 'muted' })
  })
})
