import { describe, expect, it } from 'vitest'
import { booksLeft, canResumeOnboarding, needsOnboarding, stepAfter, stepNumber } from './onboarding.js'

describe('onboarding', () => {
  const user = status => ({ emailVerified: true, onboarding: { status } })

  it('só pendente com e-mail confirmado vai para os primeiros passos', () => {
    expect(needsOnboarding(user('pending'))).toBe(true)
    expect(needsOnboarding(user('skipped'))).toBe(false)
    expect(needsOnboarding(user('done'))).toBe(false)
    expect(needsOnboarding({ emailVerified: false, onboarding: { status: 'pending' } })).toBe(false)
    expect(needsOnboarding(null)).toBe(false)
    expect(canResumeOnboarding(user('skipped'))).toBe(true)
    expect(canResumeOnboarding(user('done'))).toBe(false)
  })

  it('passos vizinhos sem sair da lista', () => {
    expect(stepAfter('start')).toBe('books')
    expect(stepAfter('books', -1)).toBe('start')
    expect(stepAfter('start', -1)).toBe('start')
    expect(stepAfter('finish')).toBe('finish')
    expect(stepAfter('desconhecido')).toBe('books')
    expect(stepNumber('public')).toBe(3)
  })

  it('livros que faltam', () => {
    expect(booksLeft(1, 3)).toBe(2)
    expect(booksLeft(12, 10)).toBe(0)
    expect(booksLeft(undefined, 10)).toBe(10)
  })
})
