const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'
const APP_BASE = import.meta.env.BASE_URL || '/'

// Rotas de auth respondem 401 por credenciais erradas, não por sessão expirada.
const AUTH_ENDPOINT_PREFIX = '/auth/'
const PUBLIC_PATHS = ['login', 'register', 'u/']

function isOnPublicPage() {
  const path = window.location.pathname.slice(APP_BASE.length)
  return PUBLIC_PATHS.some(publicPath => path.startsWith(publicPath))
}

function handleSessionExpired() {
  localStorage.removeItem('user')

  if (!isOnPublicPage()) {
    window.location.assign(`${APP_BASE}login`)
  }
}

async function parseError(response) {
  const errorMessage = await response.text()

  try {
    const jsonError = JSON.parse(errorMessage)
    return new Error(jsonError.error || jsonError.message || 'Erro desconhecido')
  } catch {
    return new Error(errorMessage || 'Erro na requisição')
  }
}

async function client(endpoint, { body, ...customConfig } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  }

  const config = {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    ...customConfig,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
  }

  if (body) {
    if (body instanceof FormData) {
      delete config.headers['Content-Type']
      config.body = body
    } else {
      config.body = JSON.stringify(body)
    }
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, config)

  if (response.status === 401 && !endpoint.startsWith(AUTH_ENDPOINT_PREFIX)) {
    handleSessionExpired()
    throw new Error('Sessão expirada. Faça login novamente.')
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
  delete: (endpoint, config) => client(endpoint, { ...config, method: 'DELETE' }),
}
