import { db } from '../database/connection.js'
import { ONBOARDING_QUERIES as q } from '../database/queries.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import * as vanguardaService from './vanguardaService.js'

/**
 * Onboarding (pacote 42): depois de confirmar o e-mail, a conta nova escolhe
 * como começar, cadastra os 3 primeiros livros, liga (ou não) a biblioteca
 * pública e vê o caminho até o Vanguarda. Pode pular e retomar: o passo fica
 * guardado aqui. Contas antigas entram como 'done'.
 */
export const STATUSES = Object.freeze(['pending', 'skipped', 'done'])
export const STEPS = Object.freeze(['start', 'books', 'public', 'finish'])
export const STARTS = Object.freeze(['import', 'scan', 'search'])
export const FIRST_BOOKS = 3

function invalid(field) {
  return httpError(`Valor inválido em '${field}'.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field })
}

/** Corpo do PATCH → mudanças validadas ({ status?, step?, start? }). Vazio é 400. */
export function parseChanges(body = {}) {
  const changes = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw invalid('status')
    changes.status = body.status
  }
  if (body.step !== undefined) {
    if (!STEPS.includes(body.step)) throw invalid('step')
    changes.step = body.step
  }
  if (body.start !== undefined) {
    if (body.start !== null && !STARTS.includes(body.start)) throw invalid('start')
    changes.start = body.start
  }
  if (Object.keys(changes).length === 0) {
    throw httpError('Nada para mudar.', STATUS.BAD_REQUEST, 'FIELD_REQUIRED', { field: 'status' })
  }
  return changes
}

/** Só o estado (vai no /auth/me): { status, step, start } */
export async function statusOf(userId) {
  const { rows: [row] } = await db.query(q.GET, [userId])
  return row ? { status: row.status, step: row.step, start: row.start } : null
}

/** Tela do onboarding: estado, livros, biblioteca pública e o Vanguarda. */
export async function get(userId) {
  const [{ rows: [row] }, vanguarda] = await Promise.all([db.query(q.GET, [userId]), vanguardaService.progressOf(userId)])
  return {
    status: row.status,
    step: row.step,
    start: row.start,
    books: vanguarda.books,
    firstBooks: FIRST_BOOKS,
    isPublic: Boolean(row.is_public),
    vanguarda: { open: vanguarda.open, has: vanguarda.has, minBooks: vanguarda.minBooks, slotsLeft: vanguarda.slotsLeft }
  }
}

export async function update(userId, body) {
  const changes = parseChanges(body)
  await db.query(q.UPDATE, [userId, changes.status ?? null, changes.step ?? null, changes.start ?? null, 'start' in changes])
  return get(userId)
}
