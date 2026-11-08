/**
 * Relatório de erro do navegador para POST /client-errors (pacote 37).
 * Funções puras: services/errorReporter.js liga aos eventos.
 *
 * O servidor limpa de novo (e-mail, token, query), mas aqui já sai só o
 * necessário: nada de usuário, corpo de requisição ou query da URL.
 */
const MAX_MESSAGE = 300
const MAX_STACK = 4000

// Ruído conhecido: não é bug do Librishelf
const IGNORED = [
  /ResizeObserver loop/i, // aviso do navegador, inofensivo
  /^Script error\.?$/i, // erro de script de outra origem, sem detalhe
  /AbortError|The user aborted a request/i // requisição cancelada de propósito
]
const EXTENSION = /(chrome|moz|safari(-web)?)-extension:\/\//

function messageOf(error) {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  if (error && typeof error.message === 'string') return error.message
  try { return JSON.stringify(error) } catch { return String(error) }
}

/**
 * { kind: 'vue' | 'error' | 'unhandledrejection', error, info?, href, release? }
 * → corpo do relatório, ou null quando é ruído.
 */
export function buildReport({ kind, error, info = null, href, release = null }) {
  const message = String(messageOf(error) ?? '').trim().slice(0, MAX_MESSAGE)
  if (!message || IGNORED.some(pattern => pattern.test(message))) return null
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack.slice(0, MAX_STACK) : null
  if (stack && EXTENSION.test(stack)) return null
  let page
  try { page = new URL(href).pathname } catch { page = null }
  return { kind, message, stack, page, info: info ? String(info).slice(0, 60) : null, release }
}

/** Mesma chave = mesmo erro: vai uma vez por aba. */
export const reportKey = report => `${report.kind}|${report.page}|${report.message}`
