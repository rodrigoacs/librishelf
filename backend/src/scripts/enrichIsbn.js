/**
 * Preenche ol_work_key / ol_edition_key dos livros que têm ISBN válido mas
 * ainda não foram ligados ao Open Library. Com a chave da obra, edições e
 * traduções diferentes do mesmo livro se encontram na comunidade.
 *
 *   npm run enrich:isbn                     (local, lê src/.env)
 *   npm run enrich:isbn -- --dry-run        (só mostra o que faria)
 *   npm run enrich:isbn -- --limit=50
 *   docker compose exec backend npm run enrich:isbn:docker
 *
 * Não altera título, autores, editora nem datas: só as duas chaves.
 * Respeita o limite do Open Library (defina OPENLIBRARY_CONTACT para 3 req/s).
 */
import { db } from '../database/connection.js'
import { lookupIsbn } from '../services/openLibraryService.js'
import logger from '../utils/logger.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null

async function main() {
  const { rows } = await db.query(`
    SELECT id, isbn13, title
    FROM librishelf.books
    WHERE isbn13 IS NOT NULL AND ol_work_key IS NULL
    ORDER BY id
    ${limit ? 'LIMIT ' + Number(limit) : ''}
  `)

  logger.info('Livros a enriquecer', { total: rows.length, dryRun })

  let linked = 0
  let notFound = 0
  let failed = 0

  for (const [index, book] of rows.entries()) {
    try {
      const found = await lookupIsbn(book.isbn13)

      if (!found || !found.olWorkKey) {
        notFound++
        continue
      }

      if (!dryRun) {
        await db.query(
          'UPDATE librishelf.books SET ol_work_key = $1, ol_edition_key = COALESCE(ol_edition_key, $2) WHERE id = $3 AND ol_work_key IS NULL',
          [found.olWorkKey, found.olEditionKey, book.id]
        )
      }
      linked++
    } catch (err) {
      failed++
      logger.warn('Falha ao consultar ISBN', { bookId: book.id, isbn13: book.isbn13, message: err.message })
      // Serviço fora do ar: para em vez de martelar.
      if (err.status === 502 && failed >= 5) {
        logger.error('Open Library indisponível; interrompendo. Rode de novo mais tarde.')
        break
      }
    }

    if ((index + 1) % 25 === 0) logger.info('Progresso', { done: index + 1, of: rows.length, linked })
  }

  logger.info('Concluído', { linked, notFound, failed, dryRun })
}

main()
  .catch(err => {
    logger.error('Enriquecimento falhou', { message: err.message })
    process.exitCode = 1
  })
  .finally(() => db.end())
