import { ref } from 'vue'

/**
 * Tema e cor de destaque. O valor inicial é aplicado também por um script
 * inline no index.html (antes do CSS carregar), para não piscar o tema errado.
 */
export const ACCENT_COLORS = ['blue', 'green', 'purple', 'red', 'orange', 'yellow']

// Cor da barra do navegador no celular (meta theme-color) = --bg-app de cada tema
const BROWSER_BAR = { dark: '#121212', light: '#f0f0f3' }

const THEME_KEY = 'user-theme'
const ACCENT_KEY = 'user-accent'

const currentTheme = ref('dark')
const accentColor = ref('blue')
// Incrementado a cada mudança: componentes que leem cores calculadas
// (gráficos) observam isto para redesenhar.
const themeVersion = ref(0)

function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // preferências valem só para esta aba
  }
}

function applyTheme() {
  const root = document.documentElement
  root.setAttribute('data-theme', currentTheme.value)
  root.style.setProperty('--main-color-rgb', `var(--${accentColor.value}-rgb)`)
  root.style.setProperty('--main-solid-rgb', `var(--${accentColor.value}-solid-rgb)`)
  // Segue o tema escolhido no app, não o do sistema
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.setAttribute('content', BROWSER_BAR[currentTheme.value])
  })
  themeVersion.value++
}

export function initTheme() {
  const savedTheme = readStorage(THEME_KEY)
  const savedAccent = readStorage(ACCENT_KEY)

  if (savedTheme === 'light' || savedTheme === 'dark') {
    currentTheme.value = savedTheme
  } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    currentTheme.value = 'light'
  }

  if (ACCENT_COLORS.includes(savedAccent)) {
    accentColor.value = savedAccent
  }

  applyTheme()
}

export function useTheme() {
  function toggleTheme() {
    currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark'
    writeStorage(THEME_KEY, currentTheme.value)
    applyTheme()
  }

  function setAccent(colorName) {
    if (!ACCENT_COLORS.includes(colorName)) return
    accentColor.value = colorName
    writeStorage(ACCENT_KEY, colorName)
    applyTheme()
  }

  return {
    currentTheme,
    accentColor,
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
