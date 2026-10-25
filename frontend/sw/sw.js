/* global self, caches, fetch, Response, URL */
/**
 * Service worker do Librishelf — gerado no build a partir de frontend/sw/sw.js
 * (vite/serviceWorker.js troca __BUILD_ID__ e __PRECACHE__).
 *
 * O que faz:
 *   - app instalável que abre sem internet: o "esqueleto" (index.html, JS,
 *     CSS, fontes, ícones) fica guardado na instalação;
 *   - modo leitura offline: as telas guardam a última resposta da API que
 *     viram (biblioteca, livro aberto, painel…) e as capas;
 *   - nada de /api/auth/* (sessão, senha) nem das buscas no Open Library.
 *
 * Estratégias:
 *   páginas (navegação)  rede primeiro; sem rede, o index.html guardado
 *   /assets/*            cache primeiro (nomes com hash nunca mudam)
 *   /api/uploads/*       capas: mostra a guardada e atualiza por trás
 *   /api/* (GET)         rede primeiro; sem rede, a última resposta guardada
 *                        (com o cabeçalho X-Librishelf-Offline: 1)
 *   https://web.dev/articles/offline-cookbook
 *
 * Versão nova: instala, guarda o esqueleto novo e assume na hora
 * (skipWaiting). Páginas abertas continuam funcionando porque os arquivos
 * antigos ficam no cache de assets até serem podados.
 */
const BUILD_ID = '__BUILD_ID__'
const PRECACHE = __PRECACHE__

const SHELL = 'librishelf-shell'
const ASSETS = 'librishelf-assets'
const API = 'librishelf-api'
const COVERS = 'librishelf-covers'
const KNOWN = [SHELL, ASSETS, API, COVERS]

const SHELL_KEY = '/index.html'
const STATIC_FILE = /\.(png|ico|svg|webmanifest|jpg|webp)$/
const NETWORK_TIMEOUT_MS = 5000
const MAX_ASSETS = 300
const MAX_API = 250
const MAX_COVERS = 500

// Nunca guardados: sessão/conta, buscas externas, prévia, descadastro e o
// mosaico aleatório da tela de login
const API_BYPASS = [/^\/api\/auth\//, /^\/api\/isbn\//, /^\/api\/meta\//, /^\/api\/email\//, /^\/api\/moderation\//, /^\/api\/ping$/, /^\/api\/library\/covers\/random/]

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const assets = await caches.open(ASSETS)
    // Um por um: um arquivo que falhar não impede o resto (nem a instalação)
    await Promise.all(PRECACHE.map(async url => {
      if (await assets.match(url)) return
      try {
        const response = await fetch(url, { cache: 'no-cache' })
        if (response.ok) await assets.put(url, response)
      } catch {
        // Fica para o primeiro uso
      }
    }))
    try {
      const shell = await fetch('/', { cache: 'no-cache' })
      if (shell.ok) await (await caches.open(SHELL)).put(SHELL_KEY, shell)
    } catch {
      // Sem rede na instalação: a primeira navegação online guarda
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('librishelf-') && !KNOWN.includes(name)) await caches.delete(name)
    }
    await trim(ASSETS, MAX_ASSETS, new Set(PRECACHE.map(url => new URL(url, self.location.origin).href)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  const type = event.data?.type
  // Saiu da conta (ou entrou outra pessoa): some o que era de quem estava logado
  if (type === 'CLEAR_USER_DATA') {
    event.waitUntil(Promise.all([caches.delete(API), caches.delete(COVERS)]))
  }
  if (type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', build: BUILD_ID })
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }
  if (url.pathname.startsWith('/api/')) {
    if (API_BYPASS.some(pattern => pattern.test(url.pathname))) return
    if (url.pathname.startsWith('/api/uploads/')) {
      event.respondWith(staleWhileRevalidate(event, request, COVERS, MAX_COVERS))
      return
    }
    event.respondWith(networkFirst(request))
    return
  }
  // Ícones, favicon, manifest, imagens de public/ (o resto vai direto para a rede)
  if (STATIC_FILE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request, ASSETS, MAX_ASSETS))
  }
})

async function navigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      const copy = response.clone()
      caches.open(SHELL).then(cache => cache.put(SHELL_KEY, copy)).catch(() => {})
    }
    return response
  } catch {
    const cached = await caches.match(SHELL_KEY, { cacheName: SHELL })
    return cached || new Response('<h1>Sem conexão</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone()).catch(() => {})
  return response
}

async function staleWhileRevalidate(event, request, cacheName, max) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request).then(async response => {
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone())
      await trim(cacheName, max)
    }
    return response
  })
  if (cached) {
    event.waitUntil(network.catch(() => {}))
    return cached
  }
  return network
}

/** Rede primeiro; sem rede (ou demorando demais e havendo cópia), a última resposta guardada. */
async function networkFirst(request) {
  const cache = await caches.open(API)
  const network = fetch(request).then(async response => {
    // Só respostas boas e "normais" (nada de erro, 304 ou redirecionamento)
    if (response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone())
      await trim(API, MAX_API)
    }
    return response
  })
  // Se a cópia guardada responder antes, a rede pode falhar depois sem ninguém esperar
  network.catch(() => {})

  const cached = await cache.match(request)
  try {
    if (!cached) return await network
    return await Promise.race([
      network,
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
    ])
  } catch {
    if (cached) return offlineCopy(cached)
    return new Response(JSON.stringify({ error: 'Sem conexão.', code: 'OFFLINE' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-Librishelf-Offline': '1' }
    })
  }
}

// Marca a resposta guardada para o app avisar "você está vendo a última versão salva"
function offlineCopy(response) {
  const headers = new Headers(response.headers)
  headers.set('X-Librishelf-Offline', '1')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Mantém no máximo `max` itens (apaga os mais antigos; `keep` nunca sai). */
async function trim(cacheName, max, keep = new Set()) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  let excess = keys.length - max
  for (const request of keys) {
    if (excess <= 0) break
    if (keep.has(request.url)) continue
    await cache.delete(request)
    excess--
  }
}
