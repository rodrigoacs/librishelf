#!/usr/bin/env bash
# =============================================================================
#  Librishelf — pacote 2 do backlog: leitura e painel
#
#  1. Status de leitura "Quero ler" e "Lendo" (além de "Lido"), com seletor no
#     livro, selo na capa, filtro na biblioteca e prateleira "Lendo agora" no Início
#  2. Meta anual: definir/mudar/remover no Painel, barra de progresso com o ritmo
#     esperado para o dia; o Início mostra "X de Y da meta do ano"
#  3. Painel: gráfico mês a mês (escolha o ano), histórico completo por ano
#     (sem o limite de 5 anos) e top editoras
#  4. Gráficos e listas do Painel levam para a biblioteca já filtrada
#     (ano, mês, categoria, autor, editora, Lendo, Quero ler)
#
#  Migration 005 (status + tabela de metas). Precisa do pacote 1 commitado.
#
#  Uso:   bash librishelf-pacote2-leitura-painel.sh [caminho/do/repo]
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
[ -e frontend/src/components/BookRow.vue ] || fail "Falta o pacote anterior (frontend/src/components/BookRow.vue não existe): aplique e commite os pacotes em ordem."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
PATCH="$TMP_DIR/pacote.patch"

cat > "$PATCH" <<'LIBRI_PATCH_EOF'
diff --git a/backend/db/migrations/005_reading_status_and_goals.sql b/backend/db/migrations/005_reading_status_and_goals.sql
new file mode 100644
index 0000000..bbaf884
--- /dev/null
+++ b/backend/db/migrations/005_reading_status_and_goals.sql
@@ -0,0 +1,34 @@
+-- 005 — status de leitura ("Quero ler" / "Lendo") e meta anual
+-- Idempotente: pode rodar mais de uma vez.
+
+-- "Lido" continua sendo read_date preenchida. reading_status guarda os outros
+-- dois estados: 'want' (quero ler) e 'reading' (lendo — inclusive releitura de
+-- um livro que já tem data de leitura). NULL = só está na estante.
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS reading_status text;
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS started_at timestamp without time zone;
+
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_constraint
+    WHERE conname = 'books_reading_status_check'
+      AND conrelid = 'librishelf.books'::regclass
+  ) THEN
+    ALTER TABLE librishelf.books
+      ADD CONSTRAINT books_reading_status_check CHECK (reading_status IN ('want', 'reading'));
+  END IF;
+END $$;
+
+-- "Lendo agora" e "Quero ler" são consultados direto (Início, filtros, painel).
+CREATE INDEX IF NOT EXISTS idx_books_user_reading_status
+  ON librishelf.books (user_id, reading_status)
+  WHERE reading_status IS NOT NULL;
+
+-- Meta de livros lidos por ano.
+CREATE TABLE IF NOT EXISTS librishelf.reading_goals (
+  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  year       integer NOT NULL CHECK (year BETWEEN 1900 AND 2200),
+  target     integer NOT NULL CHECK (target BETWEEN 1 AND 1000),
+  updated_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (user_id, year)
+);
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index 252e8b7..169fd4d 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -1176,3 +1176,42 @@ CREATE INDEX IF NOT EXISTS idx_users_email_lower ON librishelf.users (lower(emai
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('004_email_tokens')
 ON CONFLICT (version) DO NOTHING;
+
+-- ===========================================================================
+-- 005 — status de leitura ("Quero ler" / "Lendo") e meta anual
+-- ===========================================================================
+-- "Lido" continua sendo read_date preenchida. reading_status guarda os outros
+-- dois estados: 'want' (quero ler) e 'reading' (lendo — inclusive releitura de
+-- um livro que já tem data de leitura). NULL = só está na estante.
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS reading_status text;
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS started_at timestamp without time zone;
+
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_constraint
+    WHERE conname = 'books_reading_status_check'
+      AND conrelid = 'librishelf.books'::regclass
+  ) THEN
+    ALTER TABLE librishelf.books
+      ADD CONSTRAINT books_reading_status_check CHECK (reading_status IN ('want', 'reading'));
+  END IF;
+END $$;
+
+-- "Lendo agora" e "Quero ler" são consultados direto (Início, filtros, painel).
+CREATE INDEX IF NOT EXISTS idx_books_user_reading_status
+  ON librishelf.books (user_id, reading_status)
+  WHERE reading_status IS NOT NULL;
+
+-- Meta de livros lidos por ano.
+CREATE TABLE IF NOT EXISTS librishelf.reading_goals (
+  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  year       integer NOT NULL CHECK (year BETWEEN 1900 AND 2200),
+  target     integer NOT NULL CHECK (target BETWEEN 1 AND 1000),
+  updated_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (user_id, year)
+);
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('005_reading_status_and_goals')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index ac3daf4..b63371e 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -34,6 +34,8 @@ export const LIBRARY_QUERIES = {
       b.ol_work_key,
       b.created_at,
       b.read_date,
+      b.reading_status,
+      b.started_at,
       b.publication_date
     FROM
       librishelf.books AS b
@@ -52,6 +54,8 @@ export const LIBRARY_QUERIES = {
       b.ol_work_key,
       b.ol_edition_key,
       b.read_date,
+      b.reading_status,
+      b.started_at,
       b.publication_date,
       p.name AS publisher_name, -- O Frontend procura por .publisher_name
       (SELECT STRING_AGG(a.name, ', ' ORDER BY bal.position, a.id)
@@ -91,7 +95,28 @@ export const LIBRARY_QUERIES = {
   GET_OWNER: 'SELECT user_id FROM librishelf.books WHERE id = $1',
   FIND_BY_ISBN: 'SELECT * FROM librishelf.books WHERE isbn = $1 AND user_id = $2',
   DELETE_BOOK: 'DELETE FROM librishelf.books WHERE id = $1',
-  UPDATE_READ_DATE: 'UPDATE librishelf.books SET read_date = $1 WHERE id = $2',
+  // Marcar como lido tira o livro de "Quero ler"/"Lendo"; desmarcar não mexe no status.
+  UPDATE_READ_DATE: `
+    UPDATE librishelf.books
+    SET read_date = $1::timestamp,
+        reading_status = CASE WHEN $1::timestamp IS NOT NULL THEN NULL ELSE reading_status END,
+        last_modified = now()
+    WHERE id = $2
+  `,
+  SET_READING_STATUS: `
+    UPDATE librishelf.books
+    SET reading_status = $1,
+        started_at = $2::timestamp,
+        read_date = CASE WHEN $3 THEN NULL ELSE read_date END,
+        last_modified = now()
+    WHERE id = $4
+    RETURNING reading_status, to_char(started_at, 'YYYY-MM-DD') AS started_at, to_char(read_date, 'YYYY-MM-DD') AS read_date
+  `,
+  // Editar a data de leitura no formulário também tira de "Quero ler".
+  CLEAR_WANT_IF_READ: `
+    UPDATE librishelf.books SET reading_status = NULL
+    WHERE id = $1 AND read_date IS NOT NULL AND reading_status = 'want'
+  `,
   ADD_BOOK_FUNC: 'SELECT librishelf.add_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS book_id',
   UPDATE_BOOK_FUNC: 'SELECT librishelf.update_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
   UPDATE_RATING: 'UPDATE librishelf.books SET rating = $1, last_modified = now() WHERE id = $2 RETURNING rating',
@@ -234,17 +259,34 @@ export const DASHBOARD_QUERIES = {
   // COUNT/EXTRACT puros do pg), e COALESCE garante [] quando não há dados.
   STATS: `
     WITH user_books AS (
-      SELECT id, read_date
+      SELECT id, read_date, reading_status, publisher_id
       FROM librishelf.books
       WHERE user_id = $1
     ),
+    -- Histórico completo (todos os anos com leitura).
     reading_by_year AS (
       SELECT EXTRACT(YEAR FROM read_date::date)::int AS year, COUNT(*)::int AS count
       FROM user_books
       WHERE read_date IS NOT NULL
       GROUP BY 1
-      ORDER BY 1 DESC
-      LIMIT 5
+    ),
+    -- Mês a mês no ano $2 (os 12 meses, inclusive os zerados).
+    reading_by_month AS (
+      SELECT m.month, COUNT(ub.id)::int AS count
+      FROM generate_series(1, 12) AS m(month)
+      LEFT JOIN user_books ub
+        ON ub.read_date IS NOT NULL
+       AND EXTRACT(YEAR FROM ub.read_date::date) = $2
+       AND EXTRACT(MONTH FROM ub.read_date::date) = m.month
+      GROUP BY m.month
+    ),
+    top_publishers AS (
+      SELECT p.name, COUNT(ub.id)::int AS count
+      FROM user_books ub
+      JOIN librishelf.publishers p ON p.id = ub.publisher_id
+      GROUP BY p.name
+      ORDER BY count DESC, p.name ASC
+      LIMIT 6
     ),
     top_authors AS (
       SELECT a.name, COUNT(ub.id)::int AS count
@@ -269,7 +311,12 @@ export const DASHBOARD_QUERIES = {
         WHERE user_id = $1 AND isbn IS NOT NULL AND btrim(isbn) <> '' AND isbn13 IS NULL) AS invalid_isbn,
       (SELECT COUNT(*)::int FROM user_books) AS total_books,
       (SELECT COUNT(*)::int FROM user_books WHERE read_date IS NOT NULL) AS read_books,
+      (SELECT COUNT(*)::int FROM user_books WHERE reading_status = 'reading') AS reading_books,
+      (SELECT COUNT(*)::int FROM user_books WHERE reading_status = 'want') AS want_books,
+      (SELECT target FROM librishelf.reading_goals WHERE user_id = $1 AND year = $2) AS goal_target,
       COALESCE((SELECT json_agg(r ORDER BY r.year DESC) FROM reading_by_year r), '[]'::json) AS reading_by_year,
+      COALESCE((SELECT json_agg(m ORDER BY m.month) FROM reading_by_month m), '[]'::json) AS reading_by_month,
+      COALESCE((SELECT json_agg(p ORDER BY p.count DESC, p.name ASC) FROM top_publishers p), '[]'::json) AS top_publishers,
       COALESCE((SELECT json_agg(a ORDER BY a.count DESC, a.name ASC) FROM top_authors a), '[]'::json) AS top_authors,
       COALESCE((SELECT json_agg(t ORDER BY t.count DESC, t.name ASC) FROM top_tags t), '[]'::json) AS top_tags
   `
@@ -359,6 +406,16 @@ export const COMMUNITY_QUERIES = {
   `
 }
 
+export const GOAL_QUERIES = {
+  UPSERT: `
+    INSERT INTO librishelf.reading_goals (user_id, year, target)
+    VALUES ($1, $2, $3)
+    ON CONFLICT (user_id, year) DO UPDATE SET target = EXCLUDED.target, updated_at = now()
+    RETURNING year, target
+  `,
+  DELETE: 'DELETE FROM librishelf.reading_goals WHERE user_id = $1 AND year = $2'
+}
+
 export const PROFILE_QUERIES = {
   STATS: `
     WITH ub AS (
diff --git a/backend/src/repositories/dashboardRepository.js b/backend/src/repositories/dashboardRepository.js
index 5a0148d..d641a5c 100644
--- a/backend/src/repositories/dashboardRepository.js
+++ b/backend/src/repositories/dashboardRepository.js
@@ -1,16 +1,31 @@
 import { db } from "../database/connection.js"
-import { DASHBOARD_QUERIES as q } from "../database/queries.js"
+import { DASHBOARD_QUERIES as q, GOAL_QUERIES } from "../database/queries.js"
 
-export async function getDashboardStats(userId) {
-  const { rows } = await db.query(q.STATS, [userId])
+export async function getDashboardStats(userId, year) {
+  const { rows } = await db.query(q.STATS, [userId, year])
   const row = rows[0]
 
   return {
+    year,
     totalBooks: row.total_books,
     readBooks: row.read_books,
+    readingBooks: row.reading_books,
+    wantBooks: row.want_books,
+    goal: row.goal_target ?? null,
     readingByYear: row.reading_by_year,
+    readingByMonth: row.reading_by_month,
     topAuthors: row.top_authors,
     topTags: row.top_tags,
+    topPublishers: row.top_publishers,
     invalidIsbn: row.invalid_isbn
   }
 }
+
+export async function upsertGoal(userId, year, target) {
+  const { rows } = await db.query(GOAL_QUERIES.UPSERT, [userId, year, target])
+  return rows[0]
+}
+
+export async function deleteGoal(userId, year) {
+  await db.query(GOAL_QUERIES.DELETE, [userId, year])
+}
diff --git a/backend/src/repositories/libraryRepository.js b/backend/src/repositories/libraryRepository.js
index cf008ea..c7a6278 100644
--- a/backend/src/repositories/libraryRepository.js
+++ b/backend/src/repositories/libraryRepository.js
@@ -24,6 +24,7 @@ async function getAllBooksByUser(userId, filters = {}) {
     search,
     readState,
     readYear,
+    readMonth,
     author,
     publisher,
     tags,
@@ -43,12 +44,23 @@ async function getAllBooksByUser(userId, filters = {}) {
     query += ` AND b.read_date IS NOT NULL`
   } else if (readState === 'unread' || readState === 'false') {
     query += ` AND b.read_date IS NULL`
+  } else if (readState === 'reading' || readState === 'want') {
+    query += ` AND b.reading_status = $${paramIndex}`
+    params.push(readState)
+    paramIndex++
   }
 
   if (readYear && readYear !== 'all') {
     query += ` AND EXTRACT(YEAR FROM b.read_date) = $${paramIndex}`
     params.push(readYear)
     paramIndex++
+
+    // Mês só vale junto com o ano (gráfico mensal do painel → biblioteca).
+    if (readMonth) {
+      query += ` AND EXTRACT(MONTH FROM b.read_date) = $${paramIndex}`
+      params.push(readMonth)
+      paramIndex++
+    }
   }
 
   // Busca por título, ISBN ou nome de qualquer autor do livro. % e _ digitados
@@ -217,6 +229,15 @@ async function updateRating(bookId, rating) {
   return result.rows[0]?.rating ?? null
 }
 
+async function setReadingStatus(bookId, { status, startedAt, clearRead }) {
+  const result = await db.query(q.SET_READING_STATUS, [status, startedAt, clearRead, bookId])
+  return result.rows[0] ?? null
+}
+
+async function clearWantIfRead(bookId) {
+  await db.query(q.CLEAR_WANT_IF_READ, [bookId])
+}
+
 async function pruneUserNames(userId) {
   await db.query(q.PRUNE_USER_NAMES, [userId])
 }
@@ -238,5 +259,7 @@ export {
   deleteBookById,
   updateReadDate,
   updateRating,
+  setReadingStatus,
+  clearWantIfRead,
   pruneUserNames
 }
\ No newline at end of file
diff --git a/backend/src/routes/dashboard.js b/backend/src/routes/dashboard.js
index 4281a16..fc21097 100644
--- a/backend/src/routes/dashboard.js
+++ b/backend/src/routes/dashboard.js
@@ -10,11 +10,30 @@ router.use(authenticateToken)
 
 router.get('/stats', async (req, res) => {
   try {
-    const stats = await dashboardService.getStats(req.user.id)
+    const stats = await dashboardService.getStats(req.user.id, req.query.year)
     res.status(STATUS.OK).json(stats)
   } catch (error) {
     sendError(res, error, 'Dashboard Error')
   }
 })
 
+// Meta anual: PUT /dashboard/goal { year, target } · DELETE /dashboard/goal/2026
+router.put('/goal', async (req, res) => {
+  try {
+    const goal = await dashboardService.setGoal(req.user.id, req.body?.year, req.body?.target)
+    res.status(STATUS.OK).json(goal)
+  } catch (error) {
+    sendError(res, error, 'Erro ao salvar a meta')
+  }
+})
+
+router.delete('/goal/:year', async (req, res) => {
+  try {
+    await dashboardService.removeGoal(req.user.id, req.params.year)
+    res.status(STATUS.NO_CONTENT).end()
+  } catch (error) {
+    sendError(res, error, 'Erro ao remover a meta')
+  }
+})
+
 export default router
\ No newline at end of file
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 168ba0a..787fbb8 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -256,4 +256,14 @@ router.delete('/:id/read', validateNumericId(), async (req, res) => {
   }
 })
 
+// Status de leitura: { status: 'none' | 'want' | 'reading' | 'read', date?: 'YYYY-MM-DD' }
+router.patch('/:id/status', validateNumericId(), async (req, res) => {
+  try {
+    const result = await libraryService.setReadingStatus(req.params.id, req.user.id, req.body?.status, req.body?.date)
+    res.status(STATUS.OK).json(result)
+  } catch (error) {
+    sendError(res, error, 'Erro ao mudar o status de leitura')
+  }
+})
+
 export default router
\ No newline at end of file
diff --git a/backend/src/scripts/seed.js b/backend/src/scripts/seed.js
index 67ef62b..47aef98 100644
--- a/backend/src/scripts/seed.js
+++ b/backend/src/scripts/seed.js
@@ -429,6 +429,31 @@ async function insertBooks(users, catalog) {
   return total
 }
 
+/**
+ * "Lendo" (até 2 por leitor, começados nos últimos dias) e "Quero ler" (cerca
+ * de 1 em 8 dos não lidos), mais uma meta para o ano atual e o anterior.
+ */
+async function insertReadingStatusAndGoals() {
+  await db.query(`
+    WITH unread AS (
+      SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
+      FROM librishelf.books WHERE read_date IS NULL
+    )
+    UPDATE librishelf.books b
+    SET reading_status = CASE WHEN u.rn <= 2 THEN 'reading' ELSE 'want' END,
+        started_at = CASE WHEN u.rn <= 2 THEN (current_date - (u.rn * 9)::int) END
+    FROM unread u
+    WHERE b.id = u.id AND (u.rn <= 2 OR u.rn % 8 = 0)
+  `)
+  await db.query(`
+    INSERT INTO librishelf.reading_goals (user_id, year, target)
+    SELECT u.id, y.year, 12 + (u.id * 7 + y.year) % 19
+    FROM librishelf.users u
+    CROSS JOIN (VALUES (EXTRACT(YEAR FROM now())::int), (EXTRACT(YEAR FROM now())::int - 1)) AS y(year)
+    ON CONFLICT DO NOTHING
+  `)
+}
+
 async function insertFollows(users) {
   const byName = new Map(users.map(user => [user.name, user]))
   const pairs = new Map()
@@ -553,6 +578,7 @@ async function main() {
 
   await insertUsers(users)
   const books = await insertBooks(users, catalog)
+  await insertReadingStatusAndGoals()
   const follows = await insertFollows(users)
   const covers = CONFIG.covers ? await generateCovers(catalog) : 0
 
@@ -565,6 +591,8 @@ async function main() {
       (SELECT count(*)::int FROM librishelf.tags) AS tags,
       (SELECT count(*)::int FROM librishelf.books WHERE read_date IS NOT NULL) AS lidos,
       (SELECT count(*)::int FROM librishelf.books WHERE rating IS NOT NULL) AS com_nota,
+      (SELECT count(*)::int FROM librishelf.books WHERE reading_status = 'reading') AS lendo,
+      (SELECT count(*)::int FROM librishelf.books WHERE reading_status = 'want') AS quero_ler,
       (SELECT count(*)::int FROM librishelf.books WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND isbn13 IS NULL) AS isbn_invalido,
       (SELECT count(*)::int FROM librishelf.users WHERE is_public AND show_in_community) AS na_comunidade
   `)
diff --git a/backend/src/services/dashboardService.js b/backend/src/services/dashboardService.js
index a9b0562..e5201ba 100644
--- a/backend/src/services/dashboardService.js
+++ b/backend/src/services/dashboardService.js
@@ -1,5 +1,38 @@
 import * as dashboardRepository from '../repositories/dashboardRepository.js'
+import STATUS from '../utils/statusCodes.js'
 
-export async function getStats(userId) {
-  return await dashboardRepository.getDashboardStats(userId)
-}
\ No newline at end of file
+function httpError(message, status) {
+  const error = new Error(message)
+  error.status = status
+  return error
+}
+
+/** Ano do painel (gráfico mensal e meta). Padrão: o ano atual. */
+function normalizeYear(value) {
+  if (value === undefined || value === null || value === '') return new Date().getFullYear()
+  const year = Number(value)
+  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
+    throw httpError("Ano inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST)
+  }
+  return year
+}
+
+function normalizeTarget(value) {
+  const target = Number(value)
+  if (!Number.isInteger(target) || target < 1 || target > 1000) {
+    throw httpError('A meta precisa ser um número inteiro de 1 a 1000.', STATUS.BAD_REQUEST)
+  }
+  return target
+}
+
+export async function getStats(userId, year) {
+  return await dashboardRepository.getDashboardStats(userId, normalizeYear(year))
+}
+
+export async function setGoal(userId, year, target) {
+  return await dashboardRepository.upsertGoal(userId, normalizeYear(year), normalizeTarget(target))
+}
+
+export async function removeGoal(userId, year) {
+  await dashboardRepository.deleteGoal(userId, normalizeYear(year))
+}
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index ab3859e..71676b5 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -48,6 +48,26 @@ function normalizeReadDate(value) {
   return date
 }
 
+const READ_STATES = ['all', 'read', 'unread', 'true', 'false', 'reading', 'want']
+export const READING_STATUSES = ['none', 'want', 'reading', 'read']
+
+function normalizeReadState(value) {
+  if (value === undefined || value === null || value === '') return 'all'
+  if (!READ_STATES.includes(String(value))) {
+    throw httpError("Parâmetro 'readState' inválido.", STATUS.BAD_REQUEST)
+  }
+  return String(value)
+}
+
+function normalizeReadMonth(value) {
+  if (value === undefined || value === null || value === '') return undefined
+  const month = Number(value)
+  if (!Number.isInteger(month) || month < 1 || month > 12) {
+    throw httpError("Parâmetro 'readMonth' inválido: use um número de 1 a 12.", STATUS.BAD_REQUEST)
+  }
+  return month
+}
+
 function normalizeReadYear(readYear) {
   if (readYear === undefined || readYear === null || readYear === '' || readYear === 'all') return 'all'
 
@@ -89,8 +109,9 @@ async function getPublicBook(username, bookId) {
 async function getAllBooksByUser(userId, query) {
   const filters = {
     search: query.search || undefined,
-    readState: query.readState || 'all',
+    readState: normalizeReadState(query.readState),
     readYear: normalizeReadYear(query.readYear),
+    readMonth: normalizeReadMonth(query.readMonth),
     author: query.author || undefined,
     publisher: query.publisher || undefined,
     tags: query.tags || undefined,
@@ -196,7 +217,9 @@ async function updateBookDetails(bookId, userId, rawBook) {
     input.rating = current?.rating ?? null
   }
 
-  return await libraryRepository.updateBook(bookId, input)
+  await libraryRepository.updateBook(bookId, input)
+  if (input.readDate) await libraryRepository.clearWantIfRead(bookId)
+  return true
 }
 
 async function checkBookOwnership(bookId, userId) {
@@ -244,6 +267,52 @@ async function markBookAsUnread(bookId, userId) {
   return await libraryRepository.updateReadDate(bookId, null)
 }
 
+/**
+ * Status de leitura em um passo só:
+ *   none    → só na estante (tira "Quero ler"/"Lendo" e a data de leitura)
+ *   want    → "Quero ler" (apaga a data de leitura)
+ *   reading → "Lendo" desde `date` (ou hoje); num livro já lido é releitura e a data antiga fica
+ *   read    → "Lido" em `date` (ou hoje)
+ * Devolve { status, readDate, startedAt } já como ficaram no banco.
+ */
+async function setReadingStatus(bookId, userId, rawStatus, rawDate) {
+  await checkBookOwnership(bookId, userId)
+  const status = String(rawStatus ?? '')
+
+  if (!READING_STATUSES.includes(status)) {
+    throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST)
+  }
+
+  if (status === 'read') {
+    const readDate = normalizeReadDate(rawDate) ?? new Date().toISOString().slice(0, 10)
+    await libraryRepository.updateReadDate(bookId, readDate)
+    return { status: 'read', readDate, startedAt: null }
+  }
+
+  let startedAt = null
+  if (status === 'reading') {
+    startedAt = normalizeReadDate(rawDate)
+    if (!startedAt) {
+      const current = await libraryRepository.getBookByIdForUser(bookId, userId)
+      startedAt = current?.reading_status === 'reading' && current.started_at
+        ? new Date(current.started_at).toISOString().slice(0, 10)
+        : new Date().toISOString().slice(0, 10)
+    }
+  }
+
+  const row = await libraryRepository.setReadingStatus(bookId, {
+    status: status === 'want' || status === 'reading' ? status : null,
+    startedAt,
+    clearRead: status !== 'reading'
+  })
+
+  return {
+    status: row.reading_status ?? (row.read_date ? 'read' : 'none'),
+    readDate: row.read_date,
+    startedAt: row.started_at
+  }
+}
+
 export {
   getAllBooksByUser,
   getBookById,
@@ -256,6 +325,7 @@ export {
   deleteBook,
   markBookAsRead,
   markBookAsUnread,
+  setReadingStatus,
   setRating,
   getPublicLibraryByUsername,
   normalizeDate,
diff --git a/backend/src/tests/integration/reading-status.test.js b/backend/src/tests/integration/reading-status.test.js
new file mode 100644
index 0000000..812ef39
--- /dev/null
+++ b/backend/src/tests/integration/reading-status.test.js
@@ -0,0 +1,152 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+let auth
+let otherAuth
+const year = new Date().getFullYear()
+const today = new Date().toISOString().slice(0, 10)
+
+async function signUp(name) {
+  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
+  return { Authorization: `Bearer ${tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))}` }
+}
+
+async function addBook(title, extra = {}) {
+  const res = await request(app).post('/library').set(auth).field({ title, authors: 'Autora', ...extra })
+  expect(res.statusCode).toBe(201)
+  return res.body.bookId
+}
+
+const setStatus = (id, status, date, who = auth) =>
+  request(app).patch(`/library/${id}/status`).set(who).send(date ? { status, date } : { status })
+
+const getBook = async id => (await request(app).get(`/library/${id}`).set(auth)).body
+const titles = async query => (await request(app).get('/library').set(auth).query({ sort: 'title', order: 'asc', ...query })).body.result.map(b => b.title)
+
+beforeAll(async () => {
+  await clearDatabase()
+  auth = await signUp('leitora')
+  otherAuth = await signUp('intrusa')
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+describe('Status de leitura', () => {
+  let a, b, c
+
+  it('"Quero ler", "Lendo" e "Lido" aparecem no livro e na lista', async () => {
+    a = await addBook('Alfa')
+    b = await addBook('Beta')
+    c = await addBook('Gama')
+
+    expect((await setStatus(a, 'want')).body).toEqual({ status: 'want', readDate: null, startedAt: null })
+    const reading = await setStatus(b, 'reading', '2026-01-10')
+    expect(reading.body).toEqual({ status: 'reading', readDate: null, startedAt: '2026-01-10' })
+    expect((await setStatus(c, 'read')).body).toMatchObject({ status: 'read', readDate: today })
+
+    const book = await getBook(b)
+    expect(book.reading_status).toBe('reading')
+
+    const list = (await request(app).get('/library').set(auth)).body.result
+    expect(list.find(x => x.title === 'Alfa').reading_status).toBe('want')
+  })
+
+  it('filtra por "Lendo" e por "Quero ler"', async () => {
+    expect(await titles({ readState: 'reading' })).toEqual(['Beta'])
+    expect(await titles({ readState: 'want' })).toEqual(['Alfa'])
+    expect(await titles({ readState: 'true' })).toEqual(['Gama'])
+    expect(await titles({ readState: 'false' })).toEqual(['Alfa', 'Beta'])
+  })
+
+  it('marcar como lido tira de "Lendo"; "Lendo" de novo num livro lido é releitura', async () => {
+    await request(app).patch(`/library/${b}/read`).set(auth).send({ readDate: today })
+    expect((await getBook(b)).reading_status).toBeNull()
+
+    const reread = await setStatus(b, 'reading')
+    expect(reread.body.status).toBe('reading')
+    expect(reread.body.readDate).toBe(today) // a leitura anterior fica registrada
+  })
+
+  it('"Lendo" de novo sem data mantém o dia em que começou', async () => {
+    await setStatus(a, 'reading', '2026-02-01')
+    expect((await setStatus(a, 'reading')).body.startedAt).toBe('2026-02-01')
+  })
+
+  it('"Quero ler" e "nenhum" apagam a data de leitura', async () => {
+    expect((await setStatus(c, 'want')).body).toEqual({ status: 'want', readDate: null, startedAt: null })
+    expect((await setStatus(c, 'none')).body).toEqual({ status: 'none', readDate: null, startedAt: null })
+  })
+
+  it('editar a data de leitura no formulário tira de "Quero ler"', async () => {
+    await setStatus(c, 'want')
+    await request(app).put(`/library/${c}`).set(auth).send({ title: 'Gama', authors: ['Autora'], readDate: today })
+    const book = await getBook(c)
+    expect(book.reading_status).toBeNull()
+  })
+
+  it('valida status, data e dono', async () => {
+    expect((await setStatus(a, 'talvez')).statusCode).toBe(400)
+    expect((await setStatus(a, 'reading', 'ontem')).statusCode).toBe(400)
+    expect((await setStatus(a, 'read', '2999-01-01')).statusCode).toBe(400)
+    expect((await setStatus(a, 'want', null, otherAuth)).statusCode).toBe(403)
+    expect((await request(app).get('/library').set(auth).query({ readState: 'qualquer' })).statusCode).toBe(400)
+  })
+})
+
+describe('Filtro por mês de leitura', () => {
+  it('ano + mês filtram a lista; mês inválido → 400', async () => {
+    const d = await addBook('Delta', { readDate: `${year - 1}-03-15` })
+    expect(d).toBeTruthy()
+    expect(await titles({ readYear: year - 1, readMonth: 3 })).toEqual(['Delta'])
+    expect(await titles({ readYear: year - 1, readMonth: 4 })).toEqual([])
+    expect((await request(app).get('/library').set(auth).query({ readYear: year, readMonth: 13 })).statusCode).toBe(400)
+  })
+})
+
+describe('Painel', () => {
+  it('conta "Lendo" e "Quero ler", mês a mês do ano pedido, editoras e histórico completo', async () => {
+    for (const y of [year - 9, year - 8, year - 7, year - 6, year - 5]) {
+      await addBook(`Antigo ${y}`, { readDate: `${y}-06-01`, publisher: 'Editora Velha' })
+    }
+
+    const stats = (await request(app).get('/dashboard/stats').set(auth).query({ year: year - 1 })).body
+    expect(stats.year).toBe(year - 1)
+    expect(stats.readingBooks).toBe(2)
+    expect(stats.wantBooks).toBe(0)
+    expect(stats.readingByMonth).toHaveLength(12)
+    expect(stats.readingByMonth[2]).toEqual({ month: 3, count: 1 })
+    expect(stats.readingByYear.length).toBeGreaterThanOrEqual(7) // sem o antigo limite de 5 anos
+    expect(stats.topPublishers[0]).toEqual({ name: 'Editora Velha', count: 5 })
+    expect(stats.goal).toBeNull()
+  })
+
+  it('ano inválido → 400; sem ano usa o atual', async () => {
+    expect((await request(app).get('/dashboard/stats').set(auth).query({ year: 'abc' })).statusCode).toBe(400)
+    expect((await request(app).get('/dashboard/stats').set(auth)).body.year).toBe(year)
+  })
+})
+
+describe('Meta anual', () => {
+  it('cria, atualiza, aparece no painel e remove', async () => {
+    expect((await request(app).put('/dashboard/goal').set(auth).send({ year, target: 12 })).body).toEqual({ year, target: 12 })
+    expect((await request(app).put('/dashboard/goal').set(auth).send({ year, target: 20 })).body.target).toBe(20)
+    expect((await request(app).get('/dashboard/stats').set(auth)).body.goal).toBe(20)
+
+    // A meta é de cada um.
+    expect((await request(app).get('/dashboard/stats').set(otherAuth)).body.goal).toBeNull()
+
+    expect((await request(app).delete(`/dashboard/goal/${year}`).set(auth)).statusCode).toBe(204)
+    expect((await request(app).get('/dashboard/stats').set(auth)).body.goal).toBeNull()
+  })
+
+  it('meta inválida → 400', async () => {
+    for (const target of [0, -1, 1001, 2.5, 'dez', null]) {
+      expect((await request(app).put('/dashboard/goal').set(auth).send({ year, target })).statusCode).toBe(400)
+    }
+    expect((await request(app).put('/dashboard/goal').set(auth).send({ year: 99, target: 5 })).statusCode).toBe(400)
+  })
+})
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index 1f7ec56..292b60f 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -221,33 +221,55 @@
           class="details-content view"
         >
           <div
-            v-if="!isReadOnly || book.read_date"
+            v-if="!isReadOnly"
             class="read-state"
           >
-            <template v-if="book.read_date">
-              <span class="read-pill">
+            <div
+              class="status-picker"
+              role="group"
+              :aria-label="t('status.label')"
+            >
+              <button
+                v-for="option in STATUS_OPTIONS"
+                :key="option"
+                type="button"
+                class="status-option"
+                :class="[option, { active: currentStatus === option }]"
+                :aria-pressed="currentStatus === option"
+                :disabled="readSaving"
+                @click="changeStatus(option)"
+              >
                 <i
-                  class="pi pi-check"
+                  :class="STATUS_ICONS[option]"
                   aria-hidden="true"
                 ></i>
-                {{ t('bookDialog.readOn', { date: formatDate(book.read_date) }) }}
-              </span>
+                <span>{{ t(`status.${option}`) }}</span>
+              </button>
+            </div>
+            <p
+              v-if="statusCaption"
+              class="status-caption"
+            >
+              {{ statusCaption }}
               <button
-                v-if="!isReadOnly"
                 type="button"
                 class="link-btn"
                 :disabled="readSaving"
-                @click="markUnread"
-              >{{ t('bookDialog.undoRead') }}</button>
-            </template>
-            <Button
-              v-else
-              :label="t('bookDialog.markRead')"
-              icon="pi pi-check"
-              class="p-button-sm mark-read-btn"
-              :loading="readSaving"
-              @click="markRead"
-            />
+                @click="changeStatus(currentStatus)"
+              >{{ t('status.clear') }}</button>
+            </p>
+          </div>
+          <div
+            v-else-if="currentStatus !== 'none'"
+            class="read-state"
+          >
+            <span class="read-pill">
+              <i
+                :class="STATUS_ICONS[currentStatus]"
+                aria-hidden="true"
+              ></i>
+              {{ statusCaption }}
+            </span>
           </div>
 
           <ul
@@ -476,6 +498,7 @@ import { currentUser } from '../services/session.js'
 import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import GeneratedCover from './GeneratedCover.vue'
 import { fromApiDate, toApiDate } from '../utils/dates.js'
+import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../utils/readingStatus.js'
 import { validateImageFile, createPreviewHandle } from '../utils/files.js'
 
 const { t, locale } = useI18n()
@@ -509,7 +532,7 @@ const preview = createPreviewHandle()
 
 function emptyBook() {
   // authors: texto para exibir; authorNames: a lista que é editada e salva.
-  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, pubdate: null }
+  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, pubdate: null }
 }
 
 const book = ref(emptyBook())
@@ -552,26 +575,37 @@ const metaItems = computed(() => {
   return items
 })
 
-async function markRead() {
-  readSaving.value = true
-  try {
-    const today = new Date()
-    await api.markAsRead(props.bookId, toApiDate(today))
-    book.value.read_date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
-    emit('updated', { book: { book_id: props.bookId, read_date: toApiDate(today) }, coverChanged: false })
-  } catch (error) {
-    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
-  } finally {
-    readSaving.value = false
+const currentStatus = computed(() => statusOf(book.value))
+
+const statusCaption = computed(() => {
+  const status = currentStatus.value
+  if (status === 'read') return t('bookDialog.readOn', { date: formatDate(book.value.read_date) })
+  if (status === 'reading') {
+    return book.value.started_at
+      ? t('status.readingSince', { date: formatDate(book.value.started_at) })
+      : t('status.reading')
   }
-}
+  if (status === 'want') return t('status.wantCaption')
+  return ''
+})
 
-async function markUnread() {
+/**
+ * Quero ler / Lendo / Lido. Clicar no status que já está marcado tira o status
+ * (o livro volta a só estar na estante). Datas vão no fuso da pessoa.
+ */
+async function changeStatus(option) {
+  const next = currentStatus.value === option ? 'none' : option
   readSaving.value = true
   try {
-    await api.markAsUnread(props.bookId)
-    book.value.read_date = null
-    emit('updated', { book: { book_id: props.bookId, read_date: null }, coverChanged: false })
+    const today = toApiDate(new Date())
+    const result = await api.setReadingStatus(props.bookId, next, next === 'read' || next === 'reading' ? today : undefined)
+    book.value.read_date = fromApiDate(result.readDate)
+    book.value.started_at = fromApiDate(result.startedAt)
+    book.value.reading_status = result.status === 'want' || result.status === 'reading' ? result.status : null
+    emit('updated', {
+      book: { book_id: props.bookId, read_date: result.readDate, reading_status: book.value.reading_status, started_at: result.startedAt },
+      coverChanged: false
+    })
   } catch (error) {
     toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
   } finally {
@@ -781,6 +815,8 @@ function applyResponse(data) {
     publisher: data.publisher_name || data.publisher || '',
     tags: data.tags || '',
     read_date: fromApiDate(data.read_date),
+    reading_status: data.reading_status ?? null,
+    started_at: fromApiDate(data.started_at),
     pubdate: fromApiDate(data.publication_date)
   }
 }
@@ -1101,18 +1137,67 @@ button.cover-wrapper {
   font-size: 0.8rem;
 }
 
-.mark-read-btn.p-button {
-  background: transparent;
-  border: 1px solid var(--main-color);
-  color: var(--main-color);
+.read-state:has(.status-picker) {
+  flex-direction: column;
+  align-items: flex-start;
+  gap: 0.5rem;
+}
+
+.status-picker {
+  display: inline-flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.status-option {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  padding: 0.45rem 0.9rem;
   border-radius: 999px;
+  border: 1px solid var(--border-color);
+  background: transparent;
+  color: var(--text-secondary);
+  font: inherit;
+  font-size: 0.88rem;
   font-weight: 600;
+  cursor: pointer;
+  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
 }
 
-.mark-read-btn.p-button:enabled:hover {
-  background: rgba(var(--main-color-rgb), 0.12);
+.status-option .pi {
+  font-size: 0.8rem;
+}
+
+.status-option:hover:not(:disabled) {
   border-color: var(--main-color);
-  color: var(--main-color);
+  color: var(--text-primary);
+}
+
+.status-option.active {
+  background: var(--main-color);
+  border-color: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.status-option:disabled {
+  opacity: 0.6;
+  cursor: progress;
+}
+
+.status-option:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+.status-caption {
+  margin: 0;
+  font-size: 0.85rem;
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  flex-wrap: wrap;
 }
 
 .link-btn {
diff --git a/frontend/src/components/BookItem.vue b/frontend/src/components/BookItem.vue
index 8f30efd..4345665 100644
--- a/frontend/src/components/BookItem.vue
+++ b/frontend/src/components/BookItem.vue
@@ -26,6 +26,12 @@
           aria-hidden="true"
         ></span>
 
+        <span
+          v-if="status === 'reading' || status === 'want'"
+          class="status-badge"
+          :class="status"
+        >{{ t(`status.${status}`) }}</span>
+
         <span
           v-if="isRead"
           class="bookmark-ribbon"
@@ -81,6 +87,7 @@ import { ref, computed, watch } from 'vue'
 import { useI18n } from 'vue-i18n'
 import BookDialog from './BookDialog.vue'
 import { useReadToggle } from '../composables/useReadToggle.js'
+import { statusOf } from '../utils/readingStatus.js'
 import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import GeneratedCover from './GeneratedCover.vue'
 
@@ -99,7 +106,8 @@ const emit = defineEmits(['updated', 'deleted'])
 const displayDialog = ref(false)
 
 const bookId = computed(() => props.book.book_id ?? props.book.id)
-const isRead = computed(() => Boolean(props.book.read_date))
+const status = computed(() => statusOf(props.book))
+const isRead = computed(() => status.value === 'read')
 const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))
 const bookCoverUrl = computed(() => coverUrl(bookId.value, props.coverVersion))
 
@@ -113,7 +121,7 @@ function onCoverError(event) {
 
 const ariaLabel = computed(() => {
   const parts = [props.book.title, props.book.authors].filter(Boolean)
-  if (isRead.value) parts.push(t('book.read_ribbon'))
+  if (status.value !== 'none') parts.push(t(`status.${status.value}`))
   return parts.join(' — ')
 })
 </script>
@@ -285,6 +293,31 @@ button.book-card {
   font-weight: bold;
 }
 
+.status-badge {
+  position: absolute;
+  left: 8px;
+  bottom: 8px;
+  z-index: 3;
+  padding: 0.2rem 0.55rem;
+  border-radius: 999px;
+  font-size: 0.72rem;
+  font-weight: 700;
+  letter-spacing: 0.2px;
+  line-height: 1.3;
+  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
+}
+
+.status-badge.reading {
+  background: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.status-badge.want {
+  background: rgba(0, 0, 0, 0.6);
+  color: #ffffff;
+  border: 1px solid rgba(255, 255, 255, 0.35);
+}
+
 .book-details {
   display: block;
   padding: 12px;
diff --git a/frontend/src/components/BookRow.vue b/frontend/src/components/BookRow.vue
index ff1c0eb..7e3b556 100644
--- a/frontend/src/components/BookRow.vue
+++ b/frontend/src/components/BookRow.vue
@@ -50,8 +50,8 @@
 
       <span
         class="col read"
-        :class="{ 'is-read': isRead }"
-      >{{ isRead ? readDateLabel : t('library.unread') }}</span>
+        :class="[`status-${status}`]"
+      >{{ statusLabel }}</span>
     </button>
 
     <button
@@ -89,6 +89,7 @@ import GeneratedCover from './GeneratedCover.vue'
 import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import { fromApiDate } from '../utils/dates.js'
 import { useReadToggle } from '../composables/useReadToggle.js'
+import { statusOf } from '../utils/readingStatus.js'
 
 /** Linha da biblioteca no modo lista: mais livros por tela, com os dados principais. */
 const props = defineProps({
@@ -101,7 +102,8 @@ const { t, locale } = useI18n()
 const displayDialog = ref(false)
 
 const bookId = computed(() => props.book.book_id ?? props.book.id)
-const isRead = computed(() => Boolean(props.book.read_date))
+const status = computed(() => statusOf(props.book))
+const isRead = computed(() => status.value === 'read')
 const bookCoverUrl = computed(() => coverUrl(bookId.value, props.coverVersion))
 const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))
 
@@ -122,9 +124,15 @@ const readDateLabel = computed(() => {
   return date.toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
 })
 
+const statusLabel = computed(() => {
+  if (status.value === 'read') return readDateLabel.value
+  if (status.value === 'none') return t('library.unread')
+  return t(`status.${status.value}`)
+})
+
 const ariaLabel = computed(() => {
   const parts = [props.book.title, props.book.authors].filter(Boolean)
-  parts.push(isRead.value ? t('library.read') : t('library.unread'))
+  parts.push(status.value === 'read' ? t('library.read') : statusLabel.value)
   return parts.join(' — ')
 })
 </script>
@@ -230,7 +238,16 @@ const ariaLabel = computed(() => {
   font-size: 0.85rem;
 }
 
-.read.is-read {
+.read.status-read {
+  color: var(--text-primary);
+}
+
+.read.status-reading {
+  color: var(--main-color);
+  font-weight: 600;
+}
+
+.read.status-want {
   color: var(--text-primary);
 }
 
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 8de1fc9..88f3eef 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -98,16 +98,16 @@
       <div class="chips-container">
         <Chip
           v-if="filters.readState !== 'all'"
-          :label="filters.readState === 'read' ? t('library.read') : t('library.unread')"
+          :label="readStateLabel(filters.readState)"
           removable
           @remove="emitFilter('readState', 'all')"
           class="custom-chip theme-border"
         />
         <Chip
           v-if="hasReadYear"
-          :label="t('library.read_year_chip', { year: filters.readYear })"
+          :label="readPeriodLabel"
           removable
-          @remove="emitFilter('readYear', 'all')"
+          @remove="clearReadPeriod"
           class="custom-chip theme-border"
         />
         <Chip
@@ -165,14 +165,15 @@
       <div class="sidebar-content">
         <div class="filter-group">
           <label id="filter-read-status">{{ t('library.read_status') }}</label>
-          <SelectButton
+          <Dropdown
             :modelValue="filters.readState"
-            :options="['all', 'read', 'unread']"
-            :optionLabel="opt => opt === 'all' ? t('library.all') : (opt === 'read' ? t('library.read') : t('library.unread'))"
-            :allowEmpty="false"
+            :options="readStateOptions"
+            optionLabel="label"
+            optionValue="value"
             aria-labelledby="filter-read-status"
+            class="w-full custom-dropdown"
+            panelClass="custom-panel"
             @update:modelValue="value => emitFilter('readState', value)"
-            class="w-full custom-selectbutton"
           />
         </div>
 
@@ -187,7 +188,7 @@
             :placeholder="t('library.select_year')"
             class="w-full custom-dropdown"
             panelClass="custom-panel"
-            @update:modelValue="value => emitFilter('readYear', value)"
+            @update:modelValue="setReadYear"
           />
         </div>
 
@@ -291,7 +292,6 @@ import { tagColor } from '../utils/tagColors.js'
 import { ref, computed, watch, onMounted } from 'vue'
 import Button from 'primevue/button'
 import Sidebar from 'primevue/sidebar'
-import SelectButton from 'primevue/selectbutton'
 import MultiSelect from 'primevue/multiselect'
 import Dropdown from 'primevue/dropdown'
 import Chip from 'primevue/chip'
@@ -299,7 +299,7 @@ import AddBookDialog from './AddBookDialog.vue'
 import api from '../services/api.js'
 import { useI18n } from 'vue-i18n'
 
-const { t } = useI18n()
+const { t, locale } = useI18n()
 
 // Os filtros vêm do useLibrary (fonte única); este componente só exibe e emite
 // mudanças. Assim filtros vindos da URL, do "Limpar" do estado vazio etc.
@@ -351,6 +351,42 @@ const yearOptions = computed(() => {
 
 const hasReadYear = computed(() => Boolean(props.filters.readYear) && props.filters.readYear !== 'all')
 
+const READ_STATE_KEYS = {
+  all: 'library.all',
+  want: 'status.want',
+  reading: 'status.reading',
+  read: 'library.read',
+  unread: 'library.unread'
+}
+
+const readStateOptions = computed(() =>
+  ['all', 'want', 'reading', 'read', 'unread'].map(value => ({ value, label: t(READ_STATE_KEYS[value]) }))
+)
+
+function readStateLabel(value) {
+  return t(READ_STATE_KEYS[value] ?? 'library.all')
+}
+
+// "Lidos em 2025" ou "Lidos em março de 2025" (quando veio do gráfico mensal).
+const readPeriodLabel = computed(() => {
+  const { readYear, readMonth } = props.filters
+  if (!readMonth) return t('library.read_year_chip', { year: readYear })
+  const month = new Date(Number(readYear), readMonth - 1, 1)
+    .toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' })
+  return t('library.read_month_chip', { period: month })
+})
+
+// Trocar o ano tira o mês (ele só existe junto com o ano de onde veio).
+function setReadYear(value) {
+  emit('filter-change', { key: 'readMonth', value: null, silent: true })
+  emitFilter('readYear', value)
+}
+
+function clearReadPeriod() {
+  emit('filter-change', { key: 'readMonth', value: null, silent: true })
+  emitFilter('readYear', 'all')
+}
+
 const hasActiveFilters = computed(() => {
   const f = props.filters
   return f.readState !== 'all' ||
diff --git a/frontend/src/composables/useLibrary.js b/frontend/src/composables/useLibrary.js
index e3c117a..38d8cda 100644
--- a/frontend/src/composables/useLibrary.js
+++ b/frontend/src/composables/useLibrary.js
@@ -8,6 +8,7 @@ function defaultFilters() {
     search: '',
     readState: 'all',
     readYear: 'all',
+    readMonth: null,
     author: [],
     publisher: [],
     tags: [],
@@ -29,9 +30,9 @@ function buildParams(filters) {
 
   if (filters.search) params.search = filters.search
 
-  if (filters.readState !== 'all') {
-    params.readState = filters.readState === 'read' ? 'true' : 'false'
-  }
+  if (filters.readState === 'read') params.readState = 'true'
+  else if (filters.readState === 'unread') params.readState = 'false'
+  else if (filters.readState === 'reading' || filters.readState === 'want') params.readState = filters.readState
 
   // Listas vão como parâmetro repetido (author=A&author=B): o nome pode ter vírgula.
   if (filters.author?.length > 0) {
@@ -50,6 +51,7 @@ function buildParams(filters) {
 
   if (filters.readYear && filters.readYear !== 'all') {
     params.readYear = filters.readYear
+    if (filters.readMonth) params.readMonth = filters.readMonth
   }
 
   return params
diff --git a/frontend/src/composables/useReadToggle.js b/frontend/src/composables/useReadToggle.js
index cebea05..2043664 100644
--- a/frontend/src/composables/useReadToggle.js
+++ b/frontend/src/composables/useReadToggle.js
@@ -3,6 +3,7 @@ import { useI18n } from 'vue-i18n'
 import { useToast } from 'primevue/usetoast'
 import api from '../services/api.js'
 import { toApiDate } from '../utils/dates.js'
+import { statusOf } from '../utils/readingStatus.js'
 
 /**
  * Marcar/desmarcar como lido direto no card ou na linha da lista, sem abrir
@@ -21,7 +22,8 @@ export function useReadToggle(getBook, onUpdated) {
     if (saving.value) return
     const book = getBook()
     const bookId = book.book_id ?? book.id
-    const wasRead = Boolean(book.read_date)
+    // "Lendo" (inclusive releitura) e "Quero ler" viram "Lido"; "Lido" volta a não lido.
+    const wasRead = statusOf(book) === 'read'
 
     saving.value = true
     try {
@@ -31,7 +33,7 @@ export function useReadToggle(getBook, onUpdated) {
       } else {
         const today = toApiDate(new Date())
         await api.markAsRead(bookId, today)
-        onUpdated({ book: { book_id: bookId, read_date: today }, coverChanged: false })
+        onUpdated({ book: { book_id: bookId, read_date: today, reading_status: null }, coverChanged: false })
       }
     } catch (error) {
       toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 91c1849..f19d373 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -58,7 +58,10 @@
     "addFirst": "Add your first book",
     "tipIsbn": "Type the ISBN (on the back, near the barcode) and click Look up.",
     "tipRead": "Mark the books you have read and give them 1 to 5 stars.",
-    "tipShare": "In Account, make your library public to share the link and find other readers."
+    "tipShare": "In Account, make your library public to share the link and find other readers.",
+    "readingNow": "Reading now",
+    "seeReading": "See all",
+    "readOfGoal": "{n} of {goal} for this year's goal"
   },
   "book": {
     "new_title": "New Book",
@@ -138,7 +141,8 @@
     "view_label": "View mode",
     "view_grid": "Grid",
     "view_list": "List",
-    "row_rating": "Rated {n} out of 5"
+    "row_rating": "Rated {n} out of 5",
+    "read_month_chip": "Read in {period}"
   },
   "bookDialog": {
     "bookCover": "Book Cover",
@@ -223,7 +227,7 @@
     "readBooks": "Books Read",
     "unreadBooks": "To Read",
     "readingRate": "Reading Rate",
-    "readingByYear": "Reading by Year",
+    "readingByYear": "Books read per year",
     "favoriteGenres": "Favorite Genres",
     "topAuthors": "Top Authors",
     "noTagsData": "No tag data available",
@@ -231,7 +235,17 @@
     "books": "Books",
     "loadError": "Could not load your statistics.",
     "noYearData": "No reading recorded yet",
-    "invalidIsbn": "{n} book with an invalid ISBN — fix it so it shows up in the community. | {n} books with an invalid ISBN — fix them so they show up in the community."
+    "invalidIsbn": "{n} book with an invalid ISBN — fix it so it shows up in the community. | {n} books with an invalid ISBN — fix them so they show up in the community.",
+    "yearLabel": "Dashboard year",
+    "readingNow": "Reading now",
+    "wantToRead": "Want to read",
+    "ofShelf": "{n}% of your shelf",
+    "readingByMonth": "Books read per month in {year}",
+    "noMonthData": "No books read in {year}",
+    "clickHint": "Click a bar to see the books.",
+    "topPublishers": "Top publishers",
+    "noPublishersData": "No publisher data available",
+    "booksCount": "{n} book | {n} books"
   },
   "login": {
     "header": "Your personal library, everywhere.",
@@ -548,5 +562,32 @@
     "text": "Confirm your email: we sent a link to {email}. Until then, public library, community and followers are locked.",
     "resend": "Resend link",
     "sent": "Link sent"
+  },
+  "status": {
+    "label": "Reading status",
+    "want": "Want to read",
+    "reading": "Reading",
+    "read": "Read",
+    "none": "On the shelf",
+    "clear": "Clear status",
+    "readingSince": "Reading since {date}",
+    "wantCaption": "On your to-read list"
+  },
+  "goal": {
+    "title": "{year} goal",
+    "set": "Set a goal",
+    "edit": "Change goal",
+    "save": "Save goal",
+    "remove": "Remove goal",
+    "question": "How many books do you want to read in {year}?",
+    "ofTarget": "of {goal} book | of {goal} books",
+    "done": "Goal reached! 🎉",
+    "ahead": "{n} book ahead of pace | {n} books ahead of pace",
+    "behind": "{n} book behind pace to finish the year | {n} books behind pace to finish the year",
+    "onTrack": "Right on pace",
+    "missed": "{n} book short | {n} books short",
+    "future": "This year has not started yet",
+    "empty": "No goal for this year. You have read no books so far. | No goal for this year. You have read {n} book so far. | No goal for this year. You have read {n} books so far.",
+    "paceMarker": "Where you need to be today"
   }
 }
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 0439472..710f0fb 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -18,7 +18,10 @@
     "addFirst": "Adicionar o primeiro livro",
     "tipIsbn": "Digite o ISBN (fica no verso, perto do código de barras) e clique em Buscar.",
     "tipRead": "Marque os livros que já leu e dê uma nota de 1 a 5 estrelas.",
-    "tipShare": "Em Conta, torne a biblioteca pública para compartilhar o link e encontrar outros leitores."
+    "tipShare": "Em Conta, torne a biblioteca pública para compartilhar o link e encontrar outros leitores.",
+    "readingNow": "Lendo agora",
+    "seeReading": "Ver todos",
+    "readOfGoal": "{n} de {goal} da meta do ano"
   },
   "menu": {
     "home": "Início",
@@ -138,7 +141,8 @@
     "view_label": "Modo de exibição",
     "view_grid": "Grade",
     "view_list": "Lista",
-    "row_rating": "Nota {n} de 5"
+    "row_rating": "Nota {n} de 5",
+    "read_month_chip": "Lidos em {period}"
   },
   "bookDialog": {
     "bookCover": "Capa do Livro",
@@ -223,7 +227,7 @@
     "readBooks": "Livros Lidos",
     "unreadBooks": "Para Ler",
     "readingRate": "Taxa de Leitura",
-    "readingByYear": "Leituras por Ano",
+    "readingByYear": "Leituras por ano",
     "favoriteGenres": "Gêneros Favoritos",
     "topAuthors": "Melhores Autores",
     "noTagsData": "Nenhum dado de tags disponível",
@@ -231,7 +235,17 @@
     "books": "Livros",
     "loadError": "Não foi possível carregar as estatísticas.",
     "noYearData": "Nenhuma leitura registrada ainda",
-    "invalidIsbn": "{n} livro com ISBN inválido — corrija para ele aparecer na comunidade. | {n} livros com ISBN inválido — corrija para eles aparecerem na comunidade."
+    "invalidIsbn": "{n} livro com ISBN inválido — corrija para ele aparecer na comunidade. | {n} livros com ISBN inválido — corrija para eles aparecerem na comunidade.",
+    "yearLabel": "Ano do painel",
+    "readingNow": "Lendo agora",
+    "wantToRead": "Quero ler",
+    "ofShelf": "{n}% da estante",
+    "readingByMonth": "Leituras mês a mês em {year}",
+    "noMonthData": "Nenhuma leitura registrada em {year}",
+    "clickHint": "Clique numa barra para ver os livros.",
+    "topPublishers": "Editoras mais presentes",
+    "noPublishersData": "Nenhum dado de editoras disponível",
+    "booksCount": "{n} livro | {n} livros"
   },
   "login": {
     "header": "Sua biblioteca pessoal, em todo lugar.",
@@ -548,5 +562,32 @@
     "text": "Confirme seu e-mail: enviamos um link para {email}. Até lá, biblioteca pública, comunidade e seguidores ficam bloqueados.",
     "resend": "Reenviar link",
     "sent": "Link enviado"
+  },
+  "status": {
+    "label": "Status de leitura",
+    "want": "Quero ler",
+    "reading": "Lendo",
+    "read": "Lido",
+    "none": "Na estante",
+    "clear": "Tirar status",
+    "readingSince": "Lendo desde {date}",
+    "wantCaption": "Na sua lista de próximas leituras"
+  },
+  "goal": {
+    "title": "Meta de {year}",
+    "set": "Definir meta",
+    "edit": "Mudar meta",
+    "save": "Salvar meta",
+    "remove": "Remover meta",
+    "question": "Quantos livros você quer ler em {year}?",
+    "ofTarget": "de {goal} livro | de {goal} livros",
+    "done": "Meta cumprida! 🎉",
+    "ahead": "{n} livro à frente do ritmo | {n} livros à frente do ritmo",
+    "behind": "{n} livro atrás do ritmo para fechar o ano | {n} livros atrás do ritmo para fechar o ano",
+    "onTrack": "No ritmo certo",
+    "missed": "Faltou {n} livro | Faltaram {n} livros",
+    "future": "O ano ainda não começou",
+    "empty": "Sem meta para este ano. Você leu nenhum livro até agora. | Sem meta para este ano. Você leu {n} livro até agora. | Sem meta para este ano. Você leu {n} livros até agora.",
+    "paceMarker": "Onde você precisa estar hoje"
   }
 }
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 48d12b9..b845ef4 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -104,6 +104,11 @@ export default {
     return client.delete(`/library/${id}/read`)
   },
 
+  /** status: 'none' | 'want' | 'reading' | 'read'; date opcional ('YYYY-MM-DD', no fuso da pessoa). */
+  setReadingStatus(id, status, date) {
+    return client.patch(`/library/${id}/status`, date ? { status, date } : { status })
+  },
+
   setRating(id, rating) {
     return client.patch(`/library/${id}/rating`, { rating })
   },
@@ -172,8 +177,16 @@ export default {
     return client.get('/tags')
   },
 
-  getDashboardStats() {
-    return client.get('/dashboard/stats')
+  getDashboardStats(year) {
+    return client.get(`/dashboard/stats${toQuery(year ? { year } : {})}`)
+  },
+
+  setReadingGoal(year, target) {
+    return client.put('/dashboard/goal', { year, target })
+  },
+
+  deleteReadingGoal(year) {
+    return client.delete(`/dashboard/goal/${year}`)
   },
 
   // --- Público ---
diff --git a/frontend/src/utils/libraryQuery.js b/frontend/src/utils/libraryQuery.js
index 0b75bb2..ce82640 100644
--- a/frontend/src/utils/libraryQuery.js
+++ b/frontend/src/utils/libraryQuery.js
@@ -5,11 +5,11 @@
  * exibição: dá para recarregar, voltar, salvar nos favoritos ou mandar o link.
  * Valores padrão não aparecem na URL, para ela ficar curta.
  *
- *   /books?q=asimov&status=read&year=2025&tags=Fantasia&sort=title&order=asc&view=list
+ *   /books?q=asimov&status=read&year=2025&month=3&tags=Fantasia&sort=title&order=asc&view=list
  */
 
 const SORT_FIELDS = ['recent', 'title', 'authors', 'readDate', 'pubDate', 'rating']
-const READ_STATES = ['read', 'unread']
+const READ_STATES = ['read', 'unread', 'reading', 'want']
 export const VIEW_MODES = ['grid', 'list']
 
 function asList(value) {
@@ -25,6 +25,7 @@ function asSingle(value) {
 export function queryToFilters(query = {}) {
   const status = asSingle(query.status)
   const year = asSingle(query.year)
+  const month = Number(asSingle(query.month))
   const sort = asSingle(query.sort)
   const order = asSingle(query.order)
 
@@ -32,6 +33,7 @@ export function queryToFilters(query = {}) {
     search: String(asSingle(query.q) ?? ''),
     readState: READ_STATES.includes(status) ? status : 'all',
     readYear: /^\d{4}$/.test(year ?? '') ? year : 'all',
+    readMonth: /^\d{4}$/.test(year ?? '') && Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
     author: asList(query.author),
     publisher: asList(query.publisher),
     tags: asList(query.tags),
@@ -51,7 +53,10 @@ export function filtersToQuery(filters, view = 'grid') {
   const query = {}
   if (filters.search?.trim()) query.q = filters.search.trim()
   if (READ_STATES.includes(filters.readState)) query.status = filters.readState
-  if (filters.readYear && filters.readYear !== 'all') query.year = String(filters.readYear)
+  if (filters.readYear && filters.readYear !== 'all') {
+    query.year = String(filters.readYear)
+    if (filters.readMonth) query.month = String(filters.readMonth)
+  }
   if (filters.author?.length) query.author = [...filters.author]
   if (filters.publisher?.length) query.publisher = [...filters.publisher]
   if (filters.tags?.length) query.tags = [...filters.tags]
diff --git a/frontend/src/utils/readingStatus.js b/frontend/src/utils/readingStatus.js
new file mode 100644
index 0000000..6eaae32
--- /dev/null
+++ b/frontend/src/utils/readingStatus.js
@@ -0,0 +1,24 @@
+/**
+ * Status de leitura de um livro, como o app mostra:
+ *   reading → "Lendo"  (vale mesmo se o livro já foi lido antes: releitura)
+ *   read    → "Lido"
+ *   want    → "Quero ler"
+ *   none    → só na estante
+ */
+export function statusOf(book) {
+  if (!book) return 'none'
+  if (book.reading_status === 'reading') return 'reading'
+  if (book.read_date) return 'read'
+  if (book.reading_status === 'want') return 'want'
+  return 'none'
+}
+
+/** Ordem em que os status aparecem nos seletores. */
+export const STATUS_OPTIONS = ['want', 'reading', 'read']
+
+export const STATUS_ICONS = {
+  none: 'pi pi-book',
+  want: 'pi pi-bookmark',
+  reading: 'pi pi-book',
+  read: 'pi pi-check'
+}
diff --git a/frontend/src/views/Dashboard.vue b/frontend/src/views/Dashboard.vue
index ee850fd..132ce56 100644
--- a/frontend/src/views/Dashboard.vue
+++ b/frontend/src/views/Dashboard.vue
@@ -5,13 +5,31 @@
         <h1>{{ $t('dashboard.title') }}</h1>
         <p>{{ $t('dashboard.subtitle') }}</p>
       </div>
-      <div class="date-display">{{ currentDate }}</div>
+      <div class="header-side">
+        <label
+          class="sr-only"
+          for="dashboard-year"
+        >{{ t('dashboard.yearLabel') }}</label>
+        <Dropdown
+          inputId="dashboard-year"
+          :modelValue="year"
+          :options="yearOptions"
+          class="year-dropdown"
+          panelClass="custom-panel"
+          @update:modelValue="changeYear"
+        />
+        <div class="date-display">{{ currentDate }}</div>
+      </div>
     </div>
 
     <div
       v-if="loading"
       class="loading-layout"
     >
+      <Skeleton
+        height="150px"
+        class="chart-skeleton"
+      />
       <div class="kpi-grid">
         <Skeleton
           height="120px"
@@ -70,41 +88,175 @@
         ></i>
       </router-link>
 
+      <!-- Meta do ano -->
+      <section
+        class="goal-card"
+        aria-labelledby="goal-title"
+      >
+        <div class="goal-head">
+          <h2 id="goal-title">{{ t('goal.title', { year }) }}</h2>
+          <div
+            v-if="!editingGoal"
+            class="goal-actions"
+          >
+            <Button
+              v-if="stats.goal"
+              :label="t('goal.edit')"
+              icon="pi pi-pencil"
+              class="p-button-text p-button-sm"
+              @click="startEditGoal"
+            />
+            <Button
+              v-else
+              :label="t('goal.set')"
+              icon="pi pi-flag"
+              class="p-button-sm btn-action-primary"
+              @click="startEditGoal"
+            />
+          </div>
+        </div>
+
+        <form
+          v-if="editingGoal"
+          class="goal-form"
+          @submit.prevent="saveGoal"
+        >
+          <label for="goal-target">{{ t('goal.question', { year }) }}</label>
+          <div class="goal-form-row">
+            <InputNumber
+              v-model="goalDraft"
+              inputId="goal-target"
+              :min="1"
+              :max="1000"
+              showButtons
+              :useGrouping="false"
+              class="goal-input"
+            />
+            <Button
+              type="submit"
+              :label="t('goal.save')"
+              :loading="goalSaving"
+              class="p-button-sm btn-action-primary"
+            />
+            <Button
+              type="button"
+              :label="t('common.cancel')"
+              class="p-button-text p-button-sm"
+              @click="editingGoal = false"
+            />
+            <Button
+              v-if="stats.goal"
+              type="button"
+              :label="t('goal.remove')"
+              class="p-button-text p-button-sm p-button-danger"
+              :disabled="goalSaving"
+              @click="removeGoal"
+            />
+          </div>
+        </form>
+
+        <template v-else-if="stats.goal">
+          <p class="goal-numbers">
+            <strong>{{ readInYear }}</strong>
+            <span>{{ t('goal.ofTarget', { goal: stats.goal }, stats.goal) }}</span>
+          </p>
+          <div
+            class="goal-bar"
+            role="progressbar"
+            :aria-valuenow="readInYear"
+            aria-valuemin="0"
+            :aria-valuemax="stats.goal"
+            :aria-label="t('goal.title', { year })"
+          >
+            <span
+              class="goal-fill"
+              :style="{ width: `${goalPercent}%` }"
+            ></span>
+            <span
+              v-if="paceMarker !== null"
+              class="goal-pace"
+              :style="{ left: `${paceMarker}%` }"
+              :title="t('goal.paceMarker')"
+            ></span>
+          </div>
+          <p
+            class="goal-status"
+            :class="goalStatus.tone"
+          >{{ goalStatus.text }}</p>
+        </template>
+
+        <p
+          v-else
+          class="goal-empty"
+        >{{ t('goal.empty', { n: readInYear }, readInYear) }}</p>
+      </section>
+
       <div class="kpi-grid">
-        <div class="kpi-card total">
+        <router-link
+          :to="{ name: 'library' }"
+          class="kpi-card total"
+        >
           <div class="kpi-icon"><i class="pi pi-book" aria-hidden="true"></i></div>
           <div class="kpi-info">
             <span class="label">{{ $t('dashboard.totalBooks') }}</span>
             <span class="value">{{ stats.totalBooks }}</span>
           </div>
-        </div>
+        </router-link>
 
-        <div class="kpi-card read">
+        <router-link
+          :to="{ name: 'library', query: { status: 'read' } }"
+          class="kpi-card read"
+        >
           <div class="kpi-icon"><i class="pi pi-check-circle" aria-hidden="true"></i></div>
           <div class="kpi-info">
             <span class="label">{{ $t('dashboard.readBooks') }}</span>
             <span class="value">{{ stats.readBooks }}</span>
+            <span class="sub">{{ t('dashboard.ofShelf', { n: readingRate }) }}</span>
           </div>
-        </div>
+        </router-link>
 
-        <div class="kpi-card unread">
-          <div class="kpi-icon"><i class="pi pi-bookmark" aria-hidden="true"></i></div>
+        <router-link
+          :to="{ name: 'library', query: { status: 'reading' } }"
+          class="kpi-card reading"
+        >
+          <div class="kpi-icon"><i class="pi pi-eye" aria-hidden="true"></i></div>
           <div class="kpi-info">
-            <span class="label">{{ $t('dashboard.unreadBooks') }}</span>
-            <span class="value">{{ unreadBooks }}</span>
+            <span class="label">{{ t('dashboard.readingNow') }}</span>
+            <span class="value">{{ stats.readingBooks }}</span>
           </div>
-        </div>
+        </router-link>
 
-        <div class="kpi-card rate">
-          <div class="kpi-icon"><i class="pi pi-percentage" aria-hidden="true"></i></div>
+        <router-link
+          :to="{ name: 'library', query: { status: 'want' } }"
+          class="kpi-card want"
+        >
+          <div class="kpi-icon"><i class="pi pi-bookmark" aria-hidden="true"></i></div>
           <div class="kpi-info">
-            <span class="label">{{ $t('dashboard.readingRate') }}</span>
-            <span class="value">{{ readingRate }}%</span>
+            <span class="label">{{ t('dashboard.wantToRead') }}</span>
+            <span class="value">{{ stats.wantBooks }}</span>
           </div>
-        </div>
+        </router-link>
       </div>
 
       <div class="charts-grid">
+        <div class="chart-card main-chart">
+          <h3>{{ t('dashboard.readingByMonth', { year }) }}</h3>
+          <p class="chart-hint">{{ t('dashboard.clickHint') }}</p>
+          <div class="chart-wrapper flex-center">
+            <div
+              v-if="readInYear === 0"
+              class="no-data"
+            >{{ t('dashboard.noMonthData', { year }) }}</div>
+            <Chart
+              v-else
+              type="bar"
+              :data="monthChartData"
+              :options="monthChartOptions"
+              class="h-full"
+            />
+          </div>
+        </div>
+
         <div class="chart-card main-chart">
           <h3>{{ $t('dashboard.readingByYear') }}</h3>
           <div class="chart-wrapper flex-center">
@@ -122,6 +274,9 @@
           </div>
         </div>
 
+      </div>
+
+      <div class="charts-grid lower">
         <div class="chart-card">
           <h3>{{ $t('dashboard.favoriteGenres') }}</h3>
           <div class="chart-wrapper flex-center">
@@ -146,16 +301,38 @@
               v-if="stats.topAuthors.length === 0"
               class="no-data"
             >{{ $t('dashboard.noAuthorsData') }}</div>
-            <div
+            <router-link
               v-for="(author, index) in stats.topAuthors"
               :key="author.name"
+              :to="{ name: 'library', query: { author: author.name } }"
               class="author-row"
               :style="{ '--author-color': colorFor(author.name) }"
             >
               <div class="rank">{{ index + 1 }}</div>
               <div class="name">{{ author.name }}</div>
-              <div class="count">{{ author.count }} {{ $t('dashboard.books') }}</div>
-            </div>
+              <div class="count">{{ t('dashboard.booksCount', { n: author.count }, author.count) }}</div>
+            </router-link>
+          </div>
+        </div>
+
+        <div class="chart-card authors-list">
+          <h3>{{ t('dashboard.topPublishers') }}</h3>
+          <div class="authors-wrapper">
+            <div
+              v-if="stats.topPublishers.length === 0"
+              class="no-data"
+            >{{ t('dashboard.noPublishersData') }}</div>
+            <router-link
+              v-for="(publisher, index) in stats.topPublishers"
+              :key="publisher.name"
+              :to="{ name: 'library', query: { publisher: publisher.name } }"
+              class="author-row"
+              :style="{ '--author-color': colorFor(publisher.name) }"
+            >
+              <div class="rank">{{ index + 1 }}</div>
+              <div class="name">{{ publisher.name }}</div>
+              <div class="count">{{ t('dashboard.booksCount', { n: publisher.count }, publisher.count) }}</div>
+            </router-link>
           </div>
         </div>
       </div>
@@ -165,42 +342,143 @@
 
 <script setup>
 import { ref, computed, onMounted } from 'vue'
+import { useRouter } from 'vue-router'
 import { useI18n } from 'vue-i18n'
+import { useToast } from 'primevue/usetoast'
 import Chart from 'primevue/chart'
 import Skeleton from 'primevue/skeleton'
 import Button from 'primevue/button'
+import Dropdown from 'primevue/dropdown'
+import InputNumber from 'primevue/inputnumber'
 import api from '../services/api.js'
 import { useTheme, cssVar } from '../composables/useTheme.js'
 import { colorFor, tagColorName } from '../utils/tagColors.js'
 
 const { t, locale } = useI18n()
+const router = useRouter()
+const toast = useToast()
 const { themeVersion } = useTheme()
 
+const CURRENT_YEAR = new Date().getFullYear()
+
 const loading = ref(true)
 const loadError = ref(false)
+const year = ref(CURRENT_YEAR)
 const stats = ref({
   totalBooks: 0,
   readBooks: 0,
+  readingBooks: 0,
+  wantBooks: 0,
+  goal: null,
   readingByYear: [],
+  readingByMonth: [],
   topAuthors: [],
-  topTags: []
+  topTags: [],
+  topPublishers: []
 })
 
+const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
+
 const currentDate = computed(() => {
-  const dateLocale = locale.value === 'pt' ? 'pt-BR' : 'en-US'
-  const text = new Date().toLocaleDateString(dateLocale, {
+  const text = new Date().toLocaleDateString(dateLocale.value, {
     weekday: 'long', day: 'numeric', month: 'long'
   })
   // Só a primeira letra: "Sábado, 10 de outubro" (o CSS capitalize fazia "De Outubro").
   return text.charAt(0).toUpperCase() + text.slice(1)
 })
 
+// Anos com leitura + o ano atual, do mais novo para o mais antigo.
+const yearOptions = computed(() => {
+  const years = new Set([CURRENT_YEAR, year.value, ...stats.value.readingByYear.map(item => item.year)])
+  return [...years].sort((a, b) => b - a)
+})
+
 const readingRate = computed(() => {
   if (!stats.value.totalBooks) return 0
   return Math.round((stats.value.readBooks / stats.value.totalBooks) * 100)
 })
 
-const unreadBooks = computed(() => stats.value.totalBooks - stats.value.readBooks)
+const readInYear = computed(() =>
+  stats.value.readingByMonth.reduce((sum, item) => sum + item.count, 0)
+)
+
+// ---------------------------------------------------------------------------
+// Meta anual
+// ---------------------------------------------------------------------------
+const editingGoal = ref(false)
+const goalDraft = ref(12)
+const goalSaving = ref(false)
+
+const goalPercent = computed(() => {
+  if (!stats.value.goal) return 0
+  return Math.min(100, Math.round((readInYear.value / stats.value.goal) * 100))
+})
+
+// Fração do ano que já passou (só no ano atual): onde o leitor "deveria" estar.
+const yearFraction = computed(() => {
+  if (year.value !== CURRENT_YEAR) return null
+  const now = new Date()
+  const start = new Date(CURRENT_YEAR, 0, 1)
+  const end = new Date(CURRENT_YEAR + 1, 0, 1)
+  return (now - start) / (end - start)
+})
+
+const paceMarker = computed(() => (yearFraction.value === null ? null : Math.round(yearFraction.value * 100)))
+
+const goalStatus = computed(() => {
+  const goal = stats.value.goal
+  const read = readInYear.value
+  if (!goal) return { text: '', tone: '' }
+  if (read >= goal) return { text: t('goal.done'), tone: 'good' }
+
+  if (yearFraction.value === null) {
+    return year.value < CURRENT_YEAR
+      ? { text: t('goal.missed', { n: goal - read }, goal - read), tone: 'muted' }
+      : { text: t('goal.future'), tone: 'muted' }
+  }
+
+  const expected = Math.floor(goal * yearFraction.value)
+  const diff = read - expected
+  if (diff > 0) return { text: t('goal.ahead', { n: diff }, diff), tone: 'good' }
+  if (diff < 0) return { text: t('goal.behind', { n: -diff }, -diff), tone: 'warn' }
+  return { text: t('goal.onTrack'), tone: 'good' }
+})
+
+function startEditGoal() {
+  goalDraft.value = stats.value.goal || Math.max(12, readInYear.value)
+  editingGoal.value = true
+}
+
+async function saveGoal() {
+  if (!goalDraft.value) return
+  goalSaving.value = true
+  try {
+    const saved = await api.setReadingGoal(year.value, goalDraft.value)
+    stats.value.goal = saved.target
+    editingGoal.value = false
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message, life: 4000 })
+  } finally {
+    goalSaving.value = false
+  }
+}
+
+async function removeGoal() {
+  goalSaving.value = true
+  try {
+    await api.deleteReadingGoal(year.value)
+    stats.value.goal = null
+    editingGoal.value = false
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message, life: 4000 })
+  } finally {
+    goalSaving.value = false
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Gráficos (clicar leva para a biblioteca já filtrada)
+// ---------------------------------------------------------------------------
 
 // O chart.js não entende var(--x): lê os valores resolvidos e recalcula quando
 // o tema ou a cor de destaque mudam.
@@ -214,27 +492,77 @@ const palette = computed(() => {
   }
 })
 
-const yearChartData = computed(() => {
-  const sorted = [...stats.value.readingByYear].sort((a, b) => a.year - b.year)
-  return {
-    labels: sorted.map(item => item.year),
-    datasets: [{
-      label: t('dashboard.readBooks'),
-      data: sorted.map(item => item.count),
-      // Cada ano com a sua cor — a mesma das barras do perfil público.
-      backgroundColor: sorted.map(item => cssVar(`--${tagColorName(String(item.year))}`) || palette.value.main),
-      borderRadius: 6
-    }]
+function openLibrary(query) {
+  router.push({ name: 'library', query })
+}
+
+// Mãozinha sobre barras/fatias clicáveis.
+function pointerOnHover(event, elements) {
+  const canvas = event?.native?.target
+  if (canvas) canvas.style.cursor = elements.length ? 'pointer' : 'default'
+}
+
+const monthLabels = computed(() =>
+  Array.from({ length: 12 }, (_, i) =>
+    new Date(2000, i, 1).toLocaleDateString(dateLocale.value, { month: 'short' }).replace('.', ''))
+)
+
+const monthChartData = computed(() => ({
+  labels: monthLabels.value,
+  datasets: [{
+    label: t('dashboard.readBooks'),
+    data: stats.value.readingByMonth.map(item => item.count),
+    backgroundColor: cssVar(`--${tagColorName(String(year.value))}`) || palette.value.main,
+    borderRadius: 6
+  }]
+}))
+
+const barScales = computed(() => ({
+  y: { grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } },
+  x: { grid: { display: false }, ticks: { color: palette.value.text } }
+}))
+
+const monthChartOptions = computed(() => ({
+  responsive: true,
+  maintainAspectRatio: false,
+  plugins: { legend: { display: false } },
+  scales: barScales.value,
+  // A coluna inteira é clicável (barras baixas são difíceis de acertar).
+  interaction: { mode: 'index', intersect: false },
+  onHover: pointerOnHover,
+  onClick: (_, elements) => {
+    if (!elements.length) return
+    const month = elements[0].index + 1
+    if (!stats.value.readingByMonth[month - 1]?.count) return
+    openLibrary({ status: 'read', year: String(year.value), month: String(month) })
   }
-})
+}))
+
+const sortedYears = computed(() => [...stats.value.readingByYear].sort((a, b) => a.year - b.year))
+
+const yearChartData = computed(() => ({
+  labels: sortedYears.value.map(item => item.year),
+  datasets: [{
+    label: t('dashboard.readBooks'),
+    data: sortedYears.value.map(item => item.count),
+    // Cada ano com a sua cor — a mesma das barras do perfil público.
+    backgroundColor: sortedYears.value.map(item => cssVar(`--${tagColorName(String(item.year))}`) || palette.value.main),
+    borderRadius: 6
+  }]
+}))
 
 const yearChartOptions = computed(() => ({
   responsive: true,
   maintainAspectRatio: false,
   plugins: { legend: { display: false } },
-  scales: {
-    y: { grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } },
-    x: { grid: { display: false }, ticks: { color: palette.value.text } }
+  scales: barScales.value,
+  // A coluna inteira é clicável (barras baixas são difíceis de acertar).
+  interaction: { mode: 'index', intersect: false },
+  onHover: pointerOnHover,
+  onClick: (_, elements) => {
+    if (!elements.length) return
+    const item = sortedYears.value[elements[0].index]
+    if (item) openLibrary({ status: 'read', year: String(item.year) })
   }
 }))
 
@@ -242,7 +570,8 @@ const tagsChartData = computed(() => ({
   labels: stats.value.topTags.map(tag => tag.name),
   datasets: [{
     data: stats.value.topTags.map(tag => tag.count),
-    backgroundColor: palette.value.series,
+    // Mesma cor da categoria no resto do app.
+    backgroundColor: stats.value.topTags.map(tag => cssVar(`--${tagColorName(tag.name)}`) || palette.value.main),
     borderWidth: 0,
     hoverOffset: 10
   }]
@@ -252,7 +581,13 @@ const doughnutOptions = computed(() => ({
   responsive: true,
   maintainAspectRatio: false,
   plugins: {
-    legend: { position: 'right', labels: { color: palette.value.text, usePointStyle: true } }
+    legend: { position: 'bottom', labels: { color: palette.value.text, usePointStyle: true, boxWidth: 8 } }
+  },
+  onHover: pointerOnHover,
+  onClick: (_, elements) => {
+    if (!elements.length) return
+    const tag = stats.value.topTags[elements[0].index]
+    if (tag) openLibrary({ tags: tag.name })
   }
 }))
 
@@ -260,7 +595,7 @@ async function loadStats() {
   loading.value = true
   loadError.value = false
   try {
-    stats.value = await api.getDashboardStats()
+    stats.value = await api.getDashboardStats(year.value)
   } catch (error) {
     loadError.value = true
   } finally {
@@ -268,6 +603,16 @@ async function loadStats() {
   }
 }
 
+async function changeYear(value) {
+  year.value = value
+  editingGoal.value = false
+  try {
+    stats.value = await api.getDashboardStats(value)
+  } catch {
+    loadError.value = true
+  }
+}
+
 onMounted(loadStats)
 </script>
 
@@ -378,12 +723,23 @@ onMounted(loadStats)
   --kpi-color: var(--red);
 }
 
-.kpi-card.unread {
+.kpi-card.reading {
+  --kpi-color: var(--blue);
+}
+
+.kpi-card.want {
   --kpi-color: var(--purple);
 }
 
-.kpi-card.rate {
-  --kpi-color: var(--orange);
+a.kpi-card {
+  text-decoration: none;
+  color: inherit;
+}
+
+a.kpi-card:focus-visible,
+a.author-row:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
 }
 
 .kpi-icon {
@@ -415,6 +771,136 @@ onMounted(loadStats)
   font-weight: 700;
 }
 
+.kpi-info .sub {
+  color: var(--text-secondary);
+  font-size: 0.78rem;
+}
+
+/* Ano + data no cabeçalho */
+.header-side {
+  display: flex;
+  align-items: center;
+  gap: 1rem;
+}
+
+.year-dropdown {
+  min-width: 7.5rem;
+}
+
+/* Meta anual */
+.goal-card {
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 16px;
+  padding: 1.5rem;
+  margin-bottom: 1.5rem;
+}
+
+.goal-head {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 1rem;
+  margin-bottom: 0.75rem;
+}
+
+.goal-head h2 {
+  margin: 0;
+  font-size: 1.1rem;
+  font-weight: 600;
+  color: var(--text-primary);
+}
+
+.goal-numbers {
+  margin: 0 0 0.75rem;
+  display: flex;
+  align-items: baseline;
+  gap: 0.5rem;
+  color: var(--text-secondary);
+}
+
+.goal-numbers strong {
+  font-family: 'Georgia', serif;
+  font-size: 2.4rem;
+  line-height: 1;
+  color: var(--text-primary);
+}
+
+.goal-bar {
+  position: relative;
+  height: 12px;
+  border-radius: 999px;
+  background: var(--bg-hover);
+  overflow: visible;
+}
+
+.goal-fill {
+  display: block;
+  height: 100%;
+  border-radius: 999px;
+  background: var(--main-color);
+  transition: width 0.4s ease;
+}
+
+/* Onde deveria estar hoje para bater a meta no fim do ano. */
+.goal-pace {
+  position: absolute;
+  top: -4px;
+  width: 2px;
+  height: 20px;
+  margin-left: -1px;
+  background: var(--text-primary);
+  opacity: 0.55;
+  border-radius: 1px;
+}
+
+.goal-status {
+  margin: 0.75rem 0 0;
+  font-size: 0.9rem;
+  color: var(--text-secondary);
+}
+
+.goal-status.good {
+  color: var(--green);
+}
+
+.goal-status.warn {
+  color: var(--orange);
+}
+
+.goal-empty {
+  margin: 0;
+  color: var(--text-secondary);
+}
+
+.goal-form {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+}
+
+.goal-form label {
+  color: var(--text-secondary);
+  font-size: 0.9rem;
+}
+
+.goal-form-row {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  flex-wrap: wrap;
+}
+
+.goal-input :deep(.p-inputnumber-input) {
+  width: 6rem;
+}
+
+.chart-hint {
+  margin: -1rem 0 1rem;
+  color: var(--text-secondary);
+  font-size: 0.82rem;
+}
+
 .charts-grid {
   display: grid;
   grid-template-columns: repeat(2, 1fr);
@@ -443,11 +929,27 @@ onMounted(loadStats)
 }
 
 .chart-wrapper {
-  flex: 1;
+  flex: 0 0 auto;
   position: relative;
+  height: 280px;
   min-height: 0;
 }
 
+.chart-wrapper > :deep(.p-chart) {
+  position: relative;
+  width: 100%;
+  height: 100%;
+}
+
+.charts-grid.lower {
+  grid-template-columns: repeat(3, minmax(0, 1fr));
+  margin-top: 1.5rem;
+}
+
+.charts-grid.lower .chart-wrapper {
+  height: 300px;
+}
+
 .flex-center {
   display: flex;
   align-items: center;
@@ -462,9 +964,7 @@ onMounted(loadStats)
 .authors-wrapper {
   display: flex;
   flex-direction: column;
-  gap: 1rem;
-  height: 100%;
-  justify-content: center;
+  gap: 0.25rem;
 }
 
 .author-row {
@@ -472,7 +972,15 @@ onMounted(loadStats)
   align-items: center;
   gap: 1rem;
   position: relative;
-  padding: 0.5rem 0;
+  padding: 0.5rem 0.5rem;
+  margin: 0 -0.5rem;
+  border-radius: 8px;
+  text-decoration: none;
+  color: inherit;
+}
+
+a.author-row:hover {
+  background: var(--bg-hover);
 }
 
 .author-row .rank {
@@ -526,11 +1034,26 @@ onMounted(loadStats)
   }
 }
 
+@media (max-width: 1100px) {
+  .charts-grid.lower {
+    grid-template-columns: repeat(2, minmax(0, 1fr));
+  }
+
+  .charts-grid.lower > :first-child {
+    grid-column: 1 / -1;
+  }
+}
+
 @media (max-width: 900px) {
-  .charts-grid {
+  .charts-grid,
+  .charts-grid.lower {
     grid-template-columns: 1fr;
   }
 
+  .chart-wrapper {
+    height: 240px;
+  }
+
   .main-chart {
     grid-column: auto;
   }
@@ -583,6 +1106,16 @@ onMounted(loadStats)
     align-items: flex-start;
     gap: 0.5rem;
   }
+
+  .header-side {
+    width: 100%;
+    justify-content: space-between;
+  }
+
+  .goal-card {
+    padding: 1.1rem;
+    margin-bottom: 1rem;
+  }
 }
 .error-state {
   display: flex;
diff --git a/frontend/src/views/Home.vue b/frontend/src/views/Home.vue
index 2aeaab3..396392e 100644
--- a/frontend/src/views/Home.vue
+++ b/frontend/src/views/Home.vue
@@ -92,6 +92,30 @@
     </section>
 
     <template v-else>
+      <section
+        v-if="readingBooks.length"
+        class="shelf reading-shelf"
+        aria-labelledby="home-reading-title"
+      >
+        <div class="shelf-head">
+          <h2 id="home-reading-title">{{ t('home.readingNow') }}</h2>
+          <router-link
+            :to="{ name: 'library', query: { status: 'reading' } }"
+            class="see-all"
+          >{{ t('home.seeReading') }}</router-link>
+        </div>
+        <div class="shelf-row">
+          <BookItem
+            v-for="book in readingBooks"
+            :key="book.book_id"
+            :book="book"
+            quick-actions
+            @updated="reload"
+            @deleted="reload"
+          />
+        </div>
+      </section>
+
       <section
         class="shelf"
         aria-labelledby="home-recent-title"
@@ -200,6 +224,8 @@ const { t } = useI18n()
 const loading = ref(true)
 const recentBooks = ref([])
 const readBooks = ref([])
+const readingBooks = ref([])
+const goal = ref(null)
 const total = ref(0)
 const readThisYear = ref(0)
 const events = ref([])
@@ -215,16 +241,22 @@ const greeting = computed(() => {
 
 const summary = computed(() => {
   if (loading.value || total.value === 0) return ''
-  return `${t('home.totalBooks', { n: total.value }, total.value)} · ${t('home.readThisYear', { n: readThisYear.value }, readThisYear.value)}`
+  const read = goal.value
+    ? t('home.readOfGoal', { n: readThisYear.value, goal: goal.value })
+    : t('home.readThisYear', { n: readThisYear.value }, readThisYear.value)
+  return `${t('home.totalBooks', { n: total.value }, total.value)} · ${read}`
 })
 
 async function reload() {
   try {
-    const [recent, read, stats] = await Promise.all([
+    const [recent, read, reading, stats] = await Promise.all([
       api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc' }),
       api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'readDate', order: 'desc', readState: 'true' }),
+      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc', readState: 'reading' }),
       api.getDashboardStats()
     ])
+    readingBooks.value = reading.result || []
+    goal.value = stats.goal ?? null
     recentBooks.value = recent.result || []
     total.value = recent.total || 0
     readBooks.value = read.result || []
@@ -233,6 +265,7 @@ async function reload() {
   } catch {
     recentBooks.value = []
     readBooks.value = []
+    readingBooks.value = []
   } finally {
     loading.value = false
   }
diff --git a/frontend/src/views/Library.vue b/frontend/src/views/Library.vue
index 8ab8595..778731a 100644
--- a/frontend/src/views/Library.vue
+++ b/frontend/src/views/Library.vue
@@ -186,9 +186,10 @@ function scrollToTop() {
   scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
 }
 
-function handleFilterChange({ key, value }) {
-  setFilter(key, value)
-  scrollToTop()
+function handleFilterChange({ key, value, silent = false }) {
+  // silent: muda o filtro sem buscar (vem junto com outra mudança que busca).
+  setFilter(key, value, { fetch: !silent })
+  if (!silent) scrollToTop()
 }
 
 function clearFilters() {
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
1. Migration nova (005). Local:  npm run db:migrate:local
   Produção (no deploy, depois do backup):  docker compose run --rm backend npm run db:migrate:docker
   O servidor não sobe com migration pendente.
2. Rode a suíte completa no backend:  npm test
   (teste novo: src/tests/integration/reading-status.test.js)
3. Banco de teste: npm run db:seed recria tudo já com "Lendo", "Quero ler" e metas.
4. Teste: abra um livro e use Quero ler / Lendo / Lido; no Painel, defina a meta
   e clique numa barra do gráfico mensal.
5. Commite e rode o pacote 3.

Sugestão de commit
------------------
feat(leitura): status Quero ler/Lendo, meta anual e painel clicável

- migration 005: reading_status ('want' | 'reading'), started_at e reading_goals
- PATCH /library/:id/status; filtros readState=reading|want e readMonth
- livro: seletor Quero ler / Lendo / Lido; selo na capa; "Lendo agora" no Início
- painel: meta do ano com ritmo, gráfico mensal por ano, histórico completo,
  top editoras; barras, fatias e listas abrem a biblioteca filtrada
- seed com status e metas
MSG