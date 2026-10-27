/**
 * Acerta books.cover_version com os arquivos de capa da pasta UPLOAD_DIR:
 *   - livro com {id}.avif ou {id}.jpg e sem versão → ganha uma versão
 *   - livro com versão e sem arquivo → volta a null (sem capa)
 *
 * Roda sozinho logo depois da migration 016 (só a primeira parte, na mesma
 * transação) e pode ser rodado à mão:
 *
 *   npm run covers:sync              (local, lê src/.env)
 *   docker compose exec backend npm run covers:sync:docker
 *
 * Trava: se a pasta não existe ou não tem nenhuma capa mas o banco tem livros
 * com capa, não anula nada (pasta errada ou volume não montado) — só com --force.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import UPLOAD_DIR from '../config/uploadDir.js'
import logger from '../utils/logger.js'

const COVER_FILE = /^(\d{1,10})\.(avif|jpg)$/

/** Ids dos livros que têm arquivo de capa na pasta (null se a pasta não existe). */
export async function coverIdsOnDisk(dir = UPLOAD_DIR) {
  let files
  try {
    files = await fs.readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  const ids = new Set()
  for (const file of files) {
    const match = COVER_FILE.exec(file)
    if (match) ids.add(Number(match[1]))
  }
  return [...ids].filter(id => id <= 2147483647)
}

/**
 * @param client conexão do pg (dentro ou fora de transação)
 * @param options.clear também anula a versão de quem não tem mais arquivo
 * @param options.force anula mesmo com a pasta vazia/inexistente
 */
export async function syncCoverVersions(client, { dir = UPLOAD_DIR, clear = true, force = false } = {}) {
  const ids = await coverIdsOnDisk(dir)
  const found = ids ?? []

  const { rowCount: set } = await client.query(`
    UPDATE librishelf.books
    SET cover_version = nextval('librishelf.cover_version_seq')::int
    WHERE id = ANY($1::int[]) AND cover_version IS NULL
  `, [found])

  let cleared = 0
  let skippedClear = false
  if (clear) {
    if (found.length === 0 && !force) {
      const { rows: [{ n }] } = await client.query(
        'SELECT count(*)::int AS n FROM librishelf.books WHERE cover_version IS NOT NULL'
      )
      skippedClear = n > 0
    }
    if (!skippedClear) {
      ;({ rowCount: cleared } = await client.query(`
        UPDATE librishelf.books SET cover_version = NULL
        WHERE cover_version IS NOT NULL AND NOT (id = ANY($1::int[]))
      `, [found]))
    }
  }

  return { dir, dirExists: ids !== null, files: found.length, set, cleared, skippedClear }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCli) {
  const { db } = await import('./connection.js')
  const force = process.argv.includes('--force')
  try {
    const result = await syncCoverVersions(db, { force })
    if (!result.dirExists) logger.warn('Pasta de capas não encontrada', { dir: result.dir })
    if (result.skippedClear) {
      logger.warn('Nenhuma capa na pasta, mas o banco tem livros com capa: nada foi anulado. Confira UPLOAD_DIR (ou use --force).', { dir: result.dir })
    }
    logger.info('Capas conferidas', { dir: result.dir, arquivos: result.files, marcadas: result.set, anuladas: result.cleared })
    await db.end()
  } catch (err) {
    logger.error('Falha ao conferir capas', { message: err.message })
    await db.end().catch(() => { })
    process.exit(1)
  }
}
