import { nextTick } from 'vue'

/**
 * Trocou de página: o foco vai para o <h1> da página nova. Sem isso o foco
 * ficava no link do menu que foi clicado e o leitor de tela não anunciava
 * nada; quem usa teclado tinha de passar pelo menu inteiro de novo.
 *
 * Só quando muda a página (nome da rota ou parâmetros). Mudança só na query
 * — filtro da biblioteca, ?book= — não mexe no foco, senão a busca perderia
 * o cursor a cada letra. Na primeira carga também não (o navegador já
 * começa do topo).
 */
const MAX_FRAMES = 30

function samePage(to, from) {
  return to.name === from.name && JSON.stringify(to.params) === JSON.stringify(from.params)
}

function findHeading() {
  const main = document.getElementById('main-content')
  return main?.querySelector('h1') ?? document.querySelector('h1')
}

function focusHeading(frame = 0) {
  // Uma janela aberta por cima (livro, confirmação) tem prioridade
  if (document.querySelector('dialog[open]')) return

  const heading = findHeading()
  if (!heading) {
    // Página que monta o título depois de carregar: tenta nos próximos quadros
    if (frame < MAX_FRAMES) requestAnimationFrame(() => focusHeading(frame + 1))
    return
  }
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
}

export function installRouteFocus(router) {
  router.afterEach((to, from, failure) => {
    if (failure || from.matched.length === 0 || samePage(to, from)) return
    nextTick(() => focusHeading())
  })
}
