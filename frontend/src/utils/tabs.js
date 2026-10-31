/**
 * Barra de abas do celular: Início, Biblioteca, [Adicionar], Comunidade, Menu.
 * Telas sem aba própria (Listas, Autores, Conta...) acendem "Menu", que é onde
 * elas moram.
 */
export const TAB_ROUTES = {
  home: 'home',
  library: 'library',
  community: 'community'
}

/** Aba acesa para a rota atual (nome da rota do vue-router). */
export function activeTab(routeName) {
  for (const [tab, name] of Object.entries(TAB_ROUTES)) {
    if (routeName === name) return tab
  }
  return 'menu'
}

const NO_KEYBOARD = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'])

/**
 * true quando o foco abre o teclado (campo de texto, área de texto, editável).
 * Com o teclado aberto a barra de abas sai de cena.
 */
export function opensKeyboard(element) {
  if (!element || element.nodeType !== 1) return false
  if (element.isContentEditable) return true
  const tag = element.tagName
  if (tag === 'TEXTAREA') return !element.readOnly && !element.disabled
  if (tag !== 'INPUT') return false
  const type = (element.getAttribute('type') || 'text').toLowerCase()
  return !NO_KEYBOARD.has(type) && !element.readOnly && !element.disabled
}
