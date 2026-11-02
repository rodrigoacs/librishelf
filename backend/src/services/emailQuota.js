import { db } from '../database/connection.js'
import { MAIL_QUEUE_QUERIES as q } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'

/**
 * Limite de envio da caixa SMTP.
 *
 * A Hostinger conta os envios por caixa numa janela móvel de 24 horas:
 * 100/dia nas caixas grátis que vêm com a hospedagem e nos testes, 1000/dia no
 * Business Starter, 3000/dia no Business Standard e no Premium. Entrada e
 * saída contam separado.
 *   https://www.hostinger.com/support/4625828-parameters-and-limits-of-hostinger-email/
 *
 *   MAIL_DAILY_LIMIT     limite da caixa em 24 h (padrão 100, o menor plano)
 *   MAIL_DIRECT_RESERVE  parte do limite guardada para os e-mails que saem na
 *                        hora (confirmar e-mail, senha, troca de e-mail,
 *                        denúncias). Padrão: 20% do limite.
 *
 * A fila (e-mails de cobrança, avisos de seguidores) para em
 * MAIL_DAILY_LIMIT - MAIL_DIRECT_RESERVE. Os e-mails que saem na hora nunca
 * esperam: só entram na conta.
 */
const DEFAULT_DAILY_LIMIT = 100
const DEFAULT_RESERVE_SHARE = 0.2
const MIN_WAIT_SECONDS = 60
const MAX_WAIT_SECONDS = 60 * 60

function intFromEnv(name, fallback, min) {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value >= min ? value : fallback
}

/** → { daily, reserve, queue } lidos do ambiente na hora (dá para mudar nos testes) */
export function limits() {
  const daily = intFromEnv('MAIL_DAILY_LIMIT', DEFAULT_DAILY_LIMIT, 1)
  const reserve = Math.min(intFromEnv('MAIL_DIRECT_RESERVE', Math.ceil(daily * DEFAULT_RESERVE_SHARE), 0), daily)
  return { daily, reserve, queue: daily - reserve }
}

/**
 * Reserva uma vaga para um e-mail da fila. → id do registro, ou null se a fila
 * já chegou no limite. Se o envio falhar, devolva a vaga com release(id).
 */
export async function reserve(kind, userId = null) {
  const { queue } = limits()
  return transaction(async (client) => {
    await client.query(q.LOCK)
    const { rows: [{ total }] } = await client.query(q.COUNT_24H)
    if (total >= queue) return null
    const { rows } = await client.query(q.INSERT, [kind, userId])
    return rows[0].id
  })
}

export async function release(id) {
  if (id) await db.query(q.DELETE, [id])
}

/** E-mail que saiu na hora (sem reserva): só entra na conta. */
export async function record(kind, userId = null) {
  await db.query(q.INSERT, [kind, userId])
}

/** Quanto esperar até abrir uma vaga, entre 1 minuto e 1 hora. */
export async function secondsUntilSlot() {
  const { rows } = await db.query(q.NEXT_SLOT_SECONDS)
  return Math.min(Math.max(rows[0].seconds, MIN_WAIT_SECONDS), MAX_WAIT_SECONDS)
}

/** Para a administração: envios nas últimas 24 h e os limites. */
export async function usage() {
  const { rows } = await db.query(q.COUNT_24H)
  return { last24h: rows[0].total, ...limits() }
}

export async function purge() {
  const { rowCount } = await db.query(q.PURGE)
  return rowCount
}
