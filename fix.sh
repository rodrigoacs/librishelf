#!/usr/bin/env bash
# =============================================================================
#  Librishelf — correções da auditoria (pendências levantadas em 2026-10-09)
#
#  Uso:   bash fix-audit-2026-10.sh [caminho/do/repo]      (padrão: pasta atual)
#
#  O que faz (NÃO commita nem faz push):
#    1. Aplica o patch de código (backend, frontend, Docker, nginx, .gitignore)
#    2. Para de versionar uploads/ e backend/uploads/ (git rm --cached; os
#       arquivos continuam no disco)
#    3. Baixa o logo para frontend/public/bookshelf.png (sai do CDN externo)
#    4. Atualiza dependências vulneráveis (npm audit fix; Vite 5 → 8)
#    5. Roda os testes que não precisam de banco e o build do frontend
#
#  Se o patch não encaixar (arquivos mexidos desde o commit 6f0c496), o script
#  para ANTES de alterar qualquer coisa.
# =============================================================================
set -euo pipefail

EXPECTED_BRANCH="fix/audit-2026-08"
LOGO_URL="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
LOGO_PATH="frontend/public/bookshelf.png"

if [ -t 1 ]; then
  B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'
else
  B=''; G=''; Y=''; R=''; C=''; N=''
fi

step()  { printf '\n%s==> %s%s\n' "$B$C" "$*" "$N"; }
ok()    { printf '%s  ✔ %s%s\n' "$G" "$*" "$N"; }
warn()  { printf '%s  ! %s%s\n' "$Y" "$*" "$N"; }
fail()  { printf '%s  ✘ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

REPO="${1:-$PWD}"
cd "$REPO" || fail "Pasta não encontrada: $REPO"

# -----------------------------------------------------------------------------
step "Verificando o ambiente"
# -----------------------------------------------------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Não é um repositório git: $PWD"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
[ -d backend/src ] && [ -d frontend/src ] || fail "Não parece ser o repositório do Librishelf (faltam backend/src e frontend/src)."
ok "Repositório: $REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "$EXPECTED_BRANCH" ]; then
  warn "Branch atual é '$BRANCH' (esperado: '$EXPECTED_BRANCH'). Continuando mesmo assim."
else
  ok "Branch: $BRANCH"
fi

command -v node >/dev/null || fail "Node.js não encontrado."
command -v npm  >/dev/null || fail "npm não encontrado."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
# Vite 8 exige Node 20.19+ ou 22.12+
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; } || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; }; then
  fail "Node $(node -v) é antigo demais para o Vite 8 (precisa 20.19+ ou 22.12+)."
fi
ok "Node $(node -v), npm $(npm -v)"

PATCH_FILE="$(mktemp)"
trap 'rm -f "$PATCH_FILE"' EXIT

cat > "$PATCH_FILE" <<'PATCH_EOF'
diff --git a/.gitignore b/.gitignore
index a038f02..8285c39 100644
--- a/.gitignore
+++ b/.gitignore
@@ -32,4 +32,6 @@ coverage
 .env
 .env.test
 
-git commit -m "chore: ignora backend/uploads/ (gerado localmente pelos testes)"package-lock.jsonuploads/
+# Capas enviadas pelos usuários (volume do Docker e pasta local dos testes)
+uploads/
+backend/uploads/
diff --git a/backend/.dockerignore b/backend/.dockerignore
new file mode 100644
index 0000000..cbed0cd
--- /dev/null
+++ b/backend/.dockerignore
@@ -0,0 +1,11 @@
+node_modules
+npm-debug.log*
+uploads
+coverage
+src/tests
+src/.env
+src/.env.*
+!src/.env.example
+.git
+Dockerfile
+.dockerignore
diff --git a/backend/Dockerfile b/backend/Dockerfile
index 4a2e8f1..d492075 100644
--- a/backend/Dockerfile
+++ b/backend/Dockerfile
@@ -1,7 +1,18 @@
 FROM node:24-slim
+
+ENV NODE_ENV=production
 WORKDIR /app
+
 COPY package*.json ./
-RUN npm install
-COPY . .
+RUN npm ci --omit=dev && npm cache clean --force
+
+COPY --chown=node:node src ./src
+
+# Pasta de uploads com dono "node" para o volume montado herdar a permissão
+# quando ainda não existir no host.
+RUN mkdir -p /app/uploads && chown node:node /app/uploads
+
+USER node
+
 EXPOSE 3050
-CMD ["node", "src/server.js"]
\ No newline at end of file
+CMD ["node", "src/server.js"]
diff --git a/backend/src/.env.example b/backend/src/.env.example
index 3a39746..db9fc44 100644
--- a/backend/src/.env.example
+++ b/backend/src/.env.example
@@ -1,6 +1,27 @@
+# --- Banco ---
 DB_USER=
 DB_HOST=
 DB_NAME=
 DB_PASSWORD=
-DB_PORT=
-SECRET_KEY=
\ No newline at end of file
+DB_PORT=5432
+# SSL do Postgres (deixe false se o banco está na mesma rede Docker)
+DB_SSL=false
+# DB_SSL_REJECT_UNAUTHORIZED=true
+# DB_SSL_CA=/caminho/para/ca.pem
+
+# --- Auth ---
+# Mínimo de 32 caracteres. Gere com: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
+SECRET_KEY=
+# true em produção (HTTPS)
+COOKIE_SECURE=false
+
+# --- HTTP ---
+PORT=3050
+# Origens do frontend, separadas por vírgula
+ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
+# Quantidade de proxies na frente do app (1 atrás do nginx). Deixe vazio sem proxy.
+TRUST_PROXY=
+
+# --- Uploads ---
+# Padrão: ./uploads relativo ao diretório de execução
+# UPLOAD_DIR=
diff --git a/backend/src/app.js b/backend/src/app.js
index 84a1e4d..55e9aa0 100644
--- a/backend/src/app.js
+++ b/backend/src/app.js
@@ -11,14 +11,27 @@ import dashboardRoutes from './routes/dashboard.js'
 import errorHandler from './middlewares/errorHandler.js'
 import UPLOAD_DIR from './config/uploadDir.js'
 import corsOptions from './config/corsOptions.js'
+import trustProxy from './config/trustProxy.js'
+
+const UPLOADS_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
 
 const app = express()
 
+app.set('trust proxy', trustProxy)
+app.disable('x-powered-by')
+
 app.use(cors(corsOptions))
 app.use(express.json())
 app.use(cookieParser())
 
-app.use('/uploads', express.static(UPLOAD_DIR))
+app.use('/uploads', express.static(UPLOAD_DIR, {
+  etag: true,
+  lastModified: true,
+  setHeaders: (res) => {
+    res.setHeader('Cache-Control', UPLOADS_CACHE_CONTROL)
+    res.setHeader('X-Content-Type-Options', 'nosniff')
+  }
+}))
 
 app.use('/auth', authRoutes)
 app.use('/library', libraryRoutes)
@@ -30,4 +43,4 @@ app.get('/ping', (req, res) => { res.json({ message: 'pong' }) })
 
 app.use(errorHandler)
 
-export default app
\ No newline at end of file
+export default app
diff --git a/backend/src/config/trustProxy.js b/backend/src/config/trustProxy.js
new file mode 100644
index 0000000..008d060
--- /dev/null
+++ b/backend/src/config/trustProxy.js
@@ -0,0 +1,33 @@
+import logger from '../utils/logger.js'
+
+/**
+ * Valor de `app.set('trust proxy', ...)`.
+ *
+ * Atrás de um reverse proxy (nginx), sem isso o req.ip de todo mundo é o IP do
+ * proxy e o rate limit vira global. Mas confiar no X-Forwarded-For sem proxy na
+ * frente permite que o cliente forje o próprio IP — por isso o padrão é `false`
+ * e o valor vem de TRUST_PROXY:
+ *   - número (ex.: "1")  → quantidade de proxies confiáveis na frente do app
+ *   - "true" / "false"
+ *   - lista de IPs/sub-redes ou presets do Express ("loopback", "uniquelocal")
+ */
+function parseTrustProxy(raw) {
+  if (raw === undefined || raw.trim() === '') return false
+
+  const value = raw.trim()
+
+  if (value === 'true') return true
+  if (value === 'false') return false
+  if (/^\d+$/.test(value)) return Number(value)
+
+  return value.split(',').map(v => v.trim()).filter(Boolean)
+}
+
+const trustProxy = parseTrustProxy(process.env.TRUST_PROXY)
+
+if (process.env.TRUST_PROXY === undefined) {
+  logger.info('TRUST_PROXY não definido, usando padrão sem proxy (false). Defina TRUST_PROXY=1 atrás do nginx.')
+}
+
+export { parseTrustProxy }
+export default trustProxy
diff --git a/backend/src/database/connection.js b/backend/src/database/connection.js
index b3ca090..9e925f9 100644
--- a/backend/src/database/connection.js
+++ b/backend/src/database/connection.js
@@ -1,18 +1,42 @@
+import fs from 'fs'
 import pkg from 'pg'
 import logger from '../utils/logger.js'
 
 const { Pool } = pkg
 
+/**
+ * SSL do Postgres, controlado por env:
+ *   DB_SSL=true                          → liga SSL
+ *   DB_SSL_REJECT_UNAUTHORIZED=false     → aceita certificado autoassinado (padrão: valida)
+ *   DB_SSL_CA=/caminho/para/ca.pem       → CA própria para validar o certificado do servidor
+ * Com o banco na mesma rede Docker do backend, deixar DB_SSL desligado é aceitável.
+ */
+function buildSslConfig() {
+  if (process.env.DB_SSL !== 'true') return false
+
+  const ssl = {
+    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
+  }
+
+  if (process.env.DB_SSL_CA) {
+    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8')
+  }
+
+  return ssl
+}
+
 const pool = new Pool({
   user: process.env.DB_USER,
   host: process.env.DB_HOST,
   database: process.env.DB_NAME,
   password: process.env.DB_PASSWORD,
   port: process.env.DB_PORT,
+  ssl: buildSslConfig()
 })
 
 pool.on('error', (err) => {
   logger.error('Erro em cliente ocioso do pool de conexões', { context: 'connection.js', message: err.message })
 })
 
-export const db = pool
\ No newline at end of file
+export { buildSslConfig }
+export const db = pool
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index f1beea3..be49b9b 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -24,7 +24,7 @@ export const LIBRARY_QUERIES = {
       LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
   `,
 
-  GET_BOOK_BY_ID: `
+  GET_BOOK_BY_ID_FOR_USER: `
     SELECT
       b.id, -- Frontend aceita 'id' ou 'book_id', aqui retorna 'id'
       b.title,
@@ -44,7 +44,7 @@ export const LIBRARY_QUERIES = {
       ) AS tags
     FROM librishelf.books AS b
     LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
-    WHERE b.id = $1
+    WHERE b.id = $1 AND b.user_id = $2
   `,
 
   GET_OWNER: 'SELECT user_id FROM librishelf.books WHERE id = $1',
@@ -61,6 +61,11 @@ export const AUTH_QUERIES = {
     FROM librishelf.users 
     WHERE name = $1 OR email = $1
   `,
+  FIND_USER_BY_NAME: `
+    SELECT id, name
+    FROM librishelf.users
+    WHERE name = $1
+  `,
   FIND_USER_BY_ID: `
     SELECT id, name, email
     FROM librishelf.users
@@ -132,41 +137,46 @@ export const TAG_QUERIES = {
 }
 
 export const DASHBOARD_QUERIES = {
-  COUNT_TOTAL: `SELECT COUNT(*) as count FROM librishelf.books WHERE user_id = $1`,
-
-  COUNT_READ: `
-    SELECT COUNT(*) as count FROM librishelf.books 
-    WHERE user_id = $1 AND read_date IS NOT NULL
-  `,
-
-  READ_BY_YEAR: `
-    SELECT EXTRACT(YEAR FROM read_date::date) as year, COUNT(*) as count
-    FROM librishelf.books
-    WHERE user_id = $1 AND read_date IS NOT NULL
-    GROUP BY year
-    ORDER BY year DESC
-    LIMIT 5
-  `,
-
-  TOP_AUTHORS: `
-    SELECT a.name, COUNT(b.id) as count
-    FROM librishelf.authors a
-    JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
-    JOIN librishelf.books b ON bal.book_id = b.id
-    WHERE b.user_id = $1
-    GROUP BY a.name
-    ORDER BY count DESC
-    LIMIT 6
-  `,
-
-  TOP_TAGS: `
-    SELECT t.name, COUNT(b.id) as count
-    FROM librishelf.tags t
-    JOIN librishelf.books_tags_link btl ON t.id = btl.tag_id
-    JOIN librishelf.books b ON btl.book_id = b.id
-    WHERE b.user_id = $1
-    GROUP BY t.name
-    ORDER BY count DESC
-    LIMIT 6
+  // Uma única ida ao banco: o CTE filtra os livros do usuário uma vez e cada
+  // bloco agrega a partir dele. json_agg devolve números (não strings, como o
+  // COUNT/EXTRACT puros do pg), e COALESCE garante [] quando não há dados.
+  STATS: `
+    WITH user_books AS (
+      SELECT id, read_date
+      FROM librishelf.books
+      WHERE user_id = $1
+    ),
+    reading_by_year AS (
+      SELECT EXTRACT(YEAR FROM read_date::date)::int AS year, COUNT(*)::int AS count
+      FROM user_books
+      WHERE read_date IS NOT NULL
+      GROUP BY 1
+      ORDER BY 1 DESC
+      LIMIT 5
+    ),
+    top_authors AS (
+      SELECT a.name, COUNT(ub.id)::int AS count
+      FROM user_books ub
+      JOIN librishelf.books_authors_link bal ON bal.book_id = ub.id
+      JOIN librishelf.authors a ON a.id = bal.author_id
+      GROUP BY a.name
+      ORDER BY count DESC, a.name ASC
+      LIMIT 6
+    ),
+    top_tags AS (
+      SELECT t.name, COUNT(ub.id)::int AS count
+      FROM user_books ub
+      JOIN librishelf.books_tags_link btl ON btl.book_id = ub.id
+      JOIN librishelf.tags t ON t.id = btl.tag_id
+      GROUP BY t.name
+      ORDER BY count DESC, t.name ASC
+      LIMIT 6
+    )
+    SELECT
+      (SELECT COUNT(*)::int FROM user_books) AS total_books,
+      (SELECT COUNT(*)::int FROM user_books WHERE read_date IS NOT NULL) AS read_books,
+      COALESCE((SELECT json_agg(r ORDER BY r.year DESC) FROM reading_by_year r), '[]'::json) AS reading_by_year,
+      COALESCE((SELECT json_agg(a ORDER BY a.count DESC, a.name ASC) FROM top_authors a), '[]'::json) AS top_authors,
+      COALESCE((SELECT json_agg(t ORDER BY t.count DESC, t.name ASC) FROM top_tags t), '[]'::json) AS top_tags
   `
-}
\ No newline at end of file
+}
diff --git a/backend/src/middlewares/auth.js b/backend/src/middlewares/auth.js
index 9292fe2..6997bb8 100644
--- a/backend/src/middlewares/auth.js
+++ b/backend/src/middlewares/auth.js
@@ -1,5 +1,6 @@
 import jwt from 'jsonwebtoken'
 import { AUTH_COOKIE_NAME } from '../config/cookieOptions.js'
+import STATUS from '../utils/statusCodes.js'
 
 const SECRET_KEY = process.env.SECRET_KEY
 
@@ -15,11 +16,13 @@ function extractToken(req) {
   return null
 }
 
+// Token ausente, inválido ou expirado é falta de autenticação → 401.
+// 403 fica reservado para "autenticado, mas sem permissão" (ex.: livro de outro usuário).
 export function authenticateToken(req, res, next) {
   const token = extractToken(req)
 
   if (!token) {
-    return res.status(403).json({ error: 'Token is required or invalid format' })
+    return res.status(STATUS.UNAUTHORIZED).json({ error: 'Token is required or invalid format' })
   }
 
   try {
@@ -27,6 +30,7 @@ export function authenticateToken(req, res, next) {
     req.user = decoded
     next()
   } catch (err) {
-    return res.status(403).json({ error: 'Invalid token' })
+    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
+    return res.status(STATUS.UNAUTHORIZED).json({ error: message })
   }
-}
\ No newline at end of file
+}
diff --git a/backend/src/middlewares/errorHandler.js b/backend/src/middlewares/errorHandler.js
index 46d36b5..ad21240 100644
--- a/backend/src/middlewares/errorHandler.js
+++ b/backend/src/middlewares/errorHandler.js
@@ -1,17 +1,29 @@
 import logger from '../utils/logger.js'
+import STATUS from '../utils/statusCodes.js'
 
+const GENERIC_MESSAGE = 'Erro interno do servidor.'
+
+// Último middleware da cadeia. Erros com status < 500 são "controlados" e a
+// mensagem vai para o cliente; qualquer 500 recebe mensagem genérica e os
+// detalhes ficam só no log — mesmo contrato do utils/sendError.js.
 export default (err, req, res, next) => {
-  const statusCode = err.status || 500
-  const message = err.message || 'Internal Server Error'
+  if (res.headersSent) return next(err)
+
+  const rawStatus = err.status || err.statusCode
+  const statusCode = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600
+    ? rawStatus
+    : STATUS.INTERNAL_SERVER_ERROR
+
+  const isControlled = statusCode < STATUS.INTERNAL_SERVER_ERROR
 
-  if (statusCode >= 500) {
-    logger.error(message, { statusCode, stack: err.stack })
+  if (isControlled) {
+    logger.warn(err.message, { statusCode, method: req.method, path: req.path })
   } else {
-    logger.warn(message, { statusCode })
+    logger.error(err.message || 'Erro não tratado', { statusCode, method: req.method, path: req.path, stack: err.stack })
   }
 
   res.status(statusCode).json({
     status: 'error',
-    message: message
+    error: isControlled ? err.message : GENERIC_MESSAGE
   })
-}
\ No newline at end of file
+}
diff --git a/backend/src/middlewares/validateId.js b/backend/src/middlewares/validateId.js
index 347c978..886ca1c 100644
--- a/backend/src/middlewares/validateId.js
+++ b/backend/src/middlewares/validateId.js
@@ -1,12 +1,21 @@
 import STATUS from '../utils/statusCodes.js'
 
 const NUMERIC_ID_PATTERN = /^\d+$/
+// Teto do tipo `integer` do Postgres. Acima disso a query estoura com 500.
+const MAX_INT4 = 2147483647
+
+function isValidId(value) {
+  if (typeof value !== 'string' || !NUMERIC_ID_PATTERN.test(value)) return false
+
+  const parsed = Number(value)
+  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_INT4
+}
 
 function validateNumericId(paramName = 'id') {
   return (req, res, next) => {
     const value = req.params[paramName]
 
-    if (!NUMERIC_ID_PATTERN.test(value)) {
+    if (!isValidId(value)) {
       return res.status(STATUS.BAD_REQUEST).json({
         error: `Parâmetro '${paramName}' inválido: deve ser um número inteiro positivo.`
       })
@@ -16,4 +25,4 @@ function validateNumericId(paramName = 'id') {
   }
 }
 
-export { validateNumericId }
\ No newline at end of file
+export { validateNumericId, isValidId, MAX_INT4 }
diff --git a/backend/src/repositories/authRepository.js b/backend/src/repositories/authRepository.js
index a0d4e2e..9b5859e 100644
--- a/backend/src/repositories/authRepository.js
+++ b/backend/src/repositories/authRepository.js
@@ -6,6 +6,13 @@ async function getUserByUsername(username) {
   return result.rows[0] || null
 }
 
+// Só pelo nome de usuário (sem e-mail): usado nas rotas públicas, para que
+// /public/u/<e-mail> não sirva de oráculo de "esse e-mail tem conta?".
+async function getUserByName(name) {
+  const result = await db.query(q.FIND_USER_BY_NAME, [name])
+  return result.rows[0] || null
+}
+
 async function getUserById(id) {
   const result = await db.query(q.FIND_USER_BY_ID, [id])
   return result.rows[0] || null
@@ -16,4 +23,4 @@ async function createUser(username, hashedPassword, email) {
   return result.rows[0]
 }
 
-export { getUserByUsername, getUserById, createUser }
\ No newline at end of file
+export { getUserByUsername, getUserByName, getUserById, createUser }
\ No newline at end of file
diff --git a/backend/src/repositories/dashboardRepository.js b/backend/src/repositories/dashboardRepository.js
index 0e471df..d27f6a8 100644
--- a/backend/src/repositories/dashboardRepository.js
+++ b/backend/src/repositories/dashboardRepository.js
@@ -2,19 +2,14 @@ import { db } from "../database/connection.js"
 import { DASHBOARD_QUERIES as q } from "../database/queries.js"
 
 export async function getDashboardStats(userId) {
-  const [totalRes, readRes, yearsRes, authorsRes, tagsRes] = await Promise.all([
-    db.query(q.COUNT_TOTAL, [userId]),
-    db.query(q.COUNT_READ, [userId]),
-    db.query(q.READ_BY_YEAR, [userId]),
-    db.query(q.TOP_AUTHORS, [userId]),
-    db.query(q.TOP_TAGS, [userId])
-  ])
+  const { rows } = await db.query(q.STATS, [userId])
+  const row = rows[0]
 
   return {
-    totalBooks: parseInt(totalRes.rows[0].count),
-    readBooks: parseInt(readRes.rows[0].count),
-    readingByYear: yearsRes.rows,
-    topAuthors: authorsRes.rows,
-    topTags: tagsRes.rows
+    totalBooks: row.total_books,
+    readBooks: row.read_books,
+    readingByYear: row.reading_by_year,
+    topAuthors: row.top_authors,
+    topTags: row.top_tags
   }
-}
\ No newline at end of file
+}
diff --git a/backend/src/repositories/libraryRepository.js b/backend/src/repositories/libraryRepository.js
index 9fe90cd..6db0894 100644
--- a/backend/src/repositories/libraryRepository.js
+++ b/backend/src/repositories/libraryRepository.js
@@ -111,8 +111,9 @@ async function getAllBooksByUser(userId, filters = {}) {
   }
 }
 
-async function getBookById(id) {
-  const result = await db.query(q.GET_BOOK_BY_ID, [id])
+// Sempre escopado ao dono: não existe mais busca de livro só por id.
+async function getBookByIdForUser(id, userId) {
+  const result = await db.query(q.GET_BOOK_BY_ID_FOR_USER, [id, userId])
   return result.rows[0] || null
 }
 
@@ -149,8 +150,8 @@ async function getBookOwner(bookId) {
 }
 
 async function updateBook(bookId, bookInfo) {
-  const pubDate = bookInfo.pubDate ? new Date(bookInfo.pubDate).toISOString().split('T')[0] : null
-  const readDate = bookInfo.readDate ? new Date(bookInfo.readDate).toISOString().split('T')[0] : null
+  const pubDate = bookInfo.pubDate ?? null
+  const readDate = bookInfo.readDate ?? null
   const tagsArray = Array.isArray(bookInfo.tags) ? bookInfo.tags : []
 
   const params = [
@@ -184,7 +185,7 @@ async function updateReadDate(bookId, readDate) {
 
 export {
   getAllBooksByUser,
-  getBookById,
+  getBookByIdForUser,
   findBookByIsbn,
   createBook,
   getBookOwner,
diff --git a/backend/src/routes/auth.js b/backend/src/routes/auth.js
index 029dfe0..93200cb 100644
--- a/backend/src/routes/auth.js
+++ b/backend/src/routes/auth.js
@@ -10,7 +10,7 @@ const router = express.Router()
 
 router.post('/login', loginLimiter, async (req, res) => {
   try {
-    const { username, password } = req.body
+    const { username, password } = req.body ?? {}
 
     const result = await authService.loginUser(username, password)
 
@@ -45,7 +45,7 @@ router.get('/me', authenticateToken, async (req, res) => {
 
 router.post('/register', registerLimiter, async (req, res) => {
   try {
-    const { username, password, email } = req.body
+    const { username, password, email } = req.body ?? {}
 
     if (!username || !password || !email) {
       const error = new Error('Username, password, and email are required.')
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index c6b080a..508e43f 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -1,5 +1,5 @@
 import express from 'express'
-import fs from 'fs'
+import fs from 'fs/promises'
 import multer from 'multer'
 import * as libraryService from '../services/libraryService.js'
 import { authenticateToken } from '../middlewares/auth.js'
@@ -32,15 +32,13 @@ function handleUpload(uploadMiddleware) {
   }
 }
 
+const RANDOM_COVERS_LIMIT = 50
+
 const router = express.Router()
 
-router.get('/covers/random', (req, res) => {
+router.get('/covers/random', async (req, res) => {
   try {
-    if (!fs.existsSync(UPLOAD_DIR)) {
-      return res.json([])
-    }
-
-    const files = fs.readdirSync(UPLOAD_DIR)
+    const files = await fs.readdir(UPLOAD_DIR)
 
     const imageFiles = files.filter(file =>
       /\.(avif)$/i.test(file) && !file.startsWith('.')
@@ -51,11 +49,11 @@ router.get('/covers/random', (req, res) => {
       [imageFiles[i], imageFiles[j]] = [imageFiles[j], imageFiles[i]]
     }
 
-    const selectedCovers = imageFiles.slice(0, 50)
-
-    res.json(selectedCovers)
+    res.json(imageFiles.slice(0, RANDOM_COVERS_LIMIT))
   } catch (error) {
-    console.error('Erro ao buscar capas aleatórias:', error)
+    if (error.code !== 'ENOENT') {
+      logger.error('Erro ao buscar capas aleatórias', { message: error.message })
+    }
     res.json([])
   }
 })
@@ -70,10 +68,10 @@ router.get('/public/u/:username', async (req, res) => {
   }
 })
 
-router.get('/public/book/:id', validateNumericId(), async (req, res) => {
+router.get('/public/u/:username/book/:id', validateNumericId(), async (req, res) => {
   try {
-    const { id } = req.params
-    const book = await libraryService.getBookById(id)
+    const { username, id } = req.params
+    const book = await libraryService.getPublicBook(username, id)
 
     if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Livro não encontrado.' })
 
@@ -98,7 +96,8 @@ router.get('/', async (req, res) => {
 router.get('/:id', validateNumericId(), async (req, res) => {
   try {
     const { id } = req.params
-    const book = await libraryService.getBookById(id)
+    // Escopado ao usuário logado: livro de outra pessoa responde 404, igual a inexistente.
+    const book = await libraryService.getBookById(id, req.user.id)
     if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Book not found.' })
     res.status(STATUS.OK).json(book)
   } catch (error) {
@@ -108,18 +107,18 @@ router.get('/:id', validateNumericId(), async (req, res) => {
 
 router.post('/', handleUpload(upload.single('coverImage')), async (req, res) => {
   try {
-    const { title, pubDate, authors, publisher, tags, isbn, readDate } = req.body
+    const { title, pubDate, authors, publisher, tags, isbn, readDate } = req.body ?? {}
     const userId = req.user.id
 
-    if (!title) return res.status(STATUS.BAD_REQUEST).json({ error: 'Title is required.' })
-    if (!authors || !authors.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Authors is required.' })
+    if (typeof title !== 'string' || !title.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Title is required.' })
+    if (typeof authors !== 'string' || !authors.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Authors is required.' })
 
     const bookData = {
       title,
       pubDate,
       authors,
       publisher,
-      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
+      tags: typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
       isbn,
       readDate: readDate || null,
       user_id: userId
@@ -140,7 +139,7 @@ router.post('/', handleUpload(upload.single('coverImage')), async (req, res) =>
 router.put('/:id', validateNumericId(), async (req, res) => {
   try {
     const { id } = req.params
-    const bookInfo = req.body
+    const bookInfo = req.body ?? {}
     const userId = req.user.id
 
     await libraryService.updateBookDetails(id, userId, bookInfo)
@@ -163,7 +162,7 @@ router.post('/:id/cover', validateNumericId(), handleUpload(upload.single('cover
 
     await saveBookCover(req.file.buffer, id)
 
-    console.log(`[Upload] Capa processada (jpg + avif) para o livro ${id}`)
+    logger.info('Capa processada (jpg + avif)', { bookId: id, userId })
 
     res.status(STATUS.OK).json({ message: 'Capa atualizada com sucesso.' })
   } catch (error) {
diff --git a/backend/src/server.js b/backend/src/server.js
index 52548bd..207218a 100644
--- a/backend/src/server.js
+++ b/backend/src/server.js
@@ -3,6 +3,7 @@ import logger from './utils/logger.js'
 
 const PORT = process.env.PORT || 3050
 const MIN_SECRET_LENGTH = 32
+const REQUIRED_DB_VARS = ['DB_HOST', 'DB_NAME', 'DB_USER']
 
 function validateEnv() {
   const secret = process.env.SECRET_KEY
@@ -11,10 +12,17 @@ function validateEnv() {
     logger.error('SECRET_KEY ausente ou fraca', { minLength: MIN_SECRET_LENGTH })
     process.exit(1)
   }
+
+  const missingDbVars = REQUIRED_DB_VARS.filter(name => !process.env[name]?.trim())
+
+  if (missingDbVars.length > 0) {
+    logger.error('Variáveis de banco ausentes', { missing: missingDbVars })
+    process.exit(1)
+  }
 }
 
 validateEnv()
 
 app.listen(PORT, () => {
   logger.info(`Server running on port ${PORT}`)
-})
\ No newline at end of file
+})
diff --git a/backend/src/services/authService.js b/backend/src/services/authService.js
index 32c0962..7cb65ee 100644
--- a/backend/src/services/authService.js
+++ b/backend/src/services/authService.js
@@ -5,20 +5,39 @@ import bcrypt from 'bcrypt'
 import jwt from 'jsonwebtoken'
 
 const SECRET_KEY = process.env.SECRET_KEY
+const BCRYPT_ROUNDS = 10
+const UNIQUE_VIOLATION = '23505'
+const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
+const MAX_USERNAME_LENGTH = 50
+
+// Hash fixo usado quando o usuário não existe: o bcrypt.compare roda com o
+// mesmo custo e a resposta leva o mesmo tempo, sem permitir enumerar usuários.
+const DUMMY_HASH = bcrypt.hashSync('librishelf-dummy-password', BCRYPT_ROUNDS)
+
+function httpError(message, status) {
+  const error = new Error(message)
+  error.status = status
+  return error
+}
+
+function isNonEmptyString(value) {
+  return typeof value === 'string' && value.trim().length > 0
+}
 
 async function loginUser(username, password) {
-  const user = await authRepository.getUserByUsername(username)
+  if (!isNonEmptyString(username) || typeof password !== 'string' || password.length === 0) {
+    throw httpError('Username and password are required.', STATUS.BAD_REQUEST)
+  }
+
+  const user = await authRepository.getUserByUsername(username.trim())
 
-  const validUser = user || {}
-  const isPasswordValid = await bcrypt.compare(password, validUser.password_hash || "")
+  const isPasswordValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)
 
   if (!user || !isPasswordValid) {
-    const error = new Error('User or password invalid.')
-    error.status = STATUS.UNAUTHORIZED
-    throw error
+    throw httpError('User or password invalid.', STATUS.UNAUTHORIZED)
   }
 
-  const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' })
+  const token = jwt.sign({ id: user.id, username: user.name }, SECRET_KEY, { expiresIn: '7d' })
 
   return {
     token,
@@ -43,24 +62,49 @@ async function getUserProfile(id) {
 }
 
 async function registerUser(username, password, email) {
+  if (!isNonEmptyString(username) || !isNonEmptyString(email)) {
+    throw httpError('Username, password, and email are required.', STATUS.BAD_REQUEST)
+  }
+
+  const cleanUsername = username.trim()
+  const cleanEmail = email.trim()
+
+  if (cleanUsername.length > MAX_USERNAME_LENGTH) {
+    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+  }
+
+  // O login aceita usuário OU e-mail no mesmo campo; um username com "@" poderia
+  // colidir com o e-mail de outra conta.
+  if (cleanUsername.includes('@')) {
+    throw httpError('O usuário não pode conter "@".', STATUS.BAD_REQUEST)
+  }
+
+  if (!EMAIL_PATTERN.test(cleanEmail)) {
+    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST)
+  }
+
   const passwordCheck = validatePassword(password)
   if (!passwordCheck.valid) {
-    const error = new Error(passwordCheck.reason)
-    error.status = STATUS.BAD_REQUEST
-    throw error
+    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST)
   }
 
-  const existingUser = await authRepository.getUserByUsername(username)
+  const existingUser = await authRepository.getUserByUsername(cleanUsername)
   if (existingUser) {
-    const error = new Error('Username already taken.')
-    error.status = STATUS.CONFLICT
-    throw error
+    throw httpError('Username already taken.', STATUS.CONFLICT)
   }
 
-  const hashedPassword = await bcrypt.hash(password, 10)
-  const user = await authRepository.createUser(username, hashedPassword, email)
+  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)
 
-  return user
+  try {
+    return await authRepository.createUser(cleanUsername, hashedPassword, cleanEmail)
+  } catch (err) {
+    // Duas requisições simultâneas passam pela checagem acima; a constraint
+    // UNIQUE do banco é quem decide, e a violação vira 409 em vez de 500.
+    if (err.code === UNIQUE_VIOLATION) {
+      throw httpError('Username or email already taken.', STATUS.CONFLICT)
+    }
+    throw err
+  }
 }
 
-export { loginUser, registerUser, getUserProfile }
\ No newline at end of file
+export { loginUser, registerUser, getUserProfile }
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index aa29e78..cc837f9 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -3,60 +3,104 @@ import * as authRepository from '../repositories/authRepository.js'
 import STATUS from '../utils/statusCodes.js'
 import { deleteBookCover } from '../utils/imageProcessor.js'
 
+const READ_YEAR_PATTERN = /^\d{4}$/
+
+function httpError(message, status) {
+  const error = new Error(message)
+  error.status = status
+  return error
+}
+
 function normalizeIsbn(isbn) {
   if (typeof isbn !== 'string') return isbn ?? null
   const trimmed = isbn.trim()
   return trimmed ? trimmed : null
 }
 
+/**
+ * Converte a data recebida para 'YYYY-MM-DD' (ou null quando vazia).
+ * Data inválida vira 400 em vez de estourar como 500 no `toISOString()` ou no Postgres.
+ */
+function normalizeDate(value, fieldName) {
+  if (value === undefined || value === null || value === '') return null
+
+  const parsed = new Date(value)
+
+  if (Number.isNaN(parsed.getTime())) {
+    throw httpError(`Data inválida em '${fieldName}'.`, STATUS.BAD_REQUEST)
+  }
+
+  return parsed.toISOString().split('T')[0]
+}
+
+function normalizeReadYear(readYear) {
+  if (readYear === undefined || readYear === null || readYear === '' || readYear === 'all') return 'all'
+
+  if (!READ_YEAR_PATTERN.test(String(readYear))) {
+    throw httpError("Parâmetro 'readYear' inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST)
+  }
+
+  return String(readYear)
+}
+
 async function getPublicLibraryByUsername(username, query) {
-  const user = await authRepository.getUserByUsername(username)
+  const user = await authRepository.getUserByName(username)
 
   if (!user) {
-    const error = new Error('User not found.')
-    error.status = STATUS.NOT_FOUND
-    throw error
+    throw httpError('User not found.', STATUS.NOT_FOUND)
   }
 
   const booksData = await getAllBooksByUser(user.id, query)
 
   return {
-    owner: user.name || user.username,
+    owner: user.name,
     ...booksData
   }
 }
 
+/**
+ * Livro da biblioteca pública: só é encontrado se pertencer ao usuário da URL.
+ * Antes qualquer id era aceito, o que permitia percorrer os livros de todos os
+ * usuários incrementando o id.
+ */
+async function getPublicBook(username, bookId) {
+  const user = await authRepository.getUserByName(username)
+  if (!user) return null
+
+  return await libraryRepository.getBookByIdForUser(bookId, user.id)
+}
+
 async function getAllBooksByUser(userId, query) {
   const filters = {
     search: query.search || undefined,
     readState: query.readState || 'all',
-    readYear: query.readYear || 'all',
+    readYear: normalizeReadYear(query.readYear),
     author: query.author || undefined,
     publisher: query.publisher || undefined,
     tags: query.tags || undefined,
     page: query.page || 1,
     limit: query.limit || 20,
     sortField: query.sort || 'recent',
-    sortOrder: query.order || 'desc'
+    sortOrder: typeof query.order === 'string' ? query.order : 'desc'
   }
 
   return await libraryRepository.getAllBooksByUser(userId, filters)
 }
 
-async function getBookById(id) {
-  return await libraryRepository.getBookById(id)
+async function getBookById(id, userId) {
+  return await libraryRepository.getBookByIdForUser(id, userId)
 }
 
 async function addNewBook(bookData) {
   bookData.isbn = normalizeIsbn(bookData.isbn)
+  bookData.pubDate = normalizeDate(bookData.pubDate, 'pubDate')
+  bookData.readDate = normalizeDate(bookData.readDate, 'readDate')
 
   if (bookData.isbn) {
     const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)
 
     if (existingBook) {
-      const error = new Error('ISBN already exists for this user.')
-      error.status = STATUS.CONFLICT
-      throw error
+      throw httpError('ISBN already exists for this user.', STATUS.CONFLICT)
     }
   }
 
@@ -66,19 +110,7 @@ async function addNewBook(bookData) {
 }
 
 async function updateBookDetails(bookId, userId, bookData) {
-  const bookOwner = await libraryRepository.getBookOwner(bookId)
-
-  if (!bookOwner) {
-    const error = new Error('Book not found.')
-    error.status = STATUS.NOT_FOUND
-    throw error
-  }
-
-  if (bookOwner.user_id !== userId) {
-    const error = new Error('Permission denied.')
-    error.status = STATUS.FORBIDDEN
-    throw error
-  }
+  await checkBookOwnership(bookId, userId)
 
   if (typeof bookData.tags === 'string') {
     bookData.tags = bookData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
@@ -88,6 +120,9 @@ async function updateBookDetails(bookId, userId, bookData) {
     bookData.isbn = normalizeIsbn(bookData.isbn)
   }
 
+  bookData.pubDate = normalizeDate(bookData.pubDate, 'pubDate')
+  bookData.readDate = normalizeDate(bookData.readDate, 'readDate')
+
   return await libraryRepository.updateBook(bookId, bookData)
 }
 
@@ -95,15 +130,11 @@ async function checkBookOwnership(bookId, userId) {
   const bookOwner = await libraryRepository.getBookOwner(bookId)
 
   if (!bookOwner) {
-    const error = new Error('Book not found.')
-    error.status = STATUS.NOT_FOUND
-    throw error
+    throw httpError('Book not found.', STATUS.NOT_FOUND)
   }
 
   if (bookOwner.user_id !== userId) {
-    const error = new Error('Permission denied.')
-    error.status = STATUS.FORBIDDEN
-    throw error
+    throw httpError('Permission denied.', STATUS.FORBIDDEN)
   }
 
   return true
@@ -128,4 +159,17 @@ async function markBookAsUnread(bookId, userId) {
   return await libraryRepository.updateReadDate(bookId, null)
 }
 
-export { getAllBooksByUser, getBookById, addNewBook, updateBookDetails, checkBookOwnership, deleteBook, markBookAsRead, markBookAsUnread, getPublicLibraryByUsername }
\ No newline at end of file
+export {
+  getAllBooksByUser,
+  getBookById,
+  getPublicBook,
+  addNewBook,
+  updateBookDetails,
+  checkBookOwnership,
+  deleteBook,
+  markBookAsRead,
+  markBookAsUnread,
+  getPublicLibraryByUsername,
+  normalizeDate,
+  normalizeReadYear
+}
diff --git a/backend/src/tests/helpers/authToken.js b/backend/src/tests/helpers/authToken.js
new file mode 100644
index 0000000..ec6a3fe
--- /dev/null
+++ b/backend/src/tests/helpers/authToken.js
@@ -0,0 +1,18 @@
+import { AUTH_COOKIE_NAME } from '../../config/cookieOptions.js'
+
+/**
+ * Desde a migração para cookie httpOnly o login não devolve mais o token no
+ * corpo. Os testes extraem o JWT do Set-Cookie para continuar usando
+ * `Authorization: Bearer <token>` (o middleware aceita os dois).
+ */
+export function tokenFrom(res) {
+  const cookies = res.headers['set-cookie'] || []
+  const prefix = `${AUTH_COOKIE_NAME}=`
+  const authCookie = cookies.find(cookie => cookie.startsWith(prefix))
+
+  if (!authCookie) {
+    throw new Error(`Resposta sem cookie "${AUTH_COOKIE_NAME}" (status ${res.statusCode}): ${JSON.stringify(res.body)}`)
+  }
+
+  return decodeURIComponent(authCookie.slice(prefix.length).split(';')[0])
+}
diff --git a/backend/src/tests/integration/auth.test.js b/backend/src/tests/integration/auth.test.js
index 97635db..1f53b31 100644
--- a/backend/src/tests/integration/auth.test.js
+++ b/backend/src/tests/integration/auth.test.js
@@ -1,5 +1,6 @@
 import request from 'supertest'
 import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
 
 beforeAll(async () => {
@@ -42,7 +43,26 @@ describe('Auth Endpoints', () => {
       .send(mockUser)
 
     expect(res.statusCode).toEqual(200)
-    expect(res.body).toHaveProperty('token')
+    expect(res.body).toHaveProperty('user')
+    expect(res.body).not.toHaveProperty('token')
+    expect(tokenFrom(res)).toEqual(expect.any(String))
+    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i)
+  })
+
+  it('should reject login with missing credentials as 400', async () => {
+    const res = await request(app)
+      .post('/auth/login')
+      .send({ username: mockUser.username })
+
+    expect(res.statusCode).toEqual(400)
+  })
+
+  it('should reject login for unknown user with the same 401 as a wrong password', async () => {
+    const res = await request(app)
+      .post('/auth/login')
+      .send({ username: 'nao-existe', password: 'qualquer123' })
+
+    expect(res.statusCode).toEqual(401)
   })
 
   it('should reject login with wrong password', async () => {
diff --git a/backend/src/tests/integration/author.test.js b/backend/src/tests/integration/author.test.js
index 19276eb..a5eb5a6 100644
--- a/backend/src/tests/integration/author.test.js
+++ b/backend/src/tests/integration/author.test.js
@@ -1,5 +1,6 @@
 import request from 'supertest'
 import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
 
 let token
@@ -9,7 +10,7 @@ beforeAll(async () => {
 
   await request(app).post('/auth/register').send({ username: 'authortester', password: 'testpass123', email: 'authortester@example.com' })
   const loginRes = await request(app).post('/auth/login').send({ username: 'authortester', password: 'testpass123' })
-  token = loginRes.body.token
+  token = tokenFrom(loginRes)
 
   await request(app).post('/library').set('Authorization', `Bearer ${token}`).field({
     title: 'Harry Potter', authors: 'J.K. Rowling', publisher: 'Bloomsbury', tags: 'magic', pubDate: '1997-06-26', isbn: '111'
@@ -59,13 +60,13 @@ describe('Author Endpoints', () => {
 
   it('should fail without authentication', async () => {
     const res = await request(app).get('/author')
-    expect(res.statusCode).toEqual(403)
+    expect(res.statusCode).toEqual(401)
   })
 
   it('should not leak authors from other users sharing the same publisher', async () => {
     await request(app).post('/auth/register').send({ username: 'authortester2', password: 'testpass123', email: 'authortester2@example.com' })
     const loginRes2 = await request(app).post('/auth/login').send({ username: 'authortester2', password: 'testpass123' })
-    const token2 = loginRes2.body.token
+    const token2 = tokenFrom(loginRes2)
 
     await request(app).post('/library').set('Authorization', `Bearer ${token2}`).field({
       title: 'Livro de outro usuário', authors: 'Autor Estranho', publisher: 'Bloomsbury', tags: 'x', pubDate: '2000-01-01', isbn: '999-other-user'
diff --git a/backend/src/tests/integration/library-payload-contract.test.js b/backend/src/tests/integration/library-payload-contract.test.js
index 0b0b158..7464480 100644
--- a/backend/src/tests/integration/library-payload-contract.test.js
+++ b/backend/src/tests/integration/library-payload-contract.test.js
@@ -1,5 +1,6 @@
 import request from 'supertest'
 import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
 
 let token
@@ -9,7 +10,7 @@ beforeAll(async () => {
 
   await request(app).post('/auth/register').send({ username: 'contracttester', password: 'testpass123', email: 'contracttester@example.com' })
   const res = await request(app).post('/auth/login').send({ username: 'contracttester', password: 'testpass123' })
-  token = res.body.token
+  token = tokenFrom(res)
 })
 
 afterAll(async () => {
diff --git a/backend/src/tests/integration/library-upload.test.js b/backend/src/tests/integration/library-upload.test.js
index 3c9786d..8062df5 100644
--- a/backend/src/tests/integration/library-upload.test.js
+++ b/backend/src/tests/integration/library-upload.test.js
@@ -3,6 +3,7 @@ import sharp from 'sharp'
 import fs from 'fs'
 import path from 'path'
 import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
 import UPLOAD_DIR from '../../config/uploadDir.js'
 
@@ -13,7 +14,7 @@ beforeAll(async () => {
 
   await request(app).post('/auth/register').send({ username: 'uploadtester', password: 'testpass123', email: 'uploadtester@example.com' })
   const res = await request(app).post('/auth/login').send({ username: 'uploadtester', password: 'testpass123' })
-  token = res.body.token
+  token = tokenFrom(res)
 })
 
 afterAll(async () => {
diff --git a/backend/src/tests/integration/library.test.js b/backend/src/tests/integration/library.test.js
index 615d2ec..061e202 100644
--- a/backend/src/tests/integration/library.test.js
+++ b/backend/src/tests/integration/library.test.js
@@ -1,5 +1,6 @@
 import request from 'supertest'
 import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
 
 let token
@@ -9,7 +10,7 @@ beforeAll(async () => {
 
   await request(app).post('/auth/register').send({ username: 'libuser', password: 'testpass123', email: 'libuser@example.com' })
   const res = await request(app).post('/auth/login').send({ username: 'libuser', password: 'testpass123' })
-  token = res.body.token
+  token = tokenFrom(res)
 })
 
 afterAll(async () => {
@@ -45,7 +46,7 @@ describe('Library Endpoints', () => {
 
   it('should fail without token', async () => {
     const res = await request(app).get('/library')
-    expect(res.statusCode).toEqual(403)
+    expect(res.statusCode).toEqual(401)
   })
 })
 
diff --git a/backend/src/tests/integration/publisher.test.js b/backend/src/tests/integration/publisher.test.js
index 5714521..4550169 100644
--- a/backend/src/tests/integration/publisher.test.js
+++ b/backend/src/tests/integration/publisher.test.js
@@ -1,5 +1,6 @@
 import request from 'supertest'
 import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
 
 let token
@@ -9,7 +10,7 @@ beforeAll(async () => {
 
   await request(app).post('/auth/register').send({ username: 'pubtester', password: 'testpass123', email: 'pubtester@example.com' })
   const loginRes = await request(app).post('/auth/login').send({ username: 'pubtester', password: 'testpass123' })
-  token = loginRes.body.token
+  token = tokenFrom(loginRes)
 
   await request(app).post('/library').set('Authorization', `Bearer ${token}`).field({
     title: 'It', authors: 'Stephen King', publisher: 'Viking Press', tags: 'horror', pubDate: '1986-09-15', isbn: '333'
@@ -59,7 +60,7 @@ describe('Publisher Endpoints', () => {
   it('should not leak publishers from other users sharing the same author', async () => {
     await request(app).post('/auth/register').send({ username: 'pubtester2', password: 'testpass123', email: 'pubtester2@example.com' })
     const loginRes2 = await request(app).post('/auth/login').send({ username: 'pubtester2', password: 'testpass123' })
-    const token2 = loginRes2.body.token
+    const token2 = tokenFrom(loginRes2)
 
     // mesmo autor ("Stephen King") do primeiro usuário, editora diferente
     await request(app).post('/library').set('Authorization', `Bearer ${token2}`).field({
diff --git a/backend/src/tests/unit/validateId.test.js b/backend/src/tests/unit/validateId.test.js
index a1190af..24ed537 100644
--- a/backend/src/tests/unit/validateId.test.js
+++ b/backend/src/tests/unit/validateId.test.js
@@ -20,7 +20,11 @@ describe('validateNumericId', () => {
     '9;DROP TABLE books',
     ' 1',
     '1 ',
-    '0x1A'
+    '0x1A',
+    '0',
+    '000',
+    '2147483648',
+    '99999999999999999999'
   ]
 
   it.each(invalidIds)('rejeita "%s" com 400 e não chama next()', (id) => {
@@ -38,7 +42,7 @@ describe('validateNumericId', () => {
     expect(next).not.toHaveBeenCalled()
   })
 
-  const validIds = ['1', '42', '007', '999999999']
+  const validIds = ['1', '42', '007', '999999999', '2147483647']
 
   it.each(validIds)('aceita "%s" e chama next() sem responder', (id) => {
     const middleware = validateNumericId()
diff --git a/backend/src/utils/passwordPolicy.js b/backend/src/utils/passwordPolicy.js
index 934ce7f..b944b24 100644
--- a/backend/src/utils/passwordPolicy.js
+++ b/backend/src/utils/passwordPolicy.js
@@ -1,10 +1,17 @@
 const MIN_LENGTH = 8
+// bcrypt só considera os primeiros 72 bytes; acima disso duas senhas
+// diferentes com o mesmo prefixo virariam o mesmo hash.
+const MAX_BYTES = 72
 
 function validatePassword(password) {
   if (typeof password !== 'string' || password.length < MIN_LENGTH) {
     return { valid: false, reason: `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.` }
   }
 
+  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
+    return { valid: false, reason: `A senha pode ter no máximo ${MAX_BYTES} bytes.` }
+  }
+
   if (!/[a-zA-Z]/.test(password)) {
     return { valid: false, reason: 'A senha precisa conter pelo menos uma letra.' }
   }
@@ -16,4 +23,4 @@ function validatePassword(password) {
   return { valid: true }
 }
 
-export { validatePassword, MIN_LENGTH }
\ No newline at end of file
+export { validatePassword, MIN_LENGTH, MAX_BYTES }
diff --git a/docker-compose.yml b/docker-compose.yml
index ed140ad..986c465 100644
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -1,34 +1,39 @@
-version: '3.8'
-
 services:
   frontend:
     build:
       context: ./frontend
-    container_name: librishelf-frontend  
+    container_name: librishelf-frontend
+    restart: unless-stopped
+    # Só acessível pela própria máquina; o nginx de reverse proxy alcança o
+    # container pelo nome na rede "proxy".
     ports:
-      - "8080:80"
+      - "127.0.0.1:8080:80"
     volumes:
-      - ./uploads:/usr/share/nginx/html/uploads
+      - ./uploads:/usr/share/nginx/html/uploads:ro
     depends_on:
       - backend
     networks:
-      - proxy  
+      - proxy
 
   backend:
     build:
       context: ./backend
     container_name: librishelf-backend
+    restart: unless-stopped
     ports:
-      - "3050:3050"
+      - "127.0.0.1:3050:3050"
     env_file:
       - ./backend/src/.env
     environment:
       - UPLOAD_DIR=/app/uploads
+      - TRUST_PROXY=1
     volumes:
+      # O container roda como o usuário "node" (uid 1000): a pasta do host
+      # precisa pertencer a ele → sudo chown -R 1000:1000 ./uploads
       - ./uploads:/app/uploads
     networks:
-      - proxy    
+      - proxy
 
 networks:
   proxy:
-    external: true
\ No newline at end of file
+    external: true
diff --git a/frontend/.dockerignore b/frontend/.dockerignore
new file mode 100644
index 0000000..5ef28db
--- /dev/null
+++ b/frontend/.dockerignore
@@ -0,0 +1,8 @@
+node_modules
+dist
+dist-ssr
+npm-debug.log*
+.git
+Dockerfile
+.dockerignore
+# .env do frontend NÃO é ignorado: o Vite precisa do VITE_API_URL no build.
diff --git a/frontend/nginx.conf b/frontend/nginx.conf
index b478390..15f2c79 100644
--- a/frontend/nginx.conf
+++ b/frontend/nginx.conf
@@ -1,15 +1,45 @@
 server {
   listen 80;
   server_name localhost;
+  server_tokens off;
 
+  root /usr/share/nginx/html;
+  index index.html;
+
+  gzip on;
+  gzip_comp_level 5;
+  gzip_min_length 1024;
+  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
+
+  add_header X-Content-Type-Options "nosniff" always;
+  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
+  add_header X-Frame-Options "DENY" always;
+
+  # Arquivos com hash no nome gerados pelo Vite: cache longo e imutável.
+  location /assets/ {
+    try_files $uri =404;
+    add_header Cache-Control "public, max-age=31536000, immutable";
+    add_header X-Content-Type-Options "nosniff" always;
+  }
+
+  # Capas: o nome não muda quando a capa é trocada, então cache curto.
+  location /uploads/ {
+    try_files $uri =404;
+    add_header Cache-Control "public, max-age=3600, stale-while-revalidate=86400";
+    add_header X-Content-Type-Options "nosniff" always;
+  }
+
+  # index.html sempre revalidado, para pegar o build novo após deploy.
   location / {
-    root   /usr/share/nginx/html;
-    index  index.html;
     try_files $uri $uri/ /index.html;
+    add_header Cache-Control "no-cache";
+    add_header X-Content-Type-Options "nosniff" always;
+    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
+    add_header X-Frame-Options "DENY" always;
   }
 
-  error_page   500 502 503 504  /50x.html;
+  error_page 500 502 503 504 /50x.html;
   location = /50x.html {
-    root   /usr/share/nginx/html;
+    root /usr/share/nginx/html;
   }
-}
\ No newline at end of file
+}
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index 1118d21..74c8285 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -87,14 +87,16 @@
               v-if="!isReadOnly"
               icon="pi pi-trash"
               class="p-button-rounded p-button-text p-button-danger"
-              :v-tooltip.bottom="$t('bookDialog.delete')"
+              v-tooltip.bottom="$t('bookDialog.delete')"
+              :aria-label="$t('bookDialog.delete')"
               @click="deleteBook"
             />
             <Button
               v-if="!isEditing && !isReadOnly"
               icon="pi pi-pencil"
               class="p-button-rounded p-button-text p-button-secondary"
-              :v-tooltip.bottom="$t('bookDialog.edit')"
+              v-tooltip.bottom="$t('bookDialog.edit')"
+              :aria-label="$t('bookDialog.edit')"
               @click="editMode"
             />
             <div
@@ -104,12 +106,14 @@
               <Button
                 icon="pi pi-times"
                 class="p-button-rounded p-button-text p-button-secondary"
+                :aria-label="$t('common.cancel')"
                 @click="cancelEdit"
                 :disabled="isSaving"
               />
               <Button
                 icon="pi pi-check"
                 class="p-button-rounded btn-action-primary"
+                :aria-label="$t('common.save')"
                 @click="confirmSave"
                 :loading="isSaving"
               />
@@ -226,7 +230,9 @@ const { t } = useI18n()
 const props = defineProps({
   modelValue: Boolean,
   bookId: Number,
-  isReadOnly: { type: Boolean, default: false }
+  isReadOnly: { type: Boolean, default: false },
+  // Dono da biblioteca pública; obrigatório quando isReadOnly for true.
+  ownerUsername: { type: String, default: '' }
 })
 
 const emits = defineEmits(['update:modelValue', 'refresh'])
@@ -417,7 +423,7 @@ async function loadBookData() {
     let response
 
     if (props.isReadOnly) {
-      response = await api.getPublicBook(props.bookId)
+      response = await api.getPublicBook(props.ownerUsername, props.bookId)
     } else {
       response = await api.getBookById(props.bookId)
     }
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 2c1f61b..907ce0f 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -35,6 +35,7 @@
           :class="{ 'active-filter': hasActiveFilters }"
           @click="visibleFilters = true"
           v-tooltip.bottom="t('library.filters_adv')"
+          :aria-label="t('library.filters_adv')"
         />
 
         <Button
diff --git a/frontend/src/components/NavigationMenu.vue b/frontend/src/components/NavigationMenu.vue
index 7d02827..2e5e299 100644
--- a/frontend/src/components/NavigationMenu.vue
+++ b/frontend/src/components/NavigationMenu.vue
@@ -5,6 +5,7 @@
       <Button
         icon="pi pi-bars"
         class="p-button-text menu-btn"
+        :aria-label="t('menu.openMenu')"
         @click="mobileMenuOpen = true"
       />
       <div class="mobile-logo-wrapper">
@@ -176,7 +177,8 @@ async function handleLogout() {
   } catch {
     // mesmo se a chamada falhar, seguimos limpando o estado local e redirecionando
   } finally {
-    localStorage.clear()
+    // Só a sessão: tema, cor de destaque e idioma são preferências do aparelho.
+    localStorage.removeItem('user')
     router.push('/login')
   }
 }
diff --git a/frontend/src/composables/useLibrary.js b/frontend/src/composables/useLibrary.js
index d3110d2..76e7f6c 100644
--- a/frontend/src/composables/useLibrary.js
+++ b/frontend/src/composables/useLibrary.js
@@ -1,17 +1,13 @@
 import { ref } from 'vue'
 import api from '../services/api.js'
 
-export function useLibrary() {
-  const books = ref([])
-  const loading = ref(false)
-  const loadingMore = ref(false)
-  const error = ref(null)
-
-  const totalRecords = ref(0)
+const SEARCH_DEBOUNCE_MS = 500
 
-  const filters = ref({
+function defaultFilters() {
+  return {
     search: '',
     readState: 'all',
+    readYear: 'all',
     author: [],
     publisher: [],
     tags: [],
@@ -19,68 +15,106 @@ export function useLibrary() {
     sortOrder: 'desc',
     page: 1,
     limit: 20
-  })
+  }
+}
+
+function buildParams(filters) {
+  const params = {
+    page: filters.page,
+    limit: filters.limit,
+    sort: filters.sortField,
+    order: filters.sortOrder
+  }
+
+  if (filters.search) params.search = filters.search
+
+  if (filters.readState !== 'all') {
+    params.readState = filters.readState === 'read' ? 'true' : 'false'
+  }
+
+  if (filters.author?.length > 0) {
+    params.author = filters.author.map(a => a.name || a).join(',')
+  }
+
+  if (filters.publisher?.length > 0) {
+    params.publisher = filters.publisher.map(p => p.name || p).join(',')
+  }
+
+  if (filters.tags?.length > 0) {
+    params.tags = filters.tags.map(t => t.name || t).join(',')
+  }
+
+  if (filters.readYear && filters.readYear !== 'all') {
+    params.readYear = filters.readYear
+  }
+
+  return params
+}
+
+export function useLibrary() {
+  const books = ref([])
+  const loading = ref(false)
+  const loadingMore = ref(false)
+  const error = ref(null)
+
+  const totalRecords = ref(0)
+
+  const filters = ref(defaultFilters())
+
+  // Uma busca nova (filtro, ordenação, refresh) cancela a anterior em vez de ser
+  // descartada: o resultado na tela sempre corresponde aos filtros atuais.
+  // `requestId` impede que a resposta de uma requisição antiga sobrescreva a nova.
+  let controller = null
+  let requestId = 0
+  let searchTimeout = null
 
   async function fetchBooks(isLoadMore = false) {
-    if (loading.value || loadingMore.value) return
-    if (isLoadMore && books.value.length >= totalRecords.value && totalRecords.value > 0) return
+    if (isLoadMore) {
+      if (loading.value || loadingMore.value) return
+      if (books.value.length >= totalRecords.value) return
+    }
+
+    if (controller) controller.abort()
+    controller = new AbortController()
+    const currentRequest = ++requestId
+
+    const nextPage = isLoadMore ? filters.value.page + 1 : 1
 
     if (isLoadMore) {
       loadingMore.value = true
-      filters.value.page++
     } else {
       loading.value = true
-      filters.value.page = 1
+      loadingMore.value = false
     }
 
-    try {
-      const params = {
-        page: filters.value.page,
-        limit: filters.value.limit,
-        sort: filters.value.sortField,
-        order: filters.value.sortOrder
-      }
-
-      if (filters.value.search) params.search = filters.value.search
-
-      if (filters.value.readState !== 'all') {
-        params.readState = filters.value.readState === 'read' ? 'true' : 'false'
-      }
-
-      if (filters.value.author && filters.value.author.length > 0) {
-        params.author = filters.value.author.map(a => a.name || a).join(',')
-      }
-
-      if (filters.value.publisher && filters.value.publisher.length > 0) {
-        params.publisher = filters.value.publisher.map(p => p.name || p).join(',')
-      }
-
-      if (filters.value.tags && filters.value.tags.length > 0) {
-        params.tags = filters.value.tags.map(t => t.name || t).join(',')
-      }
+    error.value = null
 
-      if (filters.value.readYear && filters.value.readYear !== 'all') {
-        params.readYear = filters.value.readYear
-      }
+    try {
+      const params = buildParams({ ...filters.value, page: nextPage })
+      const response = await api.getBooks(params, { signal: controller.signal })
 
-      const response = await api.getBooks(params)
+      if (currentRequest !== requestId) return
 
+      filters.value.page = nextPage
       totalRecords.value = response.total || 0
 
       if (isLoadMore) {
-        if (response.result && response.result.length > 0) {
+        if (response.result?.length > 0) {
           books.value.push(...response.result)
         }
       } else {
         books.value = response.result || []
       }
-
     } catch (err) {
+      if (err.name === 'AbortError' || currentRequest !== requestId) return
+
       console.error('Erro no composable useLibrary:', err)
       error.value = 'Erro ao carregar livros.'
     } finally {
-      loading.value = false
-      loadingMore.value = false
+      if (currentRequest === requestId) {
+        loading.value = false
+        loadingMore.value = false
+      }
     }
   }
 
@@ -88,18 +122,39 @@ export function useLibrary() {
     fetchBooks(true)
   }
 
-  let timeout = null
-  function setFilter(key, value) {
+  function cancelPendingSearch() {
+    if (searchTimeout) {
+      clearTimeout(searchTimeout)
+      searchTimeout = null
+    }
+  }
+
+  function setFilter(key, value, { fetch = true } = {}) {
     filters.value[key] = value
 
+    if (!fetch || key === 'page') return
+
     if (key === 'search') {
-      if (timeout) clearTimeout(timeout)
-      timeout = setTimeout(() => {
+      cancelPendingSearch()
+      searchTimeout = setTimeout(() => {
+        searchTimeout = null
         fetchBooks(false)
-      }, 500)
-    } else {
-      if (key !== 'page') fetchBooks(false)
+      }, SEARCH_DEBOUNCE_MS)
+      return
     }
+
+    cancelPendingSearch()
+    fetchBooks(false)
+  }
+
+  // Limpa todos os filtros de uma vez e faz uma única requisição.
+  function resetFilters() {
+    cancelPendingSearch()
+
+    const { sortField, sortOrder, limit } = filters.value
+    filters.value = { ...defaultFilters(), sortField, sortOrder, limit }
+
+    fetchBooks(false)
   }
 
   return {
@@ -111,6 +166,7 @@ export function useLibrary() {
     filters,
     fetchBooks: () => fetchBooks(false),
     loadMore,
-    setFilter
+    setFilter,
+    resetFilters
   }
-}
\ No newline at end of file
+}
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index fbf8de4..bd6ace5 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -11,7 +11,8 @@
     "guest": "Guest",
     "configurations": "Configurations",
     "language": "Language",
-    "theme": "Theme"
+    "theme": "Theme",
+    "openMenu": "Open menu"
   },
   "common": {
     "save": "Save",
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index e622866..7f6f263 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -33,7 +33,8 @@
     "guest": "Convidado",
     "configurations": "Configurações",
     "language": "Idioma",
-    "theme": "Tema"
+    "theme": "Tema",
+    "openMenu": "Abrir menu"
   },
   "common": {
     "save": "Salvar",
diff --git a/frontend/src/main.js b/frontend/src/main.js
index fd03dae..08dac16 100644
--- a/frontend/src/main.js
+++ b/frontend/src/main.js
@@ -6,6 +6,7 @@ import PrimeVue from 'primevue/config'
 
 import ToastService from 'primevue/toastservice'
 import ConfirmationService from 'primevue/confirmationservice'
+import Tooltip from 'primevue/tooltip'
 
 import 'primevue/resources/themes/aura-dark-teal/theme.css'
 import 'primeicons/primeicons.css'
@@ -19,5 +20,6 @@ app.use(PrimeVue, { ripple: true })
 
 app.use(ToastService)
 app.use(ConfirmationService)
+app.directive('tooltip', Tooltip)
 
 app.mount('#app')
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index bfba1ae..5feb632 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -17,11 +17,11 @@ export default {
     return client.post('/auth/register', userData)
   },
 
-  async getBooks(queryParams = {}) {
+  getBooks(queryParams = {}, config = {}) {
     const queryString = new URLSearchParams(queryParams).toString()
     const url = queryString ? `/library?${queryString}` : '/library'
 
-    return client.get(url)
+    return client.get(url, config)
   },
 
   getBookById(id) {
@@ -53,12 +53,12 @@ export default {
   },
 
   getAuthors(publisherFilter) {
-    const url = publisherFilter ? `/author?publishers=${publisherFilter}` : '/author'
+    const url = publisherFilter ? `/author?publishers=${encodeURIComponent(publisherFilter)}` : '/author'
     return client.get(url)
   },
 
   getPublishers(authorFilter) {
-    const url = authorFilter ? `/publisher?authors=${authorFilter}` : '/publisher'
+    const url = authorFilter ? `/publisher?authors=${encodeURIComponent(authorFilter)}` : '/publisher'
     return client.get(url)
   },
 
@@ -76,10 +76,10 @@ export default {
 
   getPublicLibrary(username, params = {}) {
     const queryString = new URLSearchParams(params).toString()
-    return client.get(`/library/public/u/${username}?${queryString}`)
+    return client.get(`/library/public/u/${encodeURIComponent(username)}?${queryString}`)
   },
 
-  getPublicBook(id) {
-    return client.get(`/library/public/book/${id}`)
+  getPublicBook(username, id) {
+    return client.get(`/library/public/u/${encodeURIComponent(username)}/book/${id}`)
   }
 }
\ No newline at end of file
diff --git a/frontend/src/services/fetchClient.js b/frontend/src/services/fetchClient.js
index d1954f7..2286408 100644
--- a/frontend/src/services/fetchClient.js
+++ b/frontend/src/services/fetchClient.js
@@ -1,4 +1,33 @@
 const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'
+const APP_BASE = import.meta.env.BASE_URL || '/'
+
+// Rotas de auth respondem 401 por credenciais erradas, não por sessão expirada.
+const AUTH_ENDPOINT_PREFIX = '/auth/'
+const PUBLIC_PATHS = ['login', 'register', 'u/']
+
+function isOnPublicPage() {
+  const path = window.location.pathname.slice(APP_BASE.length)
+  return PUBLIC_PATHS.some(publicPath => path.startsWith(publicPath))
+}
+
+function handleSessionExpired() {
+  localStorage.removeItem('user')
+
+  if (!isOnPublicPage()) {
+    window.location.assign(`${APP_BASE}login`)
+  }
+}
+
+async function parseError(response) {
+  const errorMessage = await response.text()
+
+  try {
+    const jsonError = JSON.parse(errorMessage)
+    return new Error(jsonError.error || jsonError.message || 'Erro desconhecido')
+  } catch {
+    return new Error(errorMessage || 'Erro na requisição')
+  }
+}
 
 async function client(endpoint, { body, ...customConfig } = {}) {
   const headers = {
@@ -24,31 +53,22 @@ async function client(endpoint, { body, ...customConfig } = {}) {
     }
   }
 
-  try {
-    const response = await fetch(`${BASE_URL}${endpoint}`, config)
+  const response = await fetch(`${BASE_URL}${endpoint}`, config)
 
-    if (response.status === 401) {
-      localStorage.removeItem('user')
-      return Promise.reject(new Error('Sessão expirada. Faça login novamente.'))
-    }
+  if (response.status === 401 && !endpoint.startsWith(AUTH_ENDPOINT_PREFIX)) {
+    handleSessionExpired()
+    throw new Error('Sessão expirada. Faça login novamente.')
+  }
 
-    if (response.ok) {
-      if (response.status === 204) {
-        return null
-      }
-      return await response.json()
-    } else {
-      const errorMessage = await response.text()
-      try {
-        const jsonError = JSON.parse(errorMessage)
-        return Promise.reject(new Error(jsonError.message || jsonError.error || 'Erro desconhecido'))
-      } catch {
-        return Promise.reject(new Error(errorMessage || 'Erro na requisição'))
-      }
-    }
-  } catch (error) {
-    return Promise.reject(error)
+  if (!response.ok) {
+    throw await parseError(response)
+  }
+
+  if (response.status === 204) {
+    return null
   }
+
+  return await response.json()
 }
 
 export default {
@@ -57,4 +77,4 @@ export default {
   put: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PUT' }),
   patch: (endpoint, body, config) => client(endpoint, { ...config, body, method: 'PATCH' }),
   delete: (endpoint, config) => client(endpoint, { ...config, method: 'DELETE' }),
-}
\ No newline at end of file
+}
diff --git a/frontend/src/views/Library.vue b/frontend/src/views/Library.vue
index 63f0f24..fb14063 100644
--- a/frontend/src/views/Library.vue
+++ b/frontend/src/views/Library.vue
@@ -109,9 +109,11 @@ const {
   loadingMore,
   fetchBooks,
   loadMore,
-  setFilter
+  setFilter,
+  resetFilters
 } = useLibrary()
 
+const scrollContainer = ref(null)
 const sentinel = ref(null)
 let observer = null
 
@@ -121,18 +123,11 @@ function refreshData() {
 
 function handleFilterChange({ key, value }) {
   setFilter(key, value)
-  const container = document.querySelector('.library-container')
-  if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
+  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
 }
 
 function clearFilters() {
-  setFilter('search', '')
-  setFilter('readState', 'all')
-  setFilter('author', [])
-  setFilter('publisher', [])
-  setFilter('tags', [])
-  setFilter('readYear', 'all')
-  refreshData()
+  resetFilters()
 }
 
 function setupIntersectionObserver() {
@@ -143,7 +138,7 @@ function setupIntersectionObserver() {
       loadMore()
     }
   }, {
-    root: document.querySelector('.library-container'),
+    root: scrollContainer.value,
     rootMargin: '400px',
     threshold: 0.1
   })
@@ -160,16 +155,17 @@ watchEffect(() => {
 })
 
 onMounted(() => {
+  // Aplica os filtros vindos da URL sem disparar uma busca para cada um.
   if (route.query.author) {
-    setFilter('author', [{ name: route.query.author }])
+    setFilter('author', [{ name: route.query.author }], { fetch: false })
   }
 
   if (route.query.publisher) {
-    setFilter('publisher', [{ name: route.query.publisher }])
+    setFilter('publisher', [{ name: route.query.publisher }], { fetch: false })
   }
 
   if (route.query.tags) {
-    setFilter('tags', [{ name: route.query.tags }])
+    setFilter('tags', [{ name: route.query.tags }], { fetch: false })
   }
 
   fetchBooks()
PATCH_EOF

# -----------------------------------------------------------------------------
step "1/5 Aplicando o patch de código"
# -----------------------------------------------------------------------------
if git apply --check --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
  git apply --whitespace=nowarn "$PATCH_FILE"
  ok "Patch aplicado ($(grep -c '^diff --git' "$PATCH_FILE") arquivos)."
elif git apply --reverse --check --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
  ok "Patch já estava aplicado — seguindo para os próximos passos."
else
  printf '%s  ✘ O patch não encaixa no estado atual dos arquivos. Nada foi alterado.%s\n' "$R" "$N" >&2
  echo "    Arquivos em conflito:" >&2
  git apply --check --whitespace=nowarn "$PATCH_FILE" 2>&1 | sed 's/^/      /' >&2 || true
  echo "    Dica: rode 'git stash' (ou descarte as mudanças locais) e execute de novo." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
step "2/5 Parando de versionar uploads/ (os arquivos ficam no disco)"
# -----------------------------------------------------------------------------
TRACKED_UPLOADS="$(git ls-files -- uploads backend/uploads | wc -l | tr -d ' ')"
if [ "$TRACKED_UPLOADS" -gt 0 ]; then
  git ls-files -z -- uploads backend/uploads | xargs -0 git rm --cached --quiet --
  ok "$TRACKED_UPLOADS arquivo(s) removido(s) do índice (deleção fica staged, nada commitado)."
else
  ok "Nenhum upload versionado."
fi

# -----------------------------------------------------------------------------
step "3/5 Logo local (frontend/public/bookshelf.png)"
# -----------------------------------------------------------------------------
LOGO_FILES=(frontend/src/components/NavigationMenu.vue frontend/src/views/Home.vue)

if [ ! -s "$LOGO_PATH" ]; then
  mkdir -p "$(dirname "$LOGO_PATH")"
  if { command -v curl >/dev/null && curl -fsSL --max-time 30 -o "$LOGO_PATH" "$LOGO_URL"; } \
     || { command -v wget >/dev/null && wget -q -T 30 -O "$LOGO_PATH" "$LOGO_URL"; }; then
    if ! head -c 8 "$LOGO_PATH" | od -An -tx1 | tr -d ' \n' | grep -q '^89504e470d0a1a0a'; then
      rm -f "$LOGO_PATH"
      warn "O arquivo baixado não é PNG."
    fi
  else
    rm -f "$LOGO_PATH"
  fi
fi

if [ -s "$LOGO_PATH" ]; then
  # Só troca a URL depois que o arquivo existe; sem ele o build do Vite quebra.
  sed -i "s#src=\"$LOGO_URL\"#src=\"/bookshelf.png\"#" "${LOGO_FILES[@]}"
  ok "Logo local em $LOGO_PATH ($(wc -c < "$LOGO_PATH" | tr -d ' ') bytes), referenciado como /bookshelf.png."
else
  warn "Não consegui baixar o logo; a URL externa foi mantida. Para trocar depois: salve um PNG"
  warn "em $LOGO_PATH e rode o script de novo."
fi

# -----------------------------------------------------------------------------
step "4/5 Atualizando dependências vulneráveis"
# -----------------------------------------------------------------------------
(
  cd backend
  # Pode sair com 1 por causa de alertas só de dev (cadeia do jest), que não têm
  # correção sem rebaixar o jest; o que importa é o resultado com --omit=dev abaixo.
  npm audit fix --no-fund --loglevel=error >/dev/null 2>&1 || true
)
BACK_AUDIT="$(cd backend && npm audit --omit=dev 2>/dev/null | tail -1 || true)"
ok "backend (produção): $BACK_AUDIT"

(
  cd frontend
  npm install --save-dev vite@^8 @vitejs/plugin-vue@^6 --no-fund --no-audit --loglevel=error >/dev/null
  npm audit fix --no-fund --loglevel=error >/dev/null || true
)
FRONT_AUDIT="$(cd frontend && npm audit 2>/dev/null | tail -1 || true)"
ok "frontend: Vite $(cd frontend && node -p 'require("vite/package.json").version') — $FRONT_AUDIT"

# -----------------------------------------------------------------------------
step "5/5 Verificando"
# -----------------------------------------------------------------------------
(
  cd backend
  # Só testes que não tocam no banco; os de integração rodam com `npm test` no seu banco de teste.
  NODE_ENV=test SECRET_KEY="verificacao-local-$(printf 'x%.0s' {1..32})" \
    node --experimental-vm-modules node_modules/jest/bin/jest.js \
    src/tests/unit src/tests/integration/cors.test.js --silent 2>&1 | grep -E '^(Tests|Test Suites):' | sed 's/^/  /'
  exit "${PIPESTATUS[0]}"
) && ok "Testes unitários + CORS passando" || fail "Testes falharam (rode-os em backend/ para ver os detalhes)."

if (cd frontend && npx --no-install vite build >/tmp/librishelf-build.log 2>&1); then
  ok "Build do frontend OK"
else
  tail -20 /tmp/librishelf-build.log >&2
  fail "Build do frontend falhou (log completo em /tmp/librishelf-build.log)."
fi

# -----------------------------------------------------------------------------
step "Pronto — nada foi commitado"
# -----------------------------------------------------------------------------
git status --short | { grep -v '^D  uploads/\|^D  backend/uploads/' || true; } | sed 's/^/  /'
echo "  (+ $TRACKED_UPLOADS deleção(ões) staged de uploads/)"

cat <<EOF

${B}Falta fazer à mão${N}
  1. Rodar os testes de integração no banco de teste:   cd backend && npm test
  2. No .env de produção (backend/src/.env), conferir as variáveis novas do .env.example:
     TRUST_PROXY (o docker-compose já define 1), COOKIE_SECURE=true, ALLOWED_ORIGINS, DB_SSL
  3. Na VPS, antes de subir: o backend agora roda como usuário 'node' (uid 1000):
       sudo chown -R 1000:1000 ./uploads
  4. As portas 3050 e 8080 agora só escutam em 127.0.0.1. Se o nginx de reverse proxy
     aponta para os containers pelo nome na rede 'proxy', nada muda.
  5. Rebuild:  docker compose up -d --build

${B}Sugestão de commits${N}
  fix(security): escopar GET /library/:id e livro público ao dono (IDOR)
  fix(gitignore): corrigir linha corrompida e parar de versionar uploads/
  fix(security): trust proxy configurável para o rate limit funcionar atrás do nginx
  fix(auth): 401 para token ausente/expirado, login com tempo constante e validação de entrada
  fix(api): 400 em vez de 500 para readYear, datas e ids inválidos; errorHandler sem vazar mensagem
  perf(dashboard): consolidar as 5 queries em um CTE
  feat(db): suporte opcional a SSL no Postgres
  chore(docker): .dockerignore, npm ci sem devDeps, usuário não-root, portas só em localhost
  chore(nginx): cache de assets/uploads, gzip e headers de segurança
  fix(frontend): cancelar busca anterior no useLibrary em vez de descartar a nova
  fix(frontend): 401 de login não vira "sessão expirada"; logout preserva tema/idioma
  fix(a11y): aria-label nos botões só de ícone e registro do directive de tooltip
  chore(frontend): logo local e refs no lugar de querySelector
  test: extrair token do cookie nos testes de integração
  chore(deps): npm audit fix e Vite 5 → 8
EOF