import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { db } from '../database/connection.js'
import { COLLECTION_QUERIES as q } from '../database/queries.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import { enqueue } from '../jobs/queue.js'
import * as entitlementService from './entitlementService.js'
import { isValidImage } from '../utils/imageProcessor.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Coleção (pacote 28).
 *
 * Grátis: empréstimo básico (quem pegou, quando, prazo, devolver).
 * Pro (collector): lembrete do empréstimo por e-mail, localização física,
 * preço pago e valor, fotos do exemplar com cota por conta.
 * A rota decide quem pode escrever (requireProForWrites); aqui só as regras.
 */

// Cota de fotos do exemplar. 100 por conta dá ~25 MB (duas versões JPEG de
// até 1600 e 400 px, ~250 KB juntas); 8 por livro cobre capa, lombada,
// miolo, autógrafo e defeitos.
export const photoQuota = () => ({
  perAccount: positiveInt(process.env.COPY_PHOTO_QUOTA, 100),
  perBook: positiveInt(process.env.COPY_PHOTOS_PER_BOOK, 8)
})

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export const PHOTO_SIZES = { sm: 400, lg: 1600 }
const PHOTO_QUALITY = 82
const EMAIL_JOB = 'email.send'
const REMINDER_HOUR_UTC = 12 // 9h em Brasília

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const MAX_CENTS = 100000000

const bad = (message, code, params) => httpError(message, STATUS.BAD_REQUEST, code, params)

// ------------------------------------------------------------------ validação

function date(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad('Data inválida: use o formato AAAA-MM-DD.', 'LOAN_DATE_INVALID', { field })
    return null
  }
  const text = String(value).trim()
  const parsed = DATE_RE.test(text) ? new Date(`${text}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw bad('Data inválida: use o formato AAAA-MM-DD.', 'LOAN_DATE_INVALID', { field })
  }
  return text
}

function text(value, field, max, { required = false } = {}) {
  const clean = typeof value === 'string' ? value.trim() : ''
  if (!clean) {
    if (required) throw bad('Diga com quem o livro está.', 'LOAN_BORROWER_REQUIRED')
    return null
  }
  if (clean.length > max) throw bad(`O campo '${field}' pode ter no máximo ${max} caracteres.`, 'FIELD_TOO_LONG', { field, max })
  return clean
}

function cents(value, field) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > MAX_CENTS) throw bad('Valor inválido.', 'COPY_VALUE_INVALID', { field })
  return n
}

function loanInput(body = {}) {
  const lentOn = date(body.lentOn, 'lentOn') ?? new Date().toISOString().slice(0, 10)
  const dueOn = date(body.dueOn, 'dueOn')
  if (dueOn && dueOn < lentOn) throw bad('O prazo precisa ser depois do empréstimo.', 'LOAN_DUE_BEFORE_LENT')
  return {
    borrower: text(body.borrower, 'borrower', 120, { required: true }),
    lentOn,
    dueOn,
    notes: text(body.notes, 'notes', 500)
  }
}

// ------------------------------------------------------------------ formatos

const loanOut = row => ({
  id: row.id,
  bookId: row.book_id,
  borrower: row.borrower,
  lentOn: row.lent_on,
  dueOn: row.due_on,
  returnedOn: row.returned_on,
  notes: row.notes,
  remind: row.remind,
  ...(row.title !== undefined ? { title: row.title, authors: row.authors, coverVersion: row.cover_version, overdue: Boolean(row.overdue) } : {})
})

const copyOut = row => ({
  location: row?.location ?? null,
  priceCents: row?.price_cents ?? null,
  valueCents: row?.value_cents ?? null,
  currency: row?.currency ?? 'BRL',
  acquiredOn: row?.acquired_on ?? null
})

const photoOut = (bookId, row) => ({
  id: row.id,
  width: row.width,
  height: row.height,
  createdAt: row.created_at,
  url: `/collection/books/${bookId}/photos/${row.id}`
})

async function ownedBook(bookId, userId, client = db) {
  const { rows: [book] } = await client.query(q.OWNED_BOOK, [bookId, userId])
  if (!book) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
  return book
}

async function ownedLoan(loanId, userId) {
  const { rows: [loan] } = await db.query(q.LOAN, [loanId, userId])
  if (!loan) throw httpError('Empréstimo não encontrado.', STATUS.NOT_FOUND, 'LOAN_NOT_FOUND')
  return loan
}

// ------------------------------------------------------------------ livro

/** Tudo da coleção de um livro: empréstimos, exemplar, fotos e a cota. */
export async function bookCollection(userId, bookId) {
  await ownedBook(bookId, userId)
  const [loans, copy, photos, counts] = await Promise.all([
    db.query(q.LOANS_OF_BOOK, [bookId, userId]),
    db.query(q.COPY, [bookId, userId]),
    db.query(q.PHOTOS_OF_BOOK, [bookId, userId]),
    db.query(q.PHOTO_COUNTS, [userId, bookId])
  ])
  const quota = photoQuota()
  const list = loans.rows.map(loanOut)
  return {
    bookId,
    loan: list.find(loan => !loan.returnedOn) ?? null,
    history: list.filter(loan => loan.returnedOn),
    copy: copyOut(copy.rows[0]),
    photos: photos.rows.map(row => photoOut(bookId, row)),
    quota: { used: counts.rows[0].total, max: quota.perAccount, inBook: counts.rows[0].in_book, perBook: quota.perBook }
  }
}

// ------------------------------------------------------------------ empréstimos

export async function listLoans(userId, status = 'open') {
  const which = ['open', 'returned', 'all'].includes(status) ? status : 'open'
  const { rows } = await db.query(q.LOANS, [userId, which])
  return rows.map(loanOut)
}

export async function lend(userId, bookId, body) {
  await ownedBook(bookId, userId)
  const input = loanInput(body)
  try {
    const { rows: [row] } = await db.query(q.INSERT_LOAN, [userId, bookId, input.borrower, input.lentOn, input.dueOn, input.notes])
    return loanOut(await ownedLoan(row.id, userId))
  } catch (err) {
    if (err.code === '23505') throw httpError('Este livro já está emprestado. Marque a devolução antes.', STATUS.CONFLICT, 'LOAN_ALREADY_OPEN')
    throw err
  }
}

export async function updateLoan(userId, loanId, body) {
  const current = await ownedLoan(loanId, userId)
  const input = loanInput({ lentOn: current.lent_on, ...body })
  if (current.returned_on && current.returned_on < input.lentOn) throw bad('O prazo precisa ser depois do empréstimo.', 'LOAN_DUE_BEFORE_LENT')
  await db.query(q.UPDATE_LOAN, [loanId, userId, input.borrower, input.lentOn, input.dueOn, input.notes])
  const loan = await ownedLoan(loanId, userId)
  // Prazo novo com lembrete ligado: outro aviso (o antigo não sai, porque o
  // e-mail confere o prazo na hora de enviar)
  if (loan.remind && !loan.returned_on && loan.due_on && loan.due_on !== current.due_on) await scheduleReminder(loan)
  return loanOut(loan)
}

export async function returnLoan(userId, loanId, body = {}) {
  const loan = await ownedLoan(loanId, userId)
  if (loan.returned_on) throw httpError('Este empréstimo já foi devolvido.', STATUS.CONFLICT, 'LOAN_ALREADY_RETURNED')
  const returnedOn = date(body.returnedOn, 'returnedOn') ?? new Date().toISOString().slice(0, 10)
  if (returnedOn < loan.lent_on) throw bad('A devolução precisa ser depois do empréstimo.', 'LOAN_RETURN_BEFORE_LENT')
  await db.query(q.RETURN_LOAN, [loanId, userId, returnedOn])
  return loanOut(await ownedLoan(loanId, userId))
}

export async function deleteLoan(userId, loanId) {
  await ownedLoan(loanId, userId)
  await db.query(q.DELETE_LOAN, [loanId, userId])
}

/** Lembrete por e-mail (Pro). Precisa de prazo. */
export async function setReminder(userId, loanId, remind) {
  const loan = await ownedLoan(loanId, userId)
  const on = remind === true
  if (on && !loan.due_on) throw bad('Defina um prazo para receber o lembrete.', 'LOAN_DUE_REQUIRED')
  if (on && loan.returned_on) throw httpError('Este empréstimo já foi devolvido.', STATUS.CONFLICT, 'LOAN_ALREADY_RETURNED')
  await db.query(q.SET_REMIND, [loanId, userId, on])
  const updated = await ownedLoan(loanId, userId)
  if (on) await scheduleReminder(updated)
  return loanOut(updated)
}

// Um aviso por prazo: dedupe_key com o empréstimo e a data
function scheduleReminder(loan) {
  const runAt = new Date(`${loan.due_on}T${String(REMINDER_HOUR_UTC).padStart(2, '0')}:00:00Z`)
  return enqueue(EMAIL_JOB, { kind: 'loan_reminder', loanId: loan.id, dueOn: loan.due_on }, {
    dedupeKey: `email:loan-reminder:${loan.id}:${loan.due_on}`,
    runAt: runAt > new Date() ? runAt : null,
    maxAttempts: 6
  })
}

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

/**
 * Monta o lembrete na hora de enviar (job email.send, kind loan_reminder).
 * Não sai se o livro voltou, se o lembrete foi desligado, se o prazo mudou
 * ou se a pessoa não tem mais Pro.
 */
export async function loanReminderMessage({ loanId, dueOn }) {
  const { rows: [row] } = await db.query(q.REMINDER, [loanId])
  if (!row) return { skip: 'empréstimo não existe mais' }
  if (row.returned_on) return { skip: 'livro devolvido' }
  if (!row.remind) return { skip: 'lembrete desligado' }
  if (row.due_on !== dueOn) return { skip: 'prazo mudou' }
  if (!row.email || !row.email_verified_at) return { skip: 'e-mail não confirmado' }
  if (!(await entitlementService.hasPro(row.user_id))) return { skip: 'sem Pro' }
  return {
    userId: row.user_id,
    to: row.email,
    name: row.name,
    locale: row.email_locale,
    params: { link: `${siteUrl()}/loans`, title: row.title, borrower: row.borrower, dueOn: row.due_on }
  }
}

// ------------------------------------------------------------------ exemplar

export async function saveCopy(userId, bookId, body = {}) {
  await ownedBook(bookId, userId)
  const currency = body.currency === undefined || body.currency === null || body.currency === ''
    ? 'BRL'
    : String(body.currency).trim().toUpperCase()
  if (!CURRENCY_RE.test(currency)) throw bad('Moeda inválida.', 'COPY_CURRENCY_INVALID')

  const input = {
    location: text(body.location, 'location', 200),
    priceCents: cents(body.priceCents, 'priceCents'),
    valueCents: cents(body.valueCents, 'valueCents'),
    acquiredOn: date(body.acquiredOn, 'acquiredOn')
  }
  if (Object.values(input).every(value => value === null)) {
    await db.query(q.DELETE_COPY, [bookId, userId])
  } else {
    await db.query(q.UPSERT_COPY, [bookId, userId, input.location, input.priceCents, input.valueCents, currency, input.acquiredOn])
  }
  const { rows } = await db.query(q.COPY, [bookId, userId])
  return copyOut(rows[0])
}

export async function summary(userId) {
  const { rows: [row] } = await db.query(q.SUMMARY, [userId])
  return {
    openLoans: row.open_loans,
    overdueLoans: row.overdue_loans,
    located: row.located,
    photos: { used: row.photos, max: photoQuota().perAccount },
    // Somas em texto no SQL (bigint); aqui voltam a número
    totals: row.totals.map(item => ({
      currency: item.currency,
      books: item.books,
      paidCents: Number(item.paid_cents),
      valueCents: Number(item.value_cents)
    }))
  }
}

// ------------------------------------------------------------------ fotos

const userDir = userId => path.join(UPLOAD_DIR, 'copies', String(userId))
export const photoPath = (userId, bookId, photoId, size) => path.join(userDir(userId), `${bookId}-${photoId}-${size}.jpg`)

export async function addPhoto(userId, bookId, file) {
  if (!file?.buffer) throw bad('Envie uma imagem.', 'IMAGE_REQUIRED')
  if (!(await isValidImage(file.buffer))) throw bad('Arquivo enviado não é uma imagem válida.', 'IMAGE_INVALID')

  // Gira pela orientação da câmera e tira os metadados (EXIF, GPS) antes de gravar
  const base = sharp(file.buffer).rotate()
  const [lg, sm] = await Promise.all([PHOTO_SIZES.lg, PHOTO_SIZES.sm].map(max =>
    base.clone().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true }).toBuffer({ resolveWithObject: true })))

  const quota = photoQuota()
  const client = await db.connect()
  const written = []
  try {
    await client.query('BEGIN')
    await ownedBook(bookId, userId, client)
    await client.query(q.LOCK_USER, [userId])
    const { rows: [counts] } = await client.query(q.PHOTO_COUNTS, [userId, bookId])
    if (counts.total >= quota.perAccount) {
      throw httpError(`Você chegou ao limite de ${quota.perAccount} fotos de exemplar.`, STATUS.CONFLICT, 'COPY_PHOTO_QUOTA', { max: quota.perAccount })
    }
    if (counts.in_book >= quota.perBook) {
      throw httpError(`Cada livro pode ter até ${quota.perBook} fotos.`, STATUS.CONFLICT, 'COPY_PHOTO_BOOK_LIMIT', { max: quota.perBook })
    }

    const { rows: [row] } = await client.query(q.INSERT_PHOTO, [bookId, userId, lg.info.size + sm.info.size, lg.info.width, lg.info.height])
    await fs.mkdir(userDir(userId), { recursive: true })
    for (const [size, out] of [['lg', lg], ['sm', sm]]) {
      const target = photoPath(userId, bookId, row.id, size)
      await fs.writeFile(target, out.data)
      written.push(target)
    }
    await client.query('COMMIT')
    return photoOut(bookId, row)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { })
    await Promise.all(written.map(file => fs.unlink(file).catch(() => { })))
    throw err
  } finally {
    client.release()
  }
}

export async function photoFile(userId, bookId, photoId, size) {
  if (!PHOTO_SIZES[size]) throw httpError('Foto não encontrada.', STATUS.NOT_FOUND, 'PHOTO_NOT_FOUND')
  const { rows: [row] } = await db.query(q.PHOTO, [photoId, bookId, userId])
  if (!row) throw httpError('Foto não encontrada.', STATUS.NOT_FOUND, 'PHOTO_NOT_FOUND')
  return photoPath(userId, bookId, photoId, size)
}

export async function deletePhoto(userId, bookId, photoId) {
  const { rows: [row] } = await db.query(q.PHOTO, [photoId, bookId, userId])
  if (!row) throw httpError('Foto não encontrada.', STATUS.NOT_FOUND, 'PHOTO_NOT_FOUND')
  await db.query(q.DELETE_PHOTO, [photoId, userId])
  await Promise.all(Object.keys(PHOTO_SIZES).map(size => fs.unlink(photoPath(userId, bookId, photoId, size)).catch(() => { })))
}

/** Livros excluídos: as fotos saem do disco (as linhas já saíram por CASCADE). */
export async function removeBookPhotoFiles(userId, bookIds) {
  const prefixes = new Set(bookIds.map(id => `${id}-`))
  let names = []
  try {
    names = await fs.readdir(userDir(userId))
  } catch {
    return
  }
  await Promise.all(names
    .filter(name => prefixes.has(name.slice(0, name.indexOf('-') + 1)))
    .map(name => fs.unlink(path.join(userDir(userId), name)).catch(err => logger.warn('Foto de exemplar não removida', { userId, name, message: err.message }))))
}

/** Conta excluída: a pasta inteira de fotos. */
export function removeUserPhotoFiles(userId) {
  return fs.rm(userDir(userId), { recursive: true, force: true })
}

// ------------------------------------------------------------------ exportação

export async function exportData(userId) {
  const [loans, copies] = await Promise.all([db.query(q.EXPORT_LOANS, [userId]), db.query(q.EXPORT_COPIES, [userId])])
  return {
    loans: loans.rows.map(row => ({
      title: row.title, borrower: row.borrower, lentOn: row.lent_on, dueOn: row.due_on,
      returnedOn: row.returned_on, notes: row.notes, remind: row.remind
    })),
    copies: copies.rows.map(row => ({
      title: row.title, location: row.location, priceCents: row.price_cents, valueCents: row.value_cents,
      currency: row.currency, acquiredOn: row.acquired_on, photos: row.photos
    }))
  }
}
