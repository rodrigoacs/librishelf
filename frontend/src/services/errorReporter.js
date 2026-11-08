import { API_URL } from '../config/site.js'
import { buildReport, reportKey } from '../utils/errorReport.js'

/**
 * Erros do navegador → POST /client-errors (pacote 37): Vue
 * (app.config.errorHandler), window.onerror e promessas rejeitadas sem
 * tratamento. Só em produção.
 *
 * Por aba: cada erro vai uma vez, e no máximo MAX_PER_TAB no total (uma tela
 * em laço não vira centenas de requisições). O servidor ainda tem limite por
 * IP e deduplica por assinatura.
 */
const MAX_PER_TAB = 10
const RELEASE = typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : null

const sent = new Set()

function send(kind, error, info) {
  if (sent.size >= MAX_PER_TAB) return
  const report = buildReport({ kind, error, info, href: window.location.href, release: RELEASE })
  if (!report) return
  const key = reportKey(report)
  if (sent.has(key)) return
  sent.add(key)
  const body = JSON.stringify(report)
  try {
    // sendBeacon sobrevive a sair da página; text/plain não pede preflight
    if (navigator.sendBeacon?.(`${API_URL}/client-errors`, new Blob([body], { type: 'text/plain' }))) return
  } catch { /* cai no fetch */ }
  fetch(`${API_URL}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' })
    .catch(() => { /* sem rede: o erro fica só no console */ })
}

export function installErrorReporter(app, { enabled = import.meta.env.PROD } = {}) {
  if (!enabled) return
  const previous = app.config.errorHandler
  app.config.errorHandler = (error, instance, info) => {
    send('vue', error, info)
    if (previous) previous(error, instance, info)
    else console.error(error)
  }
  window.addEventListener('error', event => {
    // Falha ao carregar <img>/<script> não traz event.error: não é exceção
    if (!event.error && !event.message) return
    send('error', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', event => send('unhandledrejection', event.reason))
}
