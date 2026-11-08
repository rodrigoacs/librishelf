import { describe, expect, it } from 'vitest'
import { USERNAME_PATTERN, EMAIL_PATTERN } from './accountRules.js'
import { focusFirstError } from './formState.js'

describe('regras de conta', () => {
  it('nome de usuário: letras (com acento), números, ponto, hífen e sublinhado', () => {
    for (const ok of ['ana', 'joão.silva', 'leitor_42', 'a-b']) expect(USERNAME_PATTERN.test(ok)).toBe(true)
    for (const bad of ['com espaço', 'ana@x', '', 'oi!']) expect(USERNAME_PATTERN.test(bad)).toBe(false)
  })

  it('e-mail: algo@algo.algo, sem espaço', () => {
    expect(EMAIL_PATTERN.test('ana@example.com')).toBe(true)
    for (const bad of ['ana', 'ana@x', 'a b@x.com', '@x.com']) expect(EMAIL_PATTERN.test(bad)).toBe(false)
  })
})

describe('focusFirstError', () => {
  it('foca o primeiro campo com erro, na ordem dos campos', () => {
    const focused = []
    const field = name => ({ value: { focus: () => focused.push(name) } })
    const fields = { current: field('current'), next: field('next'), confirm: field('confirm') }
    expect(focusFirstError({ current: '', next: 'curta', confirm: 'diferente' }, fields)).toBe('next')
    expect(focused).toEqual(['next'])
    expect(focusFirstError({ current: '', next: '', confirm: '' }, fields)).toBe(null)
    expect(focused).toEqual(['next'])
  })
})
