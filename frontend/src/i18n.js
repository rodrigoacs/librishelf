import { createI18n } from 'vue-i18n'
import pt from './locales/pt.json'
import en from './locales/en.json'

const SUPPORTED = ['pt', 'en']
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
  messages: { pt, en }
})

export function applyDocumentLanguage(locale) {
  document.documentElement.lang = HTML_LANG[locale] || locale
}

export function setLocale(locale) {
  if (!SUPPORTED.includes(locale)) return
  i18n.global.locale.value = locale
  applyDocumentLanguage(locale)
  try {
    localStorage.setItem('user-locale', locale)
  } catch {
    // ignora: a troca vale para a sessão atual
  }
}

applyDocumentLanguage(initialLocale)

export default i18n
