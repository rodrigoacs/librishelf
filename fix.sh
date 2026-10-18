#!/usr/bin/env bash
# =============================================================================
#  Librishelf — pacote 4 do backlog: conta
#
#  1. Exportar todos os dados: JSON completo (conta, metas, livros com
#     anotações) ou CSV dos livros (abre no Excel e pode ser importado de volta)
#  2. Importar do Goodreads (ou de um CSV exportado do Librishelf): status,
#     notas, datas, prateleiras → categorias, série do título "Livro (Série, #2)",
#     anotações; pula o que já está na estante e aponta a linha com problema
#  3. Trocar e-mail (pede a senha, o novo precisa ser confirmado e o antigo
#     recebe um aviso por e-mail) e trocar nome de usuário (pede a senha)
#  4. Política de privacidade: direito de cópia agora é feito pelo próprio app
#
#  Sem migration. Precisa do pacote 3 commitado.
#
#  Uso:   bash librishelf-pacote4-conta.sh [caminho/do/repo]
#
#  NÃO commita, NÃO faz push e NÃO mexe no banco.
# =============================================================================
set -euo pipefail

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B=''; G=''; Y=''; R=''; C=''; N=''; fi
step() { printf '\n%s==> %s%s\n' "$B$C" "$*" "$N"; }
ok()   { printf '%s  ✔ %s%s\n' "$G" "$*" "$N"; }
warn() { printf '%s  ! %s%s\n' "$Y" "$*" "$N"; }
fail() { printf '%s  ✘ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

cd "${1:-$PWD}" || fail "Pasta não encontrada."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Não é um repositório git: $PWD"
cd "$(git rev-parse --show-toplevel)"
[ -f frontend/src/components/GeneratedCover.vue ] || fail "Faltam as cores v2: rode o librishelf-cores-v2.sh e commite antes deste pacote."
[ -e backend/db/migrations/006_series_and_notes.sql ] || fail "Falta o pacote anterior (backend/db/migrations/006_series_and_notes.sql não existe): aplique e commite os pacotes em ordem."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
PATCH="$TMP_DIR/pacote.patch"

cat > "$PATCH" <<'LIBRI_PATCH_EOF'
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index 7669ae9..53f36a4 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -213,6 +213,19 @@ export const AUTH_QUERIES = {
     FROM librishelf.users
     WHERE lower(email) = lower($1) AND is_active IS NOT FALSE
   `,
+  EMAIL_TAKEN: 'SELECT 1 FROM librishelf.users WHERE lower(email) = lower($1) AND id <> $2',
+  NAME_TAKEN: 'SELECT 1 FROM librishelf.users WHERE lower(name) = lower($1) AND id <> $2',
+  // E-mail novo começa sem confirmação.
+  UPDATE_EMAIL: `
+    UPDATE librishelf.users SET email = $2, email_verified_at = NULL, updated_at = now()
+    WHERE id = $1
+    RETURNING id, name, email, email_verified_at, is_public, show_in_community, show_activity
+  `,
+  UPDATE_NAME: `
+    UPDATE librishelf.users SET name = $2, updated_at = now()
+    WHERE id = $1
+    RETURNING id, name, email, email_verified_at, is_public, show_in_community, show_activity
+  `,
   MARK_EMAIL_VERIFIED: `
     UPDATE librishelf.users
     SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
@@ -467,6 +480,56 @@ export const COMMUNITY_QUERIES = {
   `
 }
 
+// Exportar / importar dados da conta.
+export const DATA_QUERIES = {
+  EXPORT_USER: `
+    SELECT name, email, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
+           is_public, show_in_community, show_activity,
+           email_verified_at IS NOT NULL AS email_verified
+    FROM librishelf.users WHERE id = $1
+  `,
+  EXPORT_GOALS: 'SELECT year, target FROM librishelf.reading_goals WHERE user_id = $1 ORDER BY year',
+  EXPORT_BOOKS: `
+    SELECT
+      b.id,
+      b.title,
+      COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
+        FROM librishelf.books_authors_link bal JOIN librishelf.authors a ON a.id = bal.author_id
+        WHERE bal.book_id = b.id), '[]'::json) AS authors,
+      p.name AS publisher,
+      COALESCE((SELECT json_agg(t.name ORDER BY t.name)
+        FROM librishelf.books_tags_link btl JOIN librishelf.tags t ON t.id = btl.tag_id
+        WHERE btl.book_id = b.id), '[]'::json) AS tags,
+      b.isbn,
+      b.rating,
+      CASE
+        WHEN b.reading_status = 'reading' THEN 'reading'
+        WHEN b.read_date IS NOT NULL THEN 'read'
+        WHEN b.reading_status = 'want' THEN 'want'
+        ELSE 'none'
+      END AS status,
+      to_char(b.read_date, 'YYYY-MM-DD') AS read_date,
+      to_char(b.started_at, 'YYYY-MM-DD') AS started_at,
+      to_char(b.publication_date, 'YYYY-MM-DD') AS publication_date,
+      b.series,
+      b.series_index,
+      b.notes,
+      to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS added_at
+    FROM librishelf.books b
+    LEFT JOIN librishelf.publishers p ON p.id = b.publisher_id
+    WHERE b.user_id = $1
+    ORDER BY b.id
+  `,
+  // Para não importar o mesmo livro duas vezes.
+  EXISTING_KEYS: `
+    SELECT b.isbn13, lower(b.title) AS title,
+           (SELECT lower(a.name) FROM librishelf.books_authors_link bal
+              JOIN librishelf.authors a ON a.id = bal.author_id
+            WHERE bal.book_id = b.id ORDER BY bal.position, a.id LIMIT 1) AS author
+    FROM librishelf.books b WHERE b.user_id = $1
+  `
+}
+
 export const GOAL_QUERIES = {
   UPSERT: `
     INSERT INTO librishelf.reading_goals (user_id, year, target)
diff --git a/backend/src/repositories/authRepository.js b/backend/src/repositories/authRepository.js
index f54eebf..1d671c6 100644
--- a/backend/src/repositories/authRepository.js
+++ b/backend/src/repositories/authRepository.js
@@ -74,7 +74,32 @@ async function deleteUser(id) {
   }
 }
 
+/** Outro usuário já usa este e-mail ou nome (sem diferenciar maiúsculas)? */
+async function isEmailTaken(email, exceptId) {
+  const result = await db.query(q.EMAIL_TAKEN, [email, exceptId])
+  return result.rowCount > 0
+}
+
+async function isNameTaken(name, exceptId) {
+  const result = await db.query(q.NAME_TAKEN, [name, exceptId])
+  return result.rowCount > 0
+}
+
+async function updateEmail(id, email) {
+  const result = await db.query(q.UPDATE_EMAIL, [id, email])
+  return result.rows[0] ?? null
+}
+
+async function updateName(id, name) {
+  const result = await db.query(q.UPDATE_NAME, [id, name])
+  return result.rows[0] ?? null
+}
+
 export {
+  isEmailTaken,
+  isNameTaken,
+  updateEmail,
+  updateName,
   getUserByUsername,
   getUserByName,
   getUserById,
diff --git a/backend/src/routes/auth.js b/backend/src/routes/auth.js
index 985b849..e178328 100644
--- a/backend/src/routes/auth.js
+++ b/backend/src/routes/auth.js
@@ -1,5 +1,6 @@
 import express from 'express'
 import * as authService from '../services/authService.js'
+import * as dataService from '../services/dataService.js'
 import STATUS from '../utils/statusCodes.js'
 import sendError from '../utils/sendError.js'
 import { loginLimiter, registerLimiter, sensitiveLimiter, mailLimiter, tokenLimiter } from '../middlewares/rateLimiter.js'
@@ -120,6 +121,47 @@ router.post('/email/verify/resend', authenticateToken, mailLimiter, async (req,
   }
 })
 
+// Trocar e-mail: { email, password, locale } → o novo precisa ser confirmado.
+router.patch('/me/email', authenticateToken, sensitiveLimiter, async (req, res) => {
+  try {
+    const { email, password, locale } = req.body ?? {}
+    const user = await authService.changeEmail(req.user.id, password, email, locale)
+    res.status(STATUS.OK).json({ user })
+  } catch (error) {
+    sendError(res, error, 'Erro ao trocar e-mail')
+  }
+})
+
+// Trocar nome de usuário: { username, password }. Devolve sessão nova (o token leva o nome).
+router.patch('/me/username', authenticateToken, sensitiveLimiter, async (req, res) => {
+  try {
+    const { username, password } = req.body ?? {}
+    const result = await authService.changeUsername(req.user.id, password, username)
+    res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions)
+    res.status(STATUS.OK).json({ user: result.user })
+  } catch (error) {
+    sendError(res, error, 'Erro ao trocar nome de usuário')
+  }
+})
+
+// Exportar todos os dados: ?format=json (padrão) ou csv (só os livros).
+router.get('/me/export', authenticateToken, sensitiveLimiter, async (req, res) => {
+  try {
+    const stamp = new Date().toISOString().slice(0, 10)
+    if (req.query.format === 'csv') {
+      const csv = await dataService.exportCsv(req.user.id)
+      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
+      res.setHeader('Content-Disposition', `attachment; filename="librishelf-${stamp}.csv"`)
+      return res.status(STATUS.OK).send(csv)
+    }
+    const data = await dataService.exportJson(req.user.id)
+    res.setHeader('Content-Disposition', `attachment; filename="librishelf-${stamp}.json"`)
+    res.status(STATUS.OK).json(data)
+  } catch (error) {
+    sendError(res, error, 'Erro ao exportar dados')
+  }
+})
+
 router.patch('/me/visibility', authenticateToken, async (req, res) => {
   try {
     const result = await authService.setPrivacy(req.user.id, req.body ?? {})
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 64c3d6d..4d8feb7 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -3,6 +3,7 @@ import fs from 'fs/promises'
 import path from 'path'
 import multer from 'multer'
 import * as libraryService from '../services/libraryService.js'
+import * as dataService from '../services/dataService.js'
 import { authenticateToken, optionalAuth } from '../middlewares/auth.js'
 import * as communityService from '../services/communityService.js'
 import { fetchCover } from '../services/openLibraryService.js'
@@ -27,12 +28,25 @@ const upload = multer({
   }
 })
 
+const MAX_CSV_MB = 5
+
+// Importação: um CSV (Goodreads ou Librishelf), em memória.
+const csvUpload = multer({
+  storage: multer.memoryStorage(),
+  limits: { fileSize: 1024 * 1024 * MAX_CSV_MB, files: 1 },
+  fileFilter: (req, file, cb) => {
+    const isCsv = /\.csv$/i.test(file.originalname) || /csv|excel|text\/plain/.test(file.mimetype)
+    if (!isCsv) return cb(new Error('Envie um arquivo .csv.'))
+    cb(null, true)
+  }
+})
+
 function handleUpload(uploadMiddleware) {
   return (req, res, next) => {
     uploadMiddleware(req, res, (err) => {
       if (err) {
         const message = err.code === 'LIMIT_FILE_SIZE'
-          ? `A imagem pode ter no máximo ${MAX_UPLOAD_MB} MB.`
+          ? (req.path.endsWith('/import') ? `O arquivo pode ter no máximo ${MAX_CSV_MB} MB.` : `A imagem pode ter no máximo ${MAX_UPLOAD_MB} MB.`)
           : err.message
         return res.status(STATUS.BAD_REQUEST).json({ error: message })
       }
@@ -122,6 +136,16 @@ router.get('/series', async (req, res) => {
   }
 })
 
+// Importar livros de um CSV (campo "file"): Goodreads ou o CSV exportado do Librishelf.
+router.post('/import', uploadLimiter, handleUpload(csvUpload.single('file')), async (req, res) => {
+  try {
+    const summary = await dataService.importCsv(req.user.id, req.file?.buffer)
+    res.status(STATUS.OK).json(summary)
+  } catch (error) {
+    sendError(res, error, 'Erro ao importar')
+  }
+})
+
 // Ações em lote: { ids: [1, 2], action: 'status' | 'addTag' | 'removeTag' | 'delete', ... }
 router.post('/batch', async (req, res) => {
   try {
diff --git a/backend/src/scripts/previewEmails.js b/backend/src/scripts/previewEmails.js
index a97d575..a62522d 100644
--- a/backend/src/scripts/previewEmails.js
+++ b/backend/src/scripts/previewEmails.js
@@ -7,7 +7,7 @@
 import fs from 'node:fs'
 import os from 'node:os'
 import path from 'node:path'
-import { resetPasswordEmail, verifyEmailEmail } from '../services/emailTemplates.js'
+import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail } from '../services/emailTemplates.js'
 
 const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'librishelf-emails'))
 fs.mkdirSync(outDir, { recursive: true })
@@ -19,7 +19,8 @@ const emails = {
   'verificar-pt': verifyEmailEmail({ name: 'Rodrigo', link: `${base}/verify-email?token=${token}`, locale: 'pt' }),
   'verificar-en': verifyEmailEmail({ name: 'Rodrigo', link: `${base}/verify-email?token=${token}`, locale: 'en' }),
   'senha-pt': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'pt' }),
-  'senha-en': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'en' })
+  'senha-en': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'en' }),
+  'email-trocado-pt': emailChangedEmail({ name: 'Rodrigo', link: `${base}/forgot-password`, locale: 'pt', newEmail: 'ro•••@gmail.com' })
 }
 
 for (const [file, mail] of Object.entries(emails)) {
diff --git a/backend/src/services/authService.js b/backend/src/services/authService.js
index 33b9d5e..4583ca8 100644
--- a/backend/src/services/authService.js
+++ b/backend/src/services/authService.js
@@ -8,7 +8,7 @@ import jwt from 'jsonwebtoken'
 import crypto from 'node:crypto'
 import * as tokenRepository from '../repositories/tokenRepository.js'
 import { sendMail } from './mailService.js'
-import { resetPasswordEmail, verifyEmailEmail } from './emailTemplates.js'
+import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail } from './emailTemplates.js'
 
 const SECRET_KEY = process.env.SECRET_KEY
 const TOKEN_TTL = '7d'
@@ -313,6 +313,90 @@ async function setPrivacy(userId, body = {}) {
   }
 }
 
+/** ro•••@gmail.com: o aviso ao e-mail antigo não entrega o endereço novo inteiro. */
+function maskEmail(email) {
+  const [local, domain] = String(email).split('@')
+  return `${local.slice(0, 2)}•••@${domain}`
+}
+
+/**
+ * Trocar o e-mail: pede a senha, o novo começa sem confirmação (recebe o link)
+ * e o endereço antigo recebe um aviso. Opções públicas já ligadas continuam;
+ * ligar de novo exige confirmar o e-mail novo.
+ */
+async function changeEmail(userId, password, newEmail, locale) {
+  await verifyCurrentPassword(userId, password)
+
+  const email = typeof newEmail === 'string' ? newEmail.trim() : ''
+  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
+    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST)
+  }
+
+  const current = await authRepository.getUserById(userId)
+  if (!current) throw httpError('User not found.', STATUS.NOT_FOUND)
+  if (current.email.toLowerCase() === email.toLowerCase()) {
+    throw httpError('Este já é o seu e-mail.', STATUS.BAD_REQUEST)
+  }
+  if (await authRepository.isEmailTaken(email, userId)) {
+    throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT)
+  }
+
+  let updated
+  try {
+    updated = await authRepository.updateEmail(userId, email)
+  } catch (err) {
+    if (err.code === UNIQUE_VIOLATION) throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT)
+    throw err
+  }
+
+  try {
+    await deliverVerification(updated, locale)
+  } catch (err) {
+    logger.error('Falha ao enviar confirmação do e-mail novo', { userId, message: err.message })
+  }
+  try {
+    const notice = emailChangedEmail({ name: updated.name, link: `${appUrl()}/forgot-password`, locale, newEmail: maskEmail(email) })
+    await sendMail({ to: current.email, ...notice })
+  } catch (err) {
+    logger.error('Falha ao avisar o e-mail antigo', { userId, message: err.message })
+  }
+
+  logger.info('E-mail da conta trocado', { userId })
+  return toProfile(updated)
+}
+
+/**
+ * Trocar o nome de usuário (também muda o link /u/<nome>). Mesmas regras do
+ * cadastro; não pode repetir o de outra pessoa nem com outras maiúsculas.
+ */
+async function changeUsername(userId, password, newName) {
+  await verifyCurrentPassword(userId, password)
+
+  const name = typeof newName === 'string' ? newName.trim() : ''
+  if (!name) throw httpError('Informe o novo nome de usuário.', STATUS.BAD_REQUEST)
+  if (name.length > MAX_USERNAME_LENGTH) {
+    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+  }
+  if (!USERNAME_PATTERN.test(name)) {
+    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST)
+  }
+  if (await authRepository.isNameTaken(name, userId)) {
+    throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT)
+  }
+
+  let updated
+  try {
+    updated = await authRepository.updateName(userId, name)
+  } catch (err) {
+    if (err.code === UNIQUE_VIOLATION) throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT)
+    throw err
+  }
+  if (!updated) throw httpError('User not found.', STATUS.NOT_FOUND)
+
+  logger.info('Nome de usuário trocado', { userId })
+  return { token: issueToken(updated), user: toProfile(updated) }
+}
+
 async function deleteAccount(userId, password) {
   await verifyCurrentPassword(userId, password)
 
@@ -338,6 +422,8 @@ export {
   resetPassword,
   getUserProfile,
   changePassword,
+  changeEmail,
+  changeUsername,
   setPrivacy,
   deleteAccount,
   USERNAME_PATTERN
diff --git a/backend/src/services/dataService.js b/backend/src/services/dataService.js
new file mode 100644
index 0000000..8cd35e4
--- /dev/null
+++ b/backend/src/services/dataService.js
@@ -0,0 +1,290 @@
+import { db } from '../database/connection.js'
+import { DATA_QUERIES as q } from '../database/queries.js'
+import * as libraryRepository from '../repositories/libraryRepository.js'
+import { normalizeBookInput } from './libraryService.js'
+import { csvToObjects, toCsv } from '../utils/csv.js'
+import { normalizeIsbn13 } from '../utils/isbn.js'
+import STATUS from '../utils/statusCodes.js'
+import logger from '../utils/logger.js'
+
+/**
+ * Seus dados: exportar tudo (JSON ou CSV) e importar livros de um CSV — do
+ * Goodreads ou o próprio CSV exportado pelo Librishelf.
+ */
+
+function httpError(message, status) {
+  const error = new Error(message)
+  error.status = status
+  return error
+}
+
+// ---------------------------------------------------------------------------
+// Exportar
+// ---------------------------------------------------------------------------
+
+/** Colunas do CSV do Librishelf (também aceitas na importação). */
+export const CSV_COLUMNS = [
+  'title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date',
+  'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at'
+]
+
+// Vários nomes numa célula: separados por "; " (nome de autor pode ter vírgula).
+const LIST_SEPARATOR = '; '
+
+async function loadExport(userId) {
+  const [user, goals, books] = await Promise.all([
+    db.query(q.EXPORT_USER, [userId]),
+    db.query(q.EXPORT_GOALS, [userId]),
+    db.query(q.EXPORT_BOOKS, [userId])
+  ])
+  if (!user.rows[0]) throw httpError('User not found.', STATUS.NOT_FOUND)
+  return { user: user.rows[0], goals: goals.rows, books: books.rows }
+}
+
+export async function exportJson(userId) {
+  const { user, goals, books } = await loadExport(userId)
+  return {
+    app: 'Librishelf',
+    version: 1,
+    exportedAt: new Date().toISOString(),
+    account: {
+      username: user.name,
+      email: user.email,
+      emailVerified: user.email_verified,
+      createdAt: user.created_at,
+      isPublic: user.is_public,
+      showInCommunity: user.show_in_community,
+      showActivity: user.show_activity
+    },
+    readingGoals: goals,
+    books: books.map(book => ({
+      title: book.title,
+      authors: book.authors,
+      publisher: book.publisher,
+      isbn: book.isbn,
+      tags: book.tags,
+      rating: book.rating,
+      status: book.status,
+      readDate: book.read_date,
+      startedAt: book.started_at,
+      publicationDate: book.publication_date,
+      series: book.series,
+      volume: book.series_index,
+      notes: book.notes,
+      addedAt: book.added_at
+    }))
+  }
+}
+
+export async function exportCsv(userId) {
+  const { books } = await loadExport(userId)
+  const rows = books.map(book => [
+    book.title,
+    book.authors.join(LIST_SEPARATOR),
+    book.publisher,
+    book.isbn,
+    book.tags.join(LIST_SEPARATOR),
+    book.rating,
+    book.status,
+    book.read_date,
+    book.started_at,
+    book.publication_date,
+    book.series,
+    book.series_index,
+    book.notes,
+    book.added_at
+  ])
+  return toCsv([CSV_COLUMNS, ...rows])
+}
+
+// ---------------------------------------------------------------------------
+// Importar
+// ---------------------------------------------------------------------------
+
+export const MAX_IMPORT_ROWS = 5000
+const MAX_NOTES = 5000
+const GOODREADS_SHELVES = new Set(['read', 'currently-reading', 'to-read'])
+
+/** ="0441013597" (como o Goodreads exporta) → 0441013597. */
+function cleanIsbn(value) {
+  const text = String(value ?? '').replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '')
+  return text || null
+}
+
+/** 2019/05/14, 2019-05-14 → '2019-05-14'; vazio ou inválido → null. */
+function cleanDate(value) {
+  const match = String(value ?? '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
+  if (!match) return null
+  const [, y, m, d] = match
+  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
+}
+
+function cleanYear(value) {
+  const year = String(value ?? '').trim()
+  return /^\d{4}$/.test(year) ? `${year}-01-01` : null
+}
+
+/** Data no futuro (relógio errado, ano digitado errado) vira hoje. */
+function notFuture(date) {
+  if (!date) return null
+  const today = new Date().toISOString().slice(0, 10)
+  return date > today ? today : date
+}
+
+/** "Duna (Crônicas de Duna, #1)" → título "Duna", série "Crônicas de Duna", volume 1. */
+export function splitSeries(rawTitle) {
+  const title = String(rawTitle ?? '').trim()
+  const match = title.match(/^(.+?)\s*\(([^()]+?),?\s*#(\d+(?:\.\d+)?)\)\s*$/)
+  if (!match) return { title, series: null, seriesIndex: null }
+  return { title: match[1].trim(), series: match[2].trim(), seriesIndex: match[3] }
+}
+
+function splitList(value, separator) {
+  return String(value ?? '').split(separator).map(item => item.trim()).filter(Boolean)
+}
+
+function fromGoodreads(record) {
+  const { title, series, seriesIndex } = splitSeries(record.Title)
+  const shelf = String(record['Exclusive Shelf'] ?? '').trim()
+  const added = cleanDate(record['Date Added'])
+
+  // Prateleiras do Goodreads viram categorias (menos as três de status).
+  const tags = splitList(record.Bookshelves, ',')
+    .filter(name => !GOODREADS_SHELVES.has(name))
+    .map(name => name.replace(/-/g, ' '))
+
+  const notes = [record['Private Notes'], record['My Review']]
+    .map(text => String(text ?? '').replace(/<br\s*\/?>/gi, '\n').trim())
+    .filter(Boolean)
+    .join('\n\n')
+    .slice(0, MAX_NOTES)
+
+  let status = 'none'
+  if (shelf === 'read') status = 'read'
+  else if (shelf === 'currently-reading') status = 'reading'
+  else if (shelf === 'to-read') status = 'want'
+
+  const rating = Number(record['My Rating'])
+
+  return {
+    title,
+    authors: [record.Author, ...splitList(record['Additional Authors'], ',')].map(name => String(name ?? '').trim()).filter(Boolean),
+    publisher: String(record.Publisher ?? '').trim(),
+    isbn: cleanIsbn(record.ISBN13) || cleanIsbn(record.ISBN),
+    tags,
+    rating: rating >= 1 && rating <= 5 ? rating : null,
+    status,
+    // Lido sem data no Goodreads: usa o dia em que foi adicionado.
+    readDate: status === 'read' ? notFuture(cleanDate(record['Date Read']) || added) : null,
+    startedAt: status === 'reading' ? notFuture(added) : null,
+    pubDate: cleanYear(record['Year Published']) || cleanYear(record['Original Publication Year']),
+    series,
+    seriesIndex,
+    notes
+  }
+}
+
+function fromLibrishelf(record) {
+  const status = ['read', 'reading', 'want'].includes(record.status) ? record.status : 'none'
+  const rating = Number(record.rating)
+  return {
+    title: String(record.title ?? '').trim(),
+    authors: splitList(record.authors, ';'),
+    publisher: String(record.publisher ?? '').trim(),
+    isbn: cleanIsbn(record.isbn),
+    tags: splitList(record.tags, ';'),
+    rating: rating >= 1 && rating <= 5 ? rating : null,
+    status,
+    readDate: status === 'read' || record.read_date ? notFuture(cleanDate(record.read_date)) : null,
+    startedAt: status === 'reading' ? notFuture(cleanDate(record.started_at)) : null,
+    pubDate: cleanDate(record.publication_date),
+    series: String(record.series ?? '').trim() || null,
+    seriesIndex: String(record.volume ?? '').trim() || null,
+    notes: String(record.notes ?? '').slice(0, MAX_NOTES)
+  }
+}
+
+function detectFormat(headers) {
+  if (headers.includes('Exclusive Shelf') || headers.includes('Author l-f')) return 'goodreads'
+  if (headers.includes('title') && headers.includes('authors')) return 'librishelf'
+  return null
+}
+
+const keyOf = (title, author) => `${String(title).toLocaleLowerCase()}\u0000${String(author ?? '').toLocaleLowerCase()}`
+
+/**
+ * Importa os livros do CSV. Pula o que já está na estante (mesmo ISBN, ou mesmo
+ * título + primeiro autor) e devolve o resumo com o motivo de cada linha pulada.
+ */
+export async function importCsv(userId, buffer) {
+  if (!buffer?.length) throw httpError('Envie o arquivo CSV.', STATUS.BAD_REQUEST)
+
+  const { headers, records } = csvToObjects(buffer.toString('utf8'))
+  const format = detectFormat(headers)
+  if (!format) {
+    throw httpError('Formato não reconhecido: envie o CSV exportado do Goodreads ou do Librishelf.', STATUS.BAD_REQUEST)
+  }
+  if (records.length === 0) throw httpError('O arquivo não tem nenhum livro.', STATUS.BAD_REQUEST)
+  if (records.length > MAX_IMPORT_ROWS) {
+    throw httpError(`O arquivo tem ${records.length} livros; o limite por importação é ${MAX_IMPORT_ROWS}.`, STATUS.BAD_REQUEST)
+  }
+
+  const { rows: existing } = await db.query(q.EXISTING_KEYS, [userId])
+  const isbns = new Set(existing.map(row => row.isbn13).filter(Boolean))
+  const keys = new Set(existing.map(row => keyOf(row.title, row.author)))
+
+  const summary = { format, total: records.length, imported: 0, duplicates: 0, errors: [] }
+
+  for (const [index, record] of records.entries()) {
+    const line = index + 2 // linha 1 é o cabeçalho
+    const book = format === 'goodreads' ? fromGoodreads(record) : fromLibrishelf(record)
+
+    try {
+      const input = normalizeBookInput({
+        title: book.title,
+        authors: book.authors,
+        publisher: book.publisher,
+        isbn: book.isbn,
+        tags: book.tags.join(', '),
+        rating: book.rating,
+        pubDate: book.pubDate,
+        readDate: book.status === 'read' ? book.readDate : null,
+        series: book.series,
+        seriesIndex: book.seriesIndex,
+        notes: book.notes
+      })
+
+      const isbn13 = input.isbn ? normalizeIsbn13(input.isbn) : null
+      const key = keyOf(input.title, input.authors[0])
+      if ((isbn13 && isbns.has(isbn13)) || keys.has(key)) {
+        summary.duplicates++
+        continue
+      }
+
+      const bookId = await libraryRepository.createBook({ ...input, user_id: userId })
+      if (input.series || input.seriesIndex !== null || input.notes) {
+        await libraryRepository.updateExtras(bookId, input)
+      }
+      if (book.status === 'reading' || book.status === 'want') {
+        await libraryRepository.setReadingStatus(bookId, {
+          status: book.status,
+          startedAt: book.status === 'reading' ? book.startedAt : null,
+          clearRead: book.status === 'want'
+        })
+      }
+
+      if (isbn13) isbns.add(isbn13)
+      keys.add(key)
+      summary.imported++
+    } catch (error) {
+      if (summary.errors.length < 100) {
+        summary.errors.push({ line, title: book.title || null, reason: error.status ? error.message : 'Erro ao gravar.' })
+      }
+      if (!error.status) logger.warn('Linha não importada', { userId, line, message: error.message })
+    }
+  }
+
+  summary.failed = summary.total - summary.imported - summary.duplicates
+  logger.info('Importação concluída', { userId, format, imported: summary.imported, duplicates: summary.duplicates, failed: summary.failed })
+  return summary
+}
diff --git a/backend/src/services/emailTemplates.js b/backend/src/services/emailTemplates.js
index 8b25cc0..c20f316 100644
--- a/backend/src/services/emailTemplates.js
+++ b/backend/src/services/emailTemplates.js
@@ -55,6 +55,16 @@ const TEXTS = {
       note: 'O link vale por 3 dias.',
       ignore: 'Se você não criou uma conta no Librishelf, pode ignorar este e-mail.'
     },
+    changed: {
+      subject: 'O e-mail da sua conta no Librishelf mudou',
+      preheader: 'Se foi você, não precisa fazer nada.',
+      title: 'Seu e-mail foi trocado',
+      greeting: name => `Olá, ${name}!`,
+      body: ({ newEmail }) => `O e-mail da sua conta agora é ${newEmail}. Avisos e links de senha passam a ir para lá.`,
+      button: 'Não fui eu: redefinir senha',
+      note: 'Redefinir a senha derruba todas as sessões abertas.',
+      ignore: 'Se foi você quem trocou, pode ignorar este aviso.'
+    },
     fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
     tagline: 'Sua biblioteca pessoal, organizada.',
     footer: 'Você recebeu este e-mail porque ele está cadastrado no Librishelf. Este é um endereço automático: respostas não são lidas.'
@@ -80,6 +90,16 @@ const TEXTS = {
       note: 'The link is valid for 3 days.',
       ignore: "If you didn't create a Librishelf account, you can ignore this email."
     },
+    changed: {
+      subject: 'Your Librishelf email has changed',
+      preheader: "If it was you, there's nothing to do.",
+      title: 'Your email was changed',
+      greeting: name => `Hi, ${name}!`,
+      body: ({ newEmail }) => `Your account email is now ${newEmail}. Notices and password links will go there from now on.`,
+      button: "It wasn't me: reset password",
+      note: 'Resetting your password signs out every open session.',
+      ignore: 'If you made this change, you can ignore this notice.'
+    },
     fallback: "If the button doesn't work, copy and paste this address into your browser:",
     tagline: 'Your personal library, organized.',
     footer: "You're receiving this email because it is registered on Librishelf. This is an automated address: replies are not read."
@@ -181,10 +201,11 @@ function layout({ locale, lang, t, name, link }) {
 </html>`
 }
 
-function build(kind, { name, link, locale }) {
+function build(kind, { name, link, locale, ...extra }) {
   const code = normalizeLocale(locale)
   const lang = TEXTS[code]
-  const t = lang[kind]
+  const base = lang[kind]
+  const t = { ...base, body: typeof base.body === 'function' ? base.body(extra) : base.body }
 
   const text = [
     t.title,
@@ -208,4 +229,6 @@ function build(kind, { name, link, locale }) {
 }
 
 export const resetPasswordEmail = params => build('reset', params)
-export const verifyEmailEmail = params => build('verify', params)
\ No newline at end of file
+export const verifyEmailEmail = params => build('verify', params)
+/** Aviso ao endereço antigo: { name, link, locale, newEmail } (newEmail já mascarado). */
+export const emailChangedEmail = params => build('changed', params)
\ No newline at end of file
diff --git a/backend/src/tests/integration/account-data.test.js b/backend/src/tests/integration/account-data.test.js
new file mode 100644
index 0000000..9dae872
--- /dev/null
+++ b/backend/src/tests/integration/account-data.test.js
@@ -0,0 +1,182 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { confirmEmail } from '../helpers/confirmEmail.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+import { testOutbox } from '../../services/mailService.js'
+import { parseCsv } from '../../utils/csv.js'
+import { splitSeries } from '../../services/dataService.js'
+
+const PASSWORD = 'senha12345'
+let auth
+
+async function signUp(name) {
+  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
+  const res = await request(app).post('/auth/login').send({ username: name, password: PASSWORD })
+  return { Authorization: `Bearer ${tokenFrom(res)}` }
+}
+
+const books = async (query = {}) => (await request(app).get('/library').set(auth).query({ limit: 100, sort: 'title', order: 'asc', ...query })).body.result
+
+const GOODREADS_HEADER = 'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies'
+
+const GOODREADS_CSV = [
+  GOODREADS_HEADER,
+  '234225,"Dune (Dune, #1)",Frank Herbert,"Herbert, Frank",,"=""0441013597""","=""9780441013593""",5,4.27,Ace Books,Paperback,688,2005,1965,2019/05/14,2019/01/02,"favoritos, sci-fi","favoritos (#1), sci-fi (#3)",read,Incrível.<br/>Reler.,,Emprestei pro João,1,0',
+  '11,"O Guia do Mochileiro",Douglas Adams,"Adams, Douglas",,"=""""","=""""",0,4.2,Arqueiro,Paperback,200,2009,1979,,2024/03/10,currently-reading,currently-reading (#1),currently-reading,,,,0,0',
+  '12,"Bons Presságios",Neil Gaiman,"Gaiman, Neil",Terry Pratchett,"=""""","=""""",0,4.2,Bertrand,Paperback,400,2019,1990,,2024/03/11,to-read,to-read (#1),to-read,,,,0,0',
+  '13,,Sem Título,"Título, Sem",,"=""""","=""""",0,0,,,,,,,2024/03/11,,,read,,,,0,0'
+].join('\n')
+
+beforeAll(async () => {
+  await clearDatabase()
+  testOutbox().length = 0
+  auth = await signUp('leitor')
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+describe('Importar do Goodreads', () => {
+  it('separa a série do título', () => {
+    expect(splitSeries('Dune (Dune, #1)')).toEqual({ title: 'Dune', series: 'Dune', seriesIndex: '1' })
+    expect(splitSeries('O Hobbit (A Terra-média #0.5)')).toEqual({ title: 'O Hobbit', series: 'A Terra-média', seriesIndex: '0.5' })
+    expect(splitSeries('Livro (edição especial)')).toEqual({ title: 'Livro (edição especial)', series: null, seriesIndex: null })
+  })
+
+  it('importa livros, status, nota, prateleiras, série e anotação; aponta a linha com erro', async () => {
+    const res = await request(app).post('/library/import').set(auth)
+      .attach('file', Buffer.from(GOODREADS_CSV), { filename: 'goodreads_library_export.csv', contentType: 'text/csv' })
+
+    expect(res.statusCode).toBe(200)
+    expect(res.body).toMatchObject({ format: 'goodreads', total: 4, imported: 3, duplicates: 0, failed: 1 })
+    expect(res.body.errors).toEqual([expect.objectContaining({ line: 5 })])
+
+    const list = await books()
+    expect(list.map(b => b.title)).toEqual(['Bons Presságios', 'Dune', 'O Guia do Mochileiro'])
+
+    const dune = list.find(b => b.title === 'Dune')
+    expect(dune.isbn).toBe('9780441013593')
+    expect(dune.rating).toBe(5)
+    expect(dune.series).toBe('Dune')
+    expect(dune.series_index).toBe(1)
+    expect(dune.tag_names).toEqual(['favoritos', 'sci fi'])
+    expect(new Date(dune.read_date).getUTCFullYear()).toBe(2019)
+
+    const full = (await request(app).get(`/library/${dune.book_id}`).set(auth)).body
+    expect(full.notes).toBe('Emprestei pro João\n\nIncrível.\nReler.')
+
+    expect(list.find(b => b.title === 'O Guia do Mochileiro').reading_status).toBe('reading')
+    const omens = list.find(b => b.title === 'Bons Presságios')
+    expect(omens.reading_status).toBe('want')
+    expect(omens.author_names).toEqual(['Neil Gaiman', 'Terry Pratchett'])
+  })
+
+  it('importar de novo não duplica', async () => {
+    const res = await request(app).post('/library/import').set(auth)
+      .attach('file', Buffer.from(GOODREADS_CSV), { filename: 'export.csv', contentType: 'text/csv' })
+    expect(res.body).toMatchObject({ imported: 0, duplicates: 3 })
+  })
+
+  it('recusa formato desconhecido, arquivo vazio e não-CSV', async () => {
+    const unknown = await request(app).post('/library/import').set(auth).attach('file', Buffer.from('a,b\n1,2\n'), { filename: 'x.csv', contentType: 'text/csv' })
+    expect(unknown.statusCode).toBe(400)
+    expect((await request(app).post('/library/import').set(auth)).statusCode).toBe(400)
+    const image = await request(app).post('/library/import').set(auth).attach('file', Buffer.from('xx'), { filename: 'x.png', contentType: 'image/png' })
+    expect(image.statusCode).toBe(400)
+  })
+})
+
+describe('Exportar', () => {
+  it('JSON com conta, metas e livros (inclusive anotação)', async () => {
+    await request(app).put('/dashboard/goal').set(auth).send({ year: 2026, target: 10 })
+    const res = await request(app).get('/auth/me/export').set(auth)
+    expect(res.statusCode).toBe(200)
+    expect(res.headers['content-disposition']).toMatch(/attachment; filename="librishelf-\d{4}-\d{2}-\d{2}\.json"/)
+    expect(res.body.account).toMatchObject({ username: 'leitor', email: 'leitor@example.com' })
+    expect(res.body.account).not.toHaveProperty('password_hash')
+    expect(res.body.readingGoals).toEqual([{ year: 2026, target: 10 }])
+    const dune = res.body.books.find(b => b.title === 'Dune')
+    expect(dune).toMatchObject({ authors: ['Frank Herbert'], status: 'read', series: 'Dune', volume: 1, rating: 5 })
+    expect(dune.notes).toContain('Emprestei')
+  })
+
+  it('CSV com cabeçalho e que volta igual na importação', async () => {
+    const res = await request(app).get('/auth/me/export').set(auth).query({ format: 'csv' }).buffer(true).parse((r, cb) => {
+      let data = ''
+      r.setEncoding('utf8')
+      r.on('data', chunk => { data += chunk })
+      r.on('end', () => cb(null, data))
+    })
+    expect(res.headers['content-type']).toMatch(/text\/csv/)
+    const rows = parseCsv(res.body)
+    expect(rows[0]).toEqual(['title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date', 'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at'])
+    expect(rows).toHaveLength(4)
+
+    // A outra conta importa o CSV exportado e fica com os mesmos livros.
+    const other = await signUp('copia')
+    const imported = await request(app).post('/library/import').set(other)
+      .attach('file', Buffer.from(res.body), { filename: 'librishelf.csv', contentType: 'text/csv' })
+    expect(imported.body).toMatchObject({ format: 'librishelf', imported: 3, failed: 0 })
+    const copy = (await request(app).get('/library').set(other).query({ sort: 'title', order: 'asc' })).body.result
+    expect(copy.map(b => [b.title, b.reading_status, Boolean(b.read_date)])).toEqual([
+      ['Bons Presságios', 'want', false],
+      ['Dune', null, true],
+      ['O Guia do Mochileiro', 'reading', false]
+    ])
+    expect(copy.find(b => b.title === 'Bons Presságios').author_names).toEqual(['Neil Gaiman', 'Terry Pratchett'])
+  })
+
+  it('exige login', async () => {
+    expect((await request(app).get('/auth/me/export')).statusCode).toBe(401)
+  })
+})
+
+describe('Trocar e-mail', () => {
+  it('pede a senha, o e-mail novo começa sem confirmação e o antigo recebe aviso', async () => {
+    await confirmEmail('leitor')
+    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'novo@example.com', password: 'errada' })).statusCode).toBe(401)
+
+    const before = testOutbox().length
+    const res = await request(app).patch('/auth/me/email').set(auth).send({ email: 'novo@example.com', password: PASSWORD, locale: 'pt' })
+    expect(res.statusCode).toBe(200)
+    expect(res.body.user).toMatchObject({ email: 'novo@example.com', emailVerified: false })
+
+    const sent = testOutbox().slice(before)
+    expect(sent.map(m => m.to).sort()).toEqual(['leitor@example.com', 'novo@example.com'])
+    const notice = sent.find(m => m.to === 'leitor@example.com')
+    expect(notice.subject).toBe('O e-mail da sua conta no Librishelf mudou')
+    expect(notice.text).toContain('no•••@example.com')
+    expect(notice.text).not.toContain('novo@example.com')
+  })
+
+  it('valida formato, igual ao atual e em uso por outra conta', async () => {
+    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'sem-arroba', password: PASSWORD })).statusCode).toBe(400)
+    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'NOVO@example.com', password: PASSWORD })).statusCode).toBe(400)
+    expect((await request(app).patch('/auth/me/email').set(auth).send({ email: 'Copia@Example.com', password: PASSWORD })).statusCode).toBe(409)
+  })
+})
+
+describe('Trocar nome de usuário', () => {
+  it('troca, devolve sessão nova e o login passa a ser pelo nome novo', async () => {
+    const res = await request(app).patch('/auth/me/username').set(auth).send({ username: 'leitor.novo', password: PASSWORD })
+    expect(res.statusCode).toBe(200)
+    expect(res.body.user.name).toBe('leitor.novo')
+    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i)
+
+    expect((await request(app).post('/auth/login').send({ username: 'leitor', password: PASSWORD })).statusCode).toBe(401)
+    expect((await request(app).post('/auth/login').send({ username: 'leitor.novo', password: PASSWORD })).statusCode).toBe(200)
+  })
+
+  it('valida regras do cadastro, senha e nome em uso (sem diferenciar maiúsculas)', async () => {
+    const send = body => request(app).patch('/auth/me/username').set(auth).send({ password: PASSWORD, ...body })
+    expect((await send({ username: 'com espaço' })).statusCode).toBe(400)
+    expect((await send({ username: 'a'.repeat(51) })).statusCode).toBe(400)
+    expect((await send({ username: '' })).statusCode).toBe(400)
+    expect((await send({ username: 'COPIA' })).statusCode).toBe(409)
+    expect((await send({ username: 'outro', password: 'errada' })).statusCode).toBe(401)
+    // Só mudar maiúsculas do próprio nome pode.
+    expect((await send({ username: 'Leitor.Novo' })).statusCode).toBe(200)
+  })
+})
diff --git a/backend/src/tests/unit/csv.test.js b/backend/src/tests/unit/csv.test.js
new file mode 100644
index 0000000..5e29c8f
--- /dev/null
+++ b/backend/src/tests/unit/csv.test.js
@@ -0,0 +1,26 @@
+import { parseCsv, csvToObjects, toCsv } from '../../utils/csv.js'
+
+describe('CSV', () => {
+  it('lê aspas, vírgulas, aspas duplicadas, quebras de linha, CRLF e BOM', () => {
+    const text = '﻿Title,Author\r\n"Duna, edição especial","Herbert ""Frank"""\r\n"Linha 1\nLinha 2",X\r\n\r\n'
+    expect(parseCsv(text)).toEqual([
+      ['Title', 'Author'],
+      ['Duna, edição especial', 'Herbert "Frank"'],
+      ['Linha 1\nLinha 2', 'X']
+    ])
+  })
+
+  it('vira objetos pelo cabeçalho; campo faltando vira vazio', () => {
+    const { headers, records } = csvToObjects('a,b,c\n1,2\n')
+    expect(headers).toEqual(['a', 'b', 'c'])
+    expect(records).toEqual([{ a: '1', b: '2', c: '' }])
+  })
+
+  it('escreve e lê de volta igual', () => {
+    const rows = [['título', 'notas'], ['Duna, 1', 'disse "oi"\nfim'], ['=SOMA(A1)', null]]
+    const back = parseCsv(toCsv(rows))
+    expect(back[1]).toEqual(['Duna, 1', 'disse "oi"\nfim'])
+    // fórmula vira texto
+    expect(back[2]).toEqual(["'=SOMA(A1)", ''])
+  })
+})
diff --git a/backend/src/utils/csv.js b/backend/src/utils/csv.js
new file mode 100644
index 0000000..01fea0a
--- /dev/null
+++ b/backend/src/utils/csv.js
@@ -0,0 +1,76 @@
+/**
+ * CSV (RFC 4180) sem dependência: aspas, aspas duplicadas, quebras de linha
+ * dentro de campos, CRLF e BOM do Excel.
+ */
+
+/** Texto CSV → lista de linhas (cada linha é uma lista de campos). */
+export function parseCsv(text) {
+  const input = String(text).replace(/^﻿/, '')
+  const rows = []
+  let row = []
+  let field = ''
+  let inQuotes = false
+
+  for (let i = 0; i < input.length; i++) {
+    const char = input[i]
+
+    if (inQuotes) {
+      if (char === '"') {
+        if (input[i + 1] === '"') {
+          field += '"'
+          i++
+        } else {
+          inQuotes = false
+        }
+      } else {
+        field += char
+      }
+      continue
+    }
+
+    if (char === '"') {
+      inQuotes = true
+    } else if (char === ',') {
+      row.push(field)
+      field = ''
+    } else if (char === '\n' || char === '\r') {
+      if (char === '\r' && input[i + 1] === '\n') i++
+      row.push(field)
+      rows.push(row)
+      row = []
+      field = ''
+    } else {
+      field += char
+    }
+  }
+
+  if (field !== '' || row.length > 0) {
+    row.push(field)
+    rows.push(row)
+  }
+
+  // Linhas totalmente vazias (fim do arquivo, linhas em branco) não contam.
+  return rows.filter(cells => cells.some(cell => cell.trim() !== ''))
+}
+
+/** Linhas → objetos usando a primeira linha como cabeçalho. */
+export function csvToObjects(text) {
+  const [header, ...rows] = parseCsv(text)
+  if (!header) return { headers: [], records: [] }
+  const headers = header.map(name => name.trim())
+  const records = rows.map(cells => Object.fromEntries(headers.map((name, i) => [name, cells[i] ?? ''])))
+  return { headers, records }
+}
+
+function escapeCell(value) {
+  if (value === null || value === undefined) return ''
+  let text = String(value)
+  // Fórmula em planilha (=, +, -, @ no começo) vira texto: evita "CSV injection".
+  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
+  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
+}
+
+/** Lista de linhas → texto CSV (com BOM para o Excel abrir acentos certo). */
+export function toCsv(rows) {
+  return '﻿' + rows.map(cells => cells.map(escapeCell).join(',')).join('\r\n') + '\r\n'
+}
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 3dae467..314724f 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -374,7 +374,41 @@
       "on": "You now accept follow requests.",
       "off": "Your followers can't see your activity anymore."
     },
-    "verifyFirst": "Confirm your email to turn these on. Use the link we sent or the \"Resend link\" button at the top of the page."
+    "verifyFirst": "Confirm your email to turn these on. Use the link we sent or the \"Resend link\" button at the top of the page.",
+    "account": {
+      "title": "Username and email",
+      "desc": "Your username (also your public library address) and contact email.",
+      "username": "Username",
+      "email": "Email",
+      "change": "Change",
+      "notVerified": "not confirmed",
+      "usernameTitle": "Change username",
+      "emailTitle": "Change email",
+      "usernameHint": "Letters, numbers, dot, hyphen and underscore. Your public library link changes too: the old address stops working.",
+      "emailHint": "We'll send a confirmation link to the new email and a notice to the current one.",
+      "newUsername": "New username",
+      "newEmail": "New email",
+      "usernameChanged": "You are now {name}.",
+      "emailChanged": "Email changed. Check the new inbox to confirm it."
+    },
+    "data": {
+      "title": "Your data",
+      "exportDesc": "Download a copy of everything: books, ratings, notes, status, goals and account data. The CSV opens in spreadsheets and can be imported back.",
+      "exportJson": "Download everything (JSON)",
+      "exportCsv": "Download books (CSV)",
+      "importTitle": "Import books",
+      "importDesc": "Bring your Goodreads shelf (or a CSV exported from Librishelf). Books already here are skipped.",
+      "step1": "On Goodreads, from a computer: My Books → Import and export → Export Library.",
+      "step2": "Download the .csv file when the link appears.",
+      "step3": "Choose the file below. Shelves become categories; \"read\", \"currently-reading\" and \"to-read\" become Read, Reading and Want to read.",
+      "chooseFile": "Choose a .csv file",
+      "importing": "Importing... this may take a few seconds.",
+      "imported": "No books imported | {n} book imported | {n} books imported",
+      "duplicates": "{n} was already on your shelf | {n} were already on your shelf",
+      "failed": "{n} with problems | {n} with problems",
+      "errorLine": "Line {line} ({title})",
+      "seeLibrary": "See in library"
+    }
   },
   "privacy": {
     "title": "Privacy Policy",
@@ -385,7 +419,7 @@
         "title": "What we collect",
         "paragraphs": [
           "Account data: username, email and password. Your password is stored securely and nobody can read it, not even us.",
-          "Content you add: your books and their details (title, authors, publisher, ISBN, tags, dates and ratings) and the covers you upload.",
+          "Content you add: your books and their details (title, authors, publisher, ISBN, series, tags, dates, ratings, reading status and goals), personal notes and the covers you upload. Personal notes are yours only: they never appear in your public library.",
           "Access data: the IP address of your visits is used briefly, only to protect the service from abuse such as repeated login attempts."
         ]
       },
@@ -440,7 +474,7 @@
       {
         "title": "Your rights (LGPD)",
         "paragraphs": [
-          "You can view, correct, request a copy of or delete your data at any time. You can make corrections and delete your account in the app itself; for other requests, reach us at the contact below."
+          "You can view, correct, download a copy of or delete your data at any time, all from the app: in Account → Your data you download everything as JSON or CSV, and deleting your account erases everything right away. For any other request, contact us below."
         ]
       },
       {
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 867d058..46ca9ae 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -374,7 +374,41 @@
       "on": "Agora você aceita pedidos para seguir.",
       "off": "Seus seguidores não veem mais sua atividade."
     },
-    "verifyFirst": "Confirme seu e-mail para ligar estas opções. Use o link que enviamos ou o botão \"Reenviar link\" no topo da página."
+    "verifyFirst": "Confirme seu e-mail para ligar estas opções. Use o link que enviamos ou o botão \"Reenviar link\" no topo da página.",
+    "account": {
+      "title": "Usuário e e-mail",
+      "desc": "Seu nome de usuário (também o endereço da biblioteca pública) e o e-mail de contato.",
+      "username": "Nome de usuário",
+      "email": "E-mail",
+      "change": "Alterar",
+      "notVerified": "não confirmado",
+      "usernameTitle": "Trocar nome de usuário",
+      "emailTitle": "Trocar e-mail",
+      "usernameHint": "Letras, números, ponto, hífen e sublinhado. O link da sua biblioteca pública muda junto: o endereço antigo deixa de funcionar.",
+      "emailHint": "Vamos mandar um link de confirmação para o e-mail novo, e um aviso para o atual.",
+      "newUsername": "Novo nome de usuário",
+      "newEmail": "Novo e-mail",
+      "usernameChanged": "Agora você é {name}.",
+      "emailChanged": "E-mail trocado. Confira a caixa de entrada do novo endereço para confirmar."
+    },
+    "data": {
+      "title": "Seus dados",
+      "exportDesc": "Baixe uma cópia de tudo: livros, notas, anotações, status, metas e dados da conta. O CSV abre em planilhas e pode ser importado de volta.",
+      "exportJson": "Baixar tudo (JSON)",
+      "exportCsv": "Baixar livros (CSV)",
+      "importTitle": "Importar livros",
+      "importDesc": "Traga sua estante do Goodreads (ou um CSV exportado do Librishelf). Livros que já estão aqui são pulados.",
+      "step1": "No Goodreads, pelo computador: My Books → Import and export → Export Library.",
+      "step2": "Baixe o arquivo .csv quando o link aparecer.",
+      "step3": "Escolha o arquivo abaixo. Prateleiras viram categorias; \"read\", \"currently-reading\" e \"to-read\" viram Lido, Lendo e Quero ler.",
+      "chooseFile": "Escolher arquivo .csv",
+      "importing": "Importando... isso pode levar alguns segundos.",
+      "imported": "Nenhum livro importado | {n} livro importado | {n} livros importados",
+      "duplicates": "{n} já estava na estante | {n} já estavam na estante",
+      "failed": "{n} com problema | {n} com problema",
+      "errorLine": "Linha {line} ({title})",
+      "seeLibrary": "Ver na biblioteca"
+    }
   },
   "privacy": {
     "title": "Política de Privacidade",
@@ -385,7 +419,7 @@
         "title": "Quais dados coletamos",
         "paragraphs": [
           "Dados da conta: nome de usuário, e-mail e senha. A senha é guardada de forma protegida e ninguém consegue lê-la, nem nós.",
-          "Conteúdo que você cadastra: seus livros e as informações deles (título, autores, editora, ISBN, tags, datas e notas) e as capas que você enviar.",
+          "Conteúdo que você cadastra: seus livros e as informações deles (título, autores, editora, ISBN, série, tags, datas, notas, status de leitura e metas), anotações pessoais e as capas que você enviar. As anotações pessoais são só suas: nunca aparecem na biblioteca pública.",
           "Dados de acesso: o endereço IP das suas visitas é usado por pouco tempo, só para proteger o serviço contra abuso, como tentativas repetidas de login."
         ]
       },
@@ -440,7 +474,7 @@
       {
         "title": "Seus direitos (LGPD)",
         "paragraphs": [
-          "Você pode consultar, corrigir, pedir uma cópia ou excluir seus dados a qualquer momento. Correções e a exclusão da conta você faz pelo próprio app; para os outros pedidos, fale com a gente pelo contato abaixo."
+          "Você pode consultar, corrigir, baixar uma cópia ou excluir seus dados a qualquer momento, tudo pelo próprio app: em Conta → Seus dados você baixa tudo em JSON ou CSV, e a exclusão da conta apaga tudo na hora. Para qualquer outro pedido, fale com a gente pelo contato abaixo."
         ]
       },
       {
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 9ef3143..2b2dd56 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -62,6 +62,34 @@ export default {
   },
 
   /** Qualquer combinação de { isPublic, showInCommunity, showActivity }. */
+  changeEmail(email, password, locale) {
+    return client.patch('/auth/me/email', { email, password, locale })
+  },
+
+  changeUsername(username, password) {
+    return client.patch('/auth/me/username', { username, password })
+  },
+
+  /** Baixa a exportação ('json' ou 'csv') como Blob, com o nome de arquivo do servidor. */
+  async exportData(format = 'json') {
+    const response = await fetch(`${API_URL}/auth/me/export?format=${format}`, { credentials: 'include' })
+    if (!response.ok) {
+      let message = 'Não foi possível exportar.'
+      try { message = (await response.json()).error || message } catch { /* corpo vazio */ }
+      throw new Error(message)
+    }
+    const disposition = response.headers.get('Content-Disposition') || ''
+    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `librishelf.${format}`
+    return { blob: await response.blob(), filename }
+  },
+
+  /** Importa um CSV do Goodreads ou do Librishelf. */
+  importBooks(file) {
+    const formData = new FormData()
+    formData.append('file', file)
+    return client.post('/library/import', formData)
+  },
+
   setPrivacy(settings) {
     return client.patch('/auth/me/visibility', settings)
   },
diff --git a/frontend/src/views/Settings.vue b/frontend/src/views/Settings.vue
index e5286f3..492dba9 100644
--- a/frontend/src/views/Settings.vue
+++ b/frontend/src/views/Settings.vue
@@ -103,6 +103,46 @@
           </div>
         </section>
 
+        <!-- Conta: nome de usuário e e-mail -->
+        <section
+          class="settings-card"
+          aria-labelledby="settings-account-title"
+        >
+          <h2 id="settings-account-title">{{ t('settings.account.title') }}</h2>
+          <p class="card-desc">{{ t('settings.account.desc') }}</p>
+
+          <dl class="account-rows">
+            <div class="account-row">
+              <dt>{{ t('settings.account.username') }}</dt>
+              <dd>
+                <span class="account-value">{{ user?.name }}</span>
+                <Button
+                  :label="t('settings.account.change')"
+                  class="p-button-text p-button-sm"
+                  @click="openAccountDialog('username')"
+                />
+              </dd>
+            </div>
+            <div class="account-row">
+              <dt>{{ t('settings.account.email') }}</dt>
+              <dd>
+                <span class="account-value">
+                  {{ user?.email }}
+                  <span
+                    v-if="!emailVerified"
+                    class="badge-pending"
+                  >{{ t('settings.account.notVerified') }}</span>
+                </span>
+                <Button
+                  :label="t('settings.account.change')"
+                  class="p-button-text p-button-sm"
+                  @click="openAccountDialog('email')"
+                />
+              </dd>
+            </div>
+          </dl>
+        </section>
+
         <!-- Senha -->
         <section
           class="settings-card"
@@ -173,6 +213,86 @@
           </form>
         </section>
 
+        <!-- Seus dados: exportar e importar -->
+        <section
+          class="settings-card"
+          aria-labelledby="settings-data-title"
+        >
+          <h2 id="settings-data-title">{{ t('settings.data.title') }}</h2>
+          <p class="card-desc">{{ t('settings.data.exportDesc') }}</p>
+          <div class="button-row">
+            <Button
+              :label="t('settings.data.exportJson')"
+              icon="pi pi-download"
+              class="p-button-outlined p-button-sm"
+              :loading="exporting === 'json'"
+              :disabled="Boolean(exporting)"
+              @click="downloadExport('json')"
+            />
+            <Button
+              :label="t('settings.data.exportCsv')"
+              icon="pi pi-file"
+              class="p-button-outlined p-button-sm"
+              :loading="exporting === 'csv'"
+              :disabled="Boolean(exporting)"
+              @click="downloadExport('csv')"
+            />
+          </div>
+
+          <h3 class="sub-title">{{ t('settings.data.importTitle') }}</h3>
+          <p class="card-desc">{{ t('settings.data.importDesc') }}</p>
+          <ol class="import-steps">
+            <li>{{ t('settings.data.step1') }}</li>
+            <li>{{ t('settings.data.step2') }}</li>
+            <li>{{ t('settings.data.step3') }}</li>
+          </ol>
+
+          <label
+            class="file-drop"
+            :class="{ busy: importing }"
+          >
+            <input
+              ref="importInput"
+              type="file"
+              accept=".csv,text/csv"
+              class="sr-only"
+              :disabled="importing"
+              @change="importFile"
+            />
+            <i
+              :class="importing ? 'pi pi-spin pi-spinner' : 'pi pi-upload'"
+              aria-hidden="true"
+            ></i>
+            <span>{{ importing ? t('settings.data.importing') : t('settings.data.chooseFile') }}</span>
+          </label>
+
+          <div
+            v-if="importResult"
+            class="import-result"
+            role="status"
+          >
+            <p class="import-summary">
+              <strong>{{ t('settings.data.imported', { n: importResult.imported }, importResult.imported) }}</strong>
+              <span v-if="importResult.duplicates"> · {{ t('settings.data.duplicates', { n: importResult.duplicates }, importResult.duplicates) }}</span>
+              <span v-if="importResult.failed"> · {{ t('settings.data.failed', { n: importResult.failed }, importResult.failed) }}</span>
+            </p>
+            <ul
+              v-if="importResult.errors?.length"
+              class="import-errors"
+            >
+              <li
+                v-for="error in importResult.errors.slice(0, 10)"
+                :key="error.line"
+              >{{ t('settings.data.errorLine', { line: error.line, title: error.title || '—' }) }}: {{ error.reason }}</li>
+            </ul>
+            <router-link
+              v-if="importResult.imported"
+              :to="{ name: 'library' }"
+              class="see-library"
+            >{{ t('settings.data.seeLibrary') }}</router-link>
+          </div>
+        </section>
+
         <!-- Excluir conta -->
         <section
           class="settings-card danger"
@@ -245,6 +365,51 @@
         </div>
       </form>
     </Dialog>
+
+    <Dialog
+      v-model:visible="accountDialog.visible"
+      modal
+      :header="accountDialog.field === 'email' ? t('settings.account.emailTitle') : t('settings.account.usernameTitle')"
+      :style="{ width: 'min(28rem, 92vw)' }"
+      :draggable="false"
+    >
+      <form
+        class="stack"
+        novalidate
+        @submit.prevent="saveAccount"
+      >
+        <p class="dialog-hint">{{ accountDialog.field === 'email' ? t('settings.account.emailHint') : t('settings.account.usernameHint') }}</p>
+        <div class="field">
+          <label for="settings-account-value">{{ accountDialog.field === 'email' ? t('settings.account.newEmail') : t('settings.account.newUsername') }}</label>
+          <input
+            id="settings-account-value"
+            v-model="accountDialog.value"
+            class="plain-input"
+            :type="accountDialog.field === 'email' ? 'email' : 'text'"
+            :autocomplete="accountDialog.field === 'email' ? 'email' : 'username'"
+            maxlength="254"
+          />
+        </div>
+        <div class="field">
+          <label for="settings-account-password">{{ t('settings.password.current') }}</label>
+          <Password
+            inputId="settings-account-password"
+            v-model="accountDialog.password"
+            :feedback="false"
+            toggleMask
+            class="w-full"
+            :inputProps="{ autocomplete: 'current-password' }"
+          />
+        </div>
+        <Button
+          type="submit"
+          :label="t('common.save')"
+          class="btn-action-primary"
+          :loading="accountDialog.saving"
+          :disabled="!accountDialog.value.trim() || !accountDialog.password"
+        />
+      </form>
+    </Dialog>
   </div>
 </template>
 
@@ -260,7 +425,7 @@ import Password from 'primevue/password'
 import api from '../services/api.js'
 import { currentUser, updateUser, setUser, clearSession } from '../services/session.js'
 
-const { t } = useI18n()
+const { t, locale } = useI18n()
 const toast = useToast()
 const router = useRouter()
 
@@ -338,6 +503,81 @@ async function changePassword() {
   }
 }
 
+// --- Conta: nome de usuário e e-mail ---
+const accountDialog = reactive({ visible: false, field: 'username', value: '', password: '', saving: false })
+
+function openAccountDialog(field) {
+  Object.assign(accountDialog, {
+    visible: true,
+    field,
+    value: field === 'email' ? user.value?.email || '' : user.value?.name || '',
+    password: '',
+    saving: false
+  })
+}
+
+async function saveAccount() {
+  accountDialog.saving = true
+  try {
+    const value = accountDialog.value.trim()
+    const result = accountDialog.field === 'email'
+      ? await api.changeEmail(value, accountDialog.password, locale.value)
+      : await api.changeUsername(value, accountDialog.password)
+    setUser(result.user)
+    accountDialog.visible = false
+    toast.add({
+      severity: 'success',
+      summary: t('common.success'),
+      detail: accountDialog.field === 'email' ? t('settings.account.emailChanged') : t('settings.account.usernameChanged', { name: result.user.name }),
+      life: 5000
+    })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    accountDialog.saving = false
+  }
+}
+
+// --- Seus dados ---
+const exporting = ref(null)
+const importing = ref(false)
+const importResult = ref(null)
+const importInput = ref(null)
+
+async function downloadExport(format) {
+  exporting.value = format
+  try {
+    const { blob, filename } = await api.exportData(format)
+    const url = URL.createObjectURL(blob)
+    const link = document.createElement('a')
+    link.href = url
+    link.download = filename
+    document.body.appendChild(link)
+    link.click()
+    link.remove()
+    setTimeout(() => URL.revokeObjectURL(url), 1000)
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    exporting.value = null
+  }
+}
+
+async function importFile(event) {
+  const file = event.target.files?.[0]
+  if (!file) return
+  importing.value = true
+  importResult.value = null
+  try {
+    importResult.value = await api.importBooks(file)
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 5000 })
+  } finally {
+    importing.value = false
+    if (importInput.value) importInput.value.value = ''
+  }
+}
+
 // --- Exclusão ---
 const deleteDialogVisible = ref(false)
 const deletePassword = ref('')
@@ -537,7 +777,158 @@ async function deleteAccount() {
   color: var(--main-color);
 }
 
+.account-rows {
+  margin: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+}
+
+.account-row {
+  display: grid;
+  grid-template-columns: 9rem minmax(0, 1fr);
+  align-items: center;
+  gap: 0.75rem;
+  padding: 0.35rem 0;
+  border-bottom: 1px solid var(--border-color);
+}
+
+.account-row:last-child {
+  border-bottom: none;
+}
+
+.account-row dt {
+  color: var(--text-secondary);
+  font-size: 0.9rem;
+}
+
+.account-row dd {
+  margin: 0;
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 0.5rem;
+  min-width: 0;
+}
+
+.account-value {
+  color: var(--text-primary);
+  font-weight: 600;
+  overflow-wrap: anywhere;
+}
+
+.badge-pending {
+  display: inline-block;
+  margin-left: 0.4rem;
+  padding: 0.1rem 0.5rem;
+  border-radius: 999px;
+  font-size: 0.72rem;
+  font-weight: 700;
+  color: #b45309;
+  background: rgba(245, 158, 11, 0.15);
+}
+
+.button-row {
+  display: flex;
+  gap: 0.6rem;
+  flex-wrap: wrap;
+}
+
+.sub-title {
+  margin: 1.5rem 0 0.25rem;
+  font-size: 1rem;
+  color: var(--text-primary);
+}
+
+.import-steps {
+  margin: 0 0 1rem;
+  padding-left: 1.2rem;
+  color: var(--text-secondary);
+  font-size: 0.9rem;
+  line-height: 1.6;
+}
+
+.file-drop {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.6rem;
+  padding: 1.1rem;
+  border: 2px dashed var(--border-color);
+  border-radius: 12px;
+  color: var(--text-secondary);
+  font-weight: 600;
+  cursor: pointer;
+  transition: border-color 0.15s ease, color 0.15s ease;
+}
+
+.file-drop:hover,
+.file-drop:focus-within {
+  border-color: var(--main-color);
+  color: var(--text-primary);
+}
+
+.file-drop.busy {
+  cursor: progress;
+}
+
+.import-result {
+  margin-top: 1rem;
+  padding: 0.9rem 1rem;
+  border-radius: 10px;
+  background: rgba(var(--main-color-rgb), 0.08);
+  border: 1px solid rgba(var(--main-color-rgb), 0.3);
+}
+
+.import-summary {
+  margin: 0;
+  color: var(--text-primary);
+}
+
+.import-errors {
+  margin: 0.6rem 0 0;
+  padding-left: 1.1rem;
+  color: var(--text-secondary);
+  font-size: 0.85rem;
+  line-height: 1.5;
+}
+
+.see-library {
+  display: inline-block;
+  margin-top: 0.6rem;
+  color: var(--main-color);
+  font-weight: 600;
+}
+
+.dialog-hint {
+  margin: 0;
+  color: var(--text-secondary);
+  font-size: 0.9rem;
+  line-height: 1.5;
+}
+
+.plain-input {
+  width: 100%;
+  background-color: var(--bg-input);
+  border: 1px solid var(--border-color);
+  padding: 0.7rem 0.9rem;
+  border-radius: 8px;
+  color: var(--text-primary);
+  font: inherit;
+  box-sizing: border-box;
+}
+
+.plain-input:focus {
+  border-color: var(--main-color);
+  outline: none;
+}
+
 @media (max-width: 640px) {
+  .account-row {
+    grid-template-columns: 1fr;
+    gap: 0.1rem;
+  }
+
   .settings-container {
     padding: 1.25rem;
   }
LIBRI_PATCH_EOF

step "1/3 Aplicando"
if git apply --reverse --check --whitespace=nowarn "$PATCH" 2>/dev/null; then
  ok "Já estava aplicado."
elif git apply --check --whitespace=nowarn "$PATCH" 2>/dev/null; then
  git apply --whitespace=nowarn "$PATCH"
  ok "Aplicado ($(grep -c '^diff --git' "$PATCH") arquivos)."
else
  # Algum arquivo mudou (ex.: formatação do editor): mescla como num merge do git.
  if ! git diff --quiet; then
    fail "Há mudanças não commitadas. Faça commit ou 'git stash' e rode de novo."
  fi
  if git apply --3way --whitespace=nowarn "$PATCH"; then
    ok "Aplicado mesclando com as mudanças que você já tinha."
  else
    warn "Ficaram conflitos marcados com <<<<<<< nos arquivos listados acima."
    fail "Resolva os conflitos (ou 'git checkout -- .' para desfazer) e rode de novo."
  fi
fi

step "2/3 Testes unitários do backend"
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd backend && npm run --silent test:unit -- --silent 2>&1 | grep -E '^(Tests|Test Suites):' | sed 's/^/  /'; exit "${PIPESTATUS[0]}"); then ok "Passando"; else fail "Falharam (rode 'npm run test:unit' no backend para ver)."; fi

step "3/3 Build do frontend"
[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd frontend && npx --no-install vite build >"$TMP_DIR/build.log" 2>&1); then ok "OK"; else tail -20 "$TMP_DIR/build.log" >&2; fail "Build falhou."; fi

step "Pronto — nada foi commitado"
git status --short | sed 's/^/  /'

cat <<'MSG'

Próximos passos
---------------
1. Suíte completa no backend:  npm test
   (testes novos: src/tests/integration/account-data.test.js e unit/csv.test.js)
2. Prévia do e-mail novo (aviso de troca de e-mail):  npm run email:preview
3. Teste em Conta: "Usuário e e-mail" → Alterar; "Seus dados" → baixar JSON/CSV
   e importar o CSV do Goodreads (My Books → Import and export → Export Library).
4. Commite e rode o pacote 5.

Sugestão de commit
------------------
feat(conta): exportar/importar dados e trocar e-mail e usuário

- GET /auth/me/export?format=json|csv: cópia completa dos dados (LGPD)
- POST /library/import: CSV do Goodreads ou do Librishelf (sem duplicar,
  status, notas, prateleiras, série do título, anotações; erros por linha)
- PATCH /auth/me/email: pede a senha, e-mail novo sem confirmação + aviso ao antigo
- PATCH /auth/me/username: pede a senha, mesmas regras do cadastro, sessão nova
- utils/csv.js sem dependências (com proteção contra fórmula em planilha)
- Conta: seções "Usuário e e-mail" e "Seus dados"; privacidade atualizada
MSG