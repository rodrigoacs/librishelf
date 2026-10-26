import { EventEmitter } from 'node:events'
import * as metrics from '../../utils/metrics.js'

beforeEach(() => metrics.resetMetrics())

test('tempo médio e p95', () => {
  for (let ms = 1; ms <= 100; ms++) metrics.timing('x', ms)
  expect(metrics.timingStats('x')).toEqual({ samples: 100, avgMs: 51, p95Ms: 96 })
  expect(metrics.timingStats('nada')).toEqual({ samples: 0, avgMs: null, p95Ms: null })
})

test('erro 500 guarda rota sem ids e corta a mensagem', () => {
  metrics.serverError({ method: 'GET', path: '/library/123/review', context: 'c', message: 'x'.repeat(500) })
  const [error] = metrics.recentErrors()
  expect(error.path).toBe('/library/:id/review')
  expect(error.message).toHaveLength(300)
})

test('só os 50 erros mais recentes', () => {
  for (let i = 0; i < 60; i++) metrics.serverError({ message: `e${i}` })
  expect(metrics.recentErrors()).toHaveLength(50)
  expect(metrics.recentErrors()[0].message).toBe('e59')
})

test('IPs que bateram no limite, somados por código', () => {
  metrics.rateLimited('RATE_LIMIT_LOGIN', '1.1.1.1')
  metrics.rateLimited('RATE_LIMIT_LOGIN', '1.1.1.1')
  metrics.rateLimited('RATE_LIMIT', '1.1.1.1')
  metrics.rateLimited('RATE_LIMIT', '2.2.2.2')
  expect(metrics.topRateLimitedIps()).toEqual([
    { ip: '1.1.1.1', total: 3, codes: { RATE_LIMIT_LOGIN: 2, RATE_LIMIT: 1 } },
    { ip: '2.2.2.2', total: 1, codes: { RATE_LIMIT: 1 } }
  ])
})

test('track conta só respostas de sucesso e aceita evento calculado', () => {
  const run = (middleware, req, status) => {
    const res = new EventEmitter()
    res.statusCode = status
    middleware(req, res, () => {})
    res.emit('finish')
  }
  const byVia = metrics.track(req => (req.query.via === 'scan' ? 'isbn.scan' : 'isbn.typed'))
  run(byVia, { query: { via: 'scan' } }, 200)
  run(byVia, { query: {} }, 200)
  run(byVia, { query: {} }, 404)
  run(metrics.track(() => null), { query: {} }, 200)
  expect(metrics.pendingCounts()).toEqual({ 'isbn.scan': 1, 'isbn.typed': 1 })
})
