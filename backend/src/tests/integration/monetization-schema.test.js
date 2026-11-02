import { db } from '../../database/connection.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Estrutura da migration 018: preços, limites de vaga e regras que o banco
// garante sozinho (um teste por conta, pagamento sem duplicar, registro de
// cobrança que sobrevive à exclusão da conta).

async function createUser(name) {
  const { rows } = await db.query(
    "INSERT INTO librishelf.users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id",
    [name, `${name}@example.com`]
  )
  return rows[0].id
}

let ana

beforeAll(async () => {
  await clearDatabase()
  ana = await createUser('ana')
})

afterAll(closeDatabase)

describe('ofertas', () => {
  test('seed com os preços em centavos e as vagas', async () => {
    const { rows } = await db.query('SELECT code, price_cents, duration, auto_renew, slots_total, slots_used, active FROM librishelf.offers ORDER BY code')
    const byCode = Object.fromEntries(rows.map(row => [row.code, row]))

    expect(byCode.monthly).toMatchObject({ price_cents: 690, duration: 'month', auto_renew: true, slots_total: null })
    expect(byCode.annual).toMatchObject({ price_cents: 4990, duration: 'year', auto_renew: false, slots_total: null })
    expect(byCode.founder_annual).toMatchObject({ price_cents: 3990, duration: 'year', slots_total: 100, active: false })
    expect(byCode.founder_lifetime).toMatchObject({ price_cents: 14990, duration: 'lifetime', slots_total: 100, active: false })
    expect(byCode.vanguarda).toMatchObject({ price_cents: 0, duration: 'lifetime', slots_total: 100 })
    expect(rows.every(row => row.slots_used === 0)).toBe(true)
  })

  test('o banco recusa passar do total de vagas', async () => {
    await expect(db.query("UPDATE librishelf.offers SET slots_used = 101 WHERE code = 'founder_lifetime'"))
      .rejects.toMatchObject({ constraint: 'offers_slots_limit' })
  })
})

describe('entitlements', () => {
  test('um teste por conta', async () => {
    await db.query("INSERT INTO librishelf.entitlements (user_id, kind, source, ends_at) VALUES ($1, 'trial', 'trial', now() + interval '14 days')", [ana])
    await expect(db.query("INSERT INTO librishelf.entitlements (user_id, kind, source, ends_at, status) VALUES ($1, 'trial', 'trial', now() + interval '14 days', 'expired')", [ana]))
      .rejects.toMatchObject({ code: '23505' })
  })

  test('teste sem fim e vitalício com fim são recusados', async () => {
    await expect(db.query("INSERT INTO librishelf.entitlements (user_id, kind, source) VALUES ($1, 'trial', 'trial')", [ana]))
      .rejects.toMatchObject({ constraint: 'entitlements_trial_ends' })
    await expect(db.query("INSERT INTO librishelf.entitlements (user_id, kind, source, ends_at) VALUES ($1, 'founder_lifetime', 'mercadopago', now() + interval '1 day')", [ana]))
      .rejects.toMatchObject({ constraint: 'entitlements_lifetime_open' })
  })

  test('origem das lojas já é aceita', async () => {
    const { rowCount } = await db.query(
      "INSERT INTO librishelf.entitlements (user_id, kind, source, ends_at, external_id) VALUES ($1, 'annual', 'apple', now() + interval '1 year', 'apple-tx-1')",
      [ana]
    )
    expect(rowCount).toBe(1)
  })
})

describe('pagamentos', () => {
  test('o mesmo pagamento externo não entra duas vezes', async () => {
    const insert = () => db.query(
      "INSERT INTO librishelf.payments (user_id, offer_code, provider, external_id, method, amount_cents, status) VALUES ($1, 'annual', 'mercadopago', 'mp-123', 'pix', 4990, 'approved')",
      [ana]
    )
    await insert()
    await expect(insert()).rejects.toMatchObject({ constraint: 'payments_external_unique' })
  })

  test('excluir a conta mantém o registro de cobrança, sem o usuário', async () => {
    const bia = await createUser('bia')
    await db.query(
      "INSERT INTO librishelf.payments (user_id, offer_code, provider, external_id, method, amount_cents, status) VALUES ($1, 'monthly', 'mercadopago', 'mp-456', 'card', 690, 'approved')",
      [bia]
    )
    await db.query("INSERT INTO librishelf.entitlements (user_id, kind, source, ends_at) VALUES ($1, 'monthly', 'mercadopago', now() + interval '1 month')", [bia])
    await db.query("INSERT INTO librishelf.user_badges (user_id, badge) VALUES ($1, 'vanguarda')", [bia])

    await db.query('DELETE FROM librishelf.users WHERE id = $1', [bia])

    const payment = await db.query("SELECT user_id, amount_cents FROM librishelf.payments WHERE external_id = 'mp-456'")
    expect(payment.rows).toEqual([{ user_id: null, amount_cents: 690 }])
    expect((await db.query('SELECT 1 FROM librishelf.entitlements WHERE user_id = $1', [bia])).rowCount).toBe(0)
    expect((await db.query('SELECT 1 FROM librishelf.user_badges WHERE user_id = $1', [bia])).rowCount).toBe(0)
  })
})

describe('webhooks e jobs', () => {
  test('evento repetido do mesmo provedor é ignorado com ON CONFLICT', async () => {
    const insert = () => db.query(
      "INSERT INTO librishelf.webhook_events (provider, event_id, topic, resource_id, payload) VALUES ('mercadopago', '12345', 'payment', '999', '{}') ON CONFLICT (provider, event_id) DO NOTHING"
    )
    expect((await insert()).rowCount).toBe(1)
    expect((await insert()).rowCount).toBe(0)
  })

  test('job com a mesma dedupe_key vira um só', async () => {
    const insert = () => db.query(
      "INSERT INTO librishelf.jobs (type, dedupe_key) VALUES ('renewal_reminder', 'renewal:1') ON CONFLICT (dedupe_key) DO NOTHING"
    )
    expect((await insert()).rowCount).toBe(1)
    expect((await insert()).rowCount).toBe(0)
  })
})
