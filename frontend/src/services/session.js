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
// O perfil guardado vale o mesmo que o cookie da sessão (7 dias): depois
// disso a sessão já venceu no servidor e o modo offline não abre mais.
const OFFLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000
// "Sair" sem conexão: o cookie ainda vale no servidor. Fica marcado aqui e a
// próxima verificação de sessão encerra no servidor antes de qualquer coisa.
const PENDING_LOGOUT_KEY = 'librishelf:pending-logout'

function setPendingLogout(pending) {
  try {
    if (pending) localStorage.setItem(PENDING_LOGOUT_KEY, '1')
    else localStorage.removeItem(PENDING_LOGOUT_KEY)
  } catch {
    // Sem localStorage: não há como lembrar; o aviso ao sair já explicou
  }
}

function hasPendingLogout() {
  try {
    return localStorage.getItem(PENDING_LOGOUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Tenta encerrar no servidor. → true se o servidor confirmou (ou não havia sessão). */
async function logoutOnServer() {
  try {
    await api.logout()
    setPendingLogout(false)
    return true
  } catch (error) {
    // 4xx: não há sessão válida para encerrar (já venceu ou foi encerrada)
    if (error?.status >= 400 && error.status < 500) {
      setPendingLogout(false)
      return true
    }
    setPendingLogout(true)
    return false
  }
}

function rememberUser(profile) {
  try {
    // Sem o e-mail: só o necessário para abrir o app (a política de privacidade diz isso)
    if (profile) {
      const { email, ...offline } = profile
      localStorage.setItem(LAST_USER_KEY, JSON.stringify({ ...offline, savedAt: Date.now() }))
    } else {
      localStorage.removeItem(LAST_USER_KEY)
    }
  } catch {
    // Sem localStorage (navegação privada): offline pede login, como antes
  }
}

function lastUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null')
    if (!saved) return null
    // Sem data (versão anterior) ou mais velho que a sessão: descarta
    if (!Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > OFFLINE_TTL_MS) {
      localStorage.removeItem(LAST_USER_KEY)
      return null
    }
    const { savedAt, ...profile } = saved
    return profile
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
  // Entrou de novo com o servidor respondendo: não há saída pendente a repetir
  if (profile) setPendingLogout(false)
}

/** Entrar: a sessão nova substitui qualquer saída pendente deste aparelho. */
export async function login(credentials) {
  await api.login(credentials)
  setPendingLogout(false)
  return loadSession({ force: true })
}

/**
 * "Sair": encerra a sessão no servidor e limpa este aparelho. Sem conexão (ou
 * com o servidor fora), limpa mesmo assim e guarda o pedido para repetir.
 * → { serverDone } — false quando a sessão continua aberta no servidor.
 */
export async function logout() {
  const serverDone = await logoutOnServer()
  clearSession()
  return { serverDone }
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

  if (!pending && hasPendingLogout()) {
    // Saiu sem conexão: primeiro encerra no servidor; não entra de novo sozinho
    pending = logoutOnServer()
      .then(() => {
        clearSession()
        return null
      })
      .finally(() => {
        pending = null
      })
    return pending
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
