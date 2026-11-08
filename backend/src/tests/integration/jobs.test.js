import { db } from '../../database/connection.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import * as queue from '../../jobs/queue.js'
import { HANDLERS, PermanentJobError } from '../../jobs/registry.js'
import { runOnce, drain, scheduleRecurring, bucketOf } from '../../jobs/worker.js'

const W1 = 'teste-1'
const W2 = 'teste-2'
const jobRow = async id => (await db.query('SELECT * FROM librishelf.jobs WHERE id = $1', [id])).rows[0]
const only = types => ({ types })

async function createUser(name) {
  const { rows } = await db.query(
    "INSERT INTO librishelf.users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id",
    [name, `${name}@example.com`]
  )
  return rows[0].id
}

// Handlers só destes testes; saem no fim
const calls = []
let failuresLeft = 0
HANDLERS['test.ok'] = async (payload) => { calls.push(payload); return { ok: true } }
HANDLERS['test.flaky'] = async () => {
  if (failuresLeft-- > 0) throw new Error('instável')
  return { ok: true }
}
HANDLERS['test.broken'] = async () => { throw new PermanentJobError('dado inválido') }
HANDLERS['test.always'] = async () => { throw new Error('sempre falha') }

beforeEach(clearDatabase)
afterAll(async () => {
  for (const type of ['test.ok', 'test.flaky', 'test.broken', 'test.always']) delete HANDLERS[type]
  await closeDatabase()
})

describe('fila', () => {
  test('enfileira e roda; payload chega ao handler', async () => {
    const id = await queue.enqueue('test.ok', { n: 1 })
    expect(await runOnce(W1, only(['test.ok']))).toMatchObject({ id, status: 'done' })
    expect(calls.at(-1)).toEqual({ n: 1 })
    const row = await jobRow(id)
    expect(row.done_at).not.toBeNull()
    expect(row.locked_by).toBeNull()
    expect(await runOnce(W1, only(['test.ok']))).toBeNull()
  })

  test('dedupe_key: o mesmo job entra uma vez só', async () => {
    expect(await queue.enqueue('test.ok', {}, { dedupeKey: 'k:1' })).not.toBeNull()
    expect(await queue.enqueue('test.ok', {}, { dedupeKey: 'k:1' })).toBeNull()
  })

  test('run_at no futuro espera', async () => {
    await queue.enqueue('test.ok', {}, { runAt: new Date(Date.now() + 60_000) })
    expect(await runOnce(W1, only(['test.ok']))).toBeNull()
  })

  test('dois workers ao mesmo tempo nunca pegam o mesmo job', async () => {
    for (let i = 0; i < 20; i++) await queue.enqueue('test.ok', { i })
    const claims = await Promise.all(Array.from({ length: 30 }, (_, i) => queue.claim(i % 2 ? W1 : W2, only(['test.ok']))))
    const ids = claims.filter(Boolean).map(job => job.id)
    expect(ids.length).toBe(20)
    expect(new Set(ids).size).toBe(20)
  })

  test('falha temporária: tenta de novo depois, com espera crescente', async () => {
    failuresLeft = 1
    const id = await queue.enqueue('test.flaky')
    expect((await runOnce(W1, only(['test.flaky']))).status).toBe('retry')

    let row = await jobRow(id)
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('instável')
    expect(new Date(row.run_at).getTime()).toBeGreaterThan(Date.now() + 20_000)
    expect(await runOnce(W1, only(['test.flaky']))).toBeNull()

    await db.query('UPDATE librishelf.jobs SET run_at = now() WHERE id = $1', [id])
    expect((await runOnce(W1, only(['test.flaky']))).status).toBe('done')
    row = await jobRow(id)
    expect(row.attempts).toBe(2)
    expect(row.last_error).toBeNull()
  })

  test('backoff: 30s, 1min, 2min… até 1h', () => {
    expect([1, 2, 3, 4].map(queue.backoffSeconds)).toEqual([30, 60, 120, 240])
    expect(queue.backoffSeconds(20)).toBe(3600)
  })

  test('desiste ao chegar em max_attempts', async () => {
    const id = await queue.enqueue('test.always', {}, { maxAttempts: 2 })
    expect((await runOnce(W1, only(['test.always']))).status).toBe('retry')
    await db.query('UPDATE librishelf.jobs SET run_at = now() WHERE id = $1', [id])
    expect((await runOnce(W1, only(['test.always']))).status).toBe('failed')
    expect((await jobRow(id)).failed_at).not.toBeNull()
  })

  test('erro permanente e tipo sem handler: desiste na hora', async () => {
    const broken = await queue.enqueue('test.broken')
    const unknown = await queue.enqueue('test.nao_existe')
    expect((await runOnce(W1, only(['test.broken']))).status).toBe('failed')
    expect((await runOnce(W1, only(['test.nao_existe']))).status).toBe('failed')
    expect((await jobRow(broken)).attempts).toBe(1)
    expect((await jobRow(unknown)).last_error).toMatch(/sem handler/)
  })

  test('lock de worker que morreu vence e o job volta', async () => {
    const id = await queue.enqueue('test.ok')
    expect(await queue.claim(W1, only(['test.ok']))).toMatchObject({ id })
    expect(await queue.claim(W2, only(['test.ok']))).toBeNull()

    await db.query("UPDATE librishelf.jobs SET locked_at = now() - interval '11 minutes' WHERE id = $1", [id])
    expect(await queue.claim(W2, only(['test.ok']))).toMatchObject({ id, attempts: 2 })
  })

  test('o worker antigo não conclui um job que outro pegou', async () => {
    const id = await queue.enqueue('test.ok')
    const job = await queue.claim(W1)
    await db.query("UPDATE librishelf.jobs SET locked_at = now() - interval '11 minutes' WHERE id = $1", [id])
    await queue.claim(W2)
    await queue.complete(job, W1)
    expect((await jobRow(id)).done_at).toBeNull()
  })
})

describe('periódicos', () => {
  test('intervalo: início arredondado', () => {
    const at = Date.parse('2026-11-02T14:47:12Z')
    expect(bucketOf(15, at)).toBe('2026-11-02T14:45')
    expect(bucketOf(24 * 60, at)).toBe('2026-11-02T00:00')
  })

  test('agendar duas vezes no mesmo intervalo não duplica', async () => {
    const at = Date.parse('2026-11-02T14:47:12Z')
    // Pacote 30: o 9º periódico (backups.sweep) já agendado neste intervalo;
    // pacote 37 acrescentou o 10º (errors.digest, a cada 15 minutos)
    await queue.enqueue('backups.sweep', {}, { dedupeKey: `backups.sweep:${bucketOf(60, at)}` })
    expect(await scheduleRecurring(at)).toBe(9)
    expect(await scheduleRecurring(at)).toBe(0)
    expect(await scheduleRecurring(at + 5 * 60_000)).toBe(2) // só os de 5 minutos viraram
  })

  test('limpeza: some com terminados há mais de 30 dias, falhados ficam', async () => {
    const old = await queue.enqueue('test.ok')
    const failed = await queue.enqueue('test.ok')
    await db.query("UPDATE librishelf.jobs SET done_at = now() - interval '31 days' WHERE id = $1", [old])
    await db.query("UPDATE librishelf.jobs SET failed_at = now() - interval '31 days' WHERE id = $1", [failed])
    await queue.enqueue('jobs.cleanup')
    await drain(W1, only(['jobs.cleanup']))
    expect(await jobRow(old)).toBeUndefined()
    expect(await jobRow(failed)).toBeDefined()
  })
})

describe('entitlements.expire', () => {
  test('vencido vira expired; vitalício e em dia ficam', async () => {
    const user = await createUser('ana')
    const insert = (kind, endsAt) => db.query(
      `INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at)
       VALUES ($1, $2, 'grant', now() - interval '20 days', ${endsAt}) RETURNING id`,
      [user, kind]
    ).then(res => res.rows[0].id)

    const trial = await insert('trial', "now() - interval '1 minute'")
    const annual = await insert('annual', "now() + interval '1 day'")
    const lifetime = await insert('vanguarda', 'NULL')

    await queue.enqueue('entitlements.expire')
    const [result] = await drain(W1, only(['entitlements.expire']))
    expect(result.result).toEqual({ expired: 1 })

    const { rows } = await db.query('SELECT id, status FROM librishelf.entitlements ORDER BY id')
    expect(Object.fromEntries(rows.map(r => [r.id, r.status]))).toEqual({ [trial]: 'expired', [annual]: 'active', [lifetime]: 'active' })
  })
})

describe('reservations.release', () => {
  test('checkout vencido devolve a vaga; em aberto e pago não', async () => {
    const [ana, bia, caio] = [await createUser('ana'), await createUser('bia'), await createUser('caio')]
    await db.query("UPDATE librishelf.offers SET slots_used = 3 WHERE code = 'founder_lifetime'")
    await db.query(
      `INSERT INTO librishelf.offer_reservations (user_id, offer_code, status, reference, expires_at, holds_slot) VALUES
        ($1, 'founder_lifetime', 'pending',   'r-vencida', now() - interval '1 minute', true),
        ($2, 'founder_lifetime', 'pending',   'r-aberta',  now() + interval '20 minutes', true),
        ($3, 'founder_lifetime', 'confirmed', 'r-paga',    now() - interval '1 hour', true)`,
      [ana, bia, caio]
    )

    await queue.enqueue('reservations.release')
    const [result] = await drain(W1, only(['reservations.release']))
    expect(result.result).toEqual({ released: 1 })

    const { rows } = await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'founder_lifetime'")
    expect(rows[0].slots_used).toBe(2)
    const status = await db.query('SELECT reference, status FROM librishelf.offer_reservations ORDER BY reference')
    expect(status.rows).toEqual([
      { reference: 'r-aberta', status: 'pending' },
      { reference: 'r-paga', status: 'confirmed' },
      { reference: 'r-vencida', status: 'released' }
    ])
  })
})
