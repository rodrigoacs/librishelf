import { API_URL } from '../config/site.js'
import i18n from '../i18n.js'
import { markApiReachable, markApiUnreachable } from './network.js'

// Rotas de auth respondem 401 por credencial errada (login, senha atual
// incorreta), não por sessão expirada.
const AUTH_ENDPOINT_PREFIX = '/auth/'
const SESSION_ENDPOINT = '/auth/me'

let onSessionExpired = () => {}

/** O módulo de sessão registra aqui o que fazer quando a API responde 401. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.code = body?.code ?? null
  }
}

/**
 * Mensagem no idioma da pessoa: a API manda um código estável (ISBN_TAKEN,
 * USERNAME_RESERVED...) e, às vezes, parâmetros ({ max: 200 }). Sem tradução
 * para o código, fica a mensagem que veio do servidor.
 */
export function translateApiError(code, params, fallback) {
  const { t, te } = i18n.global
  if (!code || !te(`errors.${code}`)) return fallback
  const values = { ...(params || {}) }
  if (values.field && te(`errors.fields.${values.field}`)) values.field = t(`errors.fields.${values.field}`)
  return t(`errors.${code}`, values)
}

async function parseError(response) {
  const text = await response.text()

  try {
    const json = JSON.parse(text)
    const raw = json.error || json.message || i18n.global.t('errors.UNKNOWN')
    return new ApiError(translateApiError(json.code, json.params, raw), response.status, json)
  } catch {
    const fallback = response.status >= 500 ? i18n.global.t('errors.INTERNAL_ERROR') : i18n.global.t('errors.UNKNOWN')
    return new ApiError(text && text.length < 200 && !text.startsWith('<') ? text : fallback, response.status, null)
  }
}

async function client(endpoint, { body, ...customConfig } = {}) {
  const config = {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    ...customConfig,
    headers: {
      'Content-Type': 'application/json',
      ...customConfig.headers
    }
  }

  if (body !== undefined) {
    if (body instanceof FormData) {
      delete config.headers['Content-Type']
      config.body = body
    } else {
      config.body = JSON.stringify(body)
    }
  }

  let response
  try {
    response = await fetch(`${API_URL}${endpoint}`, config)
  } catch (error) {
    // Cancelada de propósito: quem chamou trata. Senão é rede (sem internet, servidor fora).
    if (error.name === 'AbortError') throw error
    markApiUnreachable()
    throw new ApiError(i18n.global.t('errors.NETWORK'), 0, null)
  }

  // Resposta guardada pelo service worker (sem internet): modo leitura
  if (response.headers.get('X-Librishelf-Offline')) {
    markApiUnreachable()
    if (response.status === 503) throw new ApiError(i18n.global.t('errors.OFFLINE'), 0, null)
  } else {
    markApiReachable()
  }

  if (response.status === 401) {
    const isSessionCheck = endpoint === SESSION_ENDPOINT
    const isCredentialCheck = endpoint.startsWith(AUTH_ENDPOINT_PREFIX) && !isSessionCheck

    if (!isCredentialCheck) {
      onSessionExpired({ silent: isSessionCheck })
      throw new ApiError(i18n.global.t('errors.SESSION_EXPIRED'), 401, null)
    }
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return null
  }

  return await response.json()
}

export default {
  get: (endpoint, config) => client(endpoint, { ...config, method: 'GET' }),
  post: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'POST' }),
  put: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PUT' }),
  patch: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PATCH' }),
  delete: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'DELETE' })
}
