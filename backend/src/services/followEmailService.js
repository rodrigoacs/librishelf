import { db } from '../database/connection.js'
import { FOLLOW_EMAIL_QUERIES as q } from '../database/queries.js'
import { sendMail } from './mailService.js'
import * as quota from './emailQuota.js'
import { followDigestEmail } from './emailTemplates.js'
import { signId } from '../utils/signedToken.js'
import logger from '../utils/logger.js'

/**
 * Aviso por e-mail de seguidores (opt-in na Conta): alguém pediu para seguir
 * você / aceitou o seu pedido.
 *
 * Cada aviso entra numa fila (follow_email_queue). Quem não recebeu nenhum
 * nas últimas N horas (FOLLOW_EMAIL_INTERVAL_HOURS, padrão 6) recebe na hora;
 * senão os avisos esperam e vão juntos quando o intervalo acaba (a fila é
 * conferida a cada 5 minutos pelo worker, job follow-emails.sweep). Aviso que
 * deixou de valer (pedido cancelado ou recusado, bloqueio) não é enviado.
 *
 * Cada envio ocupa uma vaga no limite da caixa (emailQuota). Sem vaga, os
 * avisos ficam esperando a próxima varredura.
 */

// Token de descadastro: "<id>.<assinatura>" (utils/signedToken.js). Não expira
// (o link do rodapé precisa funcionar em e-mails antigos) e não dá para forjar
// sem a chave, como pede a RFC 8058. Mudar este texto invalida os links já enviados.
//   https://www.rfc-editor.org/rfc/rfc8058
export const UNSUBSCRIBE_PURPOSE = 'unsubscribe:follow-emails'

const DEFAULT_INTERVAL_HOURS = 6

export function intervalHours() {
  const hours = Number(process.env.FOLLOW_EMAIL_INTERVAL_HOURS)
  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_INTERVAL_HOURS
}

const intervalSeconds = () => Math.round(intervalHours() * 3600)

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

export function unsubscribeUrls(userId) {
  const token = encodeURIComponent(signId(UNSUBSCRIBE_PURPOSE, userId))
  return {
    // Página do app (link no corpo do e-mail)
    page: `${siteUrl()}/unsubscribe?token=${token}`,
    // Endpoint do descadastro de um clique (cabeçalho List-Unsubscribe)
    oneClick: `${siteUrl()}/api/email/unsubscribe?token=${token}`
  }
}

/** Põe o aviso na fila (se a pessoa quer) e tenta mandar na hora. */
export async function notify(userId, kind, actorId) {
  try {
    const { rows } = await db.query(q.ENQUEUE, [userId, kind, actorId])
    if (rows.length) await deliver(userId)
  } catch (err) {
    // Aviso é extra: nunca derruba o seguir/aceitar
    logger.error('Aviso de seguidor não entrou na fila', { userId, kind, message: err.message })
  }
}

/** O aviso deixou de valer (pedido cancelado ou recusado). */
export async function withdraw(userId, kind, actorId) {
  await db.query(q.DEQUEUE, [userId, kind, actorId]).catch(err => {
    logger.warn('Aviso de seguidor não saiu da fila', { userId, kind, message: err.message })
  })
}

/** Bloqueio: some qualquer aviso entre os dois. */
export async function withdrawPair(userA, userB) {
  await db.query(q.DEQUEUE_PAIR, [userA, userB]).catch(err => {
    logger.warn('Avisos do bloqueio não saíram da fila', { message: err.message })
  })
}

export async function clearQueue(userId) {
  await db.query(q.CLEAR_USER, [userId])
}

/**
 * Manda o e-mail de quem tem aviso na fila e já pode receber. Devolve true se
 * mandou. Seguro com chamadas em paralelo: só uma consegue "reservar" o envio.
 */
export async function deliver(userId) {
  // Vaga no limite da caixa antes de tudo; sem vaga, os avisos esperam
  const slot = await quota.reserve('follow', userId)
  if (!slot) {
    logger.warn('Aviso de seguidor adiado: limite de envio da caixa atingido', { userId })
    return false
  }

  const { rows: [user] } = await db.query(q.CLAIM, [userId, intervalSeconds()])
  if (!user) {
    await quota.release(slot)
    return false
  }

  // Hora do banco (não a do Node): o que entrar na fila depois disso fica para o próximo
  const startedAt = user.claimed_at
  const { rows: items } = await db.query(q.PENDING_ITEMS, [userId])
  if (items.length === 0) {
    // Tudo deixou de valer: limpa e devolve a "vez" (não conta como e-mail enviado)
    await db.query(q.DELETE_UPTO, [userId, startedAt])
    await db.query(q.RELEASE, [userId, user.previous_sent_at])
    await quota.release(slot)
    return false
  }

  const hasRequest = items.some(item => item.kind === 'request')
  const urls = unsubscribeUrls(userId)
  const mail = followDigestEmail({
    name: user.name,
    locale: user.email_locale,
    link: `${siteUrl()}/community?tab=${hasRequest ? 'requests' : 'following'}`,
    items: items.map(item => ({ kind: item.kind, actor: item.actor })),
    hours: intervalHours(),
    unsubscribe: urls.page
  })

  try {
    await sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html, unsubscribeUrl: urls.oneClick, counted: true })
  } catch (err) {
    // Falhou: os avisos ficam na fila e a próxima varredura tenta de novo
    await db.query(q.RELEASE, [userId, user.previous_sent_at])
    await quota.release(slot)
    logger.error('Aviso de seguidor não foi enviado', { userId, message: err.message })
    return false
  }

  await db.query(q.DELETE_UPTO, [userId, startedAt])
  logger.info('Aviso de seguidor enviado', { userId, items: items.length })
  return true
}

/** Varredura (job follow-emails.sweep): manda para quem tem aviso esperando e já passou do intervalo. */
export async function deliverDue() {
  const { rows } = await db.query(q.DUE_USERS, [intervalSeconds()])
  let sent = 0
  for (const { user_id: userId } of rows) {
    if (await deliver(userId)) sent++
  }
  return sent
}

// startSweeper/stopSweeper saíram: a varredura agora é o job periódico
// follow-emails.sweep do worker (jobs/registry.js).

/** Opção na Conta → { followEmails, locale } */
export async function setPreferences(userId, { followEmails, locale }) {
  const { rows } = await db.query(q.SET_PREFS, [userId, followEmails ?? null, locale ?? null])
  if (followEmails === false) await clearQueue(userId)
  return rows[0] ? { followEmails: rows[0].follow_emails, locale: rows[0].email_locale } : null
}
