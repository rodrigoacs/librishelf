import { WITHDRAWAL_DAYS, withdrawableUntil } from '../../services/withdrawalRules.js'

const DAY = 24 * 60 * 60 * 1000
const paidAt = new Date('2026-11-01T12:00:00Z')
const now = paidAt.getTime() + 3 * DAY
const base = { status: 'approved', refunded_at: null, paid_at: paidAt, provider: 'mercadopago', external_id: '123', first_charge: true }

describe('prazo de desistência', () => {
  test('7 dias a contar do pagamento', () => {
    expect(WITHDRAWAL_DAYS).toBe(7)
    expect(withdrawableUntil(base, now)).toEqual(new Date(paidAt.getTime() + 7 * DAY))
    expect(withdrawableUntil(base, paidAt.getTime() + 7 * DAY)).toBeNull()
  })

  test('sem direito: não aprovado, já reembolsado, renovação, sem pagamento no Mercado Pago', () => {
    for (const change of [
      { status: 'pending' }, { status: 'refunded' }, { refunded_at: new Date() }, { paid_at: null },
      { first_charge: false }, { provider: 'apple' }, { external_id: null }
    ]) {
      expect(withdrawableUntil({ ...base, ...change }, now)).toBeNull()
    }
    expect(withdrawableUntil(null, now)).toBeNull()
  })
})
