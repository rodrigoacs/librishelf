import { ref, computed } from 'vue'
import api from './api.js'
import { clearUserData } from './pwa.js'

/**
 * Estado da sessão em memória. O cookie httpOnly é a fonte da verdade; aqui só
 * fica o perfil carregado de /auth/me, reaproveitado entre navegações para o
 * guard do router não chamar a API a cada troca de página.
 */
const SESSION_TTL_MS = 60_000

const user = ref(null)
let checkedAt = 0
let pending = null

// Sem internet, /auth/me não responde (e o service worker não guarda nada de
// /api/auth). Para o app abrir offline em modo leitura, fica guardado o
// perfil da última sessão confirmada pelo servidor (sai ao sair da conta).
const LAST_USER_KEY = 'librishelf:last-user'

function rememberUser(profile) {
  try {
    // Sem o e-mail: só o necessário para abrir o app (a política de privacidade diz isso)
    if (profile) {
      const { email, ...offline } = profile
      localStorage.setItem(LAST_USER_KEY, JSON.stringify(offline))
    } else {
      localStorage.removeItem(LAST_USER_KEY)
    }
  } catch {
    // Sem localStorage (navegação privada): offline pede login, como antes
  }
}

function lastUser() {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const currentUser = computed(() => user.value)
export const isAuthenticated = computed(() => Boolean(user.value))

export function setUser(profile) {
  // Outra conta neste navegador: o que estava guardado offline era da anterior
  const previous = lastUser()
  if (previous && profile && previous.id !== profile.id) clearUserData()
  user.value = profile
  checkedAt = Date.now()
  rememberUser(profile)
}

export function clearSession() {
  user.value = null
  checkedAt = 0
  pending = null
  rememberUser(null)
  clearUserData()
}

/** Garante uma sessão válida. Usa o cache por até SESSION_TTL_MS, a não ser com { force: true }. */
export async function loadSession({ force = false } = {}) {
  if (!force && user.value && Date.now() - checkedAt < SESSION_TTL_MS) {
    return user.value
  }

  if (!pending) {
    pending = api.me()
      .then(({ user: profile }) => {
        setUser(profile)
        return profile
      })
      .catch(error => {
        // Sem rede (status 0): segue com a última sessão, em modo leitura
        const offlineUser = error?.status === 0 ? lastUser() : null
        if (offlineUser) {
          user.value = offlineUser
          checkedAt = 0
          return offlineUser
        }
        clearSession()
        return null
      })
      .finally(() => {
        pending = null
      })
  }

  return pending
}

export function updateUser(patch) {
  if (user.value) {
    user.value = { ...user.value, ...patch }
    rememberUser(user.value)
  }
}
