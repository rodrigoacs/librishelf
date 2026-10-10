import { API_URL } from '../config/site.js'

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
  }
}

async function parseError(response) {
  const text = await response.text()

  try {
    const json = JSON.parse(text)
    return new ApiError(json.error || json.message || 'Erro desconhecido', response.status, json)
  } catch {
    return new ApiError(text || 'Erro na requisição', response.status, null)
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

  const response = await fetch(`${API_URL}${endpoint}`, config)

  if (response.status === 401) {
    const isSessionCheck = endpoint === SESSION_ENDPOINT
    const isCredentialCheck = endpoint.startsWith(AUTH_ENDPOINT_PREFIX) && !isSessionCheck

    if (!isCredentialCheck) {
      onSessionExpired({ silent: isSessionCheck })
      throw new ApiError('Sessão expirada. Faça login novamente.', 401, null)
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
