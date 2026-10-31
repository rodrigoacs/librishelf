import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useDrag ouve pointermove/pointerup na janela; aqui a "janela" é um EventTarget
vi.mock('vue', () => ({ onBeforeUnmount: () => {} }))
const { useDrag } = await import('./useDrag.js')

function pointer(type, { y, t, id = 1 }) {
  const event = new Event(type)
  for (const [key, value] of Object.entries({ pointerId: id, pointerType: 'touch', button: 0, clientX: 100, clientY: y, timeStamp: t })) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

describe('arrastar (folha, gaveta)', () => {
  let ended
  beforeEach(() => {
    globalThis.window = new EventTarget()
    ended = null
  })
  afterEach(() => { delete globalThis.window })

  const start = () => {
    const drag = useDrag({ axis: 'y', onEnd: result => { ended = result } })
    drag.onPointerDown(pointer('pointerdown', { y: 100, t: 0 }))
    return drag
  }

  it('puxão rápido num quadro só (movimentos juntados): conta a distância e a velocidade desde o toque', () => {
    start()
    window.dispatchEvent(pointer('pointermove', { y: 160, t: 16 }))
    window.dispatchEvent(pointer('pointerup', { y: 160, t: 24 }))
    expect(ended.distance).toBe(52) // 60 andados − 8 de folga
    expect(ended.velocity).toBeGreaterThan(2) // (52 + 8) / 16 ms
  })

  it('devagar, em vários quadros: distância acumulada e velocidade baixa', () => {
    start()
    for (let i = 1; i <= 10; i++) window.dispatchEvent(pointer('pointermove', { y: 100 + i * 12, t: i * 40 }))
    window.dispatchEvent(pointer('pointerup', { y: 220, t: 420 }))
    expect(ended.distance).toBe(112)
    expect(ended.velocity).toBeLessThan(0.5)
  })

  it('dentro da folga não vira gesto (continua clique)', () => {
    start()
    window.dispatchEvent(pointer('pointermove', { y: 105, t: 16 }))
    window.dispatchEvent(pointer('pointerup', { y: 105, t: 30 }))
    expect(ended).toBeNull()
  })
})
