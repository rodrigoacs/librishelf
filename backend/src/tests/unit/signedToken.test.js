import { signId, readSignedId } from '../../utils/signedToken.js'

describe('signedToken', () => {
  const previous = process.env.SECRET_KEY
  beforeAll(() => { process.env.SECRET_KEY = 'segredo-de-teste' })
  afterAll(() => { process.env.SECRET_KEY = previous })

  test('lê o id do token que assinou', () => {
    expect(readSignedId('moderate:review', signId('moderate:review', 42))).toBe(42)
  })

  test('token de outra finalidade não vale', () => {
    expect(readSignedId('unsubscribe', signId('moderate:review', 42))).toBeNull()
  })

  test('trocar o id invalida a assinatura', () => {
    const [, sig] = signId('moderate:review', 42).split('.')
    expect(readSignedId('moderate:review', `43.${sig}`)).toBeNull()
  })

  test('recusa formatos estranhos', () => {
    for (const token of [undefined, '', '42', '42.', 'abc.def', `42.${'a'.repeat(31)}`, 'x'.repeat(100)]) {
      expect(readSignedId('moderate:review', token)).toBeNull()
    }
  })

  test('com prazo: vale até vencer; o prazo não pode ser trocado', () => {
    const token = signId('moderate:review', 42, { ttlDays: 30 })
    expect(token).toMatch(/^42\.\d+\.[A-Za-z0-9_-]{32}$/)
    expect(readSignedId('moderate:review', token)).toBe(42)
    expect(readSignedId('moderate:review', token, { requireExpiry: true })).toBe(42)
    const [id, exp, sig] = token.split('.')
    expect(readSignedId('moderate:review', `${id}.${Number(exp) + 86400}.${sig}`)).toBeNull()
    expect(readSignedId('moderate:review', signId('moderate:review', 42, { ttlDays: -1 }))).toBeNull()
  })

  test('requireExpiry recusa token sem prazo', () => {
    expect(readSignedId('moderate:review', signId('moderate:review', 42), { requireExpiry: true })).toBeNull()
  })

  test('muda com a SECRET_KEY', () => {
    const token = signId('moderate:review', 7)
    process.env.SECRET_KEY = 'outra'
    expect(readSignedId('moderate:review', token)).toBeNull()
    process.env.SECRET_KEY = 'segredo-de-teste'
  })
})
