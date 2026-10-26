import nodemailer from 'nodemailer'
import logger from '../utils/logger.js'
import { count, failure, succeeded } from '../utils/metrics.js'

/**
 * Envio de e-mail por SMTP (nodemailer).
 *
 *   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (false = STARTTLS; true para a 465),
 *   SMTP_USER, SMTP_PASS, MAIL_FROM ("Librishelf <noreply@librishelf.com>")
 *
 * Sem SMTP_HOST (desenvolvimento): o e-mail não sai; o conteúdo vai para o log,
 * para dar para copiar o link. Nos testes, fica guardado em memória.
 */

const outbox = []
let transport = null

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim())
}

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000
    })
  }
  return transport
}

function sender() {
  return process.env.MAIL_FROM?.trim() || 'Librishelf <noreply@librishelf.com>'
}

/** Só para testes: e-mails "enviados" desde o último clear. */
export function testOutbox() {
  return outbox
}

/**
 * Envia (ou registra no log, sem SMTP). Lança erro se o servidor SMTP recusar.
 * `unsubscribeUrl` (avisos): cabeçalhos List-Unsubscribe e
 * List-Unsubscribe-Post para o descadastro de um clique do Gmail, Yahoo,
 * Apple Mail… (RFC 8058). O provedor faz um POST nessa URL.
 *   https://www.rfc-editor.org/rfc/rfc8058
 */
export async function sendMail({ to, subject, text, html, unsubscribeUrl }) {
  const headers = unsubscribeUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  const list = unsubscribeUrl ? { unsubscribe: unsubscribeUrl } : undefined

  if (process.env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text, html, headers, list })
    return
  }

  if (!smtpConfigured()) {
    logger.warn('SMTP não configurado: e-mail não enviado (conteúdo abaixo)', { to, subject, text })
    return
  }

  let info
  try {
    info = await getTransport().sendMail({ from: sender(), to, subject, text, html, headers, list })
  } catch (err) {
    count('email.failed')
    failure('email', err.message)
    throw err
  }
  count('email.sent')
  succeeded('email')
  logger.info('E-mail enviado', { to, subject, messageId: info.messageId })
}

/** Para a área administrativa: o que está configurado (sem senha nem usuário). */
export function mailConfig() {
  return {
    configured: smtpConfigured(),
    host: smtpConfigured() ? process.env.SMTP_HOST.trim() : null,
    port: smtpConfigured() ? Number(process.env.SMTP_PORT) || 587 : null,
    from: sender(),
    adminEmail: Boolean(process.env.ADMIN_EMAIL?.trim())
  }
}

/** Checa a conexão com o servidor SMTP (usado no boot, só para avisar). */
export async function verifySmtp() {
  if (!smtpConfigured() || process.env.NODE_ENV === 'test') return
  try {
    await getTransport().verify()
    logger.info('SMTP pronto', { host: process.env.SMTP_HOST })
  } catch (err) {
    logger.error('SMTP não respondeu: e-mails de senha e confirmação vão falhar', { host: process.env.SMTP_HOST, message: err.message })
  }
}
