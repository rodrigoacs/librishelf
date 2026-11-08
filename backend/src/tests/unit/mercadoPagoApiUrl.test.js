import { resolveApiUrl, PRODUCTION_API_URL } from '../../services/mercadoPago.js'

// O Mercado Pago falso dos testes de ponta a ponta (e2e/fakes) só entra com
// NODE_ENV=e2e; em qualquer outro ambiente o token vai só para a API real.
describe('resolveApiUrl', () => {
  test('usa o MP_API_URL no ambiente e2e', () => {
    expect(resolveApiUrl({ NODE_ENV: 'e2e', MP_API_URL: 'http://fakes:4010/' })).toBe('http://fakes:4010')
  })

  test.each(['production', 'development', 'test', undefined])('ignora o MP_API_URL com NODE_ENV=%s', (NODE_ENV) => {
    expect(resolveApiUrl({ NODE_ENV, MP_API_URL: 'http://fakes:4010' })).toBe(PRODUCTION_API_URL)
  })

  test('sem MP_API_URL fica na API real, mesmo no e2e', () => {
    expect(resolveApiUrl({ NODE_ENV: 'e2e', MP_API_URL: '  ' })).toBe(PRODUCTION_API_URL)
  })
})
