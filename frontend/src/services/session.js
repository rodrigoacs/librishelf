import { ref, computed } from 'vue'
import api from './api.js'

/**
 * Estado da sessão em memória. O cookie httpOnly é a fonte da verdade; aqui só
 * fica o perfil carregado de /auth/me, reaproveitado entre navegações para o
 * guard do router não chamar a API a cada troca de página.
 */
const SESSION_TTL_MS = 60_000

const user = ref(null)
let checkedAt = 0
let pending = null

export const currentUser = computed(() => user.value)
export const isAuthenticated = computed(() => Boolean(user.value))

export function setUser(profile) {
  user.value = profile
  checkedAt = Date.now()
}

export function clearSession() {
  user.value = null
  checkedAt = 0
  pending = null
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
      .catch(() => {
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
  if (user.value) user.value = { ...user.value, ...patch }
}
