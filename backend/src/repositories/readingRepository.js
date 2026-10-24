import { db } from '../database/connection.js'

/**
 * Leituras de um livro (librishelf.readings, migration 009). Toda mudança
 * aqui dispara o trigger que recalcula o resumo em books (read_date,
 * started_at, reading_status) — ver librishelf.sync_book_reading().
 *
 * As funções recebem `client` para rodar dentro de uma transação aberta por
 * withTransaction (lock do livro evita duas leituras em andamento ao mesmo
 * tempo em cliques repetidos).
 */

const COLUMNS = `
  id,
  to_char(started_on, 'YYYY-MM-DD') AS started_on,
  to_char(finished_on, 'YYYY-MM-DD') AS finished_on,
  rating,
  current_page,
  progress_percent,
  progress_updated_at
`

export async function withTransaction(fn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Trava o livro até o fim da transação (e devolve page_count). */
export async function lockBook(client, bookId) {
  const { rows } = await client.query('SELECT id, page_count FROM librishelf.books WHERE id = $1 FOR UPDATE', [bookId])
  return rows[0] || null
}

/** Em andamento primeiro; depois as concluídas, da mais recente para a mais antiga. */
export async function list(client, bookId) {
  const { rows } = await (client || db).query(`
    SELECT ${COLUMNS}
    FROM librishelf.readings
    WHERE book_id = $1
    ORDER BY (finished_on IS NULL) DESC, finished_on DESC, started_on DESC NULLS LAST, id DESC
  `, [bookId])
  return rows
}

export async function getOpen(client, bookId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM librishelf.readings WHERE book_id = $1 AND finished_on IS NULL`, [bookId])
  return rows[0] || null
}

export async function getLatestFinished(client, bookId) {
  const { rows } = await client.query(`
    SELECT ${COLUMNS} FROM librishelf.readings
    WHERE book_id = $1 AND finished_on IS NOT NULL
    ORDER BY finished_on DESC, id DESC LIMIT 1
  `, [bookId])
  return rows[0] || null
}

export async function getById(client, bookId, readingId) {
  const { rows } = await (client || db).query(
    `SELECT ${COLUMNS} FROM librishelf.readings WHERE book_id = $1 AND id = $2`, [bookId, readingId])
  return rows[0] || null
}

export async function insert(client, bookId, { startedOn = null, finishedOn = null, rating = null } = {}) {
  const { rows } = await client.query(`
    INSERT INTO librishelf.readings (book_id, started_on, finished_on, rating)
    VALUES ($1, $2::date, $3::date, $4)
    RETURNING ${COLUMNS}
  `, [bookId, startedOn, finishedOn, rating])
  return rows[0]
}

/** Só altera os campos presentes em `fields` (undefined = mantém). */
export async function update(client, readingId, fields) {
  const sets = []
  const params = [readingId]
  const map = {
    startedOn: 'started_on = $?::date',
    finishedOn: 'finished_on = $?::date',
    rating: 'rating = $?',
    currentPage: 'current_page = $?',
    progressPercent: 'progress_percent = $?'
  }
  for (const [key, sql] of Object.entries(map)) {
    if (fields[key] === undefined) continue
    params.push(fields[key])
    sets.push(sql.replace('$?', `$${params.length}`))
  }
  if (fields.currentPage !== undefined || fields.progressPercent !== undefined) sets.push('progress_updated_at = now()')
  if (sets.length === 0) return getByIdOnly(client, readingId)
  sets.push('updated_at = now()')

  const { rows } = await client.query(`
    UPDATE librishelf.readings SET ${sets.join(', ')}
    WHERE id = $1
    RETURNING ${COLUMNS}
  `, params)
  return rows[0] || null
}

async function getByIdOnly(client, readingId) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM librishelf.readings WHERE id = $1`, [readingId])
  return rows[0] || null
}

export async function remove(client, readingId) {
  const { rowCount } = await client.query('DELETE FROM librishelf.readings WHERE id = $1', [readingId])
  return rowCount > 0
}

export async function removeAll(client, bookId) {
  const { rowCount } = await client.query('DELETE FROM librishelf.readings WHERE book_id = $1', [bookId])
  return rowCount
}

export async function removeFinished(client, bookId) {
  const { rowCount } = await client.query('DELETE FROM librishelf.readings WHERE book_id = $1 AND finished_on IS NOT NULL', [bookId])
  return rowCount
}

export async function setPageCount(client, bookId, pageCount) {
  await client.query('UPDATE librishelf.books SET page_count = $2, last_modified = now() WHERE id = $1', [bookId, pageCount])
}

/** "Quero ler"/"nenhum" depois de apagar as leituras (o resumo já zerou o resto). */
export async function setWant(client, bookId, want) {
  await client.query(
    'UPDATE librishelf.books SET reading_status = $2, last_modified = now() WHERE id = $1',
    [bookId, want ? 'want' : null])
}

/** Recalcula o resumo em books (o trigger já faz; usado depois de update_book). */
export async function sync(client, bookId) {
  await (client || db).query('SELECT librishelf.sync_book_reading($1)', [bookId])
}

/** Estado do livro depois das mudanças: { status, readDate, startedAt }. */
export async function bookState(client, bookId) {
  const { rows } = await client.query(`
    SELECT reading_status,
           to_char(read_date, 'YYYY-MM-DD') AS read_date,
           to_char(started_at, 'YYYY-MM-DD') AS started_at
    FROM librishelf.books WHERE id = $1
  `, [bookId])
  const row = rows[0]
  if (!row) return null
  return {
    status: row.reading_status ?? (row.read_date ? 'read' : 'none'),
    readDate: row.read_date,
    startedAt: row.started_at
  }
}
