import fs from 'fs/promises'
import { gunzipSync } from 'zlib'
import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'
import { drain } from '../../jobs/worker.js'
import { RECURRING } from '../../jobs/registry.js'
import { backupPath, sweep } from '../../services/backupService.js'

// Backup automático (pacote 30): com Pro escreve; sem Pro lê e baixa, a
// escrita recebe PRO_REQUIRED e nada é excluído.
const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const W = 'teste-backup'
const run = () => drain(W, { types: ['backups.sweep', 'backup.create', 'email.send'] })

async function signUp(name) {
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const setPro = (name, on) => db.query(
  `UPDATE librishelf.entitlements SET ends_at = now() + ($2 || ' days')::interval WHERE user_id = $1`, [ids[name], on ? '30' : '-1'])

const binary = (res, cb) => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['pro', 'livre']) await signUp(name)
  await db.query(
    `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
     VALUES ($1, 'trial', 'trial', 'active', now() - interval '1 day', now() + interval '30 days')`, [ids.pro])
  for (const title of ['Duna', 'Fundação']) {
    await db.query('INSERT INTO librishelf.books (title, user_id) VALUES ($1, $2)', [title, ids.pro])
  }
  testOutbox().length = 0
})

afterAll(async () => {
  await fs.rm(backupPath(ids.pro, 0).replace(/\/[^/]+$/, ''), { recursive: true, force: true })
  await closeDatabase()
})

describe('backup automático', () => {
  test('o periódico está registrado (de hora em hora)', () => {
    expect(RECURRING).toContainEqual({ type: 'backups.sweep', everyMinutes: 60 })
  })

  test('padrão: desligado e sem backups', async () => {
    const res = await request(app).get('/backups').set(auth('livre'))
    expect(res.body).toEqual({ settings: { enabled: false, frequency: 'weekly', notify: true, nextRunAt: null }, backups: [], keep: 5 })
  })

  test('sem Pro: ligar recebe PRO_REQUIRED', async () => {
    const res = await request(app).put('/backups/settings').set(auth('livre')).send({ enabled: true })
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'PRO_REQUIRED', params: { feature: 'auto_backup' } })
    expect((await request(app).post('/backups/run').set(auth('livre'))).body.code).toBe('PRO_REQUIRED')
  })

  test('com Pro: ligar agenda para já; a varredura gera, avisa e agenda o próximo', async () => {
    let res = await request(app).put('/backups/settings').set(auth('pro')).send({ enabled: true, frequency: 'weekly', notify: true })
    expect(res.body.settings).toMatchObject({ enabled: true, frequency: 'weekly', notify: true })
    expect(new Date(res.body.settings.nextRunAt).getTime()).toBeLessThanOrEqual(Date.now())

    expect(await sweep()).toEqual({ queued: 1 })
    expect(await sweep()).toEqual({ queued: 0 }) // mesmo vencimento, mesma dedupe_key
    const results = await run()
    expect(results.map(r => r.type)).toEqual(['backup.create', 'email.send'])

    res = await request(app).get('/backups').set(auth('pro'))
    expect(res.body.backups).toHaveLength(1)
    expect(res.body.backups[0]).toMatchObject({ trigger: 'scheduled', books: 2 })
    const next = new Date(res.body.settings.nextRunAt).getTime()
    expect(next - Date.now()).toBeGreaterThan(6.9 * 86400000)

    const [mail] = testOutbox().filter(m => m.to === 'pro@example.com')
    expect(mail.subject).toBe('Seu backup do Librishelf está pronto')
    expect(mail.text).toContain('2 livros')
    expect(mail.text).toContain('/settings#settings-backup')
  })

  test('o arquivo é a exportação JSON, em gzip, e só a dona baixa', async () => {
    const { body: { backups: [backup] } } = await request(app).get('/backups').set(auth('pro'))
    const res = await request(app).get(`/backups/${backup.id}/download`).set(auth('pro')).buffer(true).parse(binary)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/librishelf-backup-\d{4}-\d{2}-\d{2}\.json\.gz/)
    const data = JSON.parse(gunzipSync(res.body).toString())
    expect(data.app).toBe('Librishelf')
    expect(data.books.map(b => b.title).sort()).toEqual(['Duna', 'Fundação'])
    expect(data.collection).toEqual({ loans: [], copies: [] })

    expect((await request(app).get(`/backups/${backup.id}/download`).set(auth('livre'))).status).toBe(404)
  })

  test('backup agora: um por hora', async () => {
    expect((await request(app).post('/backups/run').set(auth('pro'))).status).toBe(202)
    const again = await request(app).post('/backups/run').set(auth('pro'))
    expect(again.status).toBe(429)
    expect(again.body).toMatchObject({ code: 'BACKUP_TOO_SOON', params: { minutes: 60 } })
    await run()
    expect((await request(app).get('/backups').set(auth('pro'))).body.backups[0].trigger).toBe('manual')
  })

  test('guarda só os mais recentes (BACKUP_KEEP)', async () => {
    process.env.BACKUP_KEEP = '2'
    try {
      const { create } = await import('../../services/backupService.js')
      await create({ userId: ids.pro, trigger: 'manual' })
      const { rows } = await db.query('SELECT id FROM librishelf.backups WHERE user_id = $1 ORDER BY id', [ids.pro])
      expect(rows).toHaveLength(2)
      const files = await fs.readdir(backupPath(ids.pro, 0).replace(/\/[^/]+$/, ''))
      expect(files.sort()).toEqual(rows.map(r => `${r.id}.json.gz`).sort())
    } finally {
      delete process.env.BACKUP_KEEP
    }
  })

  test('sem Pro: o agendamento espera, os backups ficam para baixar e a escrita é recusada', async () => {
    await setPro('pro', false)
    try {
      await db.query('UPDATE librishelf.backup_settings SET next_run_at = now() - interval \'1 hour\' WHERE user_id = $1', [ids.pro])
      expect(await sweep()).toEqual({ queued: 0 })

      const { body } = await request(app).get('/backups').set(auth('pro'))
      expect(body.backups).toHaveLength(2)
      expect((await request(app).get(`/backups/${body.backups[0].id}/download`).set(auth('pro'))).status).toBe(200)
      expect((await request(app).put('/backups/settings').set(auth('pro')).send({ enabled: false })).body.code).toBe('PRO_REQUIRED')
    } finally {
      await setPro('pro', true)
    }
  })

  test('sem Pro: excluir um backup continua permitido', async () => {
    const before = (await request(app).get('/backups').set(auth('pro'))).body.backups
    const last = before[before.length - 1]
    await setPro('pro', false)
    try {
      expect((await request(app).delete(`/backups/${last.id}`).set(auth('pro'))).status).toBe(204)
      await expect(fs.access(backupPath(ids.pro, last.id))).rejects.toThrow()
    } finally {
      await setPro('pro', true)
    }
    // Repõe um para o teste seguinte
    const { create } = await import('../../services/backupService.js')
    await create({ userId: ids.pro, trigger: 'manual' })
  })

  test('com Pro: excluir um backup tira o arquivo; opção inválida é recusada', async () => {
    const { body } = await request(app).get('/backups').set(auth('pro'))
    const [first] = body.backups
    expect((await request(app).delete(`/backups/${first.id}`).set(auth('pro'))).status).toBe(204)
    await expect(fs.access(backupPath(ids.pro, first.id))).rejects.toThrow()
    expect((await request(app).put('/backups/settings').set(auth('pro')).send({ frequency: 'daily' })).body)
      .toMatchObject({ code: 'BACKUP_OPTION_INVALID', params: { field: 'frequency' } })
    expect((await request(app).put('/backups/settings').set(auth('pro')).send({ enabled: 'sim' })).body.code).toBe('BACKUP_OPTION_INVALID')
  })

  test('aviso desligado: não manda e-mail', async () => {
    testOutbox().length = 0
    await request(app).put('/backups/settings').set(auth('pro')).send({ notify: false })
    await db.query("UPDATE librishelf.jobs SET dedupe_key = NULL WHERE type = 'backup.create'")
    const { create } = await import('../../services/backupService.js')
    await create({ userId: ids.pro, trigger: 'manual' })
    await run()
    expect(testOutbox()).toHaveLength(0)
  })
})
