import { db } from '../../src/database/connection.js'

export async function clearDatabase() {
  if (process.env.NODE_ENV !== 'test') return

  const dbName = process.env.DB_NAME || ''
  const looksLikeTestDb = dbName.toLowerCase().includes('test')
  const explicitlyAllowed = process.env.ALLOW_DESTRUCTIVE_TEST_DB === 'true'

  if (!looksLikeTestDb || !explicitlyAllowed) {
    throw new Error(
      '[SAFETY] clearDatabase() recusado. ' +
      `DB_NAME="${dbName}" precisa conter "test" no nome E a variável ` +
      'ALLOW_DESTRUCTIVE_TEST_DB precisa ser "true" no .env carregado. ' +
      'Isso normalmente significa que o .env de PRODUÇÃO está sendo usado ' +
      'para rodar os testes — confira qual arquivo de env foi carregado ' +
      '(deveria ser backend/src/.env.test, nunca backend/src/.env).'
    )
  }

  console.log(`[TEST] Limpando banco de teste: ${dbName}`)
  await db.query('TRUNCATE TABLE librishelf.books_authors_link, librishelf.books_tags_link, librishelf.books, librishelf.authors, librishelf.publishers, librishelf.tags, librishelf.users RESTART IDENTITY CASCADE')
}

export async function closeDatabase() {
  await db.end()
}