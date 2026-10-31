import { computed, reactive, ref } from 'vue'

/**
 * Estado da navegação do celular, dividido entre a barra do topo, a gaveta
 * (NavigationMenu) e a barra de abas (TabBar).
 */

/** Gaveta do menu aberta (a aba "Menu" e o arrasto da borda abrem a mesma) */
export const drawerOpen = ref(false)

// Quem pediu para esconder a barra de abas (seleção em lote, teclado...).
// Some enquanto houver ao menos um pedido.
const hideReasons = reactive(new Set())

export function setTabBarHidden(reason, hidden) {
  if (hidden) hideReasons.add(reason)
  else hideReasons.delete(reason)
}

export const tabBarHidden = computed(() => hideReasons.size > 0)

// Livro criado pelo "+" da barra de abas: as telas abertas recarregam
export const bookCreatedTick = ref(0)

export function notifyBookCreated() {
  bookCreatedTick.value++
}
