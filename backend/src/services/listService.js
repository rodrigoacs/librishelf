import { db } from '../database/connection.js'
import { LIST_QUERIES as q } from '../database/queries.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'

/**
 * Listas de livros do leitor ("Melhores de 2026"): só livros da própria
 * estante, na ordem que ele escolher. Privada por padrão; pública aparece no
 * perfil e tem página própria (/u/<nome>/lists/<id>) quando a biblioteca
 * também é pública. Lista de outra pessoa responde 404, como se não existisse.
 */
export const MAX_LISTS = 50
export const MAX_ITEMS = 200
export const MAX_TITLE = 100
export const MAX_DESCRIPTION = 1000
const PROFILE_LIMIT = 12

const notFound = () => httpError('Lista não encontrada.', STATUS.NOT_FOUND, 'LIST_NOT_FOUND')

function toSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isPublic: row.is_public,
    ranked: row.ranked,
    itemCount: row.item_count,
    // As 4 primeiras (capa ou capa desenhada com título e autor)
    covers: row.covers,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toItem(row) {
  return {
    bookId: row.book_id,
    position: row.position,
    title: row.title,
    authors: row.authors,
    rating: row.rating,
    readDate: row.read_date,
    readingStatus: row.reading_status,
    series: row.series,
    seriesIndex: row.series_index === null ? null : Number(row.series_index)
  }
}

function invalid(field) {
  return httpError(`Campo '${field}' inválido.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field })
}

/** Valida o corpo de criar/editar. Em edição, só o que veio muda. */
function listInput(body = {}, current = null) {
  const out = current
    ? { title: current.title, description: current.description, isPublic: current.is_public, ranked: current.ranked }
    : { title: undefined, description: null, isPublic: false, ranked: true }

  if (!current || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw httpError('Dê um nome para a lista.', STATUS.BAD_REQUEST, 'LIST_TITLE_REQUIRED')
    }
    const title = body.title.replace(/\s+/g, ' ').trim()
    if (title.length > MAX_TITLE) {
      throw httpError(`O nome pode ter no máximo ${MAX_TITLE} caracteres.`, STATUS.BAD_REQUEST, 'LIST_TITLE_TOO_LONG', { max: MAX_TITLE })
    }
    out.title = title
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') throw invalid('description')
    const description = (body.description ?? '').replace(/\r\n/g, '\n').trim()
    if (description.length > MAX_DESCRIPTION) {
      throw httpError(`A descrição pode ter no máximo ${MAX_DESCRIPTION} caracteres.`, STATUS.BAD_REQUEST, 'LIST_DESCRIPTION_TOO_LONG', { max: MAX_DESCRIPTION })
    }
    out.description = description || null
  }
  if (body.isPublic !== undefined) {
    if (typeof body.isPublic !== 'boolean') throw invalid('isPublic')
    out.isPublic = body.isPublic
  }
  if (body.ranked !== undefined) {
    if (typeof body.ranked !== 'boolean') throw invalid('ranked')
    out.ranked = body.ranked
  }
  return out
}

async function ownList(listId, userId) {
  const { rows: [row] } = await db.query(q.GET, [listId])
  if (!row || row.user_id !== userId) throw notFound()
  return row
}

async function withItems(row) {
  const { rows } = await db.query(q.ITEMS, [row.id])
  return { ...toSummary(row), itemCount: rows.length, items: rows.map(toItem) }
}

// ------------------------------------------------------------------ dono

/** GET /lists?book=ID — as listas do leitor; com ?book, marca as que têm o livro. */
export async function listOwn(userId, bookId = null) {
  const { rows } = await db.query(q.OF_OWNER, [userId, bookId])
  return rows.map(row => {
    const summary = toSummary(row)
    if (bookId) summary.hasBook = row.has_book
    return summary
  })
}

export async function create(userId, body) {
  const input = listInput(body)
  const { rows: [{ total }] } = await db.query(q.COUNT_OF_OWNER, [userId])
  if (total >= MAX_LISTS) {
    throw httpError(`Você pode ter no máximo ${MAX_LISTS} listas.`, STATUS.BAD_REQUEST, 'LIST_LIMIT', { max: MAX_LISTS })
  }
  const { rows: [{ id }] } = await db.query(q.CREATE, [userId, input.title, input.description, input.isPublic, input.ranked])

  // Já com um livro (criar a lista a partir do livro aberto)
  if (body.bookId !== undefined) await addItem(id, userId, body.bookId)
  return getOwn(id, userId)
}

export async function getOwn(listId, userId) {
  return withItems(await ownList(listId, userId))
}

export async function update(listId, userId, body) {
  const current = await ownList(listId, userId)
  const input = listInput(body, current)
  await db.query(q.UPDATE, [listId, userId, input.title, input.description, input.isPublic, input.ranked])
  return getOwn(listId, userId)
}

export async function remove(listId, userId) {
  const { rows } = await db.query(q.DELETE, [listId, userId])
  if (!rows[0]) throw notFound()
}

function bookIdOf(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw invalid('bookId')
  return id
}

/** POST /lists/:id/items — { bookId }: livro da própria estante, no fim. */
export async function addItem(listId, userId, rawBookId) {
  await ownList(listId, userId)
  const bookId = bookIdOf(rawBookId)
  const owner = await libraryRepository.getBookOwner(bookId)
  if (!owner || owner.user_id !== userId) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')

  const { rows: [{ total }] } = await db.query(q.COUNT_ITEMS, [listId])
  if (total >= MAX_ITEMS) {
    throw httpError(`Uma lista pode ter no máximo ${MAX_ITEMS} livros.`, STATUS.BAD_REQUEST, 'LIST_FULL', { max: MAX_ITEMS })
  }
  const { rows } = await db.query(q.ADD_ITEM, [listId, bookId])
  if (rows[0]) await db.query(q.TOUCH, [listId])
  return { added: Boolean(rows[0]) }
}

export async function removeItem(listId, userId, rawBookId) {
  await ownList(listId, userId)
  const { rows } = await db.query(q.REMOVE_ITEM, [listId, bookIdOf(rawBookId)])
  if (rows[0]) await db.query(q.TOUCH, [listId])
  return { removed: Boolean(rows[0]) }
}

/**
 * PUT /lists/:id/order — { bookIds: [...] } com todos os livros da lista na
 * ordem nova. Se a lista mudou em outra aba (faltou ou sobrou livro), 409 e
 * o app recarrega.
 */
export async function reorder(listId, userId, body = {}) {
  await ownList(listId, userId)
  const ids = body.bookIds
  if (!Array.isArray(ids) || ids.length > MAX_ITEMS) throw invalid('bookIds')
  const wanted = ids.map(bookIdOf)

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Trava a lista: duas reordenações ao mesmo tempo não se misturam
    await client.query('SELECT id FROM librishelf.lists WHERE id = $1 FOR UPDATE', [listId])
    const { rows } = await client.query(q.BOOK_IDS, [listId])
    const current = new Set(rows.map(row => row.book_id))
    const same = wanted.length === current.size && new Set(wanted).size === wanted.length && wanted.every(id => current.has(id))
    if (!same) {
      throw httpError('A lista mudou enquanto você reordenava. Recarregue e tente de novo.', STATUS.CONFLICT, 'LIST_ORDER_MISMATCH')
    }
    await client.query(q.REORDER, [listId, wanted])
    await client.query(q.TOUCH, [listId])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return getOwn(listId, userId)
}

// ------------------------------------------------------------------ público

async function publicOwner(username) {
  if (typeof username !== 'string') return null
  const user = await authRepository.getUserByName(username)
  if (!user || !user.is_public || user.is_active === false) return null
  return user
}

/** Para o perfil público: as listas públicas (com livros) mais recentes. */
export async function forProfile(userId) {
  const { rows } = await db.query(q.PUBLIC_OF_USER, [userId, PROFILE_LIMIT])
  return rows.map(toSummary)
}

async function publicList(username, listId) {
  const user = await publicOwner(username)
  if (!user) return null
  const { rows: [row] } = await db.query(q.GET, [listId])
  if (!row || row.user_id !== user.id || !row.is_public) return null
  return { user, row }
}

/** GET /library/public/u/:username/lists/:id — só lista pública de biblioteca pública. */
export async function getPublic(username, listId) {
  const found = await publicList(username, listId)
  if (!found) throw notFound()
  return { ...(await withItems(found.row)), owner: { username: found.user.name } }
}

/** Para a prévia do link (metaService): { user, list } ou null, com a mesma regra. */
export async function findPublic(username, listId) {
  const found = await publicList(username, listId)
  if (!found) return null
  return { user: found.user, list: await withItems(found.row) }
}
