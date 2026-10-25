/**
 * App instalável e offline: registra o service worker (gerado no build a
 * partir de frontend/sw/sw.js) e cuida do que é de cada usuário no cache.
 *
 * Só em produção: no `vite dev` um service worker atrapalharia o hot reload.
 */
const USER_CACHES = ['librishelf-api', 'librishelf-covers']

export function registerServiceWorker({ onUpdated } = {}) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  // Service worker novo assumiu: só avisa se esta aba ainda roda o código antigo
  // (a página sempre busca o index.html na rede, então quem acabou de abrir já
  // está na versão nova)
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (await runningOldVersion()) onUpdated?.()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      // updateViaCache 'none': o navegador sempre confere o sw.js no servidor
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        // Aba aberta por muito tempo: procura versão nova a cada hora
        setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
      })
      .catch(() => {
        // Sem service worker o app funciona igual, só não abre offline
      })
  })
}

/** O index.html do servidor aponta para outro JS principal que o desta aba? */
async function runningOldVersion() {
  try {
    const current = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')
    if (!current) return false
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    return !html.includes(current)
  } catch {
    return false
  }
}

/**
 * Apaga as respostas da API e as capas guardadas (sair da conta, excluir a
 * conta, entrar com outra conta). O esqueleto do app fica.
 */
export async function clearUserData() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_DATA' })
    if ('caches' in window) await Promise.all(USER_CACHES.map(name => caches.delete(name)))
  } catch {
    // Sem Cache Storage (navegação privada antiga): nada guardado
  }
}

/**
 * Deploy novo com a aba aberta: um pedaço do app que ainda não tinha sido
 * carregado pode não existir mais no servidor. Recarrega uma vez para pegar
 * a versão nova (recomendação do Vite para "vite:preloadError").
 */
export function reloadOnStaleChunks() {
  window.addEventListener('vite:preloadError', event => {
    try {
      if (sessionStorage.getItem('librishelf:chunk-reload')) return
      sessionStorage.setItem('librishelf:chunk-reload', '1')
    } catch {
      // sem sessionStorage: recarrega mesmo assim
    }
    event.preventDefault()
    window.location.reload()
  })
  window.addEventListener('load', () => {
    setTimeout(() => {
      try { sessionStorage.removeItem('librishelf:chunk-reload') } catch { /* ok */ }
    }, 10000)
  })
}
