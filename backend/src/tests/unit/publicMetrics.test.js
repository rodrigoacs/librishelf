import { clampDays, conversion, fillDays, usernameFromRedirect, windowStart } from '../../services/publicMetricsService.js'

// Métricas da página pública (pacote 41): as contas puras do serviço
describe('usernameFromRedirect', () => {
  test('só caminhos /u/:usuario contam', () => {
    expect(usernameFromRedirect('/u/Fulano')).toBe('Fulano')
    expect(usernameFromRedirect('/u/Fulano?book=3')).toBe('Fulano')
    expect(usernameFromRedirect('/u/Fulano/lists/2')).toBe('Fulano')
    expect(usernameFromRedirect('/u/Jos%C3%A9')).toBe('José')
    expect(usernameFromRedirect('/books')).toBeNull()
    expect(usernameFromRedirect('https://x.com/u/Fulano')).toBeNull()
    expect(usernameFromRedirect('/u/')).toBeNull()
    expect(usernameFromRedirect('/u/%E0%A4%A')).toBeNull()
    expect(usernameFromRedirect(null)).toBeNull()
  })
})

describe('janela de dias', () => {
  test('começa days - 1 dias antes de hoje e atravessa o mês', () => {
    expect(windowStart(1, '2026-03-02')).toBe('2026-03-02')
    expect(windowStart(3, '2026-03-02')).toBe('2026-02-28')
  })

  test('preenche os dias vazios com zero', () => {
    expect(fillDays('2026-02-27', 3, ['visit'])).toEqual([
      { day: '2026-02-27', visit: 0 },
      { day: '2026-02-28', visit: 0 },
      { day: '2026-03-01', visit: 0 }
    ])
  })

  test('days fora de 1..365 é 400', () => {
    expect(clampDays(undefined)).toBe(30)
    expect(clampDays('7')).toBe(7)
    for (const bad of ['0', '366', 'abc', '1.5']) expect(() => clampDays(bad)).toThrow(expect.objectContaining({ errorCode: 'FIELD_INVALID' }))
  })
})

describe('conversion', () => {
  test('cadastros por visita, com uma casa', () => {
    expect(conversion(1, 3)).toBe(33.3)
    expect(conversion(0, 10)).toBe(0)
    expect(conversion(2, 0)).toBeNull()
  })
})
