import { describe, it, expect, afterEach, vi } from 'vitest'
import { scrollBehavior, prefersReducedMotion } from './motion.js'

function mockReduce(reduce) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) })
}

describe('scrollBehavior', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('suave quando não há preferência por menos movimento', () => {
    mockReduce(false)
    expect(prefersReducedMotion()).toBe(false)
    expect(scrollBehavior()).toBe('smooth')
  })

  it('salto com movimento reduzido', () => {
    mockReduce(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(scrollBehavior()).toBe('auto')
  })

  it('salto quando quem chama pede', () => {
    mockReduce(false)
    expect(scrollBehavior(false)).toBe('auto')
  })
})
