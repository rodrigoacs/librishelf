/**
 * Cache em memória com validade curta, para resultados caros de calcular e
 * baratos de conferir (classificações da comunidade). Cada processo tem o seu;
 * nada aqui sobrevive a um reinício e nada é compartilhado entre réplicas.
 *
 *   const cache = createTtlCache({ ttlMs: 60_000, maxEntries: 5000 })
 *   const value = await cache.wrap('chave', () => consultaCara())
 *
 * - ttlMs = 0 desliga (wrap sempre chama a função). Os testes começam assim.
 * - Ao passar de maxEntries, saem as entradas mais antigas (ordem de inserção).
 * - Chamadas simultâneas com a mesma chave compartilham a mesma consulta.
 * - Erro não fica guardado: a próxima chamada tenta de novo.
 */
export function createTtlCache({ ttlMs, maxEntries = 5000, now = Date.now } = {}) {
  const entries = new Map()
  let ttl = ttlMs

  function sweep() {
    const t = now()
    for (const [key, entry] of entries) {
      if (entry.expires <= t) entries.delete(key)
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
  }

  return {
    get ttlMs() { return ttl },
    set ttlMs(value) { ttl = value; entries.clear() },
    get size() { return entries.size },

    async wrap(key, compute) {
      if (!ttl) return compute()

      const t = now()
      const hit = entries.get(key)
      if (hit && hit.expires > t) return hit.promise

      const promise = Promise.resolve().then(compute)
      entries.set(key, { promise, expires: t + ttl })
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key)
      })
      if (entries.size > maxEntries) sweep()
      return promise
    },

    /** Apaga as chaves que começam com o prefixo (ex.: tudo de um usuário). */
    forget(prefix) {
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },

    clear() { entries.clear() }
  }
}
