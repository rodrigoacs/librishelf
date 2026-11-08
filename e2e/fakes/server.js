import http from 'node:http'
import * as mercadoPago from './mercadoPago.js'
import { clearInbox, inbox, startSmtp } from './mail.js'

/**
 * Serviços de fora, falsos, para os testes de ponta a ponta. Node puro, sem
 * dependências: roda igual no compose (node:24-alpine) e na máquina.
 *
 *   PORT              HTTP: Mercado Pago falso e controle (padrão 4010)
 *   SMTP_PORT         caixa de e-mail (padrão 1025)
 *   PUBLIC_URL        endereço deste serviço visto pelo navegador (checkout)
 *   MP_WEBHOOK_SECRET mesma chave do backend, para assinar os webhooks
 *   WEBHOOK_URL       para onde mandar os webhooks (padrão: notification_url)
 *
 * Controle, para os testes:
 *   GET    /__fake/mail?to=…   e-mails recebidos (mais novos por último)
 *   DELETE /__fake/mail        esvazia a caixa
 *   GET    /__fake/payments    pagamentos criados
 *   GET    /health
 */
const PORT = Number(process.env.PORT) || 4010
const SMTP_PORT = Number(process.env.SMTP_PORT) || 1025

mercadoPago.configure({
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, ''),
  webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
  webhookUrl: process.env.WEBHOOK_URL || ''
})

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function control(req, res, url) {
  if (url.pathname === '/health') return mercadoPago.json(res, 200, { ok: true })
  if (url.pathname === '/__fake/mail' && req.method === 'GET') {
    const to = url.searchParams.get('to')?.toLowerCase()
    return mercadoPago.json(res, 200, { messages: inbox().filter(message => !to || message.to.includes(to)) })
  }
  if (url.pathname === '/__fake/mail' && req.method === 'DELETE') {
    clearInbox()
    return mercadoPago.json(res, 200, { ok: true })
  }
  if (url.pathname === '/__fake/payments') return mercadoPago.json(res, 200, { payments: mercadoPago.allPayments() })
  return false
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  try {
    if (await control(req, res, url)) return
    if (await mercadoPago.handle(req, res, url, () => readBody(req))) return
    mercadoPago.json(res, 404, { message: 'not_found' })
  } catch (err) {
    console.error('[fakes]', err)
    mercadoPago.json(res, 500, { message: err.message })
  }
})

server.listen(PORT, () => console.log(`[fakes] HTTP em :${PORT}`))
startSmtp(SMTP_PORT)

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0))
