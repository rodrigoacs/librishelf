#!/usr/bin/env bash
# Pacote 9 — códigos de erro, nomes reservados, bloquear leitor, noindex
#
# Rode na raiz do repositório Librishelf, na branch fix/audit-2026-08, com
# o pacote anterior já commitado:   bash pacote-9-base-e-seguranca.sh
#
# O que faz: aplica o patch (git apply; se o editor tiver reformatado algum
# arquivo, tenta git apply --3way), roda os testes unitários do backend e o
# build do frontend, e mostra a mensagem de commit sugerida.
# Não commita nem faz push.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "✗ Rode dentro do repositório do Librishelf."; exit 1; }
cd "$ROOT"
[ -d frontend ] && [ -d backend ] || { echo "✗ Não parece ser o repositório do Librishelf."; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "fix/audit-2026-08" ] || echo "⚠ Branch atual: $BRANCH (esperado fix/audit-2026-08). Continuando."

FILES=(
  backend/db/migrations/007_blocks.sql
  backend/db/schema.sql
  backend/src/database/queries.js
  backend/src/middlewares/errorHandler.js
  backend/src/middlewares/rateLimiter.js
  backend/src/middlewares/validateId.js
  backend/src/repositories/socialRepository.js
  backend/src/routes/isbn.js
  backend/src/routes/library.js
  backend/src/routes/social.js
  backend/src/services/authService.js
  backend/src/services/communityService.js
  backend/src/services/dashboardService.js
  backend/src/services/dataService.js
  backend/src/services/libraryService.js
  backend/src/services/namesService.js
  backend/src/services/openLibraryService.js
  backend/src/services/socialService.js
  backend/src/tests/integration/blocks.test.js
  backend/src/tests/unit/reservedNames.test.js
  backend/src/utils/httpError.js
  backend/src/utils/nameList.js
  backend/src/utils/passwordPolicy.js
  backend/src/utils/reservedNames.js
  backend/src/utils/sendError.js
  frontend/nginx.conf
  frontend/public/robots.txt
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/router/index.js
  frontend/src/services/api.js
  frontend/src/services/fetchClient.js
  frontend/src/services/pageTitle.js
  frontend/src/utils/bookFormErrors.js
  frontend/src/views/PublicLibrary.vue
  frontend/src/views/Register.vue
  frontend/src/views/Settings.vue
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
diff --git a/backend/db/migrations/007_blocks.sql b/backend/db/migrations/007_blocks.sql
new file mode 100644
index 0000000000000000000000000000000000000000..0c1d108f7e417dd26d16e2c4df1e7c0a9ad8e5b5
--- /dev/null
+++ b/backend/db/migrations/007_blocks.sql
@@ -0,0 +1,16 @@
+-- 007 — bloquear leitores
+-- Idempotente: pode rodar mais de uma vez.
+--
+-- Quem bloqueia some para o bloqueado (e vice-versa) na comunidade: "quem tem
+-- este livro", busca de leitores, recomendações e pedidos para seguir. Ao
+-- bloquear, os vínculos de seguir entre os dois são apagados.
+CREATE TABLE IF NOT EXISTS librishelf.blocks (
+  blocker_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  blocked_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  created_at timestamp without time zone NOT NULL DEFAULT now(),
+  PRIMARY KEY (blocker_id, blocked_id),
+  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
+);
+
+-- A checagem é nos dois sentidos: o índice cobre a busca por quem foi bloqueado.
+CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON librishelf.blocks (blocked_id, blocker_id);
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index 03f297b86bfaa0b6beca687d5b00de1738dedc65..191282ac8b050289ac505a1878d42a4b99509b4e 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -1247,3 +1247,25 @@ CREATE INDEX IF NOT EXISTS idx_books_user_series
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('006_series_and_notes')
 ON CONFLICT (version) DO NOTHING;
+
+-- ===========================================================================
+-- 007 — bloquear leitores
+-- ===========================================================================
+--
+-- Quem bloqueia some para o bloqueado (e vice-versa) na comunidade: "quem tem
+-- este livro", busca de leitores, recomendações e pedidos para seguir. Ao
+-- bloquear, os vínculos de seguir entre os dois são apagados.
+CREATE TABLE IF NOT EXISTS librishelf.blocks (
+  blocker_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  blocked_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  created_at timestamp without time zone NOT NULL DEFAULT now(),
+  PRIMARY KEY (blocker_id, blocked_id),
+  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
+);
+
+-- A checagem é nos dois sentidos: o índice cobre a busca por quem foi bloqueado.
+CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON librishelf.blocks (blocked_id, blocker_id);
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('007_blocks')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index 0763e8cb827dd77bffd2fca782ad08635bee1a6d..a07ea4999f2acfcbf07b807240016c7cb715def1 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -406,6 +406,12 @@ const SAME_BOOK = (a, b) => `(
   OR (${a}.isbn13 IS NOT NULL AND ${b}.isbn13 = ${a}.isbn13)
 )`
 
+// Nenhum dos dois bloqueou o outro (tabela librishelf.blocks, migration 007).
+const NOT_BLOCKED = (a, b) => `NOT EXISTS (
+  SELECT 1 FROM librishelf.blocks bl
+  WHERE (bl.blocker_id = ${a} AND bl.blocked_id = ${b}) OR (bl.blocker_id = ${b} AND bl.blocked_id = ${a})
+)`
+
 const AUTHORS_OF = (bookExpr) => `(
   SELECT string_agg(a.name, ', ' ORDER BY bal.position, a.id)
   FROM librishelf.books_authors_link bal
@@ -426,7 +432,7 @@ export const COMMUNITY_QUERIES = {
     FROM me
     JOIN librishelf.books b ON ${SAME_BOOK('me', 'b')}
     JOIN librishelf.users u ON u.id = b.user_id
-    WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community
+    WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community AND ${NOT_BLOCKED('u.id', '$2')}
     ORDER BY u.id, b.rating DESC NULLS LAST
   `,
 
@@ -441,7 +447,7 @@ export const COMMUNITY_QUERIES = {
       FROM me
       JOIN librishelf.books b ON ${SAME_BOOK('me', 'b')}
       JOIN librishelf.users u ON u.id = b.user_id
-      WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community
+      WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community AND ${NOT_BLOCKED('u.id', '$2')}
     ),
     candidates AS (
       SELECT b.id, b.title, b.user_id, COALESCE(b.ol_work_key, 'isbn:' || b.isbn13) AS book_key
@@ -484,6 +490,7 @@ export const COMMUNITY_QUERIES = {
           WHERE b.user_id = u.id AND EXISTS (SELECT 1 FROM mine m WHERE ${SAME_BOOK('m', 'b')})) AS common_books
       FROM librishelf.users u
       WHERE u.id <> $1 AND u.is_public AND u.show_in_community AND u.is_active IS NOT FALSE
+        AND ${NOT_BLOCKED('u.id', '$1')}
         AND ($2 = '' OR u.name ILIKE $3)
     )
     SELECT r.name AS username, r.show_activity AS accepts_followers, r.total_books, r.read_books,
@@ -505,6 +512,7 @@ export const COMMUNITY_QUERIES = {
     community AS (
       SELECT id FROM librishelf.users
       WHERE is_public AND show_in_community AND id <> $1 AND is_active IS NOT FALSE
+        AND ${NOT_BLOCKED('id', '$1')}
     ),
     peers AS (
       SELECT b.user_id, count(*)::int AS shared
@@ -553,7 +561,7 @@ export const COMMUNITY_QUERIES = {
     FROM librishelf.books b
     JOIN librishelf.users u ON u.id = b.user_id
     LEFT JOIN librishelf.publishers p ON p.id = b.publisher_id
-    WHERE b.id = $1 AND b.user_id <> $2 AND u.is_public AND u.show_in_community
+    WHERE b.id = $1 AND b.user_id <> $2 AND u.is_public AND u.show_in_community AND ${NOT_BLOCKED('u.id', '$2')}
   `,
 
   // Livros de $2 que $1 também tem.
@@ -688,6 +696,27 @@ export const SOCIAL_QUERIES = {
     WHERE follower_id = $1 AND followee_id = $2 AND status = 'pending'
     RETURNING status
   `,
+  // Bloqueios (migration 007)
+  IS_BLOCKED: `
+    SELECT
+      EXISTS (SELECT 1 FROM librishelf.blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
+      EXISTS (SELECT 1 FROM librishelf.blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_me
+  `,
+  BLOCK: `
+    INSERT INTO librishelf.blocks (blocker_id, blocked_id) VALUES ($1, $2)
+    ON CONFLICT (blocker_id, blocked_id) DO NOTHING
+  `,
+  DELETE_FOLLOWS_BETWEEN: `
+    DELETE FROM librishelf.follows
+    WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)
+  `,
+  UNBLOCK: 'DELETE FROM librishelf.blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING blocked_id',
+  BLOCKED_LIST: `
+    SELECT u.name AS username, bl.created_at
+    FROM librishelf.blocks bl JOIN librishelf.users u ON u.id = bl.blocked_id
+    WHERE bl.blocker_id = $1
+    ORDER BY bl.created_at DESC
+  `,
   PENDING_COUNT: `SELECT count(*)::int AS count FROM librishelf.follows WHERE followee_id = $1 AND status = 'pending'`,
   CONNECTIONS: `
     SELECT 'following' AS kind, u.name AS username, f.status, f.created_at, u.is_public
diff --git a/backend/src/middlewares/errorHandler.js b/backend/src/middlewares/errorHandler.js
index ad212402aee695a973087b53bae64f1d51903b63..6988a811b05728704c1124cd901af5409d6ebd01 100644
--- a/backend/src/middlewares/errorHandler.js
+++ b/backend/src/middlewares/errorHandler.js
@@ -1,5 +1,6 @@
 import logger from '../utils/logger.js'
 import STATUS from '../utils/statusCodes.js'
+import { errorBody } from '../utils/httpError.js'
 
 const GENERIC_MESSAGE = 'Erro interno do servidor.'
 
@@ -24,6 +25,8 @@ export default (err, req, res, next) => {
 
   res.status(statusCode).json({
     status: 'error',
-    error: isControlled ? err.message : GENERIC_MESSAGE
+    ...(isControlled
+      ? errorBody(err.message, err.errorCode, err.params)
+      : errorBody(GENERIC_MESSAGE))
   })
 }
diff --git a/backend/src/middlewares/rateLimiter.js b/backend/src/middlewares/rateLimiter.js
index e31368f8759a31f880be97e093ae240c79da46fe..29bc383ba58b424153d9ebee652bc612d5e64999 100644
--- a/backend/src/middlewares/rateLimiter.js
+++ b/backend/src/middlewares/rateLimiter.js
@@ -1,7 +1,8 @@
 import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
 import STATUS from '../utils/statusCodes.js'
+import { errorBody } from '../utils/httpError.js'
 
-function buildLimiter({ windowMs, max, message, perUser = false }) {
+function buildLimiter({ windowMs, max, message, code, perUser = false }) {
   return rateLimit({
     windowMs,
     max,
@@ -14,7 +15,7 @@ function buildLimiter({ windowMs, max, message, perUser = false }) {
       ? (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip))
       : (req) => ipKeyGenerator(req.ip),
     handler: (req, res) => {
-      res.status(STATUS.TOO_MANY_REQUESTS).json({ error: message })
+      res.status(STATUS.TOO_MANY_REQUESTS).json(errorBody(message, code))
     }
   })
 }
@@ -22,13 +23,15 @@ function buildLimiter({ windowMs, max, message, perUser = false }) {
 const loginLimiter = buildLimiter({
   windowMs: 15 * 60 * 1000,
   max: 10,
-  message: 'Muitas tentativas de login. Tente novamente em alguns minutos.'
+  message: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
+  code: 'RATE_LIMIT_LOGIN'
 })
 
 const registerLimiter = buildLimiter({
   windowMs: 60 * 60 * 1000,
   max: 20,
-  message: 'Muitas tentativas de cadastro. Tente novamente mais tarde.'
+  message: 'Muitas tentativas de cadastro. Tente novamente mais tarde.',
+  code: 'RATE_LIMIT_REGISTER'
 })
 
 // Troca de senha e exclusão de conta pedem a senha atual: mesmo cuidado do login.
@@ -36,7 +39,8 @@ const sensitiveLimiter = buildLimiter({
   windowMs: 15 * 60 * 1000,
   max: 10,
   perUser: true,
-  message: 'Muitas tentativas. Tente novamente em alguns minutos.'
+  message: 'Muitas tentativas. Tente novamente em alguns minutos.',
+  code: 'RATE_LIMIT_ATTEMPTS'
 })
 
 // Upload converte para AVIF (pesado em CPU).
@@ -44,14 +48,16 @@ const uploadLimiter = buildLimiter({
   windowMs: 15 * 60 * 1000,
   max: 60,
   perUser: true,
-  message: 'Muitos envios em pouco tempo. Tente novamente em alguns minutos.'
+  message: 'Muitos envios em pouco tempo. Tente novamente em alguns minutos.',
+  code: 'RATE_LIMIT_UPLOAD'
 })
 
 // Rotas públicas (biblioteca compartilhada, mosaico): sem login, por IP.
 const publicLimiter = buildLimiter({
   windowMs: 60 * 1000,
   max: 120,
-  message: 'Muitas requisições. Tente novamente em instantes.'
+  message: 'Muitas requisições. Tente novamente em instantes.',
+  code: 'RATE_LIMIT'
 })
 
 // Busca por ISBN: cada consulta vira chamadas ao Open Library.
@@ -59,7 +65,8 @@ const isbnLimiter = buildLimiter({
   windowMs: 60 * 1000,
   max: 30,
   perUser: true,
-  message: 'Muitas buscas por ISBN em pouco tempo. Aguarde um minuto.'
+  message: 'Muitas buscas por ISBN em pouco tempo. Aguarde um minuto.',
+  code: 'RATE_LIMIT_ISBN'
 })
 
 // Seguir/aceitar/remover: evita spam de pedidos.
@@ -67,21 +74,24 @@ const socialLimiter = buildLimiter({
   windowMs: 15 * 60 * 1000,
   max: 100,
   perUser: true,
-  message: 'Muitas ações em pouco tempo. Tente novamente em alguns minutos.'
+  message: 'Muitas ações em pouco tempo. Tente novamente em alguns minutos.',
+  code: 'RATE_LIMIT_ACTIONS'
 })
 
 // E-mails (esqueci minha senha, reenviar confirmação): poucos por hora.
 const mailLimiter = buildLimiter({
   windowMs: 60 * 60 * 1000,
   max: 5,
-  message: 'Muitos pedidos de e-mail. Tente novamente mais tarde.'
+  message: 'Muitos pedidos de e-mail. Tente novamente mais tarde.',
+  code: 'RATE_LIMIT_EMAIL'
 })
 
 // Links recebidos por e-mail (redefinir senha, confirmar e-mail): sem chute em massa.
 const tokenLimiter = buildLimiter({
   windowMs: 15 * 60 * 1000,
   max: 20,
-  message: 'Muitas tentativas. Tente novamente em alguns minutos.'
+  message: 'Muitas tentativas. Tente novamente em alguns minutos.',
+  code: 'RATE_LIMIT_ATTEMPTS'
 })
 
 export { mailLimiter, tokenLimiter, loginLimiter, registerLimiter, sensitiveLimiter, uploadLimiter, publicLimiter, isbnLimiter, socialLimiter }
diff --git a/backend/src/middlewares/validateId.js b/backend/src/middlewares/validateId.js
index 886ca1cbcb5e4c865dba9ec5dd46efbd0bbc0ec1..e4e0096fecc7d3e2acbd1a8625febee0f4756285 100644
--- a/backend/src/middlewares/validateId.js
+++ b/backend/src/middlewares/validateId.js
@@ -1,4 +1,5 @@
 import STATUS from '../utils/statusCodes.js'
+import { errorBody } from '../utils/httpError.js'
 
 const NUMERIC_ID_PATTERN = /^\d+$/
 // Teto do tipo `integer` do Postgres. Acima disso a query estoura com 500.
@@ -16,9 +17,11 @@ function validateNumericId(paramName = 'id') {
     const value = req.params[paramName]
 
     if (!isValidId(value)) {
-      return res.status(STATUS.BAD_REQUEST).json({
-        error: `Parâmetro '${paramName}' inválido: deve ser um número inteiro positivo.`
-      })
+      return res.status(STATUS.BAD_REQUEST).json(errorBody(
+        `Parâmetro '${paramName}' inválido: deve ser um número inteiro positivo.`,
+        'PARAM_INVALID',
+        { param: paramName }
+      ))
     }
 
     next()
diff --git a/backend/src/repositories/socialRepository.js b/backend/src/repositories/socialRepository.js
index 8e062f4a279abfb3c93e78f968ec0e7b8ae20a75..5424575fe995ec61cff1482c8dca4eea63bba10e 100644
--- a/backend/src/repositories/socialRepository.js
+++ b/backend/src/repositories/socialRepository.js
@@ -36,3 +36,35 @@ export async function feed(userId, limit, offset) {
   const { rows } = await db.query(q.FEED, [userId, limit, offset])
   return rows
 }
+
+/** { blockedByMe, blockedMe } entre $viewer e $other. */
+export async function blockState(viewerId, otherId) {
+  const { rows } = await db.query(q.IS_BLOCKED, [viewerId, otherId])
+  return { blockedByMe: rows[0].blocked_by_me, blockedMe: rows[0].blocked_me }
+}
+
+/** Bloqueia e apaga os vínculos de seguir entre os dois, numa transação. */
+export async function block(blockerId, blockedId) {
+  const client = await db.connect()
+  try {
+    await client.query('BEGIN')
+    await client.query(q.BLOCK, [blockerId, blockedId])
+    await client.query(q.DELETE_FOLLOWS_BETWEEN, [blockerId, blockedId])
+    await client.query('COMMIT')
+  } catch (err) {
+    await client.query('ROLLBACK')
+    throw err
+  } finally {
+    client.release()
+  }
+}
+
+export async function unblock(blockerId, blockedId) {
+  const { rows } = await db.query(q.UNBLOCK, [blockerId, blockedId])
+  return rows.length > 0
+}
+
+export async function blockedList(userId) {
+  const { rows } = await db.query(q.BLOCKED_LIST, [userId])
+  return rows
+}
diff --git a/backend/src/routes/isbn.js b/backend/src/routes/isbn.js
index b116a22e2abd70ab9cf6f557ff9c56e846b4ad61..8a2faddc6d7174aae5ed12ee6e5f3b007c38aa8b 100644
--- a/backend/src/routes/isbn.js
+++ b/backend/src/routes/isbn.js
@@ -3,6 +3,7 @@ import { authenticateToken } from '../middlewares/auth.js'
 import { isbnLimiter } from '../middlewares/rateLimiter.js'
 import * as openLibrary from '../services/openLibraryService.js'
 import STATUS from '../utils/statusCodes.js'
+import { errorBody } from '../utils/httpError.js'
 import sendError from '../utils/sendError.js'
 
 const router = express.Router()
@@ -13,7 +14,7 @@ router.use(authenticateToken, isbnLimiter)
 router.get('/cover/:coverId', async (req, res) => {
   try {
     const image = await openLibrary.fetchCover(req.params.coverId)
-    if (!image) return res.status(STATUS.NOT_FOUND).json({ error: 'Capa não encontrada.' })
+    if (!image) return res.status(STATUS.NOT_FOUND).json(errorBody('Capa não encontrada.', 'COVER_NOT_FOUND'))
 
     res.set('Cache-Control', 'private, max-age=3600')
     res.type('image/jpeg').send(image)
@@ -25,7 +26,7 @@ router.get('/cover/:coverId', async (req, res) => {
 router.get('/:isbn', async (req, res) => {
   try {
     const book = await openLibrary.lookupIsbn(req.params.isbn)
-    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Nenhum livro encontrado para este ISBN.' })
+    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Nenhum livro encontrado para este ISBN.', 'ISBN_NOT_FOUND'))
 
     res.status(STATUS.OK).json(book)
   } catch (error) {
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 4d8feb78174c24b1695968a38984d1d441217c71..d3f53f41730c7e199ef1de3c357b827bbd322371 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -9,6 +9,7 @@ import * as communityService from '../services/communityService.js'
 import { fetchCover } from '../services/openLibraryService.js'
 import { validateNumericId } from '../middlewares/validateId.js'
 import STATUS from '../utils/statusCodes.js'
+import { errorBody } from '../utils/httpError.js'
 import UPLOAD_DIR from '../config/uploadDir.js'
 import { saveBookCover, isValidImage } from '../utils/imageProcessor.js'
 import { uploadLimiter, publicLimiter } from '../middlewares/rateLimiter.js'
@@ -45,10 +46,13 @@ function handleUpload(uploadMiddleware) {
   return (req, res, next) => {
     uploadMiddleware(req, res, (err) => {
       if (err) {
-        const message = err.code === 'LIMIT_FILE_SIZE'
-          ? (req.path.endsWith('/import') ? `O arquivo pode ter no máximo ${MAX_CSV_MB} MB.` : `A imagem pode ter no máximo ${MAX_UPLOAD_MB} MB.`)
-          : err.message
-        return res.status(STATUS.BAD_REQUEST).json({ error: message })
+        const isImport = req.path.endsWith('/import')
+        if (err.code === 'LIMIT_FILE_SIZE') {
+          return res.status(STATUS.BAD_REQUEST).json(isImport
+            ? errorBody(`O arquivo pode ter no máximo ${MAX_CSV_MB} MB.`, 'FILE_TOO_LARGE', { max: MAX_CSV_MB })
+            : errorBody(`A imagem pode ter no máximo ${MAX_UPLOAD_MB} MB.`, 'IMAGE_TOO_LARGE', { max: MAX_UPLOAD_MB }))
+        }
+        return res.status(STATUS.BAD_REQUEST).json(errorBody(err.message, isImport ? 'CSV_REQUIRED' : 'IMAGE_ONLY'))
       }
       next()
     })
@@ -107,7 +111,7 @@ router.get('/public/u/:username/book/:id', publicLimiter, validateNumericId(), a
     const { username, id } = req.params
     const book = await libraryService.getPublicBook(username, id)
 
-    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Livro não encontrado.' })
+    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Livro não encontrado.', 'BOOK_NOT_FOUND'))
 
     res.status(STATUS.OK).json(book)
   } catch (error) {
@@ -160,7 +164,7 @@ router.get('/:id', validateNumericId(), async (req, res) => {
     const { id } = req.params
     // Escopado ao usuário logado: livro de outra pessoa responde 404, igual a inexistente.
     const book = await libraryService.getBookById(id, req.user.id)
-    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Book not found.' })
+    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Livro não encontrado.', 'BOOK_NOT_FOUND'))
     res.status(STATUS.OK).json(book)
   } catch (error) {
     sendError(res, error, 'Erro ao buscar livro')
@@ -179,7 +183,7 @@ router.post('/', uploadLimiter, handleUpload(upload.single('coverImage')), async
     // 400 e nada fica gravado (antes o livro ficava órfão e o usuário duplicava
     // ao tentar de novo).
     if (req.file && !(await isValidImage(req.file.buffer))) {
-      return res.status(STATUS.BAD_REQUEST).json({ error: 'Arquivo enviado não é uma imagem válida.' })
+      return res.status(STATUS.BAD_REQUEST).json(errorBody('Arquivo enviado não é uma imagem válida.', 'IMAGE_INVALID'))
     }
 
     const newBookId = await libraryService.addNewBook(bookData)
@@ -240,7 +244,7 @@ router.post('/:id/cover', validateNumericId(), uploadLimiter, handleUpload(uploa
     const userId = req.user.id
 
     if (!req.file) {
-      return res.status(STATUS.BAD_REQUEST).json({ error: 'Nenhuma imagem enviada.' })
+      return res.status(STATUS.BAD_REQUEST).json(errorBody('Nenhuma imagem enviada.', 'IMAGE_REQUIRED'))
     }
 
     await libraryService.checkBookOwnership(id, userId)
diff --git a/backend/src/routes/social.js b/backend/src/routes/social.js
index ddfd37a1b4122b9e3c8e99c2a930d57aa173ac5a..c622a8a310283b134ce049d8f18206c0f3169465 100644
--- a/backend/src/routes/social.js
+++ b/backend/src/routes/social.js
@@ -25,6 +25,30 @@ router.get('/connections', async (req, res) => {
   }
 })
 
+router.get('/blocks', async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await socialService.blockedUsers(req.user.id))
+  } catch (error) {
+    sendError(res, error, 'Erro ao listar bloqueados')
+  }
+})
+
+router.post('/blocks/:username', socialLimiter, async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await socialService.blockUser(req.user.id, req.params.username))
+  } catch (error) {
+    sendError(res, error, 'Erro ao bloquear')
+  }
+})
+
+router.delete('/blocks/:username', socialLimiter, async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await socialService.unblockUser(req.user.id, req.params.username))
+  } catch (error) {
+    sendError(res, error, 'Erro ao desbloquear')
+  }
+})
+
 router.get('/requests/count', async (req, res) => {
   try {
     res.status(STATUS.OK).json(await socialService.pendingCount(req.user.id))
diff --git a/backend/src/services/authService.js b/backend/src/services/authService.js
index 4583ca8654c783c1d1513a5fbcf990330de90be9..a0f8cf8729eece63d54d60e748af6eeec698777f 100644
--- a/backend/src/services/authService.js
+++ b/backend/src/services/authService.js
@@ -9,6 +9,8 @@ import crypto from 'node:crypto'
 import * as tokenRepository from '../repositories/tokenRepository.js'
 import { sendMail } from './mailService.js'
 import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail } from './emailTemplates.js'
+import { httpError } from '../utils/httpError.js'
+import { isReservedUsername } from '../utils/reservedNames.js'
 
 const SECRET_KEY = process.env.SECRET_KEY
 const TOKEN_TTL = '7d'
@@ -23,12 +25,6 @@ const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u
 // mesmo custo e a resposta leva o mesmo tempo, sem permitir enumerar usuários.
 const DUMMY_HASH = bcrypt.hashSync('librishelf-dummy-password', BCRYPT_ROUNDS)
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 function isNonEmptyString(value) {
   return typeof value === 'string' && value.trim().length > 0
 }
@@ -74,14 +70,14 @@ function toProfile(user) {
 
 async function verifyCurrentPassword(userId, password) {
   if (typeof password !== 'string' || password.length === 0) {
-    throw httpError('Informe a senha atual.', STATUS.BAD_REQUEST)
+    throw httpError('Informe a senha atual.', STATUS.BAD_REQUEST, 'CURRENT_PASSWORD_REQUIRED')
   }
 
   const user = await authRepository.getPasswordHashById(userId)
   const isValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)
 
   if (!user || !isValid) {
-    throw httpError('Senha atual incorreta.', STATUS.UNAUTHORIZED)
+    throw httpError('Senha atual incorreta.', STATUS.UNAUTHORIZED, 'CURRENT_PASSWORD_WRONG')
   }
 
   return user.password_hash
@@ -89,7 +85,7 @@ async function verifyCurrentPassword(userId, password) {
 
 async function loginUser(username, password) {
   if (!isNonEmptyString(username) || typeof password !== 'string' || password.length === 0) {
-    throw httpError('Username and password are required.', STATUS.BAD_REQUEST)
+    throw httpError('Username and password are required.', STATUS.BAD_REQUEST, 'CREDENTIALS_REQUIRED')
   }
 
   const user = await authRepository.getUserByUsername(username.trim())
@@ -97,7 +93,7 @@ async function loginUser(username, password) {
   const isPasswordValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)
 
   if (!user || !isPasswordValid) {
-    throw httpError('User or password invalid.', STATUS.UNAUTHORIZED)
+    throw httpError('User or password invalid.', STATUS.UNAUTHORIZED, 'INVALID_CREDENTIALS')
   }
 
   return {
@@ -113,34 +109,38 @@ async function getUserProfile(id) {
 
 async function registerUser(username, password, email, locale) {
   if (!isNonEmptyString(username) || !isNonEmptyString(email)) {
-    throw httpError('Username, password, and email are required.', STATUS.BAD_REQUEST)
+    throw httpError('Username, password, and email are required.', STATUS.BAD_REQUEST, 'REGISTER_FIELDS_REQUIRED')
   }
 
   const cleanUsername = username.trim()
   const cleanEmail = email.trim()
 
   if (cleanUsername.length > MAX_USERNAME_LENGTH) {
-    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'USERNAME_TOO_LONG', { max: MAX_USERNAME_LENGTH })
   }
 
   // Letras, números, ponto, hífen e sublinhado. Isso também impede "@" (o login
   // aceita usuário OU e-mail no mesmo campo) e barras no link público.
   if (!USERNAME_PATTERN.test(cleanUsername)) {
-    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST)
+    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST, 'USERNAME_INVALID')
+  }
+
+  if (isReservedUsername(cleanUsername)) {
+    throw httpError('Este nome de usuário é reservado. Escolha outro.', STATUS.BAD_REQUEST, 'USERNAME_RESERVED')
   }
 
   if (!EMAIL_PATTERN.test(cleanEmail)) {
-    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST)
+    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST, 'EMAIL_INVALID')
   }
 
   const passwordCheck = validatePassword(password)
   if (!passwordCheck.valid) {
-    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST)
+    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST, passwordCheck.code, passwordCheck.params)
   }
 
   const existingUser = await authRepository.getUserByUsername(cleanUsername)
   if (existingUser) {
-    throw httpError('Username already taken.', STATUS.CONFLICT)
+    throw httpError('Username already taken.', STATUS.CONFLICT, 'USERNAME_TAKEN')
   }
 
   const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)
@@ -152,7 +152,7 @@ async function registerUser(username, password, email, locale) {
     // Duas requisições simultâneas passam pela checagem acima; a constraint
     // UNIQUE do banco é quem decide, e a violação vira 409 em vez de 500.
     if (err.code === UNIQUE_VIOLATION) {
-      throw httpError('Username or email already taken.', STATUS.CONFLICT)
+      throw httpError('Username or email already taken.', STATUS.CONFLICT, 'USERNAME_OR_EMAIL_TAKEN')
     }
     throw err
   }
@@ -180,21 +180,21 @@ async function deliverVerification(user, locale) {
 /** Reenvia a confirmação para quem está logado. */
 async function resendVerification(userId, locale) {
   const user = await authRepository.getUserById(userId)
-  if (!user) throw httpError('User not found.', STATUS.NOT_FOUND)
+  if (!user) throw httpError('User not found.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
   if (user.email_verified_at) return { alreadyVerified: true }
 
   try {
     await deliverVerification(user, locale)
   } catch (err) {
     logger.error('Falha ao reenviar confirmação de e-mail', { userId, message: err.message })
-    throw httpError('Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.', 502)
+    throw httpError('Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.', 502, 'EMAIL_SEND_FAILED')
   }
   return { alreadyVerified: false }
 }
 
 async function verifyEmail(token) {
   const userId = await consumeLinkToken(token, 'verify_email')
-  if (!userId) throw httpError(INVALID_LINK, STATUS.BAD_REQUEST)
+  if (!userId) throw httpError(INVALID_LINK, STATUS.BAD_REQUEST, 'LINK_INVALID')
   await authRepository.markEmailVerified(userId)
   logger.info('E-mail confirmado', { userId })
 }
@@ -205,7 +205,7 @@ async function verifyEmail(token) {
  */
 async function requestPasswordReset(email, locale) {
   if (!isNonEmptyString(email) || !EMAIL_PATTERN.test(email.trim())) {
-    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST)
+    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST, 'EMAIL_INVALID')
   }
 
   const user = await authRepository.getUserByEmail(email.trim())
@@ -232,11 +232,11 @@ async function requestPasswordReset(email, locale) {
 async function resetPassword(token, newPassword) {
   const passwordCheck = validatePassword(newPassword)
   if (!passwordCheck.valid) {
-    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST)
+    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST, passwordCheck.code, passwordCheck.params)
   }
 
   const userId = await consumeLinkToken(token, 'reset_password')
-  if (!userId) throw httpError(INVALID_LINK, STATUS.BAD_REQUEST)
+  if (!userId) throw httpError(INVALID_LINK, STATUS.BAD_REQUEST, 'LINK_INVALID')
 
   const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
   await authRepository.updatePassword(userId, hashedPassword)
@@ -255,11 +255,11 @@ async function changePassword(userId, currentPassword, newPassword) {
 
   const passwordCheck = validatePassword(newPassword)
   if (!passwordCheck.valid) {
-    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST)
+    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST, passwordCheck.code, passwordCheck.params)
   }
 
   if (await bcrypt.compare(newPassword, currentHash)) {
-    throw httpError('A nova senha precisa ser diferente da atual.', STATUS.BAD_REQUEST)
+    throw httpError('A nova senha precisa ser diferente da atual.', STATUS.BAD_REQUEST, 'PASSWORD_SAME')
   }
 
   const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
@@ -282,20 +282,20 @@ async function setPrivacy(userId, body = {}) {
   const provided = fields.filter(field => body[field] !== undefined)
 
   if (provided.length === 0) {
-    throw httpError('Nada para alterar.', STATUS.BAD_REQUEST)
+    throw httpError('Nada para alterar.', STATUS.BAD_REQUEST, 'NOTHING_TO_UPDATE')
   }
 
   const invalid = provided.find(field => typeof body[field] !== 'boolean')
   if (invalid) {
-    throw httpError(`Campo '${invalid}' precisa ser true ou false.`, STATUS.BAD_REQUEST)
+    throw httpError(`Campo '${invalid}' precisa ser true ou false.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: invalid })
   }
 
   // Ligar qualquer opção pública exige e-mail confirmado; desligar, sempre pode.
   if (provided.some(field => body[field] === true)) {
     const user = await authRepository.getUserById(userId)
-    if (!user) throw httpError('User not found.', STATUS.NOT_FOUND)
+    if (!user) throw httpError('User not found.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
     if (!user.email_verified_at) {
-      throw httpError('Confirme seu e-mail para deixar a biblioteca pública ou participar da comunidade.', STATUS.FORBIDDEN)
+      throw httpError('Confirme seu e-mail para deixar a biblioteca pública ou participar da comunidade.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_PUBLIC')
     }
   }
 
@@ -304,7 +304,7 @@ async function setPrivacy(userId, body = {}) {
     showInCommunity: body.showInCommunity ?? null,
     showActivity: body.showActivity ?? null
   })
-  if (!result) throw httpError('User not found.', STATUS.NOT_FOUND)
+  if (!result) throw httpError('User not found.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
 
   return {
     isPublic: result.is_public,
@@ -329,23 +329,23 @@ async function changeEmail(userId, password, newEmail, locale) {
 
   const email = typeof newEmail === 'string' ? newEmail.trim() : ''
   if (!EMAIL_PATTERN.test(email) || email.length > 254) {
-    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST)
+    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST, 'EMAIL_INVALID')
   }
 
   const current = await authRepository.getUserById(userId)
-  if (!current) throw httpError('User not found.', STATUS.NOT_FOUND)
+  if (!current) throw httpError('User not found.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
   if (current.email.toLowerCase() === email.toLowerCase()) {
-    throw httpError('Este já é o seu e-mail.', STATUS.BAD_REQUEST)
+    throw httpError('Este já é o seu e-mail.', STATUS.BAD_REQUEST, 'EMAIL_SAME')
   }
   if (await authRepository.isEmailTaken(email, userId)) {
-    throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT)
+    throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT, 'EMAIL_TAKEN')
   }
 
   let updated
   try {
     updated = await authRepository.updateEmail(userId, email)
   } catch (err) {
-    if (err.code === UNIQUE_VIOLATION) throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT)
+    if (err.code === UNIQUE_VIOLATION) throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT, 'EMAIL_TAKEN')
     throw err
   }
 
@@ -373,25 +373,28 @@ async function changeUsername(userId, password, newName) {
   await verifyCurrentPassword(userId, password)
 
   const name = typeof newName === 'string' ? newName.trim() : ''
-  if (!name) throw httpError('Informe o novo nome de usuário.', STATUS.BAD_REQUEST)
+  if (!name) throw httpError('Informe o novo nome de usuário.', STATUS.BAD_REQUEST, 'USERNAME_REQUIRED')
   if (name.length > MAX_USERNAME_LENGTH) {
-    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'USERNAME_TOO_LONG', { max: MAX_USERNAME_LENGTH })
   }
   if (!USERNAME_PATTERN.test(name)) {
-    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST)
+    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST, 'USERNAME_INVALID')
+  }
+  if (isReservedUsername(name)) {
+    throw httpError('Este nome de usuário é reservado. Escolha outro.', STATUS.BAD_REQUEST, 'USERNAME_RESERVED')
   }
   if (await authRepository.isNameTaken(name, userId)) {
-    throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT)
+    throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT, 'USERNAME_TAKEN')
   }
 
   let updated
   try {
     updated = await authRepository.updateName(userId, name)
   } catch (err) {
-    if (err.code === UNIQUE_VIOLATION) throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT)
+    if (err.code === UNIQUE_VIOLATION) throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT, 'USERNAME_TAKEN')
     throw err
   }
-  if (!updated) throw httpError('User not found.', STATUS.NOT_FOUND)
+  if (!updated) throw httpError('User not found.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
 
   logger.info('Nome de usuário trocado', { userId })
   return { token: issueToken(updated), user: toProfile(updated) }
diff --git a/backend/src/services/communityService.js b/backend/src/services/communityService.js
index a075b2329493eb831f6650182aabc207d08d3861..84c334f142033101d1255ddc37e0116d38d72954 100644
--- a/backend/src/services/communityService.js
+++ b/backend/src/services/communityService.js
@@ -3,6 +3,7 @@ import * as libraryRepository from '../repositories/libraryRepository.js'
 import * as authRepository from '../repositories/authRepository.js'
 import * as socialRepository from '../repositories/socialRepository.js'
 import STATUS from '../utils/statusCodes.js'
+import { httpError } from '../utils/httpError.js'
 
 const MAX_READERS_LISTED = 20
 const FIND_LIMIT = 24
@@ -10,19 +11,13 @@ const RECOMMENDATION_LIMIT = 6
 const ALSO_HAVE_LIMIT = 5
 const COMMON_LIMIT = 24
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 /**
  * Painel "comunidade" de um livro do próprio usuário: outros leitores
  * (só quem optou por aparecer), nota média deles e "também têm".
  */
 export async function bookCommunity(bookId, userId) {
   const owner = await libraryRepository.getBookOwner(bookId)
-  if (!owner || owner.user_id !== userId) throw httpError('Book not found.', STATUS.NOT_FOUND)
+  if (!owner || owner.user_id !== userId) throw httpError('Book not found.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
 
   const readers = await communityRepository.readersOfBook(bookId, userId)
   const ratings = readers.map(r => r.rating).filter(r => r !== null)
@@ -55,7 +50,7 @@ export async function bookCommunity(bookId, userId) {
  */
 export async function publicProfile(username, viewerId) {
   const user = await authRepository.getUserByName(username)
-  if (!user || !user.is_public) throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND)
+  if (!user || !user.is_public) throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND, 'LIBRARY_NOT_FOUND')
 
   const stats = await communityRepository.profileStats(user.id)
 
@@ -80,13 +75,20 @@ export async function publicProfile(username, viewerId) {
     if (viewerId === user.id) {
       profile.viewer = { isOwner: true }
     } else {
-      const common = user.show_in_community
+      const { blockedByMe, blockedMe } = await socialRepository.blockState(viewerId, user.id)
+      const blocked = blockedByMe || blockedMe
+      const common = user.show_in_community && !blocked
         ? await communityRepository.commonBooks(viewerId, user.id, COMMON_LIMIT)
         : null
 
+      // Quem foi bloqueado vê o perfil como qualquer visitante (é público),
+      // mas sem "seguir" nem livros em comum. Não é avisado do bloqueio.
+      if (blockedMe) profile.acceptsFollowers = false
+
       profile.viewer = {
         isOwner: false,
-        followStatus: await socialRepository.followStatus(viewerId, user.id),
+        followStatus: blocked ? null : await socialRepository.followStatus(viewerId, user.id),
+        blockedByMe,
         commonCount: common ? common.total : null,
         commonBooks: common ? common.books : []
       }
@@ -130,8 +132,8 @@ export async function recommendations(userId) {
 /** Copia um livro da comunidade para a estante de quem pediu, como "Quero ler". */
 export async function addToWantList(sourceId, userId) {
   const source = await communityRepository.sourceBook(sourceId, userId)
-  if (!source) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND)
-  if (source.already_have) throw httpError('Este livro já está na sua estante.', STATUS.CONFLICT)
+  if (!source) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
+  if (source.already_have) throw httpError('Este livro já está na sua estante.', STATUS.CONFLICT, 'BOOK_ALREADY_ON_SHELF')
 
   const bookId = await libraryRepository.createBook({
     title: source.title,
diff --git a/backend/src/services/dashboardService.js b/backend/src/services/dashboardService.js
index e5201ba998d39a65dc3739c331099edd50ef7956..02c3e2b5a2156fba1d0397eda54479cd40950508 100644
--- a/backend/src/services/dashboardService.js
+++ b/backend/src/services/dashboardService.js
@@ -1,18 +1,13 @@
 import * as dashboardRepository from '../repositories/dashboardRepository.js'
 import STATUS from '../utils/statusCodes.js'
-
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
+import { httpError } from '../utils/httpError.js'
 
 /** Ano do painel (gráfico mensal e meta). Padrão: o ano atual. */
 function normalizeYear(value) {
   if (value === undefined || value === null || value === '') return new Date().getFullYear()
   const year = Number(value)
   if (!Number.isInteger(year) || year < 1900 || year > 2200) {
-    throw httpError("Ano inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST)
+    throw httpError("Ano inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST, 'YEAR_INVALID')
   }
   return year
 }
@@ -20,7 +15,7 @@ function normalizeYear(value) {
 function normalizeTarget(value) {
   const target = Number(value)
   if (!Number.isInteger(target) || target < 1 || target > 1000) {
-    throw httpError('A meta precisa ser um número inteiro de 1 a 1000.', STATUS.BAD_REQUEST)
+    throw httpError('A meta precisa ser um número inteiro de 1 a 1000.', STATUS.BAD_REQUEST, 'GOAL_INVALID')
   }
   return target
 }
diff --git a/backend/src/services/dataService.js b/backend/src/services/dataService.js
index 8cd35e48deba9d0967ffe80c345d3197a097fbe4..f3b6da10085d52139bfd458a19bcb71e67f1544a 100644
--- a/backend/src/services/dataService.js
+++ b/backend/src/services/dataService.js
@@ -6,18 +6,13 @@ import { csvToObjects, toCsv } from '../utils/csv.js'
 import { normalizeIsbn13 } from '../utils/isbn.js'
 import STATUS from '../utils/statusCodes.js'
 import logger from '../utils/logger.js'
+import { httpError } from '../utils/httpError.js'
 
 /**
  * Seus dados: exportar tudo (JSON ou CSV) e importar livros de um CSV — do
  * Goodreads ou o próprio CSV exportado pelo Librishelf.
  */
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 // ---------------------------------------------------------------------------
 // Exportar
 // ---------------------------------------------------------------------------
@@ -37,7 +32,7 @@ async function loadExport(userId) {
     db.query(q.EXPORT_GOALS, [userId]),
     db.query(q.EXPORT_BOOKS, [userId])
   ])
-  if (!user.rows[0]) throw httpError('User not found.', STATUS.NOT_FOUND)
+  if (!user.rows[0]) throw httpError('User not found.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
   return { user: user.rows[0], goals: goals.rows, books: books.rows }
 }
 
@@ -217,16 +212,16 @@ const keyOf = (title, author) => `${String(title).toLocaleLowerCase()}\u0000${St
  * título + primeiro autor) e devolve o resumo com o motivo de cada linha pulada.
  */
 export async function importCsv(userId, buffer) {
-  if (!buffer?.length) throw httpError('Envie o arquivo CSV.', STATUS.BAD_REQUEST)
+  if (!buffer?.length) throw httpError('Envie o arquivo CSV.', STATUS.BAD_REQUEST, 'CSV_REQUIRED')
 
   const { headers, records } = csvToObjects(buffer.toString('utf8'))
   const format = detectFormat(headers)
   if (!format) {
-    throw httpError('Formato não reconhecido: envie o CSV exportado do Goodreads ou do Librishelf.', STATUS.BAD_REQUEST)
+    throw httpError('Formato não reconhecido: envie o CSV exportado do Goodreads ou do Librishelf.', STATUS.BAD_REQUEST, 'CSV_FORMAT')
   }
-  if (records.length === 0) throw httpError('O arquivo não tem nenhum livro.', STATUS.BAD_REQUEST)
+  if (records.length === 0) throw httpError('O arquivo não tem nenhum livro.', STATUS.BAD_REQUEST, 'CSV_EMPTY')
   if (records.length > MAX_IMPORT_ROWS) {
-    throw httpError(`O arquivo tem ${records.length} livros; o limite por importação é ${MAX_IMPORT_ROWS}.`, STATUS.BAD_REQUEST)
+    throw httpError(`O arquivo tem ${records.length} livros; o limite por importação é ${MAX_IMPORT_ROWS}.`, STATUS.BAD_REQUEST, 'CSV_TOO_MANY', { count: records.length, max: MAX_IMPORT_ROWS })
   }
 
   const { rows: existing } = await db.query(q.EXISTING_KEYS, [userId])
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index 9f3e90dbc878ed0676c4e506837526714515c2b7..25c48305284d88d2fb2b549e9e79f47e6ce8dd68 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -3,16 +3,11 @@ import * as authRepository from '../repositories/authRepository.js'
 import STATUS from '../utils/statusCodes.js'
 import { deleteBookCover } from '../utils/imageProcessor.js'
 import logger from '../utils/logger.js'
-import { parseNameList, parseTagList, validateNameList } from '../utils/nameList.js'
+import { parseNameList, parseTagList, nameListError } from '../utils/nameList.js'
+import { httpError } from '../utils/httpError.js'
 
 const READ_YEAR_PATTERN = /^\d{4}$/
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 function normalizeIsbn(isbn) {
   if (typeof isbn !== 'string') return isbn ?? null
   const trimmed = isbn.trim()
@@ -29,7 +24,7 @@ function normalizeDate(value, fieldName) {
   const parsed = new Date(value)
 
   if (Number.isNaN(parsed.getTime())) {
-    throw httpError(`Data inválida em '${fieldName}'.`, STATUS.BAD_REQUEST)
+    throw httpError(`Data inválida em '${fieldName}'.`, STATUS.BAD_REQUEST, 'DATE_INVALID', { field: fieldName })
   }
 
   return parsed.toISOString().split('T')[0]
@@ -44,7 +39,7 @@ function normalizeReadDate(value) {
   if (!date) return date
   const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
   if (date > tomorrow) {
-    throw httpError('A data de leitura não pode estar no futuro.', STATUS.BAD_REQUEST)
+    throw httpError('A data de leitura não pode estar no futuro.', STATUS.BAD_REQUEST, 'READ_DATE_FUTURE')
   }
   return date
 }
@@ -55,7 +50,7 @@ export const READING_STATUSES = ['none', 'want', 'reading', 'read']
 function normalizeReadState(value) {
   if (value === undefined || value === null || value === '') return 'all'
   if (!READ_STATES.includes(String(value))) {
-    throw httpError("Parâmetro 'readState' inválido.", STATUS.BAD_REQUEST)
+    throw httpError("Parâmetro 'readState' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'readState' })
   }
   return String(value)
 }
@@ -64,7 +59,7 @@ function normalizeReadMonth(value) {
   if (value === undefined || value === null || value === '') return undefined
   const month = Number(value)
   if (!Number.isInteger(month) || month < 1 || month > 12) {
-    throw httpError("Parâmetro 'readMonth' inválido: use um número de 1 a 12.", STATUS.BAD_REQUEST)
+    throw httpError("Parâmetro 'readMonth' inválido: use um número de 1 a 12.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'readMonth' })
   }
   return month
 }
@@ -74,10 +69,10 @@ const MAX_NOTES_LENGTH = 5000
 
 function normalizeSeries(value) {
   if (value === undefined || value === null) return null
-  if (typeof value !== 'string') throw httpError("'series' precisa ser texto.", STATUS.BAD_REQUEST)
+  if (typeof value !== 'string') throw httpError("'series' precisa ser texto.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'series' })
   const series = value.trim().replace(/\s+/g, ' ')
   if (series.length > MAX_SERIES_LENGTH) {
-    throw httpError(`O nome da série pode ter até ${MAX_SERIES_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+    throw httpError(`O nome da série pode ter até ${MAX_SERIES_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'SERIES_TOO_LONG', { max: MAX_SERIES_LENGTH })
   }
   return series || null
 }
@@ -87,17 +82,17 @@ function normalizeSeriesIndex(value) {
   if (value === undefined || value === null || value === '') return null
   const number = Number(String(value).replace(',', '.'))
   if (!Number.isFinite(number) || number < 0 || number > 9999) {
-    throw httpError('O volume precisa ser um número de 0 a 9999.', STATUS.BAD_REQUEST)
+    throw httpError('O volume precisa ser um número de 0 a 9999.', STATUS.BAD_REQUEST, 'VOLUME_INVALID')
   }
   return Math.round(number * 100) / 100
 }
 
 function normalizeNotes(value) {
   if (value === undefined || value === null) return null
-  if (typeof value !== 'string') throw httpError("'notes' precisa ser texto.", STATUS.BAD_REQUEST)
+  if (typeof value !== 'string') throw httpError("'notes' precisa ser texto.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'notes' })
   const notes = value.replace(/\r\n/g, '\n').trim()
   if (notes.length > MAX_NOTES_LENGTH) {
-    throw httpError(`A anotação pode ter até ${MAX_NOTES_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+    throw httpError(`A anotação pode ter até ${MAX_NOTES_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'NOTES_TOO_LONG', { max: MAX_NOTES_LENGTH })
   }
   return notes || null
 }
@@ -106,7 +101,7 @@ function normalizeReadYear(readYear) {
   if (readYear === undefined || readYear === null || readYear === '' || readYear === 'all') return 'all'
 
   if (!READ_YEAR_PATTERN.test(String(readYear))) {
-    throw httpError("Parâmetro 'readYear' inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST)
+    throw httpError("Parâmetro 'readYear' inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'readYear' })
   }
 
   return String(readYear)
@@ -117,7 +112,7 @@ async function getPublicLibraryByUsername(username, query) {
 
   // Biblioteca privada responde igual a usuário inexistente: não confirma que a conta existe.
   if (!user || !user.is_public) {
-    throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND)
+    throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND, 'LIBRARY_NOT_FOUND')
   }
 
   const booksData = await getAllBooksByUser(user.id, query)
@@ -170,7 +165,7 @@ async function getRandomPublicBookIds(limit) {
 
 function requireText(value, fieldName) {
   if (typeof value !== 'string' || !value.trim()) {
-    throw httpError(`${fieldName} is required.`, STATUS.BAD_REQUEST)
+    throw httpError(`${fieldName} is required.`, STATUS.BAD_REQUEST, 'FIELD_REQUIRED', { field: fieldName.toLowerCase() })
   }
   return value.trim()
 }
@@ -190,7 +185,7 @@ function normalizeRating(value) {
   if (value === undefined || value === null || value === '' || value === 'null') return null
   const rating = Number(value)
   if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
-    throw httpError('A nota precisa ser um número inteiro de 1 a 5.', STATUS.BAD_REQUEST)
+    throw httpError('A nota precisa ser um número inteiro de 1 a 5.', STATUS.BAD_REQUEST, 'RATING_INVALID')
   }
   return rating
 }
@@ -198,19 +193,19 @@ function normalizeRating(value) {
 function normalizeOlKey(value, pattern, field) {
   if (value === undefined || value === null || value === '') return null
   if (typeof value !== 'string' || !pattern.test(value)) {
-    throw httpError(`Campo '${field}' inválido.`, STATUS.BAD_REQUEST)
+    throw httpError(`Campo '${field}' inválido.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field })
   }
   return value
 }
 
 function normalizeBookInput(raw = {}) {
   const authors = parseNameList(raw.authors)
-  if (authors.length === 0) throw httpError('Authors is required.', STATUS.BAD_REQUEST)
+  if (authors.length === 0) throw httpError('Authors is required.', STATUS.BAD_REQUEST, 'AUTHORS_REQUIRED')
 
   const tags = parseTagList(raw.tags)
 
-  const listError = validateNameList(authors, 'autores') || validateNameList(tags, 'tags')
-  if (listError) throw httpError(listError, STATUS.BAD_REQUEST)
+  const listError = nameListError(authors, 'autores') || nameListError(tags, 'tags')
+  if (listError) throw httpError(listError.message, STATUS.BAD_REQUEST, listError.code, listError.params)
 
   const publisher = typeof raw.publisher === 'string' ? raw.publisher.trim() : ''
 
@@ -240,7 +235,7 @@ async function addNewBook(bookData) {
     const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)
 
     if (existingBook) {
-      throw httpError('ISBN already exists for this user.', STATUS.CONFLICT)
+      throw httpError('ISBN already exists for this user.', STATUS.CONFLICT, 'ISBN_TAKEN')
     }
   }
 
@@ -281,11 +276,11 @@ async function checkBookOwnership(bookId, userId) {
   const bookOwner = await libraryRepository.getBookOwner(bookId)
 
   if (!bookOwner) {
-    throw httpError('Book not found.', STATUS.NOT_FOUND)
+    throw httpError('Book not found.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
   }
 
   if (bookOwner.user_id !== userId) {
-    throw httpError('Permission denied.', STATUS.FORBIDDEN)
+    throw httpError('Permission denied.', STATUS.FORBIDDEN, 'PERMISSION_DENIED')
   }
 
   return true
@@ -335,7 +330,7 @@ async function setReadingStatus(bookId, userId, rawStatus, rawDate) {
   const status = String(rawStatus ?? '')
 
   if (!READING_STATUSES.includes(status)) {
-    throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST)
+    throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST, 'STATUS_INVALID')
   }
 
   if (status === 'read') {
@@ -382,23 +377,23 @@ const BATCH_ACTIONS = ['status', 'addTag', 'removeTag', 'delete']
 async function batchUpdate(userId, body = {}) {
   const { action } = body
   if (!BATCH_ACTIONS.includes(action)) {
-    throw httpError("Ação inválida: use 'status', 'addTag', 'removeTag' ou 'delete'.", STATUS.BAD_REQUEST)
+    throw httpError("Ação inválida: use 'status', 'addTag', 'removeTag' ou 'delete'.", STATUS.BAD_REQUEST, 'BATCH_ACTION_INVALID')
   }
 
   const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))]
   if (ids.length === 0 || ids.length > MAX_BATCH || !ids.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
-    throw httpError(`Envie de 1 a ${MAX_BATCH} ids de livros válidos.`, STATUS.BAD_REQUEST)
+    throw httpError(`Envie de 1 a ${MAX_BATCH} ids de livros válidos.`, STATUS.BAD_REQUEST, 'BATCH_IDS_INVALID', { max: MAX_BATCH })
   }
 
   const owned = await libraryRepository.filterOwnedIds(userId, ids)
   if (owned.length !== ids.length) {
-    throw httpError('Alguns livros não foram encontrados na sua biblioteca.', STATUS.FORBIDDEN)
+    throw httpError('Alguns livros não foram encontrados na sua biblioteca.', STATUS.FORBIDDEN, 'BATCH_BOOKS_NOT_FOUND')
   }
 
   if (action === 'status') {
     const status = String(body.status ?? '')
     if (!READING_STATUSES.includes(status)) {
-      throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST)
+      throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST, 'STATUS_INVALID')
     }
     const date = normalizeReadDate(body.date) ?? new Date().toISOString().slice(0, 10)
     return { updated: await libraryRepository.batchSetStatus(ids, status, date) }
@@ -406,8 +401,9 @@ async function batchUpdate(userId, body = {}) {
 
   if (action === 'addTag' || action === 'removeTag') {
     const [tag] = parseTagList(body.tag)
-    const tagError = tag ? validateNameList([tag], 'tags') : 'Informe a categoria.'
-    if (tagError) throw httpError(tagError, STATUS.BAD_REQUEST)
+    if (!tag) throw httpError('Informe a categoria.', STATUS.BAD_REQUEST, 'TAG_REQUIRED')
+    const tagError = nameListError([tag], 'tags')
+    if (tagError) throw httpError(tagError.message, STATUS.BAD_REQUEST, tagError.code, tagError.params)
 
     if (action === 'addTag') {
       return { updated: await libraryRepository.batchAddTag(userId, ids, tag) }
diff --git a/backend/src/services/namesService.js b/backend/src/services/namesService.js
index 90ae8e2e49aa4f6b7cf7f7ae480b99b07725414b..5410324e95300921d3edb2a0daef54bcae3adafc 100644
--- a/backend/src/services/namesService.js
+++ b/backend/src/services/namesService.js
@@ -1,6 +1,7 @@
 import { db } from '../database/connection.js'
 import STATUS from '../utils/statusCodes.js'
-import { parseNameList, parseTagList, validateNameList } from '../utils/nameList.js'
+import { parseNameList, parseTagList, nameListError } from '../utils/nameList.js'
+import { httpError } from '../utils/httpError.js'
 
 /**
  * Renomear e mesclar autores, editoras e categorias (sempre do próprio usuário).
@@ -17,12 +18,6 @@ const KINDS = {
   publisher: { table: 'publishers', label: 'editoras', parse: parseNameList }
 }
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 async function moveBooks(client, kind, fromId, toId, userId) {
   const { table, link, column } = KINDS[kind]
 
@@ -50,10 +45,10 @@ export async function mergeNames(kind, userId, body = {}) {
   const [to] = config.parse(body.to)
 
   if (from.length === 0 || !to) {
-    throw httpError('Informe os nomes de origem (from) e o nome final (to).', STATUS.BAD_REQUEST)
+    throw httpError('Informe os nomes de origem (from) e o nome final (to).', STATUS.BAD_REQUEST, 'MERGE_FIELDS_REQUIRED')
   }
-  const listError = validateNameList(from, config.label) || validateNameList([to], config.label)
-  if (listError) throw httpError(listError, STATUS.BAD_REQUEST)
+  const listError = nameListError(from, config.label) || nameListError([to], config.label)
+  if (listError) throw httpError(listError.message, STATUS.BAD_REQUEST, listError.code, listError.params)
 
   const client = await db.connect()
   try {
@@ -65,7 +60,7 @@ export async function mergeNames(kind, userId, body = {}) {
       [userId, from.map(name => name.toLocaleLowerCase())]
     )
     if (sources.length !== from.length) {
-      throw httpError('Algum dos nomes não existe na sua biblioteca.', STATUS.NOT_FOUND)
+      throw httpError('Algum dos nomes não existe na sua biblioteca.', STATUS.NOT_FOUND, 'NAMES_NOT_FOUND')
     }
 
     const { rows: [existing] } = await client.query(
diff --git a/backend/src/services/openLibraryService.js b/backend/src/services/openLibraryService.js
index aedcbabfde519be13c682a002b6bae81f132b9a2..66888d3232bb2f2d364ecfb198ac394ebe72553e 100644
--- a/backend/src/services/openLibraryService.js
+++ b/backend/src/services/openLibraryService.js
@@ -1,6 +1,7 @@
 import logger from '../utils/logger.js'
 import STATUS from '../utils/statusCodes.js'
 import { normalizeIsbn13 } from '../utils/isbn.js'
+import { httpError } from '../utils/httpError.js'
 
 /**
  * Busca de livros por ISBN no Open Library, feita sempre pelo servidor (o
@@ -52,12 +53,6 @@ function unavailable(cause) {
   return error
 }
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 /** Só para testes: troca o fetch e zera cache/limite. */
 export function configureForTests({ fetch: customFetch, minInterval = 0 } = {}) {
   fetchImpl = customFetch
@@ -209,7 +204,7 @@ async function authorNames(keys) {
  */
 export async function lookupIsbn(rawIsbn) {
   const isbn13 = normalizeIsbn13(rawIsbn)
-  if (!isbn13) throw httpError('ISBN inválido.', STATUS.BAD_REQUEST)
+  if (!isbn13) throw httpError('ISBN inválido.', STATUS.BAD_REQUEST, 'ISBN_INVALID')
 
   const cached = cacheGet(lookupCache, isbn13)
   if (cached !== undefined) return cached
@@ -260,7 +255,7 @@ export async function lookupIsbn(rawIsbn) {
 /** Capa grande pelo ID (sem limite de requisições no Open Library). */
 export async function fetchCover(coverId) {
   const id = Number(coverId)
-  if (!Number.isInteger(id) || id <= 0) throw httpError('Capa inválida.', STATUS.BAD_REQUEST)
+  if (!Number.isInteger(id) || id <= 0) throw httpError('Capa inválida.', STATUS.BAD_REQUEST, 'COVER_INVALID')
 
   const cached = cacheGet(coverCache, id)
   if (cached !== undefined) return cached
@@ -280,10 +275,10 @@ export async function fetchCover(coverId) {
   if (!response.ok) throw unavailable(new Error(`HTTP ${response.status} na capa ${id}`))
 
   const declared = Number(response.headers.get('content-length'))
-  if (declared > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502)
+  if (declared > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502, 'COVER_TOO_LARGE')
 
   const buffer = Buffer.from(await response.arrayBuffer())
-  if (buffer.length > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502)
+  if (buffer.length > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502, 'COVER_TOO_LARGE')
 
   cacheSet(coverCache, id, buffer, CACHE_TTL_MS, COVER_CACHE_MAX)
   return buffer
diff --git a/backend/src/services/socialService.js b/backend/src/services/socialService.js
index a338ee51740eabf6cb911cc34c159af1b35b7d6c..c9031494a85e021870f7bc78be06e919b286a1e4 100644
--- a/backend/src/services/socialService.js
+++ b/backend/src/services/socialService.js
@@ -1,33 +1,34 @@
 import * as socialRepository from '../repositories/socialRepository.js'
 import * as authRepository from '../repositories/authRepository.js'
 import STATUS from '../utils/statusCodes.js'
+import { httpError } from '../utils/httpError.js'
 
 const FEED_PAGE_SIZE = 30
 
-function httpError(message, status) {
-  const error = new Error(message)
-  error.status = status
-  return error
-}
-
 // Mesmo erro para "não existe" e "não aceita seguidores": não confirma contas.
 const NOT_AVAILABLE = 'Leitor não encontrado ou não aceita seguidores.'
 
 async function findUser(username) {
-  if (typeof username !== 'string' || !username.trim()) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND)
+  if (typeof username !== 'string' || !username.trim()) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
   const user = await authRepository.getUserByName(username.trim())
-  if (!user) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND)
+  if (!user) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
   return user
 }
 
 export async function requestFollow(viewerId, username) {
   const target = await findUser(username)
-  if (target.id === viewerId) throw httpError('Você não pode seguir a si mesmo.', STATUS.BAD_REQUEST)
-  if (!target.show_activity) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND)
+  if (target.id === viewerId) throw httpError('Você não pode seguir a si mesmo.', STATUS.BAD_REQUEST, 'FOLLOW_SELF')
+  if (!target.show_activity) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
+
+  // Bloqueado por ele: mesma resposta de "não aceita seguidores" (não revela o bloqueio).
+  // Bloqueado por mim: aviso claro, para a pessoa saber que precisa desbloquear.
+  const { blockedByMe, blockedMe } = await socialRepository.blockState(viewerId, target.id)
+  if (blockedMe) throw httpError(NOT_AVAILABLE, STATUS.NOT_FOUND, 'READER_NOT_AVAILABLE')
+  if (blockedByMe) throw httpError('Você bloqueou este leitor. Desbloqueie para seguir.', STATUS.CONFLICT, 'READER_BLOCKED_BY_YOU')
 
   const viewer = await authRepository.getUserById(viewerId)
   if (!viewer?.email_verified_at) {
-    throw httpError('Confirme seu e-mail para seguir outros leitores.', STATUS.FORBIDDEN)
+    throw httpError('Confirme seu e-mail para seguir outros leitores.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_FOLLOW')
   }
 
   const status = await socialRepository.requestFollow(viewerId, target.id)
@@ -44,20 +45,43 @@ export async function unfollow(viewerId, username) {
 export async function acceptRequest(viewerId, username) {
   const follower = await findUser(username)
   const accepted = await socialRepository.acceptFollow(follower.id, viewerId)
-  if (!accepted) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND)
+  if (!accepted) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND, 'REQUEST_NOT_FOUND')
   return { username: follower.name, status: 'accepted' }
 }
 
 export async function rejectRequest(viewerId, username) {
   const follower = await findUser(username)
   const removed = await socialRepository.deleteFollow(follower.id, viewerId, ['pending'])
-  if (!removed) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND)
+  if (!removed) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND, 'REQUEST_NOT_FOUND')
 }
 
 export async function removeFollower(viewerId, username) {
   const follower = await findUser(username)
   const removed = await socialRepository.deleteFollow(follower.id, viewerId, ['accepted'])
-  if (!removed) throw httpError('Seguidor não encontrado.', STATUS.NOT_FOUND)
+  if (!removed) throw httpError('Seguidor não encontrado.', STATUS.NOT_FOUND, 'FOLLOWER_NOT_FOUND')
+}
+
+/**
+ * Bloquear: o outro deixa de ver você na comunidade (e você a ele), os
+ * vínculos de seguir somem e ele não consegue pedir para seguir de novo.
+ * Ele não é avisado.
+ */
+export async function blockUser(viewerId, username) {
+  const target = await findUser(username)
+  if (target.id === viewerId) throw httpError('Você não pode bloquear a si mesmo.', STATUS.BAD_REQUEST, 'BLOCK_SELF')
+  await socialRepository.block(viewerId, target.id)
+  return { username: target.name, blocked: true }
+}
+
+export async function unblockUser(viewerId, username) {
+  const target = await findUser(username)
+  await socialRepository.unblock(viewerId, target.id)
+  return { username: target.name, blocked: false }
+}
+
+export async function blockedUsers(viewerId) {
+  const rows = await socialRepository.blockedList(viewerId)
+  return { blocked: rows.map(row => ({ username: row.username, since: row.created_at })) }
 }
 
 export async function connections(viewerId) {
diff --git a/backend/src/tests/integration/blocks.test.js b/backend/src/tests/integration/blocks.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..6d161334f8e4ef5197fc370e9f28b02141961e83
--- /dev/null
+++ b/backend/src/tests/integration/blocks.test.js
@@ -0,0 +1,130 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { confirmEmail } from '../helpers/confirmEmail.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+const tokens = {}
+const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
+
+async function signUp(name) {
+  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
+  await confirmEmail(name)
+  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
+  // Biblioteca pública + comunidade + aceita seguidores
+  await request(app).patch('/auth/me/visibility').set(auth(name)).send({ isPublic: true, showInCommunity: true, showActivity: true })
+}
+
+async function addBook(user, title, isbn) {
+  const res = await request(app).post('/library').set(auth(user)).field({ title, isbn }).field('authors', 'Autor')
+  if (res.statusCode !== 201) throw new Error(`addBook ${res.statusCode}: ${JSON.stringify(res.body)}`)
+  return res.body.bookId
+}
+
+beforeAll(async () => {
+  await clearDatabase()
+  for (const name of ['lia', 'teo']) await signUp(name)
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+describe('Códigos de erro', () => {
+  it('erro controlado leva code e params', async () => {
+    const res = await request(app).post('/auth/register').send({ username: 'x'.repeat(60), password: 'senha12345', email: 'x@example.com' })
+    expect(res.statusCode).toBe(400)
+    expect(res.body).toMatchObject({ code: 'USERNAME_TOO_LONG', params: { max: expect.any(Number) } })
+    expect(typeof res.body.error).toBe('string')
+  })
+
+  it('ISBN repetido → ISBN_TAKEN', async () => {
+    await addBook('lia', 'Duna', '9788576570653')
+    const res = await request(app).post('/library').set(auth('lia')).field({ title: 'Duna 2', isbn: '9788576570653' }).field('authors', 'Autor')
+    expect(res.statusCode).toBe(409)
+    expect(res.body.code).toBe('ISBN_TAKEN')
+  })
+
+  it('id inválido → PARAM_INVALID com o nome do parâmetro', async () => {
+    const res = await request(app).get('/library/abc').set(auth('lia'))
+    expect(res.statusCode).toBe(400)
+    expect(res.body).toMatchObject({ code: 'PARAM_INVALID', params: { param: 'id' } })
+  })
+})
+
+describe('Nomes reservados', () => {
+  it.each(['admin', 'Suporte', 's.u.p.o.r.t.e', 'librishelf_oficial', 'Ádmin'])('"%s" não pode ser cadastrado', async (name) => {
+    const res = await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `r${Date.now()}@example.com` })
+    expect(res.statusCode).toBe(400)
+    expect(res.body.code).toBe('USERNAME_RESERVED')
+  })
+
+  it('nem usado na troca de nome', async () => {
+    const res = await request(app).patch('/auth/me/username').set(auth('teo')).send({ username: 'moderador', password: 'senha12345' })
+    expect(res.statusCode).toBe(400)
+    expect(res.body.code).toBe('USERNAME_RESERVED')
+  })
+})
+
+describe('Bloquear leitor', () => {
+  it('bloquear apaga o seguir nos dois sentidos e impede novo pedido', async () => {
+    await request(app).post('/social/follow/lia').set(auth('teo'))
+    await request(app).post('/social/requests/teo/accept').set(auth('lia'))
+    await request(app).post('/social/follow/teo').set(auth('lia'))
+
+    const block = await request(app).post('/social/blocks/teo').set(auth('lia'))
+    expect(block.statusCode).toBe(200)
+
+    const conn = await request(app).get('/social/connections').set(auth('lia'))
+    expect([...conn.body.following, ...conn.body.followers, ...conn.body.requests]).toHaveLength(0)
+
+    // Quem foi bloqueado recebe a mesma resposta de "não aceita seguidores"
+    const again = await request(app).post('/social/follow/lia').set(auth('teo'))
+    expect(again.statusCode).toBe(404)
+    expect(again.body.code).toBe('READER_NOT_AVAILABLE')
+
+    // Quem bloqueou é avisado de que precisa desbloquear
+    const mine = await request(app).post('/social/follow/teo').set(auth('lia'))
+    expect(mine.statusCode).toBe(409)
+    expect(mine.body.code).toBe('READER_BLOCKED_BY_YOU')
+  })
+
+  it('somem um para o outro na comunidade', async () => {
+    const liaBook = await addBook('lia', 'Neuromancer', '9788576570912')
+    const teoBook = await addBook('teo', 'Neuromancer', '9788576570912')
+
+    const fromLia = await request(app).get(`/community/books/${liaBook}`).set(auth('lia'))
+    expect(fromLia.body.readers).toEqual([])
+    const fromTeo = await request(app).get(`/community/books/${teoBook}`).set(auth('teo'))
+    expect(fromTeo.body.readers).toEqual([])
+
+    const search = await request(app).get('/community/readers').query({ q: 'lia' }).set(auth('teo'))
+    expect(search.body.map(r => r.username)).not.toContain('lia')
+  })
+
+  it('perfil: quem bloqueou vê blockedByMe; o bloqueado não pode seguir e não sabe', async () => {
+    const asLia = await request(app).get('/library/public/u/teo/profile').set(auth('lia'))
+    expect(asLia.body.viewer).toMatchObject({ blockedByMe: true, followStatus: null, commonCount: null })
+
+    const asTeo = await request(app).get('/library/public/u/lia/profile').set(auth('teo'))
+    expect(asTeo.body.acceptsFollowers).toBe(false)
+    expect(asTeo.body.viewer).toMatchObject({ blockedByMe: false, commonCount: null })
+  })
+
+  it('lista e desbloqueio', async () => {
+    const list = await request(app).get('/social/blocks').set(auth('lia'))
+    expect(list.body.blocked.map(b => b.username)).toEqual(['teo'])
+
+    await request(app).delete('/social/blocks/teo').set(auth('lia'))
+    expect((await request(app).get('/social/blocks').set(auth('lia'))).body.blocked).toEqual([])
+
+    const follow = await request(app).post('/social/follow/teo').set(auth('lia'))
+    expect(follow.statusCode).toBe(200)
+  })
+
+  it('não dá para bloquear a si mesmo', async () => {
+    const res = await request(app).post('/social/blocks/lia').set(auth('lia'))
+    expect(res.statusCode).toBe(400)
+    expect(res.body.code).toBe('BLOCK_SELF')
+  })
+})
diff --git a/backend/src/tests/unit/reservedNames.test.js b/backend/src/tests/unit/reservedNames.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..eadaf5637c4786cac88780e5a5a89516e8ff6022
--- /dev/null
+++ b/backend/src/tests/unit/reservedNames.test.js
@@ -0,0 +1,11 @@
+import { isReservedUsername } from '../../utils/reservedNames.js'
+
+describe('isReservedUsername', () => {
+  it.each(['admin', 'ADMIN', 'Suporte', 'su.por-te', 'Ádmin', 'librishelf', 'LibriShelf_BR', 'api', 'u'])('%s é reservado', name => {
+    expect(isReservedUsername(name)).toBe(true)
+  })
+
+  it.each(['ana', 'ana.leitora', 'busca', 'administra.dora', 'support42', 'leitor_u'])('%s é livre', name => {
+    expect(isReservedUsername(name)).toBe(false)
+  })
+})
diff --git a/backend/src/utils/httpError.js b/backend/src/utils/httpError.js
new file mode 100644
index 0000000000000000000000000000000000000000..44c51187302b676f48313929a2d7ed74386b5a74
--- /dev/null
+++ b/backend/src/utils/httpError.js
@@ -0,0 +1,26 @@
+/**
+ * Erro "controlado" (status < 500 ou 502 de serviço externo): a mensagem vai
+ * para o cliente. Junto vai um código estável (ex.: 'ISBN_TAKEN') e, se
+ * houver, os parâmetros da mensagem ({ max: 200 }). O frontend traduz pelo
+ * código; a mensagem em português fica como reserva para clientes antigos.
+ *
+ * O código fica em `errorCode` (e não `code`) para não se confundir com os
+ * códigos de erro do Postgres ('23505'...).
+ */
+export function httpError(message, status, errorCode, params) {
+  const error = new Error(message)
+  error.status = status
+  if (errorCode) error.errorCode = errorCode
+  if (params) error.params = params
+  return error
+}
+
+/** Corpo JSON padrão de erro: { error, code?, params? } */
+export function errorBody(message, errorCode, params) {
+  const body = { error: message }
+  if (errorCode) body.code = errorCode
+  if (params) body.params = params
+  return body
+}
+
+export default httpError
diff --git a/backend/src/utils/nameList.js b/backend/src/utils/nameList.js
index 6de61c39b0c282d50ca6ed9f6ef627bfa6bee704..59a7695395c3c0fcf5a02b9d449bcace99e6dcdc 100644
--- a/backend/src/utils/nameList.js
+++ b/backend/src/utils/nameList.js
@@ -57,10 +57,22 @@ export function parseTagList(value) {
   return dedupe(toArray(value).flatMap(item => (typeof item === 'string' ? item.split(',') : [])))
 }
 
-/** Erro de validação (status 400) ou null. */
-export function validateNameList(names, label) {
-  if (names.length > MAX_NAMES) return `No máximo ${MAX_NAMES} ${label}.`
+/**
+ * Erro de validação da lista ou null: { message, code, params } — o código
+ * vai para o cliente traduzir (utils/httpError.js).
+ */
+export function nameListError(names, label) {
+  if (names.length > MAX_NAMES) {
+    return { message: `No máximo ${MAX_NAMES} ${label}.`, code: 'NAMES_TOO_MANY', params: { max: MAX_NAMES } }
+  }
   const tooLong = names.find(name => name.length > MAX_NAME_LENGTH)
-  if (tooLong) return `Nome muito longo em ${label} (máximo ${MAX_NAME_LENGTH} caracteres).`
+  if (tooLong) {
+    return { message: `Nome muito longo em ${label} (máximo ${MAX_NAME_LENGTH} caracteres).`, code: 'NAME_TOO_LONG', params: { max: MAX_NAME_LENGTH } }
+  }
   return null
 }
+
+/** Só a mensagem do erro (ou null). */
+export function validateNameList(names, label) {
+  return nameListError(names, label)?.message ?? null
+}
diff --git a/backend/src/utils/passwordPolicy.js b/backend/src/utils/passwordPolicy.js
index b944b24cbb4035cfed62132e95061422135d0633..85eff5284b061055c4aa89bce6e294fe1777d349 100644
--- a/backend/src/utils/passwordPolicy.js
+++ b/backend/src/utils/passwordPolicy.js
@@ -5,19 +5,19 @@ const MAX_BYTES = 72
 
 function validatePassword(password) {
   if (typeof password !== 'string' || password.length < MIN_LENGTH) {
-    return { valid: false, reason: `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.` }
+    return { valid: false, reason: `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`, code: 'PASSWORD_TOO_SHORT', params: { min: MIN_LENGTH } }
   }
 
   if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
-    return { valid: false, reason: `A senha pode ter no máximo ${MAX_BYTES} bytes.` }
+    return { valid: false, reason: `A senha pode ter no máximo ${MAX_BYTES} bytes.`, code: 'PASSWORD_TOO_LONG', params: { max: MAX_BYTES } }
   }
 
   if (!/[a-zA-Z]/.test(password)) {
-    return { valid: false, reason: 'A senha precisa conter pelo menos uma letra.' }
+    return { valid: false, reason: 'A senha precisa conter pelo menos uma letra.', code: 'PASSWORD_NEEDS_LETTER' }
   }
 
   if (!/[0-9]/.test(password)) {
-    return { valid: false, reason: 'A senha precisa conter pelo menos um número.' }
+    return { valid: false, reason: 'A senha precisa conter pelo menos um número.', code: 'PASSWORD_NEEDS_NUMBER' }
   }
 
   return { valid: true }
diff --git a/backend/src/utils/reservedNames.js b/backend/src/utils/reservedNames.js
new file mode 100644
index 0000000000000000000000000000000000000000..0e6322c9b5e489f93537af7b76bad85c8b672912
--- /dev/null
+++ b/backend/src/utils/reservedNames.js
@@ -0,0 +1,38 @@
+/**
+ * Nomes de usuário que ninguém pode pegar: o nome vira a página pública
+ * /u/<nome>, então "admin", "suporte" ou "librishelf" se passariam pelo
+ * próprio site. Vale no cadastro e na troca de nome; contas antigas com um
+ * desses nomes continuam como estão.
+ *
+ * A comparação ignora maiúsculas, acentos e os separadores . _ - (então
+ * "Su.porte" e "s_u_p_o_r_t_e" também ficam de fora). Qualquer nome que comece
+ * com "librishelf" também.
+ */
+const RESERVED = [
+  // o próprio site e quem fala por ele
+  'librishelf', 'admin', 'administrator', 'administrador', 'adm', 'root', 'sysadmin', 'system', 'sistema',
+  'staff', 'equipe', 'team', 'moderator', 'moderador', 'mod', 'oficial', 'official',
+  'suporte', 'support', 'ajuda', 'help', 'helpdesk', 'contato', 'contact', 'sac', 'atendimento',
+  'security', 'seguranca', 'abuse', 'postmaster', 'hostmaster', 'webmaster', 'noreply', 'naoresponda',
+  'mail', 'email', 'newsletter', 'billing', 'financeiro', 'privacy', 'privacidade', 'legal', 'terms', 'termos',
+  // rotas e palavras do app
+  'api', 'app', 'www', 'u', 'me', 'login', 'logout', 'entrar', 'sair', 'register', 'signup', 'signin',
+  'cadastro', 'settings', 'configuracoes', 'conta', 'account', 'profile', 'perfil', 'dashboard', 'painel',
+  'books', 'livros', 'library', 'biblioteca', 'authors', 'autores', 'publishers', 'editoras', 'tags',
+  'categorias', 'community', 'comunidade', 'feed', 'uploads', 'assets', 'static',
+  'forgotpassword', 'resetpassword', 'verifyemail', 'lists', 'listas', 'reviews', 'resenhas', 'retrospectiva',
+  // valores que confundem
+  'null', 'undefined', 'anonymous', 'anonimo'
+]
+
+const normalize = name => String(name)
+  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
+  .toLowerCase()
+  .replace(/[._-]/g, '')
+
+const RESERVED_SET = new Set(RESERVED.map(normalize))
+
+export function isReservedUsername(name) {
+  const key = normalize(name)
+  return RESERVED_SET.has(key) || key.startsWith('librishelf')
+}
diff --git a/backend/src/utils/sendError.js b/backend/src/utils/sendError.js
index ae057093a978fce65a59cf29843fb0af94130c53..c8e4d66a6d7cc160848175ba860f341094e8c0eb 100644
--- a/backend/src/utils/sendError.js
+++ b/backend/src/utils/sendError.js
@@ -1,5 +1,6 @@
 import STATUS from './statusCodes.js'
 import logger from './logger.js'
+import { errorBody } from './httpError.js'
 
 const GENERIC_MESSAGE = 'Erro interno do servidor.'
 
@@ -12,7 +13,9 @@ function sendError(res, error, context) {
     logger.error(context || 'Erro não tratado', { message: error.message, stack: error.stack })
   }
 
-  return res.status(status).json({ error: message })
+  return res.status(status).json(isControlled
+    ? errorBody(message, error.errorCode, error.params)
+    : errorBody(message))
 }
 
 export default sendError
\ No newline at end of file
diff --git a/frontend/nginx.conf b/frontend/nginx.conf
index 0119c00a0faaacdde0c428ccc31a079a200a7eb7..65a5ab85955ca92e14ba995270d6402dd84f7a07 100644
--- a/frontend/nginx.conf
+++ b/frontend/nginx.conf
@@ -36,6 +36,9 @@ server {
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
     proxy_read_timeout 60s;
+
+    # Respostas da API (capas incluídas) fora dos buscadores
+    add_header X-Robots-Tag "noindex" always;
   }
 
   # Arquivos com hash no nome gerados pelo Vite: cache longo e imutável.
@@ -45,6 +48,17 @@ server {
     add_header X-Content-Type-Options "nosniff" always;
   }
 
+  # Bibliotecas públicas: abrem por link, mas não entram em buscadores.
+  location /u/ {
+    try_files $uri /index.html;
+    add_header Cache-Control "no-cache";
+    add_header X-Robots-Tag "noindex, nofollow" always;
+    add_header X-Content-Type-Options "nosniff" always;
+    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
+    add_header X-Frame-Options "DENY" always;
+    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
+  }
+
   # index.html sempre revalidado, para pegar o build novo após deploy.
   location / {
     try_files $uri $uri/ /index.html;
diff --git a/frontend/public/robots.txt b/frontend/public/robots.txt
new file mode 100644
index 0000000000000000000000000000000000000000..2859ba9c6fc50aa00a2b163c361f013c3a1f50ae
--- /dev/null
+++ b/frontend/public/robots.txt
@@ -0,0 +1,9 @@
+# Bibliotecas públicas (/u/...) não entram em buscadores: quem ativa o
+# compartilhamento pensa no link, não no Google. Elas respondem com
+# X-Robots-Tag: noindex (nginx.conf) e por isso precisam continuar
+# rastreáveis — um Disallow aqui esconderia o noindex.
+User-agent: *
+Disallow: /api/
+Disallow: /reset-password
+Disallow: /verify-email
+Allow: /
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 521a165961ee938b591e15c81c5d525a142df30b..8af29dd004e12ce1e8fbdad98e6776b27fa0489a 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -523,14 +523,16 @@
         "title": "Public library",
         "paragraphs": [
           "Your library is private by default. If you turn on sharing in Account, anyone with your link can see your books and covers, and some covers may appear on the site's sign-in pages.",
-          "You can turn it off whenever you want, and the change is immediate."
+          "You can turn it off whenever you want, and the change is immediate.",
+          "Public libraries don't show up in search engines like Google: the site asks for them not to be indexed."
         ]
       },
       {
         "title": "Community and followers",
         "paragraphs": [
           "Both options start off and live in Account. \"Join the community\" (only with a public library) lets other signed-in readers see that you have the same book, your rating for it and how many books you share.",
-          "\"Accept followers\" lets other people ask to follow you. Only those you approve see, in their feed, the books you add and finish. You can remove followers or turn the option off at any time, and the change takes effect immediately."
+          "\"Accept followers\" lets other people ask to follow you. Only those you approve see, in their feed, the books you add and finish. You can remove followers or turn the option off at any time, and the change takes effect immediately.",
+          "You can block a reader from their public library: you stop seeing each other in the community and they can't ask to follow you."
         ]
       },
       {
@@ -820,5 +822,117 @@
   "password": {
     "show": "Show password",
     "hide": "Hide password"
+  },
+  "errors": {
+    "UNKNOWN": "Something went wrong. Please try again.",
+    "INTERNAL_ERROR": "Server error. Please try again shortly.",
+    "NETWORK": "Can't reach the server. Check your connection.",
+    "SESSION_EXPIRED": "Your session expired. Please sign in again.",
+    "RATE_LIMIT": "Too many requests. Try again shortly.",
+    "RATE_LIMIT_LOGIN": "Too many login attempts. Try again in a few minutes.",
+    "RATE_LIMIT_REGISTER": "Too many sign-up attempts. Try again later.",
+    "RATE_LIMIT_UPLOAD": "Too many uploads in a short time. Try again in a few minutes.",
+    "RATE_LIMIT_ISBN": "Too many ISBN lookups. Wait a minute.",
+    "RATE_LIMIT_ACTIONS": "Too many actions in a short time. Try again in a few minutes.",
+    "RATE_LIMIT_EMAIL": "Too many email requests. Try again later.",
+    "RATE_LIMIT_ATTEMPTS": "Too many attempts. Try again in a few minutes.",
+    "PARAM_INVALID": "Invalid parameter: {param}.",
+    "FIELD_INVALID": "Invalid value in {field}.",
+    "FIELD_REQUIRED": "Fill in {field}.",
+    "DATE_INVALID": "Invalid date in {field}.",
+    "READ_DATE_FUTURE": "The read date can't be in the future.",
+    "SERIES_TOO_LONG": "The series name can have up to {max} characters.",
+    "VOLUME_INVALID": "The volume must be a number from 0 to 9999.",
+    "NOTES_TOO_LONG": "The note can have up to {max} characters.",
+    "LIBRARY_NOT_FOUND": "This library doesn't exist or isn't public.",
+    "RATING_INVALID": "The rating must be 1 to 5 stars.",
+    "AUTHORS_REQUIRED": "Add at least one author.",
+    "NAMES_TOO_MANY": "At most {max} names.",
+    "NAME_TOO_LONG": "Each name can have up to {max} characters.",
+    "TAG_REQUIRED": "Enter the category.",
+    "ISBN_TAKEN": "You already have a book with this ISBN.",
+    "ISBN_INVALID": "Invalid ISBN.",
+    "ISBN_NOT_FOUND": "No book found for this ISBN.",
+    "BOOK_NOT_FOUND": "Book not found.",
+    "BOOK_ALREADY_ON_SHELF": "This book is already on your shelf.",
+    "PERMISSION_DENIED": "You don't have permission to do that.",
+    "STATUS_INVALID": "Invalid reading status.",
+    "BATCH_ACTION_INVALID": "Invalid batch action.",
+    "BATCH_IDS_INVALID": "Select 1 to {max} books.",
+    "BATCH_BOOKS_NOT_FOUND": "Some books weren't found in your library.",
+    "COVER_INVALID": "Invalid cover.",
+    "COVER_TOO_LARGE": "The cover found is too large.",
+    "COVER_NOT_FOUND": "Cover not found.",
+    "IMAGE_INVALID": "The uploaded file isn't a valid image.",
+    "IMAGE_ONLY": "Only image files are allowed.",
+    "IMAGE_REQUIRED": "No image uploaded.",
+    "IMAGE_TOO_LARGE": "The image can be at most {max} MB.",
+    "FILE_TOO_LARGE": "The file can be at most {max} MB.",
+    "CSV_REQUIRED": "Upload a .csv file.",
+    "CSV_FORMAT": "Unrecognized format: upload the CSV exported from Goodreads or Librishelf.",
+    "CSV_EMPTY": "The file has no books.",
+    "CSV_TOO_MANY": "The file has {count} books; the import limit is {max}.",
+    "YEAR_INVALID": "Invalid year.",
+    "GOAL_INVALID": "The goal must be a number from 1 to 1000.",
+    "MERGE_FIELDS_REQUIRED": "Choose the names to merge and the final name.",
+    "NAMES_NOT_FOUND": "One of the names no longer exists in your library.",
+    "CURRENT_PASSWORD_REQUIRED": "Enter your current password.",
+    "CURRENT_PASSWORD_WRONG": "Current password is incorrect.",
+    "CREDENTIALS_REQUIRED": "Enter username and password.",
+    "INVALID_CREDENTIALS": "Incorrect username or password.",
+    "REGISTER_FIELDS_REQUIRED": "Fill in username, email and password.",
+    "USERNAME_REQUIRED": "Enter the username.",
+    "USERNAME_TOO_LONG": "The username can have at most {max} characters.",
+    "USERNAME_INVALID": "Use only letters, numbers, dot, hyphen and underscore.",
+    "USERNAME_RESERVED": "This name is reserved. Choose another one.",
+    "USERNAME_TAKEN": "This username is already taken.",
+    "USERNAME_OR_EMAIL_TAKEN": "This username or email is already taken.",
+    "EMAIL_INVALID": "Invalid email.",
+    "EMAIL_SAME": "This is already your email.",
+    "EMAIL_TAKEN": "This email is already used by another account.",
+    "EMAIL_SEND_FAILED": "Couldn't send the email right now. Try again in a few minutes.",
+    "EMAIL_NOT_VERIFIED_PUBLIC": "Confirm your email to make your library public or join the community.",
+    "EMAIL_NOT_VERIFIED_FOLLOW": "Confirm your email to follow other readers.",
+    "PASSWORD_TOO_SHORT": "The password must have at least {min} characters.",
+    "PASSWORD_TOO_LONG": "The password can be at most {max} bytes.",
+    "PASSWORD_NEEDS_LETTER": "The password must have at least one letter.",
+    "PASSWORD_NEEDS_NUMBER": "The password must have at least one number.",
+    "PASSWORD_SAME": "The new password must be different from the current one.",
+    "LINK_INVALID": "This link is invalid or expired. Request a new one.",
+    "NOTHING_TO_UPDATE": "Nothing to change.",
+    "USER_NOT_FOUND": "Account not found.",
+    "READER_NOT_AVAILABLE": "Reader not found or not accepting followers.",
+    "READER_BLOCKED_BY_YOU": "You blocked this reader. Unblock to follow.",
+    "FOLLOW_SELF": "You can't follow yourself.",
+    "BLOCK_SELF": "You can't block yourself.",
+    "REQUEST_NOT_FOUND": "Request not found.",
+    "FOLLOWER_NOT_FOUND": "Follower not found.",
+    "fields": {
+      "title": "title",
+      "isbn": "ISBN",
+      "readDate": "read date",
+      "startedAt": "start date",
+      "pubDate": "publication date",
+      "publicationDate": "publication date",
+      "series": "series",
+      "notes": "note",
+      "olWorkKey": "Open Library work",
+      "olEditionKey": "Open Library edition",
+      "isPublic": "public library",
+      "showInCommunity": "community",
+      "showActivity": "activity"
+    }
+  },
+  "block": {
+    "block": "Block {name}",
+    "unblock": "Unblock",
+    "moreActions": "More actions",
+    "confirmTitle": "Block {name}?",
+    "confirmText": "You'll stop following each other and seeing each other in the community, and this person won't be able to ask to follow you. They aren't notified. You can undo it in Account.",
+    "confirmButton": "Block",
+    "blocked": "{name} was blocked.",
+    "unblocked": "{name} was unblocked.",
+    "listTitle": "Blocked readers",
+    "listEmpty": "Nobody blocked. To block someone, open their public library and use the ⋯ menu."
   }
 }
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index c4be3be62565843821a8f582f18b467a7f8abf24..d00f3f741ce64d3fa5f89a8071c21a8d8ef1fde3 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -523,14 +523,16 @@
         "title": "Biblioteca pública",
         "paragraphs": [
           "Sua biblioteca é privada por padrão. Se você ativar o compartilhamento em Conta, qualquer pessoa com o seu link pode ver seus livros e capas, e algumas capas podem aparecer nas telas de entrada do site.",
-          "Você pode desativar quando quiser, e a mudança vale na hora."
+          "Você pode desativar quando quiser, e a mudança vale na hora.",
+          "Bibliotecas públicas não aparecem em buscadores como o Google: o site pede para não serem indexadas."
         ]
       },
       {
         "title": "Comunidade e seguidores",
         "paragraphs": [
           "As duas opções começam desligadas e ficam em Conta. \"Participar da comunidade\" (só com a biblioteca pública) deixa outros leitores logados verem que vocês têm o mesmo livro, sua nota para ele e quantos livros vocês têm em comum.",
-          "\"Aceitar seguidores\" deixa outras pessoas pedirem para seguir você. Só quem você aprovar vê, no feed, os livros que você adiciona e termina de ler. Você pode remover seguidores ou desligar a opção quando quiser, e a mudança vale na hora."
+          "\"Aceitar seguidores\" deixa outras pessoas pedirem para seguir você. Só quem você aprovar vê, no feed, os livros que você adiciona e termina de ler. Você pode remover seguidores ou desligar a opção quando quiser, e a mudança vale na hora.",
+          "Você pode bloquear um leitor pela biblioteca pública dele: vocês deixam de se ver na comunidade e ele não pode pedir para seguir você."
         ]
       },
       {
@@ -820,5 +822,117 @@
   "password": {
     "show": "Mostrar senha",
     "hide": "Esconder senha"
+  },
+  "errors": {
+    "UNKNOWN": "Algo deu errado. Tente de novo.",
+    "INTERNAL_ERROR": "Erro no servidor. Tente de novo em instantes.",
+    "NETWORK": "Sem conexão com o servidor. Confira sua internet.",
+    "SESSION_EXPIRED": "Sua sessão expirou. Entre de novo.",
+    "RATE_LIMIT": "Muitas requisições. Tente de novo em instantes.",
+    "RATE_LIMIT_LOGIN": "Muitas tentativas de login. Tente de novo em alguns minutos.",
+    "RATE_LIMIT_REGISTER": "Muitas tentativas de cadastro. Tente de novo mais tarde.",
+    "RATE_LIMIT_UPLOAD": "Muitos envios em pouco tempo. Tente de novo em alguns minutos.",
+    "RATE_LIMIT_ISBN": "Muitas buscas por ISBN em pouco tempo. Aguarde um minuto.",
+    "RATE_LIMIT_ACTIONS": "Muitas ações em pouco tempo. Tente de novo em alguns minutos.",
+    "RATE_LIMIT_EMAIL": "Muitos pedidos de e-mail. Tente de novo mais tarde.",
+    "RATE_LIMIT_ATTEMPTS": "Muitas tentativas. Tente de novo em alguns minutos.",
+    "PARAM_INVALID": "Parâmetro inválido: {param}.",
+    "FIELD_INVALID": "Valor inválido em {field}.",
+    "FIELD_REQUIRED": "Preencha {field}.",
+    "DATE_INVALID": "Data inválida em {field}.",
+    "READ_DATE_FUTURE": "A data de leitura não pode estar no futuro.",
+    "SERIES_TOO_LONG": "O nome da série pode ter até {max} caracteres.",
+    "VOLUME_INVALID": "O volume precisa ser um número de 0 a 9999.",
+    "NOTES_TOO_LONG": "A anotação pode ter até {max} caracteres.",
+    "LIBRARY_NOT_FOUND": "Esta biblioteca não existe ou não é pública.",
+    "RATING_INVALID": "A nota precisa ser de 1 a 5 estrelas.",
+    "AUTHORS_REQUIRED": "Informe pelo menos um autor.",
+    "NAMES_TOO_MANY": "No máximo {max} nomes.",
+    "NAME_TOO_LONG": "Cada nome pode ter até {max} caracteres.",
+    "TAG_REQUIRED": "Informe a categoria.",
+    "ISBN_TAKEN": "Você já tem um livro com este ISBN.",
+    "ISBN_INVALID": "ISBN inválido.",
+    "ISBN_NOT_FOUND": "Nenhum livro encontrado para este ISBN.",
+    "BOOK_NOT_FOUND": "Livro não encontrado.",
+    "BOOK_ALREADY_ON_SHELF": "Este livro já está na sua estante.",
+    "PERMISSION_DENIED": "Você não tem permissão para isso.",
+    "STATUS_INVALID": "Status de leitura inválido.",
+    "BATCH_ACTION_INVALID": "Ação em lote inválida.",
+    "BATCH_IDS_INVALID": "Selecione de 1 a {max} livros.",
+    "BATCH_BOOKS_NOT_FOUND": "Alguns livros não foram encontrados na sua biblioteca.",
+    "COVER_INVALID": "Capa inválida.",
+    "COVER_TOO_LARGE": "A capa encontrada é grande demais.",
+    "COVER_NOT_FOUND": "Capa não encontrada.",
+    "IMAGE_INVALID": "O arquivo enviado não é uma imagem válida.",
+    "IMAGE_ONLY": "Envie só arquivos de imagem.",
+    "IMAGE_REQUIRED": "Nenhuma imagem enviada.",
+    "IMAGE_TOO_LARGE": "A imagem pode ter no máximo {max} MB.",
+    "FILE_TOO_LARGE": "O arquivo pode ter no máximo {max} MB.",
+    "CSV_REQUIRED": "Envie um arquivo .csv.",
+    "CSV_FORMAT": "Formato não reconhecido: envie o CSV exportado do Goodreads ou do Librishelf.",
+    "CSV_EMPTY": "O arquivo não tem nenhum livro.",
+    "CSV_TOO_MANY": "O arquivo tem {count} livros; o limite por importação é {max}.",
+    "YEAR_INVALID": "Ano inválido.",
+    "GOAL_INVALID": "A meta precisa ser um número de 1 a 1000.",
+    "MERGE_FIELDS_REQUIRED": "Escolha os nomes a juntar e o nome final.",
+    "NAMES_NOT_FOUND": "Algum dos nomes não existe mais na sua biblioteca.",
+    "CURRENT_PASSWORD_REQUIRED": "Informe a senha atual.",
+    "CURRENT_PASSWORD_WRONG": "Senha atual incorreta.",
+    "CREDENTIALS_REQUIRED": "Informe usuário e senha.",
+    "INVALID_CREDENTIALS": "Usuário ou senha incorretos.",
+    "REGISTER_FIELDS_REQUIRED": "Preencha usuário, e-mail e senha.",
+    "USERNAME_REQUIRED": "Informe o nome de usuário.",
+    "USERNAME_TOO_LONG": "O nome de usuário pode ter no máximo {max} caracteres.",
+    "USERNAME_INVALID": "Use só letras, números, ponto, hífen e sublinhado.",
+    "USERNAME_RESERVED": "Este nome é reservado. Escolha outro.",
+    "USERNAME_TAKEN": "Este nome de usuário já está em uso.",
+    "USERNAME_OR_EMAIL_TAKEN": "Este nome de usuário ou e-mail já está em uso.",
+    "EMAIL_INVALID": "E-mail inválido.",
+    "EMAIL_SAME": "Este já é o seu e-mail.",
+    "EMAIL_TAKEN": "Este e-mail já está em uso em outra conta.",
+    "EMAIL_SEND_FAILED": "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.",
+    "EMAIL_NOT_VERIFIED_PUBLIC": "Confirme seu e-mail para deixar a biblioteca pública ou participar da comunidade.",
+    "EMAIL_NOT_VERIFIED_FOLLOW": "Confirme seu e-mail para seguir outros leitores.",
+    "PASSWORD_TOO_SHORT": "A senha precisa ter pelo menos {min} caracteres.",
+    "PASSWORD_TOO_LONG": "A senha pode ter no máximo {max} bytes.",
+    "PASSWORD_NEEDS_LETTER": "A senha precisa ter pelo menos uma letra.",
+    "PASSWORD_NEEDS_NUMBER": "A senha precisa ter pelo menos um número.",
+    "PASSWORD_SAME": "A nova senha precisa ser diferente da atual.",
+    "LINK_INVALID": "Este link é inválido ou expirou. Peça um novo.",
+    "NOTHING_TO_UPDATE": "Nada para alterar.",
+    "USER_NOT_FOUND": "Conta não encontrada.",
+    "READER_NOT_AVAILABLE": "Leitor não encontrado ou não aceita seguidores.",
+    "READER_BLOCKED_BY_YOU": "Você bloqueou este leitor. Desbloqueie para seguir.",
+    "FOLLOW_SELF": "Você não pode seguir a si mesmo.",
+    "BLOCK_SELF": "Você não pode bloquear a si mesmo.",
+    "REQUEST_NOT_FOUND": "Pedido não encontrado.",
+    "FOLLOWER_NOT_FOUND": "Seguidor não encontrado.",
+    "fields": {
+      "title": "título",
+      "isbn": "ISBN",
+      "readDate": "data de leitura",
+      "startedAt": "data de início",
+      "pubDate": "data de publicação",
+      "publicationDate": "data de publicação",
+      "series": "série",
+      "notes": "anotação",
+      "olWorkKey": "obra do Open Library",
+      "olEditionKey": "edição do Open Library",
+      "isPublic": "biblioteca pública",
+      "showInCommunity": "comunidade",
+      "showActivity": "atividade"
+    }
+  },
+  "block": {
+    "block": "Bloquear {name}",
+    "unblock": "Desbloquear",
+    "moreActions": "Mais ações",
+    "confirmTitle": "Bloquear {name}?",
+    "confirmText": "Vocês deixam de se seguir e de se ver na comunidade, e esta pessoa não poderá pedir para seguir você. Ela não é avisada. Dá para desfazer em Conta.",
+    "confirmButton": "Bloquear",
+    "blocked": "{name} foi bloqueado.",
+    "unblocked": "{name} foi desbloqueado.",
+    "listTitle": "Leitores bloqueados",
+    "listEmpty": "Ninguém bloqueado. Para bloquear, abra a biblioteca pública da pessoa e use o menu ⋯."
   }
 }
diff --git a/frontend/src/router/index.js b/frontend/src/router/index.js
index 9edf2d7a40cb501df7f0fb045a9e037b988df03e..7e4e548843c9840acfea1eb46315f8171d1a1b6c 100644
--- a/frontend/src/router/index.js
+++ b/frontend/src/router/index.js
@@ -10,6 +10,7 @@ import { installRouteFocus } from '../services/routeFocus.js'
  *   standalone   — tela cheia, sem o menu lateral
  *   public       — acessível com ou sem sessão (mostra o menu se houver sessão)
  *   title        — chave de pageTitle.* para o título da aba (services/pageTitle.js)
+ *   noindex      — fora de buscadores (o nginx também manda X-Robots-Tag)
  *
  * Views carregadas sob demanda: o chart.js do Dashboard e as telas internas
  * não entram no bundle do login.
@@ -33,7 +34,7 @@ const router = createRouter({
     { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPassword.vue'), meta: { standalone: true, title: 'resetPassword' } },
     { path: '/verify-email', name: 'verify-email', component: () => import('../views/VerifyEmail.vue'), meta: { standalone: true, title: 'verifyEmail' } },
 
-    { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true, title: 'publicLibrary' } },
+    { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true, title: 'publicLibrary', noindex: true } },
     { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { public: true, title: 'privacy' } },
 
     { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFound.vue'), meta: { public: true, title: 'notFound' } }
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 01c4932c0e12fdecb65186c495cd25bd176c0dd2..a22b89c3909d33b4d73402058f0215a7203fa222 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -207,6 +207,18 @@ export default {
     return client.delete(`/social/follow/${enc(username)}`)
   },
 
+  getBlocked() {
+    return client.get('/social/blocks')
+  },
+
+  block(username) {
+    return client.post(`/social/blocks/${enc(username)}`)
+  },
+
+  unblock(username) {
+    return client.delete(`/social/blocks/${enc(username)}`)
+  },
+
   acceptRequest(username) {
     return client.post(`/social/requests/${enc(username)}/accept`)
   },
diff --git a/frontend/src/services/fetchClient.js b/frontend/src/services/fetchClient.js
index 877cd94967c9d586a5b1a82248349119cb7216f4..eb3e818396edaaa5423b9c20901fe7d2ce7c7fc3 100644
--- a/frontend/src/services/fetchClient.js
+++ b/frontend/src/services/fetchClient.js
@@ -1,4 +1,5 @@
 import { API_URL } from '../config/site.js'
+import i18n from '../i18n.js'
 
 // Rotas de auth respondem 401 por credencial errada (login, senha atual
 // incorreta), não por sessão expirada.
@@ -18,17 +19,33 @@ export class ApiError extends Error {
     this.name = 'ApiError'
     this.status = status
     this.body = body
+    this.code = body?.code ?? null
   }
 }
 
+/**
+ * Mensagem no idioma da pessoa: a API manda um código estável (ISBN_TAKEN,
+ * USERNAME_RESERVED...) e, às vezes, parâmetros ({ max: 200 }). Sem tradução
+ * para o código, fica a mensagem que veio do servidor.
+ */
+export function translateApiError(code, params, fallback) {
+  const { t, te } = i18n.global
+  if (!code || !te(`errors.${code}`)) return fallback
+  const values = { ...(params || {}) }
+  if (values.field && te(`errors.fields.${values.field}`)) values.field = t(`errors.fields.${values.field}`)
+  return t(`errors.${code}`, values)
+}
+
 async function parseError(response) {
   const text = await response.text()
 
   try {
     const json = JSON.parse(text)
-    return new ApiError(json.error || json.message || 'Erro desconhecido', response.status, json)
+    const raw = json.error || json.message || i18n.global.t('errors.UNKNOWN')
+    return new ApiError(translateApiError(json.code, json.params, raw), response.status, json)
   } catch {
-    return new ApiError(text || 'Erro na requisição', response.status, null)
+    const fallback = response.status >= 500 ? i18n.global.t('errors.INTERNAL_ERROR') : i18n.global.t('errors.UNKNOWN')
+    return new ApiError(text && text.length < 200 && !text.startsWith('<') ? text : fallback, response.status, null)
   }
 }
 
@@ -52,7 +69,14 @@ async function client(endpoint, { body, ...customConfig } = {}) {
     }
   }
 
-  const response = await fetch(`${API_URL}${endpoint}`, config)
+  let response
+  try {
+    response = await fetch(`${API_URL}${endpoint}`, config)
+  } catch (error) {
+    // Cancelada de propósito: quem chamou trata. Senão é rede (sem internet, servidor fora).
+    if (error.name === 'AbortError') throw error
+    throw new ApiError(i18n.global.t('errors.NETWORK'), 0, null)
+  }
 
   if (response.status === 401) {
     const isSessionCheck = endpoint === SESSION_ENDPOINT
@@ -60,7 +84,7 @@ async function client(endpoint, { body, ...customConfig } = {}) {
 
     if (!isCredentialCheck) {
       onSessionExpired({ silent: isSessionCheck })
-      throw new ApiError('Sessão expirada. Faça login novamente.', 401, null)
+      throw new ApiError(i18n.global.t('errors.SESSION_EXPIRED'), 401, null)
     }
   }
 
diff --git a/frontend/src/services/pageTitle.js b/frontend/src/services/pageTitle.js
index b5dcb045d10ba94a8a16672dffab8cde70eff76f..63292fbd440248f71032fa177b86197df29d1cbe 100644
--- a/frontend/src/services/pageTitle.js
+++ b/frontend/src/services/pageTitle.js
@@ -24,11 +24,27 @@ function render() {
   document.title = [overlay, routeTitle(currentRoute), APP_NAME].filter(Boolean).join(' · ')
 }
 
+/** <meta name="robots" content="noindex"> nas rotas com meta.noindex. */
+function setRobots(noindex) {
+  let tag = document.head.querySelector('meta[name="robots"]')
+  if (!noindex) {
+    tag?.remove()
+    return
+  }
+  if (!tag) {
+    tag = document.createElement('meta')
+    tag.name = 'robots'
+    document.head.appendChild(tag)
+  }
+  tag.content = 'noindex, nofollow'
+}
+
 /** Chamado pelo router.afterEach. */
 export function setRouteTitle(route) {
   currentRoute = route
   overlay = ''
   render()
+  setRobots(Boolean(route?.meta?.noindex))
 }
 
 /** Algo aberto por cima da página (o livro); '' tira. */
diff --git a/frontend/src/utils/bookFormErrors.js b/frontend/src/utils/bookFormErrors.js
index 931f8f77d5037bcb5f397758156865ae731f3947..2b0d8ba0de83f757af708adb942a6426322fb4d9 100644
--- a/frontend/src/utils/bookFormErrors.js
+++ b/frontend/src/utils/bookFormErrors.js
@@ -1,9 +1,9 @@
 /**
  * Erros do servidor no formulário de livro → campo e mensagem traduzida.
- * O backend responde { error: 'texto' } com o status HTTP; aqui o texto é
- * reconhecido para mostrar o erro embaixo do campo certo (e não num toast
- * que some em poucos segundos). O que não for reconhecido volta null e vira
- * toast, como antes.
+ * O backend responde { error, code, params }: pelo código o erro vai para
+ * embaixo do campo certo (e não num toast que some em poucos segundos). Sem
+ * código (servidor antigo), o texto original ainda é reconhecido. O que não
+ * for reconhecido volta null e vira toast, como antes.
  */
 
 /** Ordem dos campos na tela: o primeiro com erro recebe o foco. */
@@ -23,10 +23,44 @@ const RULES = [
   { field: 'cover', test: msg => /imagem|image|arquivo/i.test(msg), key: () => 'bookForm.errors.coverInvalid' }
 ]
 
+// Código da API → campo do formulário (null: o campo vem em params.field)
+const CODE_FIELDS = {
+  ISBN_TAKEN: 'isbn',
+  ISBN_INVALID: 'isbn',
+  AUTHORS_REQUIRED: 'authors',
+  NAMES_TOO_MANY: 'authors',
+  NAME_TOO_LONG: 'authors',
+  READ_DATE_FUTURE: 'statusDate',
+  VOLUME_INVALID: 'seriesIndex',
+  SERIES_TOO_LONG: 'series',
+  NOTES_TOO_LONG: 'notes',
+  RATING_INVALID: 'rating',
+  IMAGE_INVALID: 'cover',
+  IMAGE_ONLY: 'cover',
+  IMAGE_TOO_LARGE: 'cover'
+}
+
+// params.field da API → campo do formulário
+const PARAM_FIELDS = { title: 'title', isbn: 'isbn', pubDate: 'pubDate', publicationDate: 'pubDate', readDate: 'statusDate', startedAt: 'statusDate', series: 'series', notes: 'notes' }
+
+function fieldFromCode(error) {
+  const code = error?.code
+  if (!code) return null
+  if (CODE_FIELDS[code]) return CODE_FIELDS[code]
+  const param = error.body?.params?.field
+  if (['FIELD_REQUIRED', 'FIELD_INVALID', 'DATE_INVALID'].includes(code) && PARAM_FIELDS[param]) return PARAM_FIELDS[param]
+  return null
+}
+
 export function fieldErrorFromApi(error, t) {
   const status = error?.status
   if (status !== 400 && status !== 409) return null
-  const message = String(error?.message || '')
+
+  // Já traduzida pelo fetchClient a partir do código
+  const byCode = fieldFromCode(error)
+  if (byCode) return { field: byCode, message: error.message }
+
+  const message = String(error?.body?.error || error?.message || '')
   const rule = RULES.find(item => item.test(message, status))
   if (!rule) return null
   return { field: rule.field, message: rule.key ? t(rule.key(status)) : message }
diff --git a/frontend/src/views/PublicLibrary.vue b/frontend/src/views/PublicLibrary.vue
index 7931e3bfd364296389c21c8b2abb87aff8071ab5..6b220dec5ffde973940d779edd5eadf49b76cbf1 100644
--- a/frontend/src/views/PublicLibrary.vue
+++ b/frontend/src/views/PublicLibrary.vue
@@ -45,8 +45,17 @@
           </template>
 
           <template v-else-if="viewer">
+            <!-- Bloqueado por mim: só o desbloquear -->
             <AppButton
-              v-if="followStatus === 'accepted'"
+              v-if="viewer.blockedByMe"
+              :label="t('block.unblock')"
+              icon="pi pi-lock-open"
+              class="btn-outlined btn-secondary"
+              :loading="blockBusy"
+              @click="unblock"
+            />
+            <AppButton
+              v-else-if="followStatus === 'accepted'"
               :label="t('profile.following')"
               icon="pi pi-check"
               class="btn-outlined btn-secondary"
@@ -69,6 +78,20 @@
               :loading="followBusy"
               @click="follow"
             />
+            <IconButton
+              v-if="!viewer.blockedByMe"
+              icon="pi pi-ellipsis-h"
+              :label="t('block.moreActions')"
+              class="more-btn"
+              aria-haspopup="true"
+              aria-controls="profile-more-menu"
+              @click="event => moreMenu.toggle(event)"
+            />
+            <PopupMenu
+              id="profile-more-menu"
+              ref="moreMenu"
+              :items="moreItems"
+            />
           </template>
 
           <!-- Sem sessão: o mesmo botão Seguir, que leva ao login e volta para cá -->
@@ -358,6 +381,9 @@ import BookItem from '../components/BookItem.vue'
 import BookDialog from '../components/BookDialog.vue'
 import StarRating from '../components/StarRating.vue'
 import ReaderAvatar from '../components/ReaderAvatar.vue'
+import IconButton from '../components/form/IconButton.vue'
+import PopupMenu from '../components/ui/PopupMenu.vue'
+import { useConfirm } from '../services/confirm.js'
 import { tagColor, colorFor } from '../utils/tagColors.js'
 import { fromApiDate } from '../utils/dates.js'
 
@@ -430,6 +456,57 @@ async function follow() {
   }
 }
 
+// --- Bloquear ---
+const confirm = useConfirm()
+const moreMenu = ref(null)
+const blockBusy = ref(false)
+
+const moreItems = computed(() => [
+  { label: t('block.block', { name: username.value }), icon: 'pi pi-ban', command: askBlock }
+])
+
+function askBlock() {
+  confirm.require({
+    header: t('block.confirmTitle', { name: username.value }),
+    message: t('block.confirmText'),
+    icon: 'pi pi-ban',
+    acceptLabel: t('block.confirmButton'),
+    rejectLabel: t('common.cancel'),
+    acceptClass: 'btn-rounded btn-danger',
+    rejectClass: 'btn-text btn-secondary',
+    accept: block
+  })
+}
+
+async function block() {
+  blockBusy.value = true
+  try {
+    await api.block(username.value)
+    profile.value.viewer.blockedByMe = true
+    profile.value.viewer.followStatus = null
+    profile.value.viewer.commonCount = null
+    profile.value.viewer.commonBooks = []
+    toast.add({ severity: 'success', summary: t('common.success'), detail: t('block.blocked', { name: username.value }), life: 4000 })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    blockBusy.value = false
+  }
+}
+
+async function unblock() {
+  blockBusy.value = true
+  try {
+    await api.unblock(username.value)
+    await loadProfile()
+    toast.add({ severity: 'success', summary: t('common.success'), detail: t('block.unblocked', { name: username.value }), life: 3000 })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    blockBusy.value = false
+  }
+}
+
 async function unfollow() {
   followBusy.value = true
   try {
@@ -881,10 +958,14 @@ watch(username, () => {
     gap: 1rem;
   }
 
-  /* Botão Seguir na largura toda, embaixo do nome */
-  .follow-area,
-  .follow-area .btn {
+  /* Botão Seguir na largura toda, embaixo do nome (o ⋯ fica ao lado) */
+  .follow-area {
     width: 100%;
+    flex-wrap: nowrap;
+  }
+
+  .follow-area .btn {
+    flex: 1;
   }
 }
 </style>
\ No newline at end of file
diff --git a/frontend/src/views/Register.vue b/frontend/src/views/Register.vue
index 823df1559c0411ea432f5c24d8399de483b52767..eea71e8694f45c44bf11b9683f7818372344f7a7 100644
--- a/frontend/src/views/Register.vue
+++ b/frontend/src/views/Register.vue
@@ -16,7 +16,9 @@
       <div class="field">
         <TextField
           id="register-name"
+          ref="nameField"
           v-model="name"
+          :error="errors.name"
           :label="t('register.user')"
           autocomplete="username"
           maxlength="50"
@@ -28,7 +30,9 @@
       <div class="field">
         <TextField
           id="register-email"
+          ref="emailField"
           v-model="email"
+          :error="errors.email"
           :label="t('register.email')"
           type="email"
           autocomplete="email"
@@ -38,7 +42,9 @@
       <div class="field">
         <PasswordField
           id="register-password"
+          ref="passwordField"
           v-model="password"
+          :error="errors.password"
           :label="t('register.password')"
           autocomplete="new-password"
           strength
@@ -48,7 +54,9 @@
       <div class="field">
         <PasswordField
           id="register-confirm-password"
+          ref="confirmField"
           v-model="confirmPassword"
+          :error="errors.confirm"
           :label="t('register.confirmPassword')"
           autocomplete="new-password"
         />
@@ -79,7 +87,7 @@
 import PasswordField from '../components/form/PasswordField.vue'
 import TextField from '../components/form/TextField.vue'
 import { isWeakPassword } from '../utils/password.js'
-import { ref } from 'vue'
+import { ref, reactive, watch } from 'vue'
 import { useRouter, useRoute } from 'vue-router'
 import { useToast } from '../services/toast.js'
 import AppButton from '../components/ui/AppButton.vue'
@@ -102,21 +110,57 @@ const password = ref('')
 const confirmPassword = ref('')
 const loading = ref(false)
 
-function fail(detail) {
-  toast.add({ severity: 'error', summary: t('register.error'), detail, life: 4000 })
+// Erros embaixo de cada campo (como na Conta); toast só para o que não é de campo.
+const errors = reactive({ name: '', email: '', password: '', confirm: '' })
+const nameField = ref(null)
+const emailField = ref(null)
+const passwordField = ref(null)
+const confirmField = ref(null)
+const FIELDS = { name: nameField, email: emailField, password: passwordField, confirm: confirmField }
+
+watch(name, () => { errors.name = '' })
+watch(email, () => { errors.email = '' })
+watch(password, () => { errors.password = '' })
+watch(confirmPassword, () => { errors.confirm = '' })
+
+const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
+
+// Código da API → campo
+const CODE_FIELDS = {
+  USERNAME_TAKEN: 'name',
+  USERNAME_OR_EMAIL_TAKEN: 'name',
+  USERNAME_INVALID: 'name',
+  USERNAME_RESERVED: 'name',
+  USERNAME_TOO_LONG: 'name',
+  EMAIL_INVALID: 'email',
+  EMAIL_TAKEN: 'email',
+  PASSWORD_TOO_SHORT: 'password',
+  PASSWORD_TOO_LONG: 'password',
+  PASSWORD_NEEDS_LETTER: 'password',
+  PASSWORD_NEEDS_NUMBER: 'password'
+}
+
+function focusFirstError() {
+  const key = Object.keys(FIELDS).find(k => errors[k])
+  if (key) FIELDS[key].value?.focus()
+}
+
+function validate() {
+  const required = t('settings.errors.required')
+  const cleanName = name.value.trim()
+  errors.name = !cleanName ? required : (USERNAME_PATTERN.test(cleanName) ? '' : t('register.invalidUsername'))
+  errors.email = !email.value.trim() ? required : (EMAIL_PATTERN.test(email.value.trim()) ? '' : t('settings.errors.email'))
+  errors.password = !password.value ? required : (isWeakPassword(password.value) ? t('register.passwordTooWeak') : '')
+  errors.confirm = !confirmPassword.value ? required : (password.value !== confirmPassword.value ? t('register.passwordMismatch') : '')
+  return !Object.values(errors).some(Boolean)
 }
 
 async function handleRegister() {
-  if (!name.value.trim() || !email.value.trim() || !password.value) {
-    toast.add({ severity: 'warn', summary: t('register.attention'), detail: t('register.fillFields'), life: 3000 })
+  if (!validate()) {
+    focusFirstError()
     return
   }
 
-  if (!USERNAME_PATTERN.test(name.value.trim())) return fail(t('register.invalidUsername'))
-  if (password.value !== confirmPassword.value) return fail(t('register.passwordMismatch'))
-
-  if (isWeakPassword(password.value)) return fail(t('register.passwordTooWeak'))
-
   loading.value = true
   try {
     await api.register({
@@ -129,7 +173,13 @@ async function handleRegister() {
     toast.add({ severity: 'success', summary: t('register.success'), detail: t('register.accountCreatedVerify'), life: 7000 })
     router.push({ name: 'login', query: route.query })
   } catch (error) {
-    fail(error.message || t('register.errorCreating'))
+    const field = CODE_FIELDS[error.code]
+    if (field) {
+      errors[field] = error.message
+      focusFirstError()
+    } else {
+      toast.add({ severity: 'error', summary: t('register.error'), detail: error.message || t('register.errorCreating'), life: 4000 })
+    }
   } finally {
     loading.value = false
   }
diff --git a/frontend/src/views/Settings.vue b/frontend/src/views/Settings.vue
index eed4fdf697eb250001e74df1871ea8b065b083cc..a49d0f032dae9f8163ce86385bdd288dcebd06f7 100644
--- a/frontend/src/views/Settings.vue
+++ b/frontend/src/views/Settings.vue
@@ -116,6 +116,40 @@
                 class="toggle-help"
               >{{ t('settings.activity.help') }}</small>
             </div>
+
+            <!-- Leitores bloqueados: não veem você na comunidade nem pedem para seguir -->
+            <div
+              class="blocked-block"
+              id="settings-blocked"
+              tabindex="-1"
+            >
+              <h3 class="sub-title">{{ t('block.listTitle') }}</h3>
+              <p
+                v-if="blockedUsers.length === 0"
+                class="toggle-help"
+              >{{ t('block.listEmpty') }}</p>
+              <ul
+                v-else
+                class="blocked-list"
+              >
+                <li
+                  v-for="person in blockedUsers"
+                  :key="person.username"
+                >
+                  <ReaderAvatar
+                    :username="person.username"
+                    size="sm"
+                  />
+                  <span class="blocked-name">{{ person.username }}</span>
+                  <AppButton
+                    :label="t('block.unblock')"
+                    class="btn-sm btn-text btn-secondary"
+                    :loading="unblocking === person.username"
+                    @click="unblockUser(person.username)"
+                  />
+                </li>
+              </ul>
+            </div>
           </div>
         </section>
 
@@ -429,7 +463,8 @@
 <script setup>
 import PasswordField from '../components/form/PasswordField.vue'
 import TextField from '../components/form/TextField.vue'
-import { ref, reactive, computed, watch } from 'vue'
+import ReaderAvatar from '../components/ReaderAvatar.vue'
+import { ref, reactive, computed, watch, onMounted } from 'vue'
 import { useRouter } from 'vue-router'
 import { useI18n } from 'vue-i18n'
 import { useToast } from '../services/toast.js'
@@ -511,6 +546,33 @@ async function copyLink() {
   setTimeout(() => { copied.value = false }, 2000)
 }
 
+// --- Bloqueados ---
+const blockedUsers = ref([])
+const unblocking = ref('')
+
+async function loadBlocked() {
+  try {
+    blockedUsers.value = (await api.getBlocked()).blocked
+  } catch {
+    // Lista opcional: se falhar, a seção só fica vazia
+  }
+}
+
+async function unblockUser(username) {
+  unblocking.value = username
+  try {
+    await api.unblock(username)
+    blockedUsers.value = blockedUsers.value.filter(person => person.username !== username)
+    toast.add({ severity: 'success', summary: t('common.success'), detail: t('block.unblocked', { name: username }), life: 3000 })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    unblocking.value = ''
+  }
+}
+
+onMounted(loadBlocked)
+
 // --- Senha ---
 // Erros embaixo de cada campo (como no cadastro), em vez de um aviso solto
 // no canto. Erro do servidor vai para o campo a que se refere.
@@ -1082,4 +1144,38 @@ async function deleteAccount() {
     flex-direction: column;
   }
 }
+.blocked-block {
+  border-top: 1px solid var(--border-color);
+  padding-top: 1rem;
+}
+
+.blocked-block .sub-title {
+  margin: 0 0 0.5rem;
+  font-size: var(--fs-md);
+  font-weight: 600;
+  color: var(--text-primary);
+}
+
+.blocked-list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.35rem;
+}
+
+.blocked-list li {
+  display: flex;
+  align-items: center;
+  gap: 0.6rem;
+}
+
+.blocked-name {
+  flex: 1;
+  min-width: 0;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
 </style>
\ No newline at end of file
__LIBRISHELF_PATCH__

echo "→ Aplicando o patch…"
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
    echo "  Resolva esses trechos e rode de novo só a parte de verificação:"
    echo "    (cd backend && npm run test:unit) && (cd frontend && npm install && npm run build)"
  else
    echo "✗ O patch não entrou (nada foi alterado)."
  fi
  echo "  Para desfazer tudo deste pacote:"
  echo "    git checkout HEAD -- $(git ls-files -- "${FILES[@]}" | tr '\n' ' ')"
  NEW=$(for f in "${FILES[@]}"; do git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || printf '%s ' "$f"; done)
  [ -n "$NEW" ] && echo "    rm -f $NEW"
  exit 1
fi

# Guarda as versões exatas deste pacote no banco de objetos do git: se o
# editor reformatar os arquivos antes do commit, o --3way do próximo pacote
# ainda encontra a base certa.
git hash-object -w -- "${FILES[@]}" 2>/dev/null >/dev/null || true

[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund)
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund)

echo "→ Testes unitários do backend…"
(cd backend && npm run test:unit --silent)

echo "→ Build do frontend…"
(cd frontend && npm run build)

echo
echo "✓ Tudo certo. Mensagem de commit sugerida:"
echo "────────────────────────────────────────────"
cat <<'__MSG__'
feat: base para o lançamento (pacote 9)

- Erros da API com código estável e parâmetros ({ error, code, params });
  o frontend traduz pelo código (pt/en), inclusive rede fora e sessão
  expirada. Formulários de livro e cadastro põem o erro no campo certo
- Nomes de usuário reservados (admin, suporte, librishelf..., rotas do
  app), ignorando maiúsculas, acentos e . _ -; vale no cadastro e na troca
- Bloquear leitor (migration 007): apaga o seguir nos dois sentidos, some
  na comunidade, busca, recomendações e "quem tem este livro"; o bloqueado
  não pode pedir para seguir e não é avisado. Menu ⋯ na biblioteca pública
  e lista de bloqueados na Conta
- Bibliotecas públicas fora de buscadores: X-Robots-Tag noindex no nginx
  (/u/ e /api/), meta robots na rota e robots.txt
- Cadastro com erros embaixo de cada campo
- Testes: códigos de erro, nomes reservados e bloqueio
__MSG__
echo "────────────────────────────────────────────"