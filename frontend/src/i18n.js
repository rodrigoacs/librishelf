import { createI18n } from 'vue-i18n'

const SUPPORTED = ['pt', 'en']
// Cada idioma é um chunk separado: só o que está em uso é baixado (o service
// worker guarda os dois para a troca funcionar offline).
const LOADERS = {
  pt: () => import('./locales/pt.json'),
  en: () => import('./locales/en.json')
}
const HTML_LANG = { pt: 'pt-BR', en: 'en' }

function readSavedLocale() {
  try {
    const saved = localStorage.getItem('user-locale')
    if (SUPPORTED.includes(saved)) return saved
  } catch {
    // localStorage indisponível (modo privado, cookies bloqueados): segue o navegador.
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : (navigator.language ? 'en' : 'pt')
}

const initialLocale = readSavedLocale()

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  globalInjection: true,
  messages: {}
})

const loaded = new Set()

/** Baixa e registra as mensagens do idioma (uma vez só). */
export async function loadLocaleMessages(locale) {
  if (loaded.has(locale)) return
  const messages = await LOADERS[locale]()
  i18n.global.setLocaleMessage(locale, messages.default ?? messages)
  loaded.add(locale)
}

export function applyDocumentLanguage(locale) {
  document.documentElement.lang = HTML_LANG[locale] || locale
}

export async function setLocale(locale) {
  if (!SUPPORTED.includes(locale)) return
  try {
    await loadLocaleMessages(locale)
  } catch {
    return // sem rede e sem o chunk guardado: fica no idioma atual
  }
  i18n.global.locale.value = locale
  applyDocumentLanguage(locale)
  try {
    localStorage.setItem('user-locale', locale)
  } catch {
    // ignora: a troca vale para a sessão atual
  }
}

applyDocumentLanguage(initialLocale)

/** Resolve quando o idioma inicial está carregado (o main.js espera antes de montar). */
export const i18nReady = loadLocaleMessages(initialLocale)

export default i18n
