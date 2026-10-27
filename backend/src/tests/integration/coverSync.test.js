import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { syncCoverVersions, coverIdsOnDisk } from '../../database/coverSync.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

// Conferência das capas em disco (migration 016 e npm run covers:sync)
let dir
let token
const ids = []
const versionOf = async id => (await db.query('SELECT cover_version FROM librishelf.books WHERE id = $1', [id])).rows[0].cover_version

beforeAll(async () => {
  await clearDatabase()
  await request(app).post('/auth/register').send({ username: 'capas', password: 'senha12345', email: 'capas@example.com' })
  token = tokenFrom(await request(app).post('/auth/login').send({ username: 'capas', password: 'senha12345' }))
  for (const title of ['Um', 'Dois', 'Três']) {
    const res = await request(app).post('/library').set({ Authorization: `Bearer ${token}` }).field({ title, authors: 'Autor' })
    ids.push(res.body.bookId)
  }
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'librishelf-covers-'))
})

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
  await closeDatabase()
})

describe('syncCoverVersions', () => {
  it('lê só nomes {id}.avif/{id}.jpg; pasta inexistente → null', async () => {
    await fs.writeFile(path.join(dir, `${ids[0]}.avif`), 'x')
    await fs.writeFile(path.join(dir, `${ids[0]}.jpg`), 'x')
    await fs.writeFile(path.join(dir, `${ids[1]}.jpg`), 'x')
    await fs.writeFile(path.join(dir, 'notas.txt'), 'x')
    expect((await coverIdsOnDisk(dir)).sort((a, b) => a - b)).toEqual([ids[0], ids[1]])
    expect(await coverIdsOnDisk(path.join(dir, 'nao-existe'))).toBeNull()
  })

  it('marca quem tem arquivo, sem mexer em quem já tinha versão', async () => {
    const first = await syncCoverVersions(db, { dir, clear: false })
    expect(first).toMatchObject({ files: 2, set: 2, cleared: 0 })
    const v0 = await versionOf(ids[0])
    expect(v0).toEqual(expect.any(Number))
    expect(await versionOf(ids[2])).toBeNull()

    const again = await syncCoverVersions(db, { dir, clear: false })
    expect(again.set).toBe(0)
    expect(await versionOf(ids[0])).toBe(v0)
  })

  it('anula quem perdeu o arquivo', async () => {
    await fs.rm(path.join(dir, `${ids[1]}.jpg`))
    const result = await syncCoverVersions(db, { dir })
    expect(result).toMatchObject({ set: 0, cleared: 1 })
    expect(await versionOf(ids[1])).toBeNull()
    expect(await versionOf(ids[0])).toEqual(expect.any(Number))
  })

  it('pasta vazia ou errada não anula nada sem --force', async () => {
    const empty = path.join(dir, 'vazia')
    await fs.mkdir(empty)
    const result = await syncCoverVersions(db, { dir: empty })
    expect(result).toMatchObject({ files: 0, cleared: 0, skippedClear: true })
    expect(await versionOf(ids[0])).toEqual(expect.any(Number))

    const forced = await syncCoverVersions(db, { dir: empty, force: true })
    expect(forced.cleared).toBe(1)
    expect(await versionOf(ids[0])).toBeNull()
  })
})
