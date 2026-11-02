import { FEATURES, FEATURE_NAMES, PRO_FEATURES, featureFlags, tierOf } from '../../config/features.js'

describe('mapa de recursos', () => {
  test('o que é grátis continua grátis', () => {
    // Nada que é grátis hoje vira pago: mudar isto é decisão de produto, não refatoração
    expect(['export', 'import', 'loans'].map(tierOf)).toEqual(['free', 'free', 'free'])
  })

  test('os quatro recursos do Pro', () => {
    expect([...PRO_FEATURES].sort()).toEqual(['auto_backup', 'collector', 'personalization', 'stats_advanced'])
  })

  test('todo recurso é free ou pro', () => {
    expect(FEATURE_NAMES.every(name => ['free', 'pro'].includes(FEATURES[name]))).toBe(true)
  })

  test('featureFlags', () => {
    expect(featureFlags(false)).toMatchObject({ export: true, collector: false })
    expect(Object.values(featureFlags(true)).every(Boolean)).toBe(true)
  })

  test('recurso desconhecido é erro', () => {
    expect(() => tierOf('anuncios')).toThrow(/Recurso desconhecido/)
  })
})
