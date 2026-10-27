import { createTtlCache } from '../../utils/ttlCache.js'

function clock(start = 1000) {
  let t = start
  return { now: () => t, advance: ms => { t += ms } }
}

describe('createTtlCache', () => {
  it('guarda até vencer e depois calcula de novo', async () => {
    const time = clock()
    const cache = createTtlCache({ ttlMs: 100, now: time.now })
    let calls = 0
    const compute = async () => ++calls

    expect(await cache.wrap('a', compute)).toBe(1)
    expect(await cache.wrap('a', compute)).toBe(1)
    time.advance(99)
    expect(await cache.wrap('a', compute)).toBe(1)
    time.advance(1)
    expect(await cache.wrap('a', compute)).toBe(2)
  })

  it('ttlMs = 0 desliga; ligar depois começa vazio', async () => {
    const cache = createTtlCache({ ttlMs: 0 })
    let calls = 0
    await cache.wrap('a', async () => ++calls)
    await cache.wrap('a', async () => ++calls)
    expect(calls).toBe(2)
    expect(cache.size).toBe(0)

    cache.ttlMs = 1000
    await cache.wrap('a', async () => ++calls)
    await cache.wrap('a', async () => ++calls)
    expect(calls).toBe(3)
  })

  it('chamadas simultâneas compartilham a mesma consulta', async () => {
    const cache = createTtlCache({ ttlMs: 1000 })
    let calls = 0
    let release
    const gate = new Promise(resolve => { release = resolve })
    const compute = async () => { calls++; await gate; return 'ok' }

    const both = Promise.all([cache.wrap('k', compute), cache.wrap('k', compute)])
    release()
    expect(await both).toEqual(['ok', 'ok'])
    expect(calls).toBe(1)
  })

  it('erro não fica guardado', async () => {
    const cache = createTtlCache({ ttlMs: 1000 })
    await expect(cache.wrap('k', async () => { throw new Error('banco fora') })).rejects.toThrow('banco fora')
    expect(await cache.wrap('k', async () => 'voltou')).toBe('voltou')
  })

  it('forget apaga por prefixo; maxEntries tira as mais antigas', async () => {
    const cache = createTtlCache({ ttlMs: 1000, maxEntries: 2 })
    await cache.wrap('1:a', async () => 1)
    await cache.wrap('1:b', async () => 1)
    await cache.wrap('2:a', async () => 1)
    expect(cache.size).toBe(2)

    cache.forget('1:')
    expect(cache.size).toBe(1)
    let calls = 0
    await cache.wrap('2:a', async () => ++calls)
    expect(calls).toBe(0)
  })
})
