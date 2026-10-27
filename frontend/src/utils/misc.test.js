import { describe, expect, it } from 'vitest'
import { isWeakPassword } from './password.js'
import { statusOf } from './readingStatus.js'
import { seriesText } from './series.js'
import { tagColorName, colorFor, TAG_COLOR_NAMES } from './tagColors.js'

describe('isWeakPassword (mesma regra do backend)', () => {
  it('8+ caracteres com letra e número', () => {
    expect(isWeakPassword('senha12345')).toBe(false)
    expect(isWeakPassword('curta1')).toBe(true)
    expect(isWeakPassword('somenteletras')).toBe(true)
    expect(isWeakPassword('1234567890')).toBe(true)
  })

  it('até 72 bytes (bcrypt), contando acentos como 2', () => {
    expect(isWeakPassword(`a1${'x'.repeat(70)}`)).toBe(false)
    expect(isWeakPassword(`a1${'é'.repeat(36)}`)).toBe(true) // 2 + 72 bytes
  })
})

describe('statusOf', () => {
  it('lendo vence lido (releitura); depois lido, quero ler, nenhum', () => {
    expect(statusOf({ reading_status: 'reading', read_date: '2025-01-01' })).toBe('reading')
    expect(statusOf({ read_date: '2025-01-01' })).toBe('read')
    expect(statusOf({ reading_status: 'want' })).toBe('want')
    expect(statusOf({})).toBe('none')
    expect(statusOf(null)).toBe('none')
  })
})

describe('seriesText', () => {
  const t = (key, { series, n }) => `${series} #${n}`
  it('com e sem volume; vírgula decimal no pt', () => {
    expect(seriesText({ series: 'Duna', series_index: 2 }, t, 'pt-BR')).toBe('Duna #2')
    expect(seriesText({ series: 'Duna', series_index: '1.5' }, t, 'pt-BR')).toBe('Duna #1,5')
    expect(seriesText({ series: 'Duna', series_index: null }, t, 'pt-BR')).toBe('Duna')
    expect(seriesText({}, t, 'pt-BR')).toBe('')
  })
})

describe('cores por nome', () => {
  it('mesmo nome, mesma cor; sempre uma das 6', () => {
    expect(tagColorName('Fantasia')).toBe(tagColorName('Fantasia'))
    for (const name of ['', 'a', 'Ficção', '2026', 'Machado de Assis']) expect(TAG_COLOR_NAMES).toContain(tagColorName(name))
    expect(colorFor('Fantasia')).toBe(`var(--${tagColorName('Fantasia')})`)
  })
})
