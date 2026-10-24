import { watch } from 'vue'
import i18n from '../i18n.js'

/**
 * Título da aba do navegador: "Biblioteca · Librishelf". Com várias abas
 * abertas (e no histórico) dá para saber qual é qual, e o leitor de tela
 * anuncia a página nova.
 *
 * Cada rota diz o seu em meta.title (chave de pageTitle.*). Um livro aberto
 * por cima da página entra na frente: "Duna · Biblioteca de ana · Librishelf".
 */
const APP_NAME = 'Librishelf'

let currentRoute = null
let overlay = ''

function routeTitle(route) {
  const key = route?.meta?.title
  if (!key) return ''
  return i18n.global.t(`pageTitle.${key}`, { name: route.params?.username ?? '' })
}

function render() {
  document.title = [overlay, routeTitle(currentRoute), APP_NAME].filter(Boolean).join(' · ')
}

/**
 * <meta name="robots" content="noindex"> nas rotas com meta.noindex.
 *
 * meta.noindex === 'server': quem decide é o servidor (o nginx injeta a tag
 * no index.html de /u/<usuário> conforme a opção "aparecer em buscadores").
 * A troca de rota não mexe na tag; a página chama setRobots() quando souber.
 */
export function setRobots(noindex) {
  let tag = document.head.querySelector('meta[name="robots"]')
  if (!noindex) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = 'robots'
    document.head.appendChild(tag)
  }
  tag.content = 'noindex, nofollow'
}

/** Chamado pelo router.afterEach. */
export function setRouteTitle(route) {
  currentRoute = route
  overlay = ''
  render()
  if (route?.meta?.noindex !== 'server') setRobots(Boolean(route?.meta?.noindex))
}

/** Algo aberto por cima da página (o livro); '' tira. */
export function setOverlayTitle(text) {
  overlay = text || ''
  render()
}

// Trocou o idioma: o título acompanha
watch(i18n.global.locale, render)
