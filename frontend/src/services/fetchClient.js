const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'

async function client(endpoint, { body, ...customConfig } = {}) {
  const token = localStorage.getItem('token')

  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const config = {
    method: body ? 'POST' : 'GET',
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

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config)

    if (response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return Promise.reject(new Error('Sessão expirada. Faça login novamente.'))
    }

    if (response.ok) {
      if (response.status === 204) {
        return null
      }
      return await response.json()
    } else {
      const errorMessage = await response.text()
      try {
        const jsonError = JSON.parse(errorMessage)
        return Promise.reject(new Error(jsonError.message || jsonError.error || 'Erro desconhecido'))
      } catch {
        return Promise.reject(new Error(errorMessage || 'Erro na requisição'))
      }
    }
  } catch (error) {
    return Promise.reject(error)
  }
}

export default {
  get: (endpoint, config) => client(endpoint, { ...config, method: 'GET' }),
  post: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'POST' }),
  put: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PUT' }),
  patch: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PATCH' }),
  delete: (endpoint, config) => client(endpoint, { ...config, method: 'DELETE' }),
}