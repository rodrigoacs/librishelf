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

import { readFileSync } from 'node:fs'
import { MOTION, SPRING, GESTURE, shouldComplete, rubberBand, velocityFrom, navDirection, pickTransition, staggerDelay } from './motion.js'

describe('tokens de movimento', () => {
  const css = readFileSync(new URL('../assets/main.css', import.meta.url), 'utf8')
  const token = name => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()

  it('main.css e MOTION têm as mesmas durações', () => {
    expect(token('dur-short')).toBe(`${MOTION.short}ms`)
    expect(token('dur-medium')).toBe(`${MOTION.medium}ms`)
    expect(token('dur-long')).toBe(`${MOTION.long}ms`)
    expect(token('dur-spring')).toBe(`${MOTION.spring}ms`)
    expect(token('stagger')).toBe(`${MOTION.stagger}ms`)
  })

  it('main.css e MOTION têm as mesmas curvas', () => {
    expect(token('ease-standard')).toBe(MOTION.easeStandard)
    expect(token('ease-enter')).toBe(MOTION.easeEnter)
    expect(token('ease-exit')).toBe(MOTION.easeExit)
    expect(token('ease-spring')).toBe(SPRING)
    expect(token('press-scale')).toBe(String(MOTION.pressScale))
  })

  it('a mola começa em 0, passa um pouco de 1 e termina em 1', () => {
    const values = SPRING.slice(7, -1).split(',').map(Number)
    expect(values[0]).toBe(0)
    expect(values.at(-1)).toBe(1)
    const peak = Math.max(...values)
    expect(peak).toBeGreaterThan(1.01)
    expect(peak).toBeLessThan(1.08)
  })

  it('cascata cresce por item e para no teto', () => {
    expect(staggerDelay(0)).toBe(0)
    expect(staggerDelay(2)).toBe(2 * MOTION.stagger)
    expect(staggerDelay(50)).toBe(MOTION.staggerMax * MOTION.stagger)
  })
})

describe('fechar/abrir por gesto (folha e gaveta)', () => {
  const size = 600

  it('devagar: fecha só depois de passar 35% do tamanho', () => {
    expect(shouldComplete({ distance: size * 0.3, velocity: 0.1, size })).toBe(false)
    expect(shouldComplete({ distance: size * 0.36, velocity: 0.1, size })).toBe(true)
  })

  it('puxão rápido fecha mesmo curto', () => {
    expect(shouldComplete({ distance: 40, velocity: 0.9, size })).toBe(true)
  })

  it('puxão rápido mas quase parado no lugar não fecha', () => {
    expect(shouldComplete({ distance: 4, velocity: 1.2, size })).toBe(false)
  })

  it('passou da metade, mas voltou rápido: não fecha', () => {
    expect(shouldComplete({ distance: size * 0.5, velocity: -0.8, size })).toBe(false)
  })

  it('sem tamanho medido não decide fechar', () => {
    expect(shouldComplete({ distance: 300, velocity: 2, size: 0 })).toBe(false)
  })

  it('velocidade só dos últimos 80 ms', () => {
    const samples = [{ t: 0, v: 0 }, { t: 100, v: 10 }, { t: 150, v: 40 }, { t: 180, v: 70 }]
    expect(velocityFrom(samples)).toBeCloseTo(60 / 80)
    expect(velocityFrom([{ t: 0, v: 0 }])).toBe(0)
  })

  it('borracha: cresce cada vez menos e nunca passa do limite', () => {
    expect(rubberBand(0)).toBe(0)
    expect(rubberBand(-20)).toBe(0)
    const a = rubberBand(100)
    const b = rubberBand(200)
    expect(b).toBeGreaterThan(a)
    expect(b - a).toBeLessThan(a)
    expect(rubberBand(100000)).toBeLessThan(GESTURE.refreshMax)
  })
})

describe('transição pelo sentido da navegação', () => {
  it('sentido pela posição no histórico', () => {
    expect(navDirection(3, 4)).toBe('forward')
    expect(navDirection(4, 3)).toBe('back')
    expect(navDirection(4, 4)).toBe('swap')
    expect(navDirection(null, 2)).toBe('swap')
  })

  it('livro abrindo e fechando na mesma tela', () => {
    expect(pickTransition({ fromPath: '/books', toPath: '/books', fromBook: null, toBook: 7 })).toBe('book-open')
    expect(pickTransition({ fromPath: '/books', toPath: '/books', fromBook: 7, toBook: null })).toBe('book-close')
  })

  it('só filtros mudando na URL: sem animação', () => {
    expect(pickTransition({ fromPath: '/books', toPath: '/books', fromBook: null, toBook: null })).toBe(null)
    expect(pickTransition({ fromPath: '/books', toPath: '/books', fromBook: 3, toBook: 5 })).toBe(null)
  })

  it('detalhe entra deslizando e volta deslizando ao contrário', () => {
    expect(pickTransition({ fromPath: '/lists', toPath: '/lists/2', direction: 'forward', fromDepth: 1, toDepth: 2 })).toBe('push')
    expect(pickTransition({ fromPath: '/lists/2', toPath: '/lists', direction: 'back', fromDepth: 2, toDepth: 1 })).toBe('pop')
    expect(pickTransition({ fromPath: '/lists', toPath: '/lists/2', direction: 'back', fromDepth: 1, toDepth: 2 })).toBe('pop')
  })

  it('telas do mesmo nível (menu) esmaecem', () => {
    expect(pickTransition({ fromPath: '/books', toPath: '/community', direction: 'forward' })).toBe('fade')
    expect(pickTransition({ fromPath: '/community', toPath: '/books', direction: 'back' })).toBe('fade')
  })
})
