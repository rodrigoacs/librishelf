import { describe, expect, it } from 'vitest'
import { comparePeriods, chartPeriod, change, isoDate, fromIso } from './statPeriods.js'

const today = new Date(2026, 10, 2) // 2 de novembro de 2026

describe('períodos das estatísticas', () => {
  it('ano até hoje × mesmo trecho do ano passado', () => {
    expect(comparePeriods('yearToDate', today)).toEqual([
      { from: '2025-01-01', to: '2025-11-02' },
      { from: '2026-01-01', to: '2026-11-02' }
    ])
  })

  it('dois anos fechados, mês até hoje e 12 meses móveis', () => {
    expect(comparePeriods('lastYears', today)).toEqual([
      { from: '2024-01-01', to: '2024-12-31' },
      { from: '2025-01-01', to: '2025-12-31' }
    ])
    expect(comparePeriods('monthToDate', today)).toEqual([
      { from: '2025-11-01', to: '2025-11-02' },
      { from: '2026-11-01', to: '2026-11-02' }
    ])
    expect(comparePeriods('rolling', today)).toEqual([
      { from: '2024-12-01', to: '2025-11-30' },
      { from: '2025-12-01', to: '2026-11-02' }
    ])
  })

  it('29 de fevereiro vira 28 no ano anterior', () => {
    expect(comparePeriods('yearToDate', new Date(2028, 1, 29))[0].to).toBe('2027-02-28')
  })

  it('gráfico: 12 meses, este ano, ano passado e 5 anos', () => {
    expect(chartPeriod('last12', today)).toEqual({ from: '2025-12-01', to: '2026-11-02' })
    expect(chartPeriod('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-11-02' })
    expect(chartPeriod('lastYear', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(chartPeriod('last5', today)).toEqual({ from: '2022-01-01', to: '2026-11-02' })
  })

  it('datas ida e volta', () => {
    expect(isoDate(fromIso('2026-03-09'))).toBe('2026-03-09')
  })

  it('variação em porcentagem e em valor', () => {
    expect(change(10, 15, { locale: 'pt-BR' })).toEqual({ text: '+50%', tone: 'up' })
    expect(change(10, 5, { locale: 'pt-BR' })).toEqual({ text: '-50%', tone: 'down' })
    expect(change(0, 3, { locale: 'pt-BR' })).toEqual({ text: '—', tone: 'up' })
    expect(change(4, 4.5, { percent: false, decimals: 1, locale: 'pt-BR' })).toEqual({ text: '+0,5', tone: 'up' })
    expect(change(null, 4, { locale: 'pt-BR' }).text).toBe('—')
  })
})
