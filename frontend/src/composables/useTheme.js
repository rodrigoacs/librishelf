import { computed, ref, watch } from 'vue'
import { currentUser } from '../services/session.js'
import api from '../services/api.js'

/**
 * Tema e cor de destaque. O valor inicial é aplicado também por um script
 * inline no index.html (antes do CSS carregar), para não piscar o tema errado.
 *
 * Grátis, no aparelho: claro/escuro e as 6 cores de destaque.
 * Pro (pacote 29), na conta: paletas extras, cores extras e ícone do app.
 * O que vem da conta vale por cima do aparelho e continua valendo sem Pro
 * (só não dá para trocar). Escolher uma opção grátis tira a do Pro da conta.
 */
export const ACCENT_COLORS = ['blue', 'green', 'purple', 'red', 'orange', 'yellow']
export const PRO_ACCENTS = ['teal', 'pink', 'indigo']
// Paleta → tema de base (os tokens da paleta valem por cima dele)
export const PRO_PALETTES = { paper: 'light', amoled: 'dark', slate: 'dark', forest: 'dark' }
export const APP_ICONS = ['night', 'paper', 'mono']

const BROWSER_BAR = { dark: '#121212', light: '#f0f0f3', paper: '#f3ecdf', amoled: '#000000', slate: '#0f172a', forest: '#0f1a14' }

const THEME_KEY = 'user-theme'
const ACCENT_KEY = 'user-accent'
// Cópia do que vem da conta, só para o index.html aplicar antes do Vue
const ACCOUNT_KEY = 'user-personalization'

const currentTheme = ref('dark')
const accentColor = ref('blue')
const account = ref({ palette: null, accent: null, appIcon: null })
const themeVersion = ref(0)
const shownTheme = computed(() => effectiveTheme())
const shownAccent = computed(() => effectiveAccent())

function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // modo privado / storage cheio: segue só na memória
  }
}

function effectiveTheme() {
  return PRO_PALETTES[account.value.palette] || currentTheme.value
}

function effectiveAccent() {
  return PRO_ACCENTS.includes(account.value.accent) ? account.value.accent : accentColor.value
}

function setLink(selector, href) {
  document.querySelectorAll(selector).forEach(link => {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href)
  })
}

// Ícone do app: favicon da aba na hora; o manifesto vale para a próxima instalação
function applyIcon() {
  const icon = APP_ICONS.includes(account.value.appIcon) ? account.value.appIcon : null
  setLink('link[rel="icon"][type="image/svg+xml"]', icon ? `/icons/alt/${icon}.svg` : '/favicon.svg')
  setLink('link[rel="apple-touch-icon"]', icon ? `/icons/alt/${icon}-192.png` : '/bookshelf.png')
  setLink('link[rel="manifest"]', icon ? `/manifest-${icon}.webmanifest` : '/manifest.webmanifest')
}

function applyTheme() {
  const root = document.documentElement
  const theme = effectiveTheme()
  const accent = effectiveAccent()
  root.setAttribute('data-theme', theme)
  if (account.value.palette && PRO_PALETTES[account.value.palette]) root.setAttribute('data-palette', account.value.palette)
  else root.removeAttribute('data-palette')
  root.style.setProperty('--main-color-rgb', `var(--${accent}-rgb)`)
  root.style.setProperty('--main-solid-rgb', `var(--${accent}-solid-rgb)`)
  const bar = BROWSER_BAR[account.value.palette] || BROWSER_BAR[theme]
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', bar))
  applyIcon()
  themeVersion.value++
}

/** Personalização da conta (do /auth/me); null ao sair. */
export function applyAccount(personalization) {
  const next = {
    palette: personalization?.palette ?? null,
    accent: personalization?.accent ?? null,
    appIcon: personalization?.appIcon ?? null
  }
  account.value = next
  const any = next.palette || next.accent || next.appIcon
  writeStorage(ACCOUNT_KEY, any ? JSON.stringify(next) : null)
  applyTheme()
}

export function initTheme() {
  const savedTheme = readStorage(THEME_KEY)
  const savedAccent = readStorage(ACCENT_KEY)

  if (savedTheme === 'light' || savedTheme === 'dark') {
    currentTheme.value = savedTheme
  } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    currentTheme.value = 'light'
  }

  if (ACCENT_COLORS.includes(savedAccent)) accentColor.value = savedAccent

  try {
    const saved = JSON.parse(readStorage(ACCOUNT_KEY) || 'null')
    if (saved) account.value = { palette: saved.palette ?? null, accent: saved.accent ?? null, appIcon: saved.appIcon ?? null }
  } catch {
    // cópia estragada: espera o /auth/me
  }

  applyTheme()

  // A conta manda: aplica quando o /auth/me chega e limpa ao sair
  watch(() => currentUser.value?.personalization, value => {
    if (currentUser.value === null) applyAccount(null)
    else if (value) applyAccount(value)
  }, { deep: true })
}

// Escolha grátis no lugar de uma do Pro: tira a do Pro da conta (sempre
// permitido, mesmo sem Pro). Falha de rede não impede a troca neste aparelho.
async function dropAccount(item) {
  if (!account.value[item]) return
  account.value = { ...account.value, [item]: null }
  writeStorage(ACCOUNT_KEY, JSON.stringify(account.value))
  if (!currentUser.value) return
  try {
    const fresh = await api.resetPersonalization(item)
    if (currentUser.value) currentUser.value.personalization = fresh
  } catch {
    // fica para a próxima vez que o /auth/me chegar
  }
}

export function useTheme() {
  function toggleTheme() {
    currentTheme.value = effectiveTheme() === 'dark' ? 'light' : 'dark'
    writeStorage(THEME_KEY, currentTheme.value)
    dropAccount('palette')
    applyTheme()
  }

  function setAccent(colorName) {
    if (!ACCENT_COLORS.includes(colorName)) return
    accentColor.value = colorName
    writeStorage(ACCENT_KEY, colorName)
    dropAccount('accent')
    applyTheme()
  }

  return {
    // O que está valendo (conta por cima do aparelho): 'dark' | 'light' e a cor
    currentTheme: shownTheme,
    accentColor: shownAccent,
    account,
    themeVersion,
    toggleTheme,
    setAccent,
    availableColors: ACCENT_COLORS
  }
}

/** Lê uma variável CSS já resolvida (para bibliotecas que não entendem var()). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
