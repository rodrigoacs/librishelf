import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

/**
 * Para faixas que rolam para o lado (abas, tabelas): diz se ainda há conteúdo
 * escondido à esquerda/direita, para a tela mostrar um degradê ou um aviso
 * em vez de cortar no meio ("Modera…") sem indicar que dá para rolar.
 */
export function useScrollEdges(elRef) {
  const scrollable = ref(false)
  const moreStart = ref(false)
  const moreEnd = ref(false)

  function update() {
    const el = elRef.value
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    scrollable.value = max > 1
    moreStart.value = el.scrollLeft > 1
    moreEnd.value = el.scrollLeft < max - 1
  }

  let observer = null
  let current = null
  function attach(el) {
    current?.removeEventListener('scroll', update)
    observer?.disconnect()
    current = el
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update)
      observer.observe(el)
      if (el.firstElementChild) observer.observe(el.firstElementChild)
    }
    update()
  }

  onMounted(() => attach(elRef.value))
  watch(elRef, el => attach(el))
  onBeforeUnmount(() => attach(null))

  return { scrollable, moreStart, moreEnd, update }
}
