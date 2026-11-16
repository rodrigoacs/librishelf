import { db } from '../database/connection.js'
import { PUBLIC_METRIC_QUERIES as q } from '../database/queries.js'
import * as authRepository from '../repositories/authRepository.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import { appDay } from '../utils/appTime.js'
import logger from '../utils/logger.js'

/**
 * Métricas da página pública (pacote 41). Contador próprio: por dono, por
 * dia e por evento, sem nada de quem visitou (sem IP, sem cookie, sem conta).
 *   visit            abriu /u/:usuario (o navegador conta uma vez por sessão)
 *   share            tocou em Compartilhar
 *   invite_register  "Criar conta" no convite
 *   invite_login     "Entrar" no convite
 *   signup           cadastro que veio de /u/:usuario (pelo redirect)
 * Página que não é pública (ou não existe) e a visita do próprio dono não contam.
 */
export const CLIENT_EVENTS = Object.freeze(['visit', 'share', 'invite_register', 'invite_login'])
export const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const TOP_PAGES = 10

/** '/u/Fulano', '/u/Fulano?book=3' → 'Fulano'; o resto → null. */
export function usernameFromRedirect(redirect) {
  if (typeof redirect !== 'string') return null
  const match = redirect.match(/^\/u\/([^/?#]{1,60})(?:[/?#].*)?$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/** Primeiro dia de uma janela de `days` dias que termina hoje (no fuso do app). */
export function windowStart(days, today = appDay()) {
  const [y, m, d] = today.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d - (days - 1)))
  return start.toISOString().slice(0, 10)
}

/** Todos os dias da janela, com zero onde não houve nada: [{ day, ...zeros }] */
export function fillDays(start, days, fields) {
  const [y, m, d] = start.split('-').map(Number)
  return Array.from({ length: days }, (_, i) => ({
    day: new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
    ...Object.fromEntries(fields.map(field => [field, 0]))
  }))
}

/** Cadastros por visita, em % com uma casa (null sem visitas). */
export function conversion(signups, visits) {
  return visits > 0 ? Math.round((signups / visits) * 1000) / 10 : null
}

export function clampDays(raw) {
  const days = Number(raw ?? DEFAULT_DAYS)
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw httpError(`'days' precisa ser um número de 1 a ${MAX_DAYS}.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'days' })
  }
  return days
}

async function publicOwner(username) {
  if (typeof username !== 'string' || !username) return null
  const owner = await authRepository.getUserByName(username)
  return owner?.is_public ? owner : null
}

/** Evento do navegador. Página que não conta é ignorada sem erro (204 igual). */
export async function record(username, event, viewerId = null) {
  if (!CLIENT_EVENTS.includes(event)) {
    throw httpError('Evento desconhecido.', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'event' })
  }
  const owner = await publicOwner(username)
  if (!owner || owner.id === viewerId) return
  await db.query(q.INCREMENT, [owner.id, appDay(), event])
}

/** Cadastro novo com redirect para uma página pública. Nunca atrapalha o cadastro. */
export async function recordSignup(redirect) {
  try {
    const owner = await publicOwner(usernameFromRedirect(redirect))
    if (owner) await db.query(q.INCREMENT, [owner.id, appDay(), 'signup'])
  } catch (error) {
    logger.warn('Cadastro vindo da página pública não foi contado', { message: error.message })
  }
}

/** "Visitas da sua página" (Pro): por dia, com zeros, e o total. */
export async function ownerVisits(ownerId, rawDays) {
  const days = clampDays(rawDays)
  const start = windowStart(days)
  const { rows } = await db.query(q.OWNER_VISITS, [ownerId, start])
  const byDay = new Map(rows.map(row => [row.day, row.count]))
  const series = fillDays(start, days, ['visits']).map(item => ({ day: item.day, visits: byDay.get(item.day) ?? 0 }))
  return { days, total: series.reduce((sum, item) => sum + item.visits, 0), series }
}

/** Admin: todas as páginas somadas, por dia, e a conversão página → cadastro. */
export async function adminSummary(rawDays) {
  const days = clampDays(rawDays)
  const start = windowStart(days)
  const fields = ['visit', 'share', 'invite_register', 'invite_login', 'signup']
  const [{ rows }, top] = await Promise.all([
    db.query(q.DAILY_TOTALS, [start]),
    db.query(q.TOP_PAGES, [start, TOP_PAGES])
  ])
  const series = fillDays(start, days, fields)
  const index = new Map(series.map(item => [item.day, item]))
  for (const row of rows) {
    const item = index.get(row.day)
    if (item) item[row.event] = row.count
  }
  const totals = Object.fromEntries(fields.map(field => [field, series.reduce((sum, item) => sum + item[field], 0)]))
  return {
    days,
    totals,
    conversion: conversion(totals.signup, totals.visit),
    series,
    topPages: top.rows.map(row => ({ ...row, conversion: conversion(row.signups, row.visits) }))
  }
}
