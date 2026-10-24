#!/usr/bin/env bash
# Pacote 10 — cadastro
#   ler o código de barras (ISBN) com a câmera e buscar o livro por título/autor
#   no Open Library, no Novo livro
#
# Rode na raiz do repositório, na branch fix/audit-2026-08, com o 1957cff como
# último commit. Deixe este script FORA do repositório:
#   bash ~/Downloads/pacote-10-cadastro.sh
#
# O que faz: aplica o patch (git apply; se falhar, git apply --3way), grava os
# blobs para o 3way dos próximos pacotes, reinstala as dependências do frontend
# (package.json mudou: barcode-detector), roda testes unitários e build e mostra
# a mensagem de commit. Sem migrations. Não commita nem faz push.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "✗ Rode dentro do repositório do Librishelf."; exit 1; }
cd "$ROOT"
[ -d frontend ] && [ -d backend ] || { echo "✗ Não parece ser o repositório do Librishelf."; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "fix/audit-2026-08" ] || echo "⚠ Branch atual: $BRANCH (esperado fix/audit-2026-08). Continuando."
git merge-base --is-ancestor 1957cff HEAD 2>/dev/null || echo "⚠ O commit 1957cff (pacote 9) não está no histórico. O 3way pode resolver; continuando."

if git ls-files --error-unmatch frontend/src/components/book/BarcodeScanner.vue >/dev/null 2>&1; then
  echo "✗ BarcodeScanner.vue já está commitado — parece que o pacote 10 já entrou."; exit 1
fi

FILES=(
  backend/src/middlewares/rateLimiter.js
  backend/src/routes/isbn.js
  backend/src/services/openLibraryService.js
  backend/src/tests/helpers/openLibraryMock.js
  backend/src/tests/integration/community.test.js
  backend/src/tests/unit/openLibrary.test.js
  frontend/nginx.conf
  frontend/package-lock.json
  frontend/package.json
  frontend/src/components/book/BarcodeScanner.vue
  frontend/src/components/book/BookEditForm.vue
  frontend/src/components/book/BookSearch.vue
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/services/api.js
  frontend/src/services/barcode.js
)

DIRTY=$(git status --porcelain -- "${FILES[@]}")
if [ -n "$DIRTY" ]; then
  echo "✗ Estes arquivos têm mudanças não commitadas; commite ou descarte antes:"
  echo "$DIRTY"
  exit 1
fi

PATCH_FILE=$(mktemp)
trap 'rm -f "$PATCH_FILE"' EXIT
cat > "$PATCH_FILE" <<'__LIBRISHELF_PATCH__'
diff --git a/backend/src/middlewares/rateLimiter.js b/backend/src/middlewares/rateLimiter.js
index f7adc3fc182c087d48713bed6ab9cea48b19c05d..ce8fb75aab15c5eee6864d0101d9cc00695d2a83 100644
--- a/backend/src/middlewares/rateLimiter.js
+++ b/backend/src/middlewares/rateLimiter.js
@@ -60,6 +60,26 @@ const publicLimiter = buildLimiter({
   code: 'RATE_LIMIT'
 })
 
+// Busca por título no Novo livro: o frontend já espera a pessoa parar de
+// digitar, mas cada busca nova é uma chamada ao Open Library.
+const bookSearchLimiter = buildLimiter({
+  windowMs: 60 * 1000,
+  max: 20,
+  perUser: true,
+  message: 'Muitas buscas em pouco tempo. Aguarde um minuto.',
+  code: 'RATE_LIMIT_SEARCH'
+})
+
+// Capas do Open Library pelo proxy (miniaturas da busca e a capa do ISBN).
+// Capa por ID não tem limite lá; aqui é só contra abuso.
+const coverProxyLimiter = buildLimiter({
+  windowMs: 60 * 1000,
+  max: 150,
+  perUser: true,
+  message: 'Muitas requisições. Tente novamente em instantes.',
+  code: 'RATE_LIMIT'
+})
+
 // Trecho de <head> das bibliotecas públicas, pedido pelo nginx a cada
 // abertura de /u/<usuário>. Generoso: em 429 o nginx cai no noindex padrão.
 const metaLimiter = buildLimiter({
@@ -103,4 +123,4 @@ const tokenLimiter = buildLimiter({
   code: 'RATE_LIMIT_ATTEMPTS'
 })
 
-export { mailLimiter, tokenLimiter, loginLimiter, registerLimiter, sensitiveLimiter, uploadLimiter, publicLimiter, metaLimiter, isbnLimiter, socialLimiter }
+export { mailLimiter, tokenLimiter, loginLimiter, registerLimiter, sensitiveLimiter, uploadLimiter, publicLimiter, metaLimiter, isbnLimiter, bookSearchLimiter, coverProxyLimiter, socialLimiter }
diff --git a/backend/src/routes/isbn.js b/backend/src/routes/isbn.js
index 8a2faddc6d7174aae5ed12ee6e5f3b007c38aa8b..3047dff7e7d15333178b99721bf482232febaf38 100644
--- a/backend/src/routes/isbn.js
+++ b/backend/src/routes/isbn.js
@@ -1,6 +1,6 @@
 import express from 'express'
 import { authenticateToken } from '../middlewares/auth.js'
-import { isbnLimiter } from '../middlewares/rateLimiter.js'
+import { isbnLimiter, bookSearchLimiter, coverProxyLimiter } from '../middlewares/rateLimiter.js'
 import * as openLibrary from '../services/openLibraryService.js'
 import STATUS from '../utils/statusCodes.js'
 import { errorBody } from '../utils/httpError.js'
@@ -8,22 +8,35 @@ import sendError from '../utils/sendError.js'
 
 const router = express.Router()
 
-router.use(authenticateToken, isbnLimiter)
+router.use(authenticateToken)
 
 // Capa (proxy): o navegador não fala direto com o Open Library.
-router.get('/cover/:coverId', async (req, res) => {
+// ?size=M → miniatura (lista da busca por título); padrão L.
+router.get('/cover/:coverId', coverProxyLimiter, async (req, res) => {
   try {
-    const image = await openLibrary.fetchCover(req.params.coverId)
+    const size = req.query.size === 'M' ? 'M' : 'L'
+    const image = await openLibrary.fetchCover(req.params.coverId, size)
     if (!image) return res.status(STATUS.NOT_FOUND).json(errorBody('Capa não encontrada.', 'COVER_NOT_FOUND'))
 
-    res.set('Cache-Control', 'private, max-age=3600')
+    res.set('Cache-Control', 'private, max-age=86400')
     res.type('image/jpeg').send(image)
   } catch (error) {
     sendError(res, error, 'Erro ao buscar capa no Open Library')
   }
 })
 
-router.get('/:isbn', async (req, res) => {
+// Busca por título/autor: GET /isbn/search?q=dom+casmurro&lang=pt
+router.get('/search', bookSearchLimiter, async (req, res) => {
+  try {
+    const result = await openLibrary.searchBooks(req.query.q, req.query.lang)
+    res.set('Cache-Control', 'private, max-age=3600')
+    res.status(STATUS.OK).json(result)
+  } catch (error) {
+    sendError(res, error, 'Erro na busca por título')
+  }
+})
+
+router.get('/:isbn', isbnLimiter, async (req, res) => {
   try {
     const book = await openLibrary.lookupIsbn(req.params.isbn)
     if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Nenhum livro encontrado para este ISBN.', 'ISBN_NOT_FOUND'))
diff --git a/backend/src/services/openLibraryService.js b/backend/src/services/openLibraryService.js
index 66888d3232bb2f2d364ecfb198ac394ebe72553e..238693f31f6721efd7ccef2b949d4195d36629d7 100644
--- a/backend/src/services/openLibraryService.js
+++ b/backend/src/services/openLibraryService.js
@@ -4,8 +4,8 @@ import { normalizeIsbn13 } from '../utils/isbn.js'
 import { httpError } from '../utils/httpError.js'
 
 /**
- * Busca de livros por ISBN no Open Library, feita sempre pelo servidor (o
- * navegador do usuário não fala com o Open Library).
+ * Busca de livros no Open Library (por ISBN e por título/autor), feita sempre
+ * pelo servidor (o navegador do usuário não fala com o Open Library).
  *
  * Regras de uso do Open Library: identificar o app no User-Agent (com contato)
  * libera até 3 requisições/s; sem isso, 1/s. Capas por ID (não por ISBN) não
@@ -22,6 +22,12 @@ const CACHE_TTL_MS = 24 * 60 * 60 * 1000
 const NOT_FOUND_TTL_MS = 60 * 60 * 1000
 const CACHE_MAX = 500
 const COVER_CACHE_MAX = 30
+// Miniaturas (tamanho M, ~10–30 KB) da busca por título: dez por busca.
+const THUMB_CACHE_MAX = 300
+const SEARCH_CACHE_MAX = 300
+const SEARCH_TIMEOUT_MS = 10000
+const SEARCH_LIMIT = 10
+const SEARCH_MAX_QUERY = 200
 const MAX_COVER_BYTES = 5 * 1024 * 1024
 const MAX_AUTHORS = 8
 
@@ -34,6 +40,8 @@ let minIntervalMs = Number(process.env.OPENLIBRARY_MIN_INTERVAL_MS) || (contact(
 
 const lookupCache = new Map()
 const coverCache = new Map()
+const thumbCache = new Map()
+const searchCache = new Map()
 
 let queue = Promise.resolve()
 let lastRequestAt = 0
@@ -47,8 +55,7 @@ function userAgent() {
 }
 
 function unavailable(cause) {
-  const error = new Error('A busca por ISBN está indisponível no momento. Tente de novo mais tarde.')
-  error.status = 502
+  const error = httpError('A busca no Open Library está indisponível no momento. Tente de novo mais tarde.', 502, 'OPENLIBRARY_UNAVAILABLE')
   error.cause = cause
   return error
 }
@@ -59,6 +66,8 @@ export function configureForTests({ fetch: customFetch, minInterval = 0 } = {})
   minIntervalMs = minInterval
   lookupCache.clear()
   coverCache.clear()
+  thumbCache.clear()
+  searchCache.clear()
   queue = Promise.resolve()
   lastRequestAt = 0
 }
@@ -90,13 +99,13 @@ function cacheSet(cache, key, value, ttl, max) {
   cache.set(key, { value, expiresAt: Date.now() + ttl })
 }
 
-async function getJson(path) {
+async function getJson(path, timeoutMs = TIMEOUT_MS) {
   let response
   try {
     response = await throttled(() => fetchImpl(`${API_BASE}${path}`, {
       headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
       redirect: 'follow',
-      signal: AbortSignal.timeout(TIMEOUT_MS)
+      signal: AbortSignal.timeout(timeoutMs)
     }))
   } catch (err) {
     throw unavailable(err)
@@ -252,17 +261,24 @@ export async function lookupIsbn(rawIsbn) {
   return result
 }
 
-/** Capa grande pelo ID (sem limite de requisições no Open Library). */
-export async function fetchCover(coverId) {
+const COVER_SIZES = { L: { cache: coverCache, max: COVER_CACHE_MAX }, M: { cache: thumbCache, max: THUMB_CACHE_MAX } }
+
+/**
+ * Capa pelo ID (sem limite de requisições no Open Library).
+ * size: 'L' (grande, para salvar no livro) ou 'M' (miniatura da busca).
+ */
+export async function fetchCover(coverId, size = 'L') {
   const id = Number(coverId)
   if (!Number.isInteger(id) || id <= 0) throw httpError('Capa inválida.', STATUS.BAD_REQUEST, 'COVER_INVALID')
+  const { cache, max } = COVER_SIZES[size] ?? COVER_SIZES.L
+  const suffix = COVER_SIZES[size] ? size : 'L'
 
-  const cached = cacheGet(coverCache, id)
+  const cached = cacheGet(cache, id)
   if (cached !== undefined) return cached
 
   let response
   try {
-    response = await fetchImpl(`${COVERS_BASE}/b/id/${id}-L.jpg?default=false`, {
+    response = await fetchImpl(`${COVERS_BASE}/b/id/${id}-${suffix}.jpg?default=false`, {
       headers: { 'User-Agent': userAgent() },
       redirect: 'follow',
       signal: AbortSignal.timeout(TIMEOUT_MS)
@@ -280,6 +296,119 @@ export async function fetchCover(coverId) {
   const buffer = Buffer.from(await response.arrayBuffer())
   if (buffer.length > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502, 'COVER_TOO_LARGE')
 
-  cacheSet(coverCache, id, buffer, CACHE_TTL_MS, COVER_CACHE_MAX)
+  cacheSet(cache, id, buffer, CACHE_TTL_MS, max)
   return buffer
-}
\ No newline at end of file
+}
+
+// ------------------------------------------------------------------ busca
+
+// Campos pedidos ao /search.json. "editions" traz, para cada obra, a edição
+// que melhor combina com a busca e com o idioma (lang); é dela que vêm ISBN,
+// editora e capa. Páginas só existem na obra (mediana das edições).
+//   https://openlibrary.org/dev/docs/api/search
+const SEARCH_FIELDS = [
+  'key', 'title', 'subtitle', 'author_name', 'first_publish_year', 'cover_i',
+  'number_of_pages_median', 'edition_count',
+  'editions', 'editions.key', 'editions.title', 'editions.subtitle', 'editions.isbn',
+  'editions.publisher', 'editions.publish_date', 'editions.cover_i', 'editions.language'
+].join(',')
+
+const SEARCH_LANGS = new Set(['pt', 'en'])
+
+/** "  Dom   Casmurro " → "dom casmurro" (chave de cache); null se curta/longa demais. */
+export function normalizeSearchQuery(raw) {
+  if (typeof raw !== 'string') return null
+  const query = raw.replace(/\s+/g, ' ').trim()
+  if (query.length < 2 || query.length > SEARCH_MAX_QUERY) return null
+  return query
+}
+
+const firstString = value => {
+  const list = Array.isArray(value) ? value : [value]
+  const found = list.find(item => typeof item === 'string' && item.trim())
+  return found ? found.trim().replace(/\s+/g, ' ') : null
+}
+
+const positiveInt = value => (Number.isInteger(value) && value > 0 ? value : null)
+
+function joinTitle(title, subtitle) {
+  const base = firstString(title)
+  if (!base) return null
+  const sub = firstString(subtitle)
+  return sub ? `${base}: ${sub}` : base
+}
+
+// ISBN-13 válido de 978/979; ISBN-10 vira 13. Prefere os que já vêm com 13.
+function bestIsbn(list) {
+  if (!Array.isArray(list)) return null
+  const normalized = list.map(value => ({ raw: String(value), isbn: normalizeIsbn13(value) })).filter(item => item.isbn)
+  const thirteen = normalized.find(item => item.raw.replace(/[^0-9Xx]/g, '').length === 13)
+  return (thirteen || normalized[0])?.isbn ?? null
+}
+
+function toSearchResult(doc) {
+  if (!doc || typeof doc !== 'object') return null
+  const edition = Array.isArray(doc.editions?.docs) ? doc.editions.docs[0] : null
+
+  const title = joinTitle(edition?.title, edition?.subtitle) || joinTitle(doc.title, doc.subtitle)
+  if (!title) return null
+
+  const authors = []
+  for (const name of Array.isArray(doc.author_name) ? doc.author_name : []) {
+    const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
+    if (clean && isRealAuthorName(clean) && !authors.includes(clean)) authors.push(clean)
+    if (authors.length >= MAX_AUTHORS) break
+  }
+
+  const pubDate = parsePublishDate(firstString(edition?.publish_date))
+  const firstYear = positiveInt(doc.first_publish_year)
+
+  return {
+    title,
+    authors,
+    publisher: firstString(edition?.publisher),
+    pubDate,
+    // Ano da edição encontrada; sem ele, o da primeira publicação da obra
+    year: pubDate ? Number(pubDate.slice(0, 4)) : firstYear,
+    firstPublishYear: firstYear,
+    isbn13: bestIsbn(edition?.isbn),
+    pages: positiveInt(doc.number_of_pages_median),
+    language: firstString(edition?.language),
+    editionCount: positiveInt(doc.edition_count),
+    olWorkKey: OL_WORK_KEY.test(doc.key ?? '') ? doc.key : null,
+    olEditionKey: OL_EDITION_KEY.test(edition?.key ?? '') ? edition.key : null,
+    coverId: positiveInt(edition?.cover_i) || positiveInt(doc.cover_i)
+  }
+}
+
+/**
+ * Busca por título e/ou autor (texto livre, como na busca do site do Open
+ * Library). → { results: [...até 10], total }
+ */
+export async function searchBooks(rawQuery, lang = 'pt') {
+  const query = normalizeSearchQuery(rawQuery)
+  if (!query) throw httpError('Digite pelo menos 2 letras para buscar.', STATUS.BAD_REQUEST, 'SEARCH_QUERY_INVALID', { min: 2, max: SEARCH_MAX_QUERY })
+  const language = SEARCH_LANGS.has(lang) ? lang : 'pt'
+
+  const cacheKey = `${language}:${query.toLowerCase()}`
+  const cached = cacheGet(searchCache, cacheKey)
+  if (cached !== undefined) return cached
+
+  const params = new URLSearchParams({ q: query, fields: SEARCH_FIELDS, limit: String(SEARCH_LIMIT), lang: language })
+  const body = await getJson(`/search.json?${params}`, SEARCH_TIMEOUT_MS)
+
+  const seen = new Set()
+  const results = []
+  for (const doc of Array.isArray(body?.docs) ? body.docs : []) {
+    const result = toSearchResult(doc)
+    if (!result) continue
+    const key = result.olWorkKey || `${result.title}|${result.authors.join(';')}`
+    if (seen.has(key)) continue
+    seen.add(key)
+    results.push(result)
+  }
+
+  const value = { results, total: Number.isInteger(body?.numFound) ? body.numFound : results.length }
+  cacheSet(searchCache, cacheKey, value, results.length ? CACHE_TTL_MS : NOT_FOUND_TTL_MS, SEARCH_CACHE_MAX)
+  return value
+}
diff --git a/backend/src/tests/helpers/openLibraryMock.js b/backend/src/tests/helpers/openLibraryMock.js
index ae376b497152c91c94d4682cabfd2e69fcbc5dce..13c49c95d3a276a319b6ee6eb09d6d08ad6c9858 100644
--- a/backend/src/tests/helpers/openLibraryMock.js
+++ b/backend/src/tests/helpers/openLibraryMock.js
@@ -59,6 +59,54 @@ export const FIXTURES = {
   '/authors/OL7115219A.json': { name: 'Sarah J. Maas', key: '/authors/OL7115219A' }
 }
 
+// /search.json: formato das respostas reais com fields=...,editions,editions.*
+// (o Open Library junta à obra a edição que melhor casa com a busca e o idioma).
+export const SEARCH_FIXTURES = {
+  'dom casmurro': {
+    numFound: 3,
+    start: 0,
+    docs: [
+      {
+        key: '/works/OL1W',
+        title: 'Dom Casmurro',
+        author_name: ['Machado de Assis'],
+        first_publish_year: 1899,
+        cover_i: 111,
+        number_of_pages_median: 256,
+        edition_count: 120,
+        editions: {
+          numFound: 45,
+          start: 0,
+          numFoundExact: true,
+          docs: [{
+            key: '/books/OL10M',
+            title: 'Dom Casmurro',
+            isbn: ['8508099990', '9788508099993'],
+            publisher: ['Ática'],
+            publish_date: ['2008'],
+            cover_i: 222,
+            language: ['por']
+          }]
+        }
+      },
+      // Mesma obra repetida (não aparece duas vezes)
+      { key: '/works/OL1W', title: 'Dom Casmurro', author_name: ['Machado de Assis'] },
+      // Sem edição, autor "de mentira" e ISBN só na obra: fica sem ISBN
+      {
+        key: '/works/OL2W',
+        title: 'Dom Casmurro',
+        subtitle: 'edição comentada',
+        author_name: ['Machado de Assis', 'unknown', 'Machado de Assis'],
+        first_publish_year: 2015,
+        editions: { numFound: 0, start: 0, docs: [] }
+      },
+      // Sem título: ignorado
+      { key: '/works/OL3W', author_name: ['Alguém'] }
+    ]
+  },
+  'livro inexistente': { numFound: 0, start: 0, docs: [] }
+}
+
 // JPEG 1×1 válido (o sharp precisa conseguir ler).
 export const TINY_JPEG = Buffer.from(
   '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
@@ -75,11 +123,17 @@ export function createOpenLibraryMock({ down = false } = {}) {
     const { pathname } = new URL(url)
 
     if (url.startsWith('https://covers.openlibrary.org/')) {
-      return pathname === '/b/id/15152634-L.jpg'
+      return pathname === '/b/id/15152634-L.jpg' || pathname === '/b/id/15152634-M.jpg'
         ? new Response(TINY_JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
         : new Response('not found', { status: 404 })
     }
 
+    if (pathname === '/search.json') {
+      const q = new URL(url).searchParams.get('q')?.toLowerCase()
+      const found = SEARCH_FIXTURES[q] ?? { numFound: 0, start: 0, docs: [] }
+      return new Response(JSON.stringify(found), { status: 200, headers: { 'content-type': 'application/json' } })
+    }
+
     const body = FIXTURES[pathname]
     return body
       ? new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
diff --git a/backend/src/tests/integration/community.test.js b/backend/src/tests/integration/community.test.js
index ed69bd02c9ae85ceaf4f6d71a6c166afdf1eacac..59b24e6fbc8a0663c44a29825610a21d2b9e8bc3 100644
--- a/backend/src/tests/integration/community.test.js
+++ b/backend/src/tests/integration/community.test.js
@@ -164,6 +164,22 @@ describe('Busca por ISBN (Open Library)', () => {
     expect((await request(app).get('/isbn/12345').set(auth('ana'))).statusCode).toBe(400)
   })
 
+  it('busca por título: rota antes de /:isbn, com login e validação', async () => {
+    expect((await request(app).get('/isbn/search?q=dom+casmurro')).statusCode).toBe(401)
+    const res = await request(app).get('/isbn/search').query({ q: 'Dom Casmurro', lang: 'pt' }).set(auth('ana'))
+    expect(res.statusCode).toBe(200)
+    expect(res.body.results[0]).toMatchObject({ title: 'Dom Casmurro', isbn13: '9788508099993', olWorkKey: '/works/OL1W' })
+    const short = await request(app).get('/isbn/search?q=a').set(auth('ana'))
+    expect(short.statusCode).toBe(400)
+    expect(short.body.code).toBe('SEARCH_QUERY_INVALID')
+  })
+
+  it('miniatura da capa com ?size=M', async () => {
+    const res = await request(app).get('/isbn/cover/15152634?size=M').set(auth('ana'))
+    expect(res.statusCode).toBe(200)
+    expect(res.headers['content-type']).toMatch(/image\/jpeg/)
+  })
+
   it('serve a capa pelo próprio servidor', async () => {
     const res = await request(app).get('/isbn/cover/15152634').set(auth('ana'))
     expect(res.statusCode).toBe(200)
diff --git a/backend/src/tests/unit/openLibrary.test.js b/backend/src/tests/unit/openLibrary.test.js
index 3d8c3ddc2ba85d8578faad729c2cb37a5c31d801..dabc2ca85cf031db95fab646197608d4e579279d 100644
--- a/backend/src/tests/unit/openLibrary.test.js
+++ b/backend/src/tests/unit/openLibrary.test.js
@@ -1,4 +1,4 @@
-import { configureForTests, lookupIsbn, fetchCover, parsePublishDate } from '../../services/openLibraryService.js'
+import { configureForTests, lookupIsbn, fetchCover, parsePublishDate, searchBooks, normalizeSearchQuery } from '../../services/openLibraryService.js'
 import { createOpenLibraryMock } from '../helpers/openLibraryMock.js'
 
 describe('parsePublishDate', () => {
@@ -91,4 +91,94 @@ describe('fetchCover', () => {
     await expect(fetchCover(999)).resolves.toBeNull()
     await expect(fetchCover('abc')).rejects.toMatchObject({ status: 400 })
   })
+
+  it('miniatura (M) vem do tamanho M e tem cache próprio', async () => {
+    const mock = createOpenLibraryMock()
+    configureForTests({ fetch: mock.fetch })
+    expect(Buffer.isBuffer(await fetchCover(15152634, 'M'))).toBe(true)
+    expect(mock.calls[0].url).toContain('/b/id/15152634-M.jpg')
+    await fetchCover(15152634, 'L')
+    expect(mock.calls[1].url).toContain('/b/id/15152634-L.jpg')
+    await fetchCover(15152634, 'M')
+    expect(mock.calls.length).toBe(2)
+  })
+})
+
+describe('searchBooks', () => {
+  let mock
+
+  beforeEach(() => {
+    mock = createOpenLibraryMock()
+    configureForTests({ fetch: mock.fetch })
+  })
+
+  it('usa a edição encontrada (ISBN-13, editora, capa) e os dados da obra', async () => {
+    const { results, total } = await searchBooks('  Dom   Casmurro ', 'pt')
+    expect(total).toBe(3)
+    expect(results[0]).toEqual({
+      title: 'Dom Casmurro',
+      authors: ['Machado de Assis'],
+      publisher: 'Ática',
+      pubDate: '2008-01-01',
+      year: 2008,
+      firstPublishYear: 1899,
+      isbn13: '9788508099993',
+      pages: 256,
+      language: 'por',
+      editionCount: 120,
+      olWorkKey: '/works/OL1W',
+      olEditionKey: '/books/OL10M',
+      coverId: 222
+    })
+  })
+
+  it('sem edição: título com subtítulo, sem ISBN, autores limpos; tira repetidos e sem título', async () => {
+    const { results } = await searchBooks('dom casmurro')
+    expect(results).toHaveLength(2)
+    expect(results[1]).toMatchObject({
+      title: 'Dom Casmurro: edição comentada',
+      authors: ['Machado de Assis'],
+      isbn13: null,
+      publisher: null,
+      year: 2015,
+      olEditionKey: null,
+      coverId: null
+    })
+  })
+
+  it('pede só os campos necessários, com limite e idioma', async () => {
+    await searchBooks('Dom Casmurro', 'en')
+    const url = new URL(mock.calls[0].url)
+    expect(url.pathname).toBe('/search.json')
+    expect(url.searchParams.get('q')).toBe('Dom Casmurro')
+    expect(url.searchParams.get('limit')).toBe('10')
+    expect(url.searchParams.get('lang')).toBe('en')
+    expect(url.searchParams.get('fields')).toContain('editions.isbn')
+    expect(mock.calls[0].userAgent).toMatch(/^Librishelf\/1\.0/)
+  })
+
+  it('idioma fora da lista vira pt; cache ignora maiúsculas e espaços', async () => {
+    await searchBooks('Dom Casmurro', 'xx')
+    expect(new URL(mock.calls[0].url).searchParams.get('lang')).toBe('pt')
+    await searchBooks('dom  CASMURRO', 'pt')
+    expect(mock.calls.length).toBe(1)
+  })
+
+  it('nada encontrado → lista vazia', async () => {
+    await expect(searchBooks('livro inexistente')).resolves.toEqual({ results: [], total: 0 })
+  })
+
+  it('texto curto/longo → 400 com código; serviço fora → 502', async () => {
+    await expect(searchBooks('a')).rejects.toMatchObject({ status: 400, errorCode: 'SEARCH_QUERY_INVALID' })
+    await expect(searchBooks('x'.repeat(201))).rejects.toMatchObject({ status: 400 })
+    await expect(searchBooks(undefined)).rejects.toMatchObject({ status: 400 })
+    configureForTests({ fetch: createOpenLibraryMock({ down: true }).fetch })
+    await expect(searchBooks('dom casmurro')).rejects.toMatchObject({ status: 502, errorCode: 'OPENLIBRARY_UNAVAILABLE' })
+  })
+
+  it('normalizeSearchQuery', () => {
+    expect(normalizeSearchQuery('  a  b ')).toBe('a b')
+    expect(normalizeSearchQuery(' ')).toBeNull()
+    expect(normalizeSearchQuery(42)).toBeNull()
+  })
 })
\ No newline at end of file
diff --git a/frontend/nginx.conf b/frontend/nginx.conf
index 8f3f54e6d1ef01cb4ccefe9b90aa515ab499e9ba..b0ef1777c040cdde0f279be9906ce3a2bb6abb23 100644
--- a/frontend/nginx.conf
+++ b/frontend/nginx.conf
@@ -16,12 +16,12 @@ server {
   gzip on;
   gzip_comp_level 5;
   gzip_min_length 1024;
-  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
+  gzip_types text/plain text/css application/javascript application/json image/svg+xml application/wasm;
 
   add_header X-Content-Type-Options "nosniff" always;
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   add_header X-Frame-Options "DENY" always;
-  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
+  add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
 
   # API no mesmo domínio: /api/... → backend:3050/... (sem o prefixo).
   # Same-origin: o cookie de sessão não precisa de CORS em produção.
@@ -62,7 +62,7 @@ server {
     add_header X-Content-Type-Options "nosniff" always;
     add_header Referrer-Policy "strict-origin-when-cross-origin" always;
     add_header X-Frame-Options "DENY" always;
-    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
+    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
   }
 
   # Qualquer outra coisa em /u/ (nome inválido, subcaminho): SPA com noindex.
@@ -73,7 +73,7 @@ server {
     add_header X-Content-Type-Options "nosniff" always;
     add_header Referrer-Policy "strict-origin-when-cross-origin" always;
     add_header X-Frame-Options "DENY" always;
-    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
+    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
   }
 
   # Subrequisição do SSI acima: /__meta/u/<nome> → backend:3050/meta/u/<nome>.
@@ -100,7 +100,7 @@ server {
     add_header X-Content-Type-Options "nosniff" always;
     add_header Referrer-Policy "strict-origin-when-cross-origin" always;
     add_header X-Frame-Options "DENY" always;
-    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
+    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
   }
 
   error_page 500 502 503 504 /50x.html;
diff --git a/frontend/package-lock.json b/frontend/package-lock.json
index 5fcdad159b0f1c73597ab0c78c06bbe97b31031c..de2e5eed74e546ff721ca202c00e8fef6e8756a6 100644
--- a/frontend/package-lock.json
+++ b/frontend/package-lock.json
@@ -10,6 +10,7 @@
       "dependencies": {
         "@fontsource-variable/inter": "^5.3.0",
         "@fontsource-variable/source-serif-4": "^5.3.0",
+        "barcode-detector": "3.2.2",
         "chart.js": "^4.5.1",
         "primeicons": "^7.0.0",
         "vue": "^3.4.21",
@@ -416,6 +417,12 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@types/emscripten": {
+      "version": "1.41.6",
+      "resolved": "https://registry.npmjs.org/@types/emscripten/-/emscripten-1.41.6.tgz",
+      "integrity": "sha512-uN+9i8bFT5CUcZfyIEYDrSueACEyKGbUs5kC/72DGlZZoinh84sJfVV0i8UOJD1asdzkvLPBRrKs41kZ8MdEXg==",
+      "license": "MIT"
+    },
     "node_modules/@vitejs/plugin-vue": {
       "version": "6.0.9",
       "resolved": "https://registry.npmjs.org/@vitejs/plugin-vue/-/plugin-vue-6.0.9.tgz",
@@ -537,6 +544,15 @@
       "integrity": "sha512-uksS7YGMR5NZyr4JNq0Rp+QyLns0ueaz20KwzIPW9R0LH1Vnt4E+XUM29PNseEbf1www2gOuhuDi5AKOIXag9Q==",
       "license": "MIT"
     },
+    "node_modules/barcode-detector": {
+      "version": "3.2.2",
+      "resolved": "https://registry.npmjs.org/barcode-detector/-/barcode-detector-3.2.2.tgz",
+      "integrity": "sha512-/4QOrrNrCRmDSBWiiP4aC72dnkuXUEdcFRidHgbPRXUpy82XcCMvJssI6fEs6JT42LS7DvBVZO70qasJbYKyrA==",
+      "license": "MIT",
+      "dependencies": {
+        "zxing-wasm": "3.1.3"
+      }
+    },
     "node_modules/chart.js": {
       "version": "4.5.1",
       "resolved": "https://registry.npmjs.org/chart.js/-/chart.js-4.5.1.tgz",
@@ -1000,6 +1016,18 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/tagged-tag": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/tagged-tag/-/tagged-tag-1.0.0.tgz",
+      "integrity": "sha512-yEFYrVhod+hdNyx7g5Bnkkb0G6si8HJurOoOEgC8B/O0uXLHlaey/65KRv6cuWBNhBgHKAROVpc7QyYqE5gFng==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=20"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
     "node_modules/tinyglobby": {
       "version": "0.2.17",
       "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
@@ -1017,6 +1045,21 @@
         "url": "https://github.com/sponsors/SuperchupuDev"
       }
     },
+    "node_modules/type-fest": {
+      "version": "5.10.0",
+      "resolved": "https://registry.npmjs.org/type-fest/-/type-fest-5.10.0.tgz",
+      "integrity": "sha512-NoSdpq/WEiAg5sjmBkmV/hfxv6HJH4NqPNrqjtSO5CwRmpsDfaf4begxW34KdJykH/l1yHtwBWQkCRdoXO8mPA==",
+      "license": "(MIT OR CC0-1.0)",
+      "dependencies": {
+        "tagged-tag": "^1.0.0"
+      },
+      "engines": {
+        "node": ">=20"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
     "node_modules/vite": {
       "version": "8.3.4",
       "resolved": "https://registry.npmjs.org/vite/-/vite-8.3.4.tgz",
@@ -1150,6 +1193,19 @@
       "peerDependencies": {
         "vue": "^3.5.0"
       }
+    },
+    "node_modules/zxing-wasm": {
+      "version": "3.1.3",
+      "resolved": "https://registry.npmjs.org/zxing-wasm/-/zxing-wasm-3.1.3.tgz",
+      "integrity": "sha512-3lC9BJk4fR5ZJxcGjb0hVnDFOW7KpLXHIebiBmVd4FDRQZVeObztoTKxRUPxlWwSgxrMRONK0u50hBD1aTYEKg==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/emscripten": "^1.41.5",
+        "type-fest": "^5.8.0"
+      },
+      "peerDependencies": {
+        "@types/emscripten": ">=1.39.6"
+      }
     }
   }
 }
diff --git a/frontend/package.json b/frontend/package.json
index 78110a2c60aff5d0fa4c434c8019fc8914241f98..49e08bf7e90b6ef212266f1f00c5d79b8c12667a 100644
--- a/frontend/package.json
+++ b/frontend/package.json
@@ -11,6 +11,7 @@
   "dependencies": {
     "@fontsource-variable/inter": "^5.3.0",
     "@fontsource-variable/source-serif-4": "^5.3.0",
+    "barcode-detector": "3.2.2",
     "chart.js": "^4.5.1",
     "primeicons": "^7.0.0",
     "vue": "^3.4.21",
diff --git a/frontend/src/components/book/BarcodeScanner.vue b/frontend/src/components/book/BarcodeScanner.vue
new file mode 100644
index 0000000000000000000000000000000000000000..9a5abde597b4c112a6b76938efaa9c20bd1f0f1a
--- /dev/null
+++ b/frontend/src/components/book/BarcodeScanner.vue
@@ -0,0 +1,372 @@
+<template>
+  <!-- No body: fora do diálogo do Novo livro (não herda o tamanho dele) e do <form> -->
+  <Teleport to="body">
+    <AppDialog
+      :visible="visible"
+      size="sm"
+      dialog-class="scanner-dialog"
+      :header="t('scanner.title')"
+      @update:visible="value => emit('update:visible', value)"
+      @hide="stop"
+    >
+      <div class="scanner">
+        <div
+          class="viewport"
+          :class="{ ready: state === 'scanning' }"
+        >
+          <video
+            ref="videoEl"
+            class="video"
+            muted
+            autoplay
+            playsinline
+            aria-hidden="true"
+          ></video>
+
+          <!-- Moldura onde o código de barras deve ficar -->
+          <div
+            v-if="state === 'scanning'"
+            class="guide"
+            aria-hidden="true"
+          >
+            <span class="corner tl"></span>
+            <span class="corner tr"></span>
+            <span class="corner bl"></span>
+            <span class="corner br"></span>
+            <span class="laser"></span>
+          </div>
+
+          <div
+            v-if="state === 'starting'"
+            class="overlay-msg"
+          >
+            <i
+              class="pi pi-spinner pi-spin"
+              aria-hidden="true"
+            ></i>
+            <span>{{ t('scanner.starting') }}</span>
+          </div>
+
+          <div
+            v-else-if="state === 'error'"
+            class="overlay-msg error"
+          >
+            <i
+              class="pi pi-camera"
+              aria-hidden="true"
+            ></i>
+            <span>{{ errorText }}</span>
+          </div>
+        </div>
+
+        <p
+          class="status"
+          :class="{ warn: Boolean(notice) }"
+          aria-live="polite"
+        >{{ statusText }}</p>
+
+        <div class="actions">
+          <AppButton
+            v-if="state === 'error'"
+            :label="t('scanner.retry')"
+            icon="pi pi-refresh"
+            class="btn-outlined btn-secondary"
+            @click="start"
+          />
+          <AppButton
+            :label="t('scanner.typeInstead')"
+            icon="pi pi-pencil"
+            class="btn-text btn-secondary"
+            @click="emit('update:visible', false)"
+          />
+        </div>
+      </div>
+    </AppDialog>
+  </Teleport>
+</template>
+
+<script setup>
+import { computed, onBeforeUnmount, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import AppDialog from '../ui/AppDialog.vue'
+import AppButton from '../ui/AppButton.vue'
+import {
+  getBarcodeDetector,
+  openCamera,
+  stopStream,
+  isbnFromBarcode,
+  cameraErrorKey
+} from '../../services/barcode.js'
+
+/**
+ * Câmera para ler o código de barras do livro (EAN-13 do ISBN).
+ * Lido o ISBN, emite "detected" e fecha. A câmera desliga ao fechar, ao
+ * desmontar e quando a aba sai de vista.
+ *
+ *   <BarcodeScanner v-model:visible="open" @detected="isbn => …" />
+ */
+const props = defineProps({
+  visible: { type: Boolean, default: false }
+})
+const emit = defineEmits(['update:visible', 'detected'])
+const { t } = useI18n()
+
+const SCAN_INTERVAL_MS = 120
+const NOTICE_MS = 2500
+
+const videoEl = ref(null)
+const state = ref('idle') // idle | starting | scanning | error
+const errorKey = ref('')
+const notice = ref('')
+
+let stream = null
+let timer = null
+let noticeTimer = null
+let session = 0
+let lastValue = ''
+
+const errorText = computed(() => (errorKey.value ? t(errorKey.value) : ''))
+const statusText = computed(() => {
+  if (notice.value) return notice.value
+  if (state.value === 'scanning') return t('scanner.hint')
+  return ''
+})
+
+function showNotice(text) {
+  notice.value = text
+  clearTimeout(noticeTimer)
+  noticeTimer = setTimeout(() => { notice.value = '' }, NOTICE_MS)
+}
+
+async function start() {
+  stop()
+  const current = ++session
+  state.value = 'starting'
+  errorKey.value = ''
+  lastValue = ''
+
+  // Detector (pode baixar o leitor em WebAssembly) e câmera ao mesmo tempo
+  const detectorReady = getBarcodeDetector()
+  try {
+    const opened = await openCamera()
+    if (current !== session) return stopStream(opened)
+    stream = opened
+  } catch (error) {
+    if (current !== session) return
+    errorKey.value = cameraErrorKey(error)
+    state.value = 'error'
+    return
+  }
+
+  let detector
+  try {
+    detector = await detectorReady
+  } catch {
+    if (current !== session) return
+    stop()
+    errorKey.value = 'scanner.errors.reader'
+    state.value = 'error'
+    return
+  }
+  if (current !== session) return
+
+  const video = videoEl.value
+  if (!video) return stop()
+  video.srcObject = stream
+  try {
+    await video.play()
+  } catch {
+    // autoplay recusado: o atributo autoplay + muted costuma resolver sozinho
+  }
+  if (current !== session) return
+  state.value = 'scanning'
+  scan(detector, current)
+}
+
+async function scan(detector, current) {
+  if (current !== session) return
+  const video = videoEl.value
+  if (video && video.readyState >= 2) {
+    try {
+      const codes = await detector.detect(video)
+      if (current !== session) return
+      handle(codes)
+      if (current !== session) return
+    } catch {
+      // Quadro ruim (vídeo trocando de tamanho etc.): tenta no próximo
+    }
+  }
+  timer = setTimeout(() => scan(detector, current), SCAN_INTERVAL_MS)
+}
+
+function handle(codes) {
+  for (const code of codes || []) {
+    const isbn = isbnFromBarcode(code.rawValue)
+    if (!isbn) {
+      // EAN de preço/produto (ex.: o código de 5 dígitos ao lado) não é ISBN
+      if (code.rawValue && !notice.value) showNotice(t('scanner.notIsbn'))
+      continue
+    }
+    // Duas leituras iguais seguidas: evita pegar um código lido pela metade
+    if (isbn === lastValue) {
+      found(isbn)
+      return
+    }
+    lastValue = isbn
+    return
+  }
+}
+
+function found(isbn) {
+  navigator.vibrate?.(40)
+  stop()
+  emit('detected', isbn)
+  emit('update:visible', false)
+}
+
+function stop() {
+  session++
+  clearTimeout(timer)
+  timer = null
+  stopStream(stream)
+  stream = null
+  if (videoEl.value) videoEl.value.srcObject = null
+  if (state.value !== 'error') state.value = 'idle'
+}
+
+// Aba escondida ou página saindo: a câmera não fica ligada sem ninguém ver
+function onHidden() {
+  if (document.visibilityState === 'hidden' && props.visible) emit('update:visible', false)
+}
+
+watch(() => props.visible, open => {
+  if (open) {
+    notice.value = ''
+    start()
+    document.addEventListener('visibilitychange', onHidden)
+    window.addEventListener('pagehide', onHidden)
+  } else {
+    stop()
+    state.value = 'idle'
+    document.removeEventListener('visibilitychange', onHidden)
+    window.removeEventListener('pagehide', onHidden)
+  }
+}, { immediate: true })
+
+onBeforeUnmount(() => {
+  stop()
+  clearTimeout(noticeTimer)
+  document.removeEventListener('visibilitychange', onHidden)
+  window.removeEventListener('pagehide', onHidden)
+})
+</script>
+
+<style scoped>
+.scanner {
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+}
+
+.viewport {
+  position: relative;
+  aspect-ratio: 4 / 3;
+  border-radius: 12px;
+  overflow: hidden;
+  background: #0b0b0d;
+}
+
+.video {
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+  display: block;
+}
+
+/* Faixa larga e baixa: o formato do código de barras do livro */
+.guide {
+  position: absolute;
+  left: 10%;
+  right: 10%;
+  top: 30%;
+  bottom: 30%;
+  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
+  border-radius: 8px;
+}
+
+.corner {
+  position: absolute;
+  width: 22px;
+  height: 22px;
+  border: 3px solid #fff;
+}
+
+.corner.tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-top-left-radius: 8px; }
+.corner.tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-top-right-radius: 8px; }
+.corner.bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-bottom-left-radius: 8px; }
+.corner.br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-bottom-right-radius: 8px; }
+
+.laser {
+  position: absolute;
+  left: 6%;
+  right: 6%;
+  top: 50%;
+  height: 2px;
+  background: rgb(var(--main-color-rgb));
+  box-shadow: 0 0 8px rgb(var(--main-color-rgb));
+  animation: laser 1.6s ease-in-out infinite alternate;
+}
+
+@keyframes laser {
+  from { transform: translateY(-1.6rem); }
+  to { transform: translateY(1.6rem); }
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .laser {
+    animation: none;
+  }
+}
+
+.overlay-msg {
+  position: absolute;
+  inset: 0;
+  display: flex;
+  flex-direction: column;
+  align-items: center;
+  justify-content: center;
+  gap: 0.6rem;
+  padding: 1.25rem;
+  text-align: center;
+  color: #e4e4e7;
+  font-size: var(--fs-sm);
+  line-height: 1.45;
+}
+
+.overlay-msg .pi {
+  font-size: 1.5rem;
+}
+
+.overlay-msg.error .pi {
+  color: #a1a1aa;
+}
+
+.status {
+  margin: 0;
+  min-height: 1.3em;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+  text-align: center;
+}
+
+.status.warn {
+  color: var(--yellow);
+}
+
+.actions {
+  display: flex;
+  justify-content: center;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+}
+</style>
diff --git a/frontend/src/components/book/BookEditForm.vue b/frontend/src/components/book/BookEditForm.vue
index b555a18f37616dee41309b3ff8b6806c9b4800a5..98899620febc684af56f3cdaeb03451ff08f4362 100644
--- a/frontend/src/components/book/BookEditForm.vue
+++ b/frontend/src/components/book/BookEditForm.vue
@@ -22,7 +22,37 @@
       </aside>
 
       <div class="fields-column">
+        <!-- Novo livro: achar os dados pelo ISBN (digitado ou lido pela câmera) ou pelo título -->
         <div
+          v-if="isCreate"
+          class="finder-tabs"
+          role="group"
+          :aria-label="t('bookSearch.modeLabel')"
+        >
+          <PillButton
+            icon="pi pi-barcode"
+            :label="t('bookSearch.byIsbn')"
+            :active="findMode === 'isbn'"
+            @click="setFindMode('isbn')"
+          />
+          <PillButton
+            icon="pi pi-search"
+            :label="t('bookSearch.byTitle')"
+            :active="findMode === 'title'"
+            @click="setFindMode('title')"
+          />
+        </div>
+
+        <BookSearch
+          v-if="isCreate && findMode === 'title'"
+          ref="bookSearch"
+          :id-prefix="idPrefix"
+          :initial-query="form.title"
+          @select="applySearchResult"
+        />
+
+        <div
+          v-else
           class="isbn-row"
           :class="{ single: !isCreate }"
         >
@@ -35,8 +65,22 @@
             :error="errors.isbn"
             :hint="isCreate ? lookupMessage : ''"
             hint-live
-            :input-attrs="isCreate ? { onKeydown: onIsbnKeydown } : {}"
-          />
+            :input-attrs="isCreate ? { onKeydown: onIsbnKeydown, enterkeyhint: 'search' } : {}"
+          >
+            <template
+              v-if="isCreate && canScan"
+              #suffix
+            >
+              <span class="scan-btn">
+                <IconButton
+                  icon="pi pi-camera"
+                  :label="t('scanner.open')"
+                  title
+                  @click="scannerOpen = true"
+                />
+              </span>
+            </template>
+          </TextField>
           <AppButton
             v-if="isCreate"
             type="button"
@@ -49,6 +93,12 @@
           />
         </div>
 
+        <BarcodeScanner
+          v-if="isCreate && canScan"
+          v-model:visible="scannerOpen"
+          @detected="onScanned"
+        />
+
         <TextField
           :id="`${idPrefix}-title`"
           v-model="form.title"
@@ -198,7 +248,7 @@
 </template>
 
 <script setup>
-import { computed, nextTick, reactive, ref, watch, onBeforeUnmount } from 'vue'
+import { computed, nextTick, reactive, ref, watch, onBeforeUnmount, onMounted } from 'vue'
 import { useI18n } from 'vue-i18n'
 import AppButton from '../ui/AppButton.vue'
 import { useToast } from '../../services/toast.js'
@@ -211,6 +261,10 @@ import DateField from '../form/DateField.vue'
 import FieldLabel from '../form/FieldLabel.vue'
 import PillButton from '../form/PillButton.vue'
 import CoverDrop from '../form/CoverDrop.vue'
+import IconButton from '../form/IconButton.vue'
+import BookSearch from './BookSearch.vue'
+import BarcodeScanner from './BarcodeScanner.vue'
+import { hasCamera } from '../../services/barcode.js'
 import { toApiDate } from '../../utils/dates.js'
 import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../../utils/readingStatus.js'
 import { validateImageFile, createPreviewHandle } from '../../utils/files.js'
@@ -355,17 +409,20 @@ async function loadSeriesOptions() {
 
 // ---------------------------------------------------------------- ISBN
 
-// As chaves do Open Library só valem para o ISBN buscado; se a pessoa trocar
-// o ISBN depois, elas não são enviadas.
-const lookup = reactive({ isbn: null, olWorkKey: null, olEditionKey: null, coverId: null })
+// As chaves do Open Library só valem para o ISBN com que foram achadas (o
+// buscado, ou o do resultado da busca por título — que pode não ter ISBN);
+// se a pessoa trocar o ISBN depois, elas não são enviadas.
+const lookup = reactive({ active: false, isbn: '', olWorkKey: null, olEditionKey: null, coverId: null })
 const lookingUp = ref(false)
 const lookupState = ref('idle') // idle | found | missing | error
 
 function resetLookup() {
-  Object.assign(lookup, { isbn: null, olWorkKey: null, olEditionKey: null, coverId: null })
+  Object.assign(lookup, { active: false, isbn: '', olWorkKey: null, olEditionKey: null, coverId: null })
   lookupState.value = 'idle'
 }
 
+const lookupMatchesForm = () => lookup.active && lookup.isbn === form.isbn.trim()
+
 const lookupMessage = computed(() => {
   if (lookupState.value === 'found') return t('isbn.found')
   if (lookupState.value === 'missing') return t('isbn.not_found')
@@ -373,9 +430,9 @@ const lookupMessage = computed(() => {
   return t('isbn.hint')
 })
 
-watch(() => form.isbn, value => {
+watch(() => form.isbn, () => {
   delete errors.isbn
-  if (lookup.isbn && value.trim() !== lookup.isbn) resetLookup()
+  if (lookup.active && !lookupMatchesForm()) resetLookup()
 })
 
 function onIsbnKeydown(event) {
@@ -406,6 +463,7 @@ async function lookupIsbn() {
     if (!form.pubdate && found.pubDate) form.pubdate = parseApiDate(found.pubDate)
 
     Object.assign(lookup, {
+      active: true,
       isbn,
       olWorkKey: found.olWorkKey,
       olEditionKey: found.olEditionKey,
@@ -422,6 +480,64 @@ async function lookupIsbn() {
   }
 }
 
+// ---------------------------------------------------------------- câmera e título
+
+const findMode = ref('isbn') // isbn | title
+const bookSearch = ref(null)
+const scannerOpen = ref(false)
+const canScan = ref(false)
+
+onMounted(async () => {
+  if (isCreate.value) canScan.value = await hasCamera()
+})
+
+async function setFindMode(mode) {
+  if (findMode.value === mode) return
+  findMode.value = mode
+  await nextTick()
+  if (mode === 'title') bookSearch.value?.focus()
+  else isbnField.value?.focus()
+}
+
+// Erro no ISBN (ex.: já cadastrado) com a busca por título aberta: mostra o campo
+watch(() => errors.isbn, value => {
+  if (value) findMode.value = 'isbn'
+})
+
+function onScanned(isbn) {
+  form.isbn = isbn
+  lookupIsbn()
+}
+
+// Resultado da busca por título: mesma regra do ISBN (só campos vazios)
+async function applySearchResult(item) {
+  if (!form.title.trim() && item.title) form.title = item.title
+  if (form.authorNames.length === 0 && item.authors?.length) form.authorNames = [...item.authors]
+  if (!form.publisher.trim() && item.publisher) form.publisher = item.publisher
+  if (!form.pubdate && item.pubDate) form.pubdate = parseApiDate(item.pubDate)
+  if (!form.isbn.trim() && item.isbn13) form.isbn = item.isbn13
+
+  delete errors.isbn
+  const sameIsbn = (item.isbn13 || '') === form.isbn.trim()
+  if (sameIsbn) {
+    Object.assign(lookup, {
+      active: true,
+      isbn: item.isbn13 || '',
+      olWorkKey: item.olWorkKey,
+      olEditionKey: item.olEditionKey,
+      coverId: selectedFile.value ? null : item.coverId
+    })
+    lookupState.value = 'found'
+  } else {
+    resetLookup()
+    lookupState.value = 'found'
+  }
+
+  findMode.value = 'isbn'
+  await nextTick()
+  isbnField.value?.focus()
+}
+
 // ---------------------------------------------------------------- validação
 
 watch(() => form.title, () => { delete errors.title })
@@ -548,7 +664,7 @@ async function create() {
   if (String(form.series_index ?? '').trim()) data.append('seriesIndex', String(form.series_index).trim())
   if (form.notes?.trim()) data.append('notes', form.notes)
 
-  if (lookup.isbn && lookup.isbn === form.isbn.trim()) {
+  if (lookupMatchesForm()) {
     if (lookup.olWorkKey) data.append('olWorkKey', lookup.olWorkKey)
     if (lookup.olEditionKey) data.append('olEditionKey', lookup.olEditionKey)
     if (!selectedFile.value && lookup.coverId) data.append('olCoverId', String(lookup.coverId))
@@ -680,6 +796,18 @@ defineExpose({ focusIsbn: () => isbnField.value?.focus() })
   align-items: start;
 }
 
+.finder-tabs {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+  margin-bottom: -0.35rem;
+}
+
+.scan-btn {
+  display: inline-flex;
+  margin-right: 0.35rem;
+}
+
 .isbn-row.single {
   grid-template-columns: minmax(0, 1fr);
 }
diff --git a/frontend/src/components/book/BookSearch.vue b/frontend/src/components/book/BookSearch.vue
new file mode 100644
index 0000000000000000000000000000000000000000..92202a17cc39914a70b894d8bb79ff39f74a6936
--- /dev/null
+++ b/frontend/src/components/book/BookSearch.vue
@@ -0,0 +1,413 @@
+<template>
+  <div class="book-search">
+    <TextField
+      :id="`${idPrefix}-search`"
+      ref="field"
+      v-model="query"
+      type="search"
+      :label="t('bookSearch.label')"
+      :hint="t('bookSearch.hint')"
+      autocomplete="off"
+      :input-attrs="{ enterkeyhint: 'search', onKeydown: onKeydown, 'aria-controls': `${idPrefix}-search-results` }"
+    >
+      <template #suffix>
+        <span
+          v-if="loading"
+          class="search-spinner"
+          aria-hidden="true"
+        >
+          <i class="pi pi-spinner pi-spin"></i>
+        </span>
+      </template>
+    </TextField>
+
+    <div
+      :id="`${idPrefix}-search-results`"
+      class="results"
+      :aria-busy="loading ? 'true' : 'false'"
+    >
+      <p
+        class="sr-only"
+        aria-live="polite"
+      >{{ liveText }}</p>
+
+      <ul
+        v-if="loading && results.length === 0"
+        class="result-list"
+        aria-hidden="true"
+      >
+        <li
+          v-for="n in 3"
+          :key="n"
+          class="result skeleton-row"
+        >
+          <AppSkeleton
+            width="2.75rem"
+            height="4rem"
+            border-radius="4px"
+          />
+          <div class="skeleton-text">
+            <AppSkeleton
+              width="70%"
+              height="0.95rem"
+            />
+            <AppSkeleton
+              width="45%"
+              height="0.8rem"
+            />
+            <AppSkeleton
+              width="55%"
+              height="0.75rem"
+            />
+          </div>
+        </li>
+      </ul>
+
+      <ul
+        v-else-if="results.length"
+        class="result-list"
+        :class="{ stale: loading }"
+      >
+        <li
+          v-for="(item, index) in results"
+          :key="item.olWorkKey || index"
+        >
+          <button
+            type="button"
+            class="result"
+            @click="emit('select', item)"
+          >
+            <span class="thumb">
+              <img
+                v-if="item.coverId && !brokenCovers.has(item.coverId)"
+                :src="api.isbnCoverUrl(item.coverId, 'M')"
+                alt=""
+                loading="lazy"
+                decoding="async"
+                @error="brokenCovers.add(item.coverId)"
+              />
+              <i
+                v-else
+                class="pi pi-book"
+                aria-hidden="true"
+              ></i>
+            </span>
+            <span class="info">
+              <span class="title">{{ item.title }}</span>
+              <span
+                v-if="item.authors.length"
+                class="authors"
+              >{{ item.authors.join(', ') }}</span>
+              <span
+                v-if="item.year || item.publisher"
+                class="meta"
+              >
+                <span v-if="item.year">{{ item.year }}</span>
+                <span v-if="item.publisher">{{ item.publisher }}</span>
+              </span>
+              <span
+                v-if="item.isbn13"
+                class="meta isbn"
+              >ISBN {{ item.isbn13 }}</span>
+              <span
+                v-else
+                class="meta no-isbn"
+              >{{ t('bookSearch.noIsbn') }}</span>
+            </span>
+            <i
+              class="pi pi-angle-right chevron"
+              aria-hidden="true"
+            ></i>
+          </button>
+        </li>
+      </ul>
+
+      <p
+        v-else-if="state === 'empty'"
+        class="message"
+      >{{ t('bookSearch.empty', { q: lastQuery }) }}</p>
+
+      <p
+        v-else-if="state === 'error'"
+        class="message error"
+      >{{ errorText }}</p>
+
+      <p
+        v-if="results.length"
+        class="source"
+      >{{ t('bookSearch.source') }}</p>
+    </div>
+  </div>
+</template>
+
+<script setup>
+import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import TextField from '../form/TextField.vue'
+import AppSkeleton from '../ui/AppSkeleton.vue'
+import api from '../../services/api.js'
+
+/**
+ * Busca de livro por título/autor no Open Library (pelo servidor). Espera a
+ * pessoa parar de digitar; Enter busca na hora. Escolher um resultado emite
+ * "select" com { title, authors, publisher, pubDate, isbn13, coverId, ... }.
+ */
+const props = defineProps({
+  idPrefix: { type: String, required: true },
+  initialQuery: { type: String, default: '' }
+})
+const emit = defineEmits(['select'])
+const { t, locale } = useI18n()
+
+const DEBOUNCE_MS = 600
+const MIN_CHARS = 3
+
+const field = ref(null)
+const query = ref(props.initialQuery)
+const results = ref([])
+const loading = ref(false)
+const state = ref('idle') // idle | done | empty | error
+const errorText = ref('')
+const lastQuery = ref('')
+const brokenCovers = reactive(new Set())
+
+let debounceTimer = null
+let controller = null
+
+const liveText = computed(() => {
+  if (loading.value) return t('bookSearch.searching')
+  if (state.value === 'done') return t('bookSearch.found', { n: results.value.length }, results.value.length)
+  if (state.value === 'empty') return t('bookSearch.empty', { q: lastQuery.value })
+  if (state.value === 'error') return errorText.value
+  return ''
+})
+
+function normalized(text) {
+  return text.replace(/\s+/g, ' ').trim()
+}
+
+async function search(text) {
+  const q = normalized(text)
+  if (q.length < MIN_CHARS || q === lastQuery.value && state.value !== 'error') return
+
+  controller?.abort()
+  controller = new AbortController()
+  const { signal } = controller
+  loading.value = true
+  lastQuery.value = q
+  try {
+    const data = await api.searchBooks(q, locale.value, { signal })
+    if (signal.aborted) return
+    results.value = data.results || []
+    state.value = results.value.length ? 'done' : 'empty'
+  } catch (error) {
+    if (error.name === 'AbortError') return
+    results.value = []
+    state.value = 'error'
+    errorText.value = error.status === 429 ? error.message : t('bookSearch.error')
+    lastQuery.value = ''
+  } finally {
+    if (!signal.aborted) loading.value = false
+  }
+}
+
+watch(query, value => {
+  clearTimeout(debounceTimer)
+  if (normalized(value).length < MIN_CHARS) {
+    controller?.abort()
+    loading.value = false
+    results.value = []
+    state.value = 'idle'
+    lastQuery.value = ''
+    return
+  }
+  debounceTimer = setTimeout(() => search(value), DEBOUNCE_MS)
+}, { immediate: true })
+
+function onKeydown(event) {
+  if (event.key === 'Enter') {
+    event.preventDefault()
+    clearTimeout(debounceTimer)
+    search(query.value)
+  }
+}
+
+onBeforeUnmount(() => {
+  clearTimeout(debounceTimer)
+  controller?.abort()
+})
+
+defineExpose({ focus: () => field.value?.focus() })
+</script>
+
+<style scoped>
+.book-search {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+}
+
+.search-spinner {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  width: 34px;
+  margin-right: 0.35rem;
+  color: var(--text-secondary);
+}
+
+.result-list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  overflow: hidden;
+  transition: opacity 0.15s ease;
+}
+
+.result-list.stale {
+  opacity: 0.55;
+}
+
+.result-list li + li {
+  border-top: 1px solid var(--border-color);
+}
+
+.result {
+  display: flex;
+  align-items: center;
+  gap: 0.85rem;
+  width: 100%;
+  padding: 0.65rem 0.75rem;
+  border: none;
+  background: transparent;
+  color: inherit;
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+}
+
+button.result:hover {
+  background: var(--bg-hover);
+}
+
+button.result:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: -2px;
+  border-radius: 10px;
+}
+
+.thumb {
+  flex-shrink: 0;
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  width: 2.75rem;
+  height: 4rem;
+  border-radius: 4px;
+  overflow: hidden;
+  background: var(--bg-input);
+  color: var(--text-muted);
+}
+
+.thumb img {
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+}
+
+.info {
+  display: flex;
+  flex-direction: column;
+  gap: 0.15rem;
+  min-width: 0;
+  flex: 1;
+}
+
+.title {
+  font-weight: 600;
+  color: var(--text-primary);
+  line-height: 1.3;
+  display: -webkit-box;
+  -webkit-line-clamp: 2;
+  line-clamp: 2;
+  -webkit-box-orient: vertical;
+  overflow: hidden;
+}
+
+.authors {
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
+}
+
+.meta {
+  display: flex;
+  flex-wrap: wrap;
+  column-gap: 0.5rem;
+  min-width: 0;
+  font-size: var(--fs-xs);
+  color: var(--text-muted);
+}
+
+.meta > span + span::before {
+  content: '·';
+  margin-right: 0.5rem;
+}
+
+.isbn {
+  font-variant-numeric: tabular-nums;
+}
+
+.no-isbn {
+  font-style: italic;
+}
+
+.chevron {
+  flex-shrink: 0;
+  color: var(--text-muted);
+}
+
+.skeleton-row {
+  cursor: default;
+}
+
+.skeleton-text {
+  display: flex;
+  flex-direction: column;
+  gap: 0.4rem;
+  flex: 1;
+}
+
+.message {
+  margin: 0;
+  padding: 0.85rem 1rem;
+  border-radius: 10px;
+  background: var(--bg-input);
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+  line-height: 1.45;
+}
+
+.message.error {
+  color: var(--red);
+}
+
+.source {
+  margin: 0;
+  font-size: var(--fs-xs);
+  color: var(--text-muted);
+  text-align: right;
+}
+
+@media (pointer: coarse) {
+  .result {
+    min-height: 44px;
+  }
+}
+</style>
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index bcea9266116815f89c29f9366433d579666a52a2..8ef7b72d518160f89398db35645e242b6e731807 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -118,7 +118,7 @@
   "bookForm": {
     "newTitle": "New book",
     "editTitle": "Edit book",
-    "newSubtitle": "Look it up by ISBN or fill it in by hand.",
+    "newSubtitle": "Search by ISBN, camera or title — or fill it in by hand.",
     "isbn": "ISBN",
     "title": "Title",
     "authors": "Authors",
@@ -141,7 +141,7 @@
       "drop": "Drag an image here or click",
       "dropNow": "Drop the image here",
       "hint": "Image up to {mb} MB",
-      "fromIsbn": "Cover found by ISBN"
+      "fromIsbn": "Cover found on Open Library"
     },
     "errors": {
       "titleRequired": "Enter the title.",
@@ -608,6 +608,35 @@
     "error": "Lookup is unavailable right now. Fill in the details by hand or try later.",
     "invalid": "This ISBN isn't valid. Check the digits."
   },
+  "scanner": {
+    "open": "Scan the barcode with the camera",
+    "title": "Scan barcode",
+    "starting": "Opening the camera…",
+    "hint": "Point at the barcode on the back of the book (the one starting with 978 or 979).",
+    "notIsbn": "That code isn't an ISBN. Look for the one starting with 978 or 979.",
+    "retry": "Try again",
+    "typeInstead": "Type the ISBN",
+    "errors": {
+      "denied": "Camera access was denied. Allow the camera for this site in your browser settings and try again.",
+      "noCamera": "No camera found on this device.",
+      "busy": "The camera is being used by another app. Close it and try again.",
+      "reader": "Could not load the barcode reader. Check your connection and try again.",
+      "generic": "Could not open the camera."
+    }
+  },
+  "bookSearch": {
+    "modeLabel": "How to find the book",
+    "byIsbn": "ISBN",
+    "byTitle": "Title or author",
+    "label": "Title or author",
+    "hint": "E.g. Dune, or Frank Herbert. Pick a result to fill in the form.",
+    "searching": "Searching…",
+    "found": "No results | 1 result | {n} results",
+    "empty": "Nothing found for “{q}”. Try other words or fill it in by hand.",
+    "error": "Search is unavailable right now. Try again or fill it in by hand.",
+    "noIsbn": "no ISBN",
+    "source": "Results from Open Library"
+  },
   "community": {
     "book_title": "Community",
     "load_error": "Couldn't load the community.",
@@ -930,7 +959,10 @@
       "isPublic": "public library",
       "showInCommunity": "community",
       "showActivity": "activity"
-    }
+    },
+    "OPENLIBRARY_UNAVAILABLE": "Open Library is unavailable right now. Try again later.",
+    "SEARCH_QUERY_INVALID": "Type {min} to {max} characters to search.",
+    "RATE_LIMIT_SEARCH": "Too many searches in a short time. Wait a minute."
   },
   "block": {
     "block": "Block {name}",
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 24b2a8bb342b46bba09ef371b43e426ec539e9da..e67d3ac77eb31ecc6d1d6b1dbe288368e9545aae 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -118,7 +118,7 @@
   "bookForm": {
     "newTitle": "Novo livro",
     "editTitle": "Editar livro",
-    "newSubtitle": "Busque pelo ISBN ou preencha à mão.",
+    "newSubtitle": "Busque pelo ISBN, pela câmera ou pelo título — ou preencha à mão.",
     "isbn": "ISBN",
     "title": "Título",
     "authors": "Autores",
@@ -141,7 +141,7 @@
       "drop": "Arraste uma imagem ou clique",
       "dropNow": "Solte a imagem aqui",
       "hint": "Imagem de até {mb} MB",
-      "fromIsbn": "Capa encontrada pelo ISBN"
+      "fromIsbn": "Capa encontrada no Open Library"
     },
     "errors": {
       "titleRequired": "Informe o título.",
@@ -608,6 +608,35 @@
     "error": "A busca está indisponível agora. Preencha os dados à mão ou tente mais tarde.",
     "invalid": "Este ISBN não é válido. Confira os dígitos."
   },
+  "scanner": {
+    "open": "Ler o código de barras com a câmera",
+    "title": "Ler código de barras",
+    "starting": "Abrindo a câmera…",
+    "hint": "Aponte para o código de barras atrás do livro (o que começa com 978 ou 979).",
+    "notIsbn": "Esse código não é um ISBN. Procure o que começa com 978 ou 979.",
+    "retry": "Tentar de novo",
+    "typeInstead": "Digitar o ISBN",
+    "errors": {
+      "denied": "O acesso à câmera foi negado. Libere a câmera para este site nas configurações do navegador e tente de novo.",
+      "noCamera": "Nenhuma câmera encontrada neste aparelho.",
+      "busy": "A câmera está sendo usada por outro app. Feche-o e tente de novo.",
+      "reader": "Não foi possível carregar o leitor de código de barras. Confira sua conexão e tente de novo.",
+      "generic": "Não foi possível abrir a câmera."
+    }
+  },
+  "bookSearch": {
+    "modeLabel": "Como encontrar o livro",
+    "byIsbn": "ISBN",
+    "byTitle": "Título ou autor",
+    "label": "Título ou autor",
+    "hint": "Ex.: Dom Casmurro, ou Machado de Assis. Escolha um resultado para preencher o formulário.",
+    "searching": "Buscando…",
+    "found": "Nenhum resultado | 1 resultado | {n} resultados",
+    "empty": "Nada encontrado para “{q}”. Tente outras palavras ou preencha à mão.",
+    "error": "A busca está indisponível agora. Tente de novo ou preencha à mão.",
+    "noIsbn": "sem ISBN",
+    "source": "Resultados do Open Library"
+  },
   "community": {
     "book_title": "Comunidade",
     "load_error": "Não foi possível carregar a comunidade.",
@@ -930,7 +959,10 @@
       "isPublic": "biblioteca pública",
       "showInCommunity": "comunidade",
       "showActivity": "atividade"
-    }
+    },
+    "OPENLIBRARY_UNAVAILABLE": "O Open Library está indisponível agora. Tente de novo mais tarde.",
+    "SEARCH_QUERY_INVALID": "Digite de {min} a {max} caracteres para buscar.",
+    "RATE_LIMIT_SEARCH": "Muitas buscas em pouco tempo. Aguarde um minuto."
   },
   "block": {
     "block": "Bloquear {name}",
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index a22b89c3909d33b4d73402058f0215a7203fa222..7161caad5abdc8b645a030a3a0adefccf45bb5fe 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -160,8 +160,15 @@ export default {
     return client.get(`/isbn/${enc(isbn)}`)
   },
 
-  isbnCoverUrl(coverId) {
-    return `${API_URL}/isbn/cover/${coverId}`
+  /** size 'M' = miniatura (lista da busca por título). */
+  isbnCoverUrl(coverId, size) {
+    return `${API_URL}/isbn/cover/${coverId}${size === 'M' ? '?size=M' : ''}`
+  },
+
+  /** Busca por título/autor no Open Library → { results, total }. */
+  searchBooks(query, lang, { signal } = {}) {
+    const params = new URLSearchParams({ q: query, lang: lang || 'pt' })
+    return client.get(`/isbn/search?${params}`, { signal })
   },
 
   // --- Comunidade ---
diff --git a/frontend/src/services/barcode.js b/frontend/src/services/barcode.js
new file mode 100644
index 0000000000000000000000000000000000000000..3eb74170e846042b234745f421c9b52b742a7c26
--- /dev/null
+++ b/frontend/src/services/barcode.js
@@ -0,0 +1,110 @@
+/**
+ * Leitura de código de barras de livro (EAN-13 do ISBN) pela câmera.
+ *
+ * Detector: o BarcodeDetector nativo quando existe e lê EAN-13 (Chrome no
+ * Android e no macOS, Samsung Internet). No Safari do iPhone ele vem
+ * desligado e no Firefox não existe; aí entra o barcode-detector (ZXing em
+ * WebAssembly), carregado só quando a pessoa toca no botão da câmera. O
+ * .wasm sai do nosso próprio servidor (o padrão do pacote seria uma CDN).
+ *   https://developer.mozilla.org/docs/Web/API/BarcodeDetector
+ *   https://github.com/Sec-ant/barcode-detector
+ */
+
+const FORMATS = ['ean_13']
+
+let detectorPromise = null
+
+async function nativeDetector() {
+  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
+  try {
+    const supported = await window.BarcodeDetector.getSupportedFormats()
+    if (!FORMATS.every(format => supported.includes(format))) return null
+    return new window.BarcodeDetector({ formats: FORMATS })
+  } catch {
+    return null
+  }
+}
+
+async function zxingDetector() {
+  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
+    import('barcode-detector/ponyfill'),
+    import('zxing-wasm/reader/zxing_reader.wasm?url')
+  ])
+  prepareZXingModule({
+    overrides: {
+      locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
+    },
+    fireImmediately: true
+  })
+  return new BarcodeDetector({ formats: FORMATS })
+}
+
+/** Detector pronto (o mesmo para as próximas aberturas da câmera). */
+export function getBarcodeDetector() {
+  if (!detectorPromise) {
+    detectorPromise = (async () => (await nativeDetector()) || zxingDetector())()
+    detectorPromise.catch(() => { detectorPromise = null })
+  }
+  return detectorPromise
+}
+
+/** Tem como abrir câmera aqui? (HTTPS ou localhost, navegador com getUserMedia) */
+export function cameraSupported() {
+  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext !== false
+}
+
+/** Há alguma câmera? (sem pedir permissão; sem a lista, supõe que sim) */
+export async function hasCamera() {
+  if (!cameraSupported()) return false
+  try {
+    const devices = await navigator.mediaDevices.enumerateDevices()
+    return devices.length === 0 || devices.some(device => device.kind === 'videoinput')
+  } catch {
+    return true
+  }
+}
+
+/** Câmera traseira quando houver, em boa resolução para ler as barras. */
+export function openCamera() {
+  return navigator.mediaDevices.getUserMedia({
+    audio: false,
+    video: {
+      facingMode: { ideal: 'environment' },
+      width: { ideal: 1280 },
+      height: { ideal: 720 }
+    }
+  })
+}
+
+export function stopStream(stream) {
+  stream?.getTracks().forEach(track => track.stop())
+}
+
+/**
+ * Código lido → ISBN-13, ou null quando não é ISBN.
+ * Livro: EAN-13 começando com 978 ou 979 e dígito verificador certo.
+ */
+export function isbnFromBarcode(raw) {
+  const digits = String(raw ?? '').replace(/\D/g, '')
+  if (!/^97[89]\d{10}$/.test(digits)) return null
+  let total = 0
+  for (let i = 0; i < 12; i++) total += Number(digits[i]) * (i % 2 === 0 ? 1 : 3)
+  return String((10 - (total % 10)) % 10) === digits[12] ? digits : null
+}
+
+/** Mensagem (chave de i18n) para o erro de getUserMedia. */
+export function cameraErrorKey(error) {
+  switch (error?.name) {
+    case 'NotAllowedError':
+    case 'SecurityError':
+      return 'scanner.errors.denied'
+    case 'NotFoundError':
+    case 'OverconstrainedError':
+      return 'scanner.errors.noCamera'
+    case 'NotReadableError':
+    case 'AbortError':
+      return 'scanner.errors.busy'
+    default:
+      return 'scanner.errors.generic'
+  }
+}
__LIBRISHELF_PATCH__

undo_hint() {
  echo "  Para desfazer tudo deste pacote:"
  echo "    git checkout HEAD -- $(git ls-files -- "${FILES[@]}" | tr '\n' ' ')"
  NEW=$(for f in "${FILES[@]}"; do git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || printf '%s ' "$f"; done)
  [ -n "$NEW" ] && echo "    rm -f $NEW"
  return 0
}

if git apply --check "$PATCH_FILE" 2>/dev/null; then
  git apply "$PATCH_FILE"
  echo "✓ Patch aplicado."
elif git apply --3way "$PATCH_FILE"; then
  # --3way deixa as mudanças no índice; tira de lá para você revisar e commitar
  git reset -q -- "${FILES[@]}"
  echo "✓ Patch aplicado com 3-way (algum arquivo estava reformatado)."
else
  CONFLICTS=$(git diff --name-only --diff-filter=U)
  git reset -q -- "${FILES[@]}" 2>/dev/null || true
  echo
  if [ -n "$CONFLICTS" ]; then
    echo "✗ O patch entrou, mas com conflito (marcadores <<<<<<< / >>>>>>>) em:"
    echo "$CONFLICTS" | sed 's/^/    /'
    echo "  Resolva esses trechos e rode de novo só a verificação:"
    echo "    (cd frontend && npm install) && (cd backend && npm run test:unit) && (cd frontend && npm run build)"
  else
    echo "✗ O patch não entrou (nada foi alterado)."
  fi
  undo_hint
  exit 1
fi

# Guarda as versões exatas deste pacote no banco de objetos do git: se o
# editor reformatar os arquivos antes do commit, o --3way do próximo pacote
# ainda encontra a base certa.
git hash-object -w -- "${FILES[@]}" >/dev/null 2>&1 || true

echo "→ Dependências do frontend (barcode-detector 3.2.2 + zxing-wasm)…"
(cd frontend && npm ci --no-audit --no-fund)
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund)

echo "→ Testes unitários do backend…"
(cd backend && npm run test:unit --silent)

echo "→ Build do frontend…"
(cd frontend && npm run build)

echo
echo "Sem migrations neste pacote."
echo "Testes de integração (opcional):  (cd backend && npm test)"
echo "Câmera no celular: precisa de HTTPS (ou localhost). No Vite pela rede local"
echo "(http://192.168...) o navegador não libera a câmera e o botão não aparece."

echo
echo "✓ Tudo certo. Mensagem de commit sugerida:"
echo "────────────────────────────────────────────"
cat <<'__MSG__'
feat: código de barras e busca por título no Novo livro (pacote 10)

- Botão de câmera no campo ISBN: lê o código de barras (EAN-13 com
  978/979 e dígito verificador). BarcodeDetector nativo quando existe
  (Chrome Android/macOS); senão barcode-detector (ZXing em WebAssembly),
  baixado só ao tocar no botão e com o .wasm servido pelo próprio site.
  Lido o ISBN, busca os dados sozinho. A câmera desliga ao fechar, ao
  sair da tela e com a aba em segundo plano; avisa permissão negada,
  sem câmera, câmera ocupada e código que não é ISBN
- Busca por título ou autor (aba "Título ou autor"): GET /isbn/search no
  Open Library (search.json com a edição que melhor casa com o idioma),
  com cache, limite próprio (20/min) e espera a pessoa parar de digitar.
  Resultado com capa, ano, editora, autores e ISBN; escolher preenche o
  formulário (só campos vazios) e leva as chaves e a capa do Open Library
  mesmo sem ISBN
- Capa do Open Library em miniatura (?size=M) para a lista, com cache e
  limite separados; erro do Open Library com código OPENLIBRARY_UNAVAILABLE
- nginx: Permissions-Policy camera=(self) e gzip para application/wasm
- Testes: busca por título (unitários e rota) e miniatura da capa
__MSG__
echo "────────────────────────────────────────────"
echo "Revise com git status / git diff e commite quando quiser."