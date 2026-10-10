/**
 * Aplica o schema e as migrations pendentes.
 *
 *   npm run db:migrate                                  (local, lê src/.env)
 *   docker compose exec backend npm run db:migrate:docker
 *
 * - Banco sem o schema `librishelf`: roda db/schema.sql (já inclui todas as
 *   migrations e as registra em schema_migrations).
 * - Banco existente: roda, em ordem e cada uma numa transação, os arquivos de
 *   db/migrations/ que ainda não estão em librishelf.schema_migrations.
 *
 * Scripts destrutivos ficam em db/manual/ e nunca rodam por aqui.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { db } from './connection.js'
import logger from '../utils/logger.js'

const DB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db')
const SCHEMA_FILE = path.join(DB_DIR, 'schema.sql')
const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations')

async function schemaExists(client) {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'librishelf'"
  )
  return rows.length > 0
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS librishelf.schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamp without time zone NOT NULL DEFAULT now()
    )
  `)
}

async function listMigrations() {
  const files = await fs.readdir(MIGRATIONS_DIR)
  return files.filter(file => file.endsWith('.sql')).sort()
}

async function runInTransaction(client, sql) {
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

/**
 * Lista o que falta aplicar sem alterar nada: ['schema.sql'] para banco vazio,
 * ou os nomes das migrations pendentes. Usado no boot do servidor.
 */
export async function pendingMigrations() {
  const client = await db.connect()

  try {
    if (!(await schemaExists(client))) return ['schema.sql']

    const { rows: [{ exists }] } = await client.query(
      "SELECT to_regclass('librishelf.schema_migrations') IS NOT NULL AS exists"
    )
    const done = new Set()
    if (exists) {
      const { rows } = await client.query('SELECT version FROM librishelf.schema_migrations')
      rows.forEach(row => done.add(row.version))
    }

    return (await listMigrations())
      .map(file => file.replace(/\.sql$/, ''))
      .filter(version => !done.has(version))
  } finally {
    client.release()
  }
}

export async function migrate() {
  const client = await db.connect()

  try {
    if (!(await schemaExists(client))) {
      logger.info('Schema librishelf não encontrado; criando a partir de db/schema.sql')
      await runInTransaction(client, await fs.readFile(SCHEMA_FILE, 'utf8'))
      return { created: true, applied: [] }
    }

    await ensureMigrationsTable(client)

    const { rows } = await client.query('SELECT version FROM librishelf.schema_migrations')
    const done = new Set(rows.map(row => row.version))
    const applied = []

    for (const file of await listMigrations()) {
      const version = file.replace(/\.sql$/, '')
      if (done.has(version)) continue

      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      await runInTransaction(client, `${sql}\nINSERT INTO librishelf.schema_migrations (version) VALUES ('${version.replace(/'/g, "''")}');`)

      logger.info('Migration aplicada', { version })
      applied.push(version)
    }

    return { created: false, applied }
  } finally {
    client.release()
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCli) {
  migrate()
    .then(({ created, applied }) => {
      if (created) logger.info('Banco criado do zero com o schema atual')
      else if (applied.length === 0) logger.info('Nenhuma migration pendente')
      return db.end()
    })
    .catch(async (err) => {
      logger.error('Falha ao migrar', { message: err.message })
      await db.end().catch(() => { })
      process.exit(1)
    })
}