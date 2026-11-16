import { describe, expect, it } from 'vitest'
import { firstVisit, visitKey } from './publicVisit.js'

const memory = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

describe('firstVisit', () => {
  it('conta uma vez por página e por dia (nome sem diferença de maiúsculas)', () => {
    const storage = memory()
    expect(firstVisit(storage, 'Fulano', '2026-11-12')).toBe(true)
    expect(firstVisit(storage, 'fulano', '2026-11-12')).toBe(false)
    expect(firstVisit(storage, 'Fulano', '2026-11-13')).toBe(true)
    expect(firstVisit(storage, 'Beltrano', '2026-11-12')).toBe(true)
    expect(visitKey('Fulano', '2026-11-12')).toBe('librishelf.visit.fulano.2026-11-12')
  })

  it('sem armazenamento (bloqueado) não conta', () => {
    const blocked = { getItem: () => { throw new Error('bloqueado') }, setItem: () => {} }
    expect(firstVisit(blocked, 'Fulano', '2026-11-12')).toBe(false)
    expect(firstVisit(() => { throw new Error('SecurityError') }, 'Fulano', '2026-11-12')).toBe(false)
  })
})
