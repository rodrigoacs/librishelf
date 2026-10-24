import * as readingRepository from '../repositories/readingRepository.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'
import { normalizeReadDate, normalizeRating, normalizePageCount, today, MAX_PAGES } from '../utils/bookFields.js'

/**
 * Leituras de um livro (releituras, histórico e progresso).
 *
 * Regras:
 *   - no máximo uma leitura em andamento (sem fim) por livro
 *   - "Lido" fecha a leitura em andamento; sem ela, cria uma leitura concluída
 *   - "Lendo"/"Ler de novo" abre uma leitura nova (as concluídas ficam)
 *   - "Quero ler"/"Nenhum" apagam o histórico do livro (o app pede confirmação
 *     quando há mais de uma leitura); desmarcar "Lido" apaga só a última
 *   - progresso (página e/ou %) vale para a leitura em andamento
 * O resumo em books (read_date, started_at, reading_status) é recalculado
 * pelo banco a cada mudança (migration 009).
 */

const READING_STATUSES = ['none', 'want', 'reading', 'read']

async function ensureOwner(bookId, userId) {
  const owner = await libraryRepository.getBookOwner(bookId)
  if (!owner) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
  if (owner.user_id !== userId) throw httpError('Sem permissão.', STATUS.FORBIDDEN, 'PERMISSION_DENIED')
}

function checkOrder(startedOn, finishedOn) {
  if (startedOn && finishedOn && startedOn > finishedOn) {
    throw httpError('O fim da leitura não pode ser antes do início.', STATUS.BAD_REQUEST, 'READING_DATES_ORDER')
  }
}

export function toApi(row) {
  if (!row) return null
  return {
    id: row.id,
    startedOn: row.started_on,
    finishedOn: row.finished_on,
    rating: row.rating,
    currentPage: row.current_page,
    progressPercent: row.progress_percent,
    progressUpdatedAt: row.progress_updated_at
  }
}

// ------------------------------------------------------------ passos (dentro da transação)

/**
 * Conclui: fecha a leitura em andamento em `date`; sem ela, cria uma leitura
 * concluída. Já lido e sem leitura em andamento:
 *   keepExisting = true  → não mexe (ação em lote)
 *   keepExisting = false → muda a data da última leitura (marcar lido, status "Lido")
 */
async function finish(client, bookId, date, { keepExisting }) {
  const open = await readingRepository.getOpen(client, bookId)
  if (open) {
    // Início depois do fim escolhido: o início some (a data de fim é a que vale)
    const startedOn = open.started_on && open.started_on > date ? null : undefined
    await readingRepository.update(client, open.id, { finishedOn: date, startedOn })
    return
  }
  const last = await readingRepository.getLatestFinished(client, bookId)
  if (!last) {
    await readingRepository.insert(client, bookId, { finishedOn: date })
    return
  }
  if (!keepExisting && last.finished_on !== date) {
    checkOrder(last.started_on, date)
    await readingRepository.update(client, last.id, { finishedOn: date })
  }
}

/** Começa (ou ajusta o início da) leitura em andamento. */
async function start(client, bookId, date) {
  const open = await readingRepository.getOpen(client, bookId)
  if (open) {
    if (date && open.started_on !== date) await readingRepository.update(client, open.id, { startedOn: date })
    return
  }
  await readingRepository.insert(client, bookId, { startedOn: date || today() })
}

async function applyStatus(client, bookId, status, date, { keepExisting }) {
  if (status === 'read') return finish(client, bookId, date || today(), { keepExisting })
  if (status === 'reading') return start(client, bookId, date)
  await readingRepository.removeAll(client, bookId)
  await readingRepository.setWant(client, bookId, status === 'want')
}

// ------------------------------------------------------------ status (API antiga)

function parseStatus(rawStatus) {
  const status = String(rawStatus ?? '')
  if (!READING_STATUSES.includes(status)) {
    throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST, 'STATUS_INVALID')
  }
  return status
}

/**
 * PATCH /library/:id/status — status em um passo só:
 *   none    → só na estante (apaga as leituras)
 *   want    → "Quero ler" (apaga as leituras)
 *   reading → leitura em andamento desde `date` (ou hoje); num livro já lido é
 *             releitura e as leituras anteriores ficam
 *   read    → conclui em `date` (ou hoje)
 * → { status, readDate, startedAt }
 */
export async function setStatus(bookId, userId, rawStatus, rawDate) {
  await ensureOwner(bookId, userId)
  const status = parseStatus(rawStatus)
  const date = normalizeReadDate(rawDate)

  return readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    await applyStatus(client, bookId, status, date, { keepExisting: false })
    return readingRepository.bookState(client, bookId)
  })
}

/** PATCH /library/:id/read — marcar lido em `readDate` (ou hoje); já lido: muda a data da última leitura. */
export async function markRead(bookId, userId, rawDate) {
  await ensureOwner(bookId, userId)
  const date = normalizeReadDate(rawDate) ?? today()
  return readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    await finish(client, bookId, date, { keepExisting: false })
    return readingRepository.bookState(client, bookId)
  })
}

/** PATCH /library/:id/unread — desfaz o último "Lido" (as leituras antigas ficam). */
export async function markUnread(bookId, userId) {
  await ensureOwner(bookId, userId)
  return readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    const last = await readingRepository.getLatestFinished(client, bookId)
    if (last) await readingRepository.remove(client, last.id)
    return readingRepository.bookState(client, bookId)
  })
}

/** Ações em lote (ids já conferidos). "Lido" não muda a data de quem já leu. */
export async function batchStatus(ids, rawStatus, rawDate) {
  const status = parseStatus(rawStatus)
  const date = normalizeReadDate(rawDate) ?? today()
  return readingRepository.withTransaction(async client => {
    for (const id of ids) {
      await readingRepository.lockBook(client, id)
      await applyStatus(client, id, status, status === 'reading' ? null : date, { keepExisting: true })
    }
    return ids.length
  })
}

/**
 * Cadastro/edição pelo formulário (POST/PUT /library): `readDate` é a data da
 * última leitura concluída. Com data: muda a última (ou cria a primeira).
 * Sem data: não apaga nada, a não ser com `clear` (readDate: null explícito).
 * Com leitura em andamento não mexe: concluir é pelo status (o formulário
 * manda o status logo depois), e a data que vem é a da leitura anterior.
 */
export async function applyFormReadDate(bookId, readDate, { clear = false } = {}) {
  await readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    if (readDate && !(await readingRepository.getOpen(client, bookId))) {
      await finish(client, bookId, readDate, { keepExisting: false })
    } else if (!readDate && clear) {
      // PUT com readDate: null explícito (contrato antigo): o livro deixa de
      // estar lido — saem as leituras concluídas; a em andamento fica
      await readingRepository.removeFinished(client, bookId)
    }
    await readingRepository.sync(client, bookId)
  })
}

/**
 * Importação (CSV): uma leitura concluída por data e, se "Lendo", a leitura em
 * andamento; "Quero ler" sem leituras fica como "Quero ler".
 */
export async function importReadings(bookId, { status, finishedDates = [], startedOn = null }) {
  await readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    for (const date of finishedDates) await readingRepository.insert(client, bookId, { finishedOn: date })
    if (status === 'reading') await readingRepository.insert(client, bookId, { startedOn: startedOn || today() })
    if (status === 'want' && finishedDates.length === 0) await readingRepository.setWant(client, bookId, true)
    await readingRepository.sync(client, bookId)
  })
}

// ------------------------------------------------------------ histórico

export async function listReadings(bookId, userId) {
  await ensureOwner(bookId, userId)
  return (await readingRepository.list(null, bookId)).map(toApi)
}

function readingInput(body = {}, { partial }) {
  const out = {}
  if (!partial || Object.hasOwn(body, 'startedOn')) out.startedOn = normalizeReadDate(body.startedOn, 'startedOn')
  if (!partial || Object.hasOwn(body, 'finishedOn')) out.finishedOn = normalizeReadDate(body.finishedOn, 'finishedOn')
  if (!partial || Object.hasOwn(body, 'rating')) out.rating = normalizeRating(body.rating)
  return out
}

function openConflict() {
  return httpError('Este livro já tem uma leitura em andamento.', STATUS.CONFLICT, 'READING_ALREADY_OPEN')
}

/**
 * POST /library/:id/readings — registra uma leitura (ex.: uma releitura
 * antiga). Sem fim = leitura em andamento (só se não houver outra).
 */
export async function addReading(bookId, userId, body) {
  await ensureOwner(bookId, userId)
  const input = readingInput(body, { partial: false })
  checkOrder(input.startedOn, input.finishedOn)

  return readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    if (!input.finishedOn && await readingRepository.getOpen(client, bookId)) throw openConflict()
    const row = await readingRepository.insert(client, bookId, input)
    return { reading: toApi(row), book: await readingRepository.bookState(client, bookId) }
  })
}

/** PATCH /library/:id/readings/:readingId — início, fim e/ou nota da leitura. */
export async function updateReading(bookId, userId, readingId, body) {
  await ensureOwner(bookId, userId)
  const input = readingInput(body, { partial: true })

  return readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    const current = await readingRepository.getById(client, bookId, readingId)
    if (!current) throw httpError('Leitura não encontrada.', STATUS.NOT_FOUND, 'READING_NOT_FOUND')

    const startedOn = input.startedOn !== undefined ? input.startedOn : current.started_on
    const finishedOn = input.finishedOn !== undefined ? input.finishedOn : current.finished_on
    checkOrder(startedOn, finishedOn)
    // Reabrir uma leitura concluída só se não houver outra em andamento
    if (current.finished_on && !finishedOn && await readingRepository.getOpen(client, bookId)) throw openConflict()

    const row = await readingRepository.update(client, current.id, input)
    return { reading: toApi(row), book: await readingRepository.bookState(client, bookId) }
  })
}

/** DELETE /library/:id/readings/:readingId */
export async function deleteReading(bookId, userId, readingId) {
  await ensureOwner(bookId, userId)
  return readingRepository.withTransaction(async client => {
    await readingRepository.lockBook(client, bookId)
    const current = await readingRepository.getById(client, bookId, readingId)
    if (!current) throw httpError('Leitura não encontrada.', STATUS.NOT_FOUND, 'READING_NOT_FOUND')
    await readingRepository.remove(client, current.id)
    return { book: await readingRepository.bookState(client, bookId) }
  })
}

// ------------------------------------------------------------ progresso

function optionalInt(value, field, min, max) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw httpError(`Campo '${field}' inválido.`, STATUS.BAD_REQUEST, 'PROGRESS_INVALID', { field, min, max })
  }
  return number
}

/**
 * PATCH /library/:id/progress — { page?, percent?, totalPages? } na leitura
 * em andamento. Com o total de páginas, página ↔ % são calculadas uma a
 * partir da outra; sem ele, guarda o que veio.
 */
export async function setProgress(bookId, userId, body = {}) {
  await ensureOwner(bookId, userId)
  const page = optionalInt(body.page, 'page', 0, MAX_PAGES)
  const percent = optionalInt(body.percent, 'percent', 0, 100)
  const totalPages = Object.hasOwn(body, 'totalPages') ? normalizePageCount(body.totalPages) : undefined
  if (page === undefined && percent === undefined && totalPages === undefined) {
    throw httpError('Informe a página, a porcentagem ou o total de páginas.', STATUS.BAD_REQUEST, 'PROGRESS_INVALID')
  }

  return readingRepository.withTransaction(async client => {
    const book = await readingRepository.lockBook(client, bookId)
    const open = await readingRepository.getOpen(client, bookId)
    if (!open) throw httpError('Este livro não está em leitura.', STATUS.CONFLICT, 'NOT_READING')

    let pages = book.page_count
    if (totalPages !== undefined) {
      pages = totalPages
      await readingRepository.setPageCount(client, bookId, totalPages)
    }

    const fields = {}
    if (page !== undefined && page !== null) {
      if (pages && page > pages) {
        throw httpError('A página atual passa do total de páginas do livro.', STATUS.BAD_REQUEST, 'PROGRESS_PAGE_OVER', { max: pages })
      }
      fields.currentPage = page
      fields.progressPercent = pages ? Math.min(100, Math.round((page / pages) * 100)) : null
    } else if (percent !== undefined && percent !== null) {
      fields.progressPercent = percent
      fields.currentPage = pages ? Math.round((percent / 100) * pages) : null
    } else if (page === null || percent === null) {
      fields.currentPage = null
      fields.progressPercent = null
    } else if (totalPages !== undefined && open.current_page !== null) {
      // Só mudou o total: recalcula a % da página que já estava
      fields.progressPercent = pages ? Math.min(100, Math.round((open.current_page / pages) * 100)) : open.progress_percent
    }

    const row = Object.keys(fields).length ? await readingRepository.update(client, open.id, fields) : open
    return { reading: toApi(row), pageCount: pages ?? null }
  })
}
