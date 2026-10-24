import { db } from '../database/connection.js'
import STATUS from '../utils/statusCodes.js'
import { parseNameList, parseTagList, nameListError } from '../utils/nameList.js'
import { httpError } from '../utils/httpError.js'

/**
 * Renomear e mesclar autores, editoras e categorias (sempre do próprio usuário).
 *
 * POST /author/merge { from: ['Asimov', 'Isaac Asimov'], to: 'Isaac Asimov' }
 *
 * Um nome só em `from` = renomear. Se `to` já existe (sem diferenciar
 * maiúsculas), os livros passam para ele e os nomes de `from` somem: é a mesma
 * operação que mesclar. Tudo numa transação.
 */
const KINDS = {
  author: { table: 'authors', link: 'books_authors_link', column: 'author_id', label: 'autores', parse: parseNameList },
  tag: { table: 'tags', link: 'books_tags_link', column: 'tag_id', label: 'tags', parse: parseTagList },
  publisher: { table: 'publishers', label: 'editoras', parse: parseNameList }
}

async function moveBooks(client, kind, fromId, toId, userId) {
  const { table, link, column } = KINDS[kind]

  if (kind === 'publisher') {
    await client.query(
      'UPDATE librishelf.books SET publisher_id = $1, last_modified = now() WHERE publisher_id = $2 AND user_id = $3',
      [toId, fromId, userId]
    )
  } else {
    // Livro que já tem o nome de destino: só tira o vínculo antigo (sem duplicar).
    await client.query(
      `DELETE FROM librishelf.${link} WHERE ${column} = $1
         AND book_id IN (SELECT book_id FROM librishelf.${link} WHERE ${column} = $2)`,
      [fromId, toId]
    )
    await client.query(`UPDATE librishelf.${link} SET ${column} = $1 WHERE ${column} = $2`, [toId, fromId])
  }

  await client.query(`DELETE FROM librishelf.${table} WHERE id = $1 AND user_id = $2`, [fromId, userId])
}

export async function mergeNames(kind, userId, body = {}) {
  const config = KINDS[kind]
  const from = config.parse(body.from)
  const [to] = config.parse(body.to)

  if (from.length === 0 || !to) {
    throw httpError('Informe os nomes de origem (from) e o nome final (to).', STATUS.BAD_REQUEST, 'MERGE_FIELDS_REQUIRED')
  }
  const listError = nameListError(from, config.label) || nameListError([to], config.label)
  if (listError) throw httpError(listError.message, STATUS.BAD_REQUEST, listError.code, listError.params)

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows: sources } = await client.query(
      `SELECT id, name FROM librishelf.${config.table}
       WHERE user_id = $1 AND lower(name) = ANY($2::text[]) FOR UPDATE`,
      [userId, from.map(name => name.toLocaleLowerCase())]
    )
    if (sources.length !== from.length) {
      throw httpError('Algum dos nomes não existe na sua biblioteca.', STATUS.NOT_FOUND, 'NAMES_NOT_FOUND')
    }

    const { rows: [existing] } = await client.query(
      `SELECT id FROM librishelf.${config.table} WHERE user_id = $1 AND lower(name) = lower($2) FOR UPDATE`,
      [userId, to]
    )

    let targetId
    if (existing) {
      targetId = existing.id
      // Só mudou maiúscula/minúscula: grava a grafia nova.
      await client.query(`UPDATE librishelf.${config.table} SET name = $1 WHERE id = $2`, [to, targetId])
    } else {
      // O primeiro de `from` vira o nome final; os outros são mesclados nele.
      targetId = sources[0].id
      await client.query(`UPDATE librishelf.${config.table} SET name = $1 WHERE id = $2`, [to, targetId])
    }

    for (const source of sources) {
      if (source.id !== targetId) await moveBooks(client, kind, source.id, targetId, userId)
    }

    await client.query('COMMIT')
    return { name: to, merged: sources.filter(source => source.id !== targetId).length }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
