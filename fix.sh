#!/usr/bin/env bash
# =============================================================================
#  Librishelf — pacote 3 do backlog: organização
#
#  1. Série e volume (ex.: "Duna #2"): no cadastro, na edição, no card, na lista,
#     filtro por série (o nome no livro vira link) e ordenação "Série e volume"
#  2. Anotação pessoal em cada livro (até 5.000 caracteres, só o dono vê — nunca
#     sai na biblioteca pública)
#  3. Ações em lote na biblioteca: selecionar vários (grade ou lista) e mudar o
#     status, adicionar/remover categoria ou excluir
#  4. Autores, Editoras e Categorias: ordenar por A–Z / mais livros / mais lidos,
#     barra de lidos/total, renomear e mesclar nomes repetidos
#
#  Migration 006 (series, notes). Precisa do pacote 2 commitado.
#
#  Uso:   bash librishelf-pacote3-organizacao.sh [caminho/do/repo]
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
[ -e backend/db/migrations/005_reading_status_and_goals.sql ] || fail "Falta o pacote anterior (backend/db/migrations/005_reading_status_and_goals.sql não existe): aplique e commite os pacotes em ordem."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
PATCH="$TMP_DIR/pacote.patch"

cat > "$PATCH" <<'LIBRI_PATCH_EOF'
diff --git a/backend/db/migrations/006_series_and_notes.sql b/backend/db/migrations/006_series_and_notes.sql
new file mode 100644
index 0000000..cbd6968
--- /dev/null
+++ b/backend/db/migrations/006_series_and_notes.sql
@@ -0,0 +1,27 @@
+-- 006 — série/volume e anotação pessoal
+-- Idempotente: pode rodar mais de uma vez.
+
+-- Nome da série ("Duna"). O número do volume usa a coluna series_index, que
+-- já existia (real: aceita 1.5 para contos entre volumes).
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS series text;
+
+-- Anotação pessoal: só o dono vê (nunca sai na biblioteca pública).
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS notes text;
+
+DO $$
+BEGIN
+  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_series_length_check' AND conrelid = 'librishelf.books'::regclass) THEN
+    ALTER TABLE librishelf.books ADD CONSTRAINT books_series_length_check CHECK (char_length(series) <= 200);
+  END IF;
+  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_notes_length_check' AND conrelid = 'librishelf.books'::regclass) THEN
+    ALTER TABLE librishelf.books ADD CONSTRAINT books_notes_length_check CHECK (char_length(notes) <= 5000);
+  END IF;
+  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_series_index_check' AND conrelid = 'librishelf.books'::regclass) THEN
+    ALTER TABLE librishelf.books ADD CONSTRAINT books_series_index_check CHECK (series_index IS NULL OR (series_index >= 0 AND series_index <= 9999)) NOT VALID; -- dados antigos não são revalidados
+  END IF;
+END $$;
+
+-- Filtro e lista de séries do usuário.
+CREATE INDEX IF NOT EXISTS idx_books_user_series
+  ON librishelf.books (user_id, lower(series))
+  WHERE series IS NOT NULL;
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index 169fd4d..03f297b 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -1215,3 +1215,35 @@ CREATE TABLE IF NOT EXISTS librishelf.reading_goals (
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('005_reading_status_and_goals')
 ON CONFLICT (version) DO NOTHING;
+
+-- ===========================================================================
+-- 006 — série/volume e anotação pessoal
+-- ===========================================================================
+-- Nome da série ("Duna"). O número do volume usa a coluna series_index, que
+-- já existia (real: aceita 1.5 para contos entre volumes).
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS series text;
+
+-- Anotação pessoal: só o dono vê (nunca sai na biblioteca pública).
+ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS notes text;
+
+DO $$
+BEGIN
+  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_series_length_check' AND conrelid = 'librishelf.books'::regclass) THEN
+    ALTER TABLE librishelf.books ADD CONSTRAINT books_series_length_check CHECK (char_length(series) <= 200);
+  END IF;
+  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_notes_length_check' AND conrelid = 'librishelf.books'::regclass) THEN
+    ALTER TABLE librishelf.books ADD CONSTRAINT books_notes_length_check CHECK (char_length(notes) <= 5000);
+  END IF;
+  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_series_index_check' AND conrelid = 'librishelf.books'::regclass) THEN
+    ALTER TABLE librishelf.books ADD CONSTRAINT books_series_index_check CHECK (series_index IS NULL OR (series_index >= 0 AND series_index <= 9999)) NOT VALID; -- dados antigos não são revalidados
+  END IF;
+END $$;
+
+-- Filtro e lista de séries do usuário.
+CREATE INDEX IF NOT EXISTS idx_books_user_series
+  ON librishelf.books (user_id, lower(series))
+  WHERE series IS NOT NULL;
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('006_series_and_notes')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index b63371e..7669ae9 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -36,6 +36,8 @@ export const LIBRARY_QUERIES = {
       b.read_date,
       b.reading_status,
       b.started_at,
+      b.series,
+      b.series_index,
       b.publication_date
     FROM
       librishelf.books AS b
@@ -56,6 +58,9 @@ export const LIBRARY_QUERIES = {
       b.read_date,
       b.reading_status,
       b.started_at,
+      b.series,
+      b.series_index,
+      b.notes,
       b.publication_date,
       p.name AS publisher_name, -- O Frontend procura por .publisher_name
       (SELECT STRING_AGG(a.name, ', ' ORDER BY bal.position, a.id)
@@ -112,6 +117,59 @@ export const LIBRARY_QUERIES = {
     WHERE id = $4
     RETURNING reading_status, to_char(started_at, 'YYYY-MM-DD') AS started_at, to_char(read_date, 'YYYY-MM-DD') AS read_date
   `,
+  UPDATE_EXTRAS: 'UPDATE librishelf.books SET series = $1, series_index = $2, notes = $3 WHERE id = $4',
+  GET_EXTRAS: 'SELECT series, series_index, notes FROM librishelf.books WHERE id = $1',
+  SERIES_BY_USER: `
+    SELECT min(series) AS name, COUNT(*)::int AS count,
+           COUNT(*) FILTER (WHERE read_date IS NOT NULL)::int AS read
+    FROM librishelf.books
+    WHERE user_id = $1 AND series IS NOT NULL
+    GROUP BY lower(series)
+    ORDER BY lower(min(series))
+  `,
+  OWNED_IDS: 'SELECT id FROM librishelf.books WHERE user_id = $1 AND id = ANY($2::int[])',
+  // Ações em lote (ids já conferidos como do usuário).
+  BATCH_STATUS_READ: `
+    UPDATE librishelf.books SET read_date = COALESCE(read_date, $2::timestamp), reading_status = NULL, last_modified = now()
+    WHERE id = ANY($1::int[])
+  `,
+  BATCH_STATUS_READING: `
+    UPDATE librishelf.books
+    SET started_at = CASE WHEN reading_status = 'reading' AND started_at IS NOT NULL THEN started_at ELSE $2::timestamp END,
+        reading_status = 'reading', last_modified = now()
+    WHERE id = ANY($1::int[])
+  `,
+  BATCH_STATUS_WANT: `
+    UPDATE librishelf.books SET reading_status = 'want', started_at = NULL, read_date = NULL, last_modified = now()
+    WHERE id = ANY($1::int[])
+  `,
+  BATCH_STATUS_NONE: `
+    UPDATE librishelf.books SET reading_status = NULL, started_at = NULL, read_date = NULL, last_modified = now()
+    WHERE id = ANY($1::int[])
+  `,
+  ENSURE_TAG: `
+    WITH ins AS (
+      INSERT INTO librishelf.tags (name, user_id) VALUES ($1, $2)
+      ON CONFLICT (user_id, (lower(name))) DO NOTHING
+      RETURNING id
+    )
+    SELECT id FROM ins
+    UNION ALL
+    SELECT id FROM librishelf.tags WHERE user_id = $2 AND lower(name) = lower($1)
+    LIMIT 1
+  `,
+  BATCH_ADD_TAG: `
+    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
+    SELECT unnest($1::int[]), $2
+    ON CONFLICT (book_id, tag_id) DO NOTHING
+  `,
+  BATCH_REMOVE_TAG: `
+    DELETE FROM librishelf.books_tags_link btl
+    USING librishelf.tags t
+    WHERE btl.tag_id = t.id AND t.user_id = $2 AND lower(t.name) = lower($3)
+      AND btl.book_id = ANY($1::int[])
+  `,
+  BATCH_DELETE: 'DELETE FROM librishelf.books WHERE id = ANY($1::int[])',
   // Editar a data de leitura no formulário também tira de "Quero ler".
   CLEAR_WANT_IF_READ: `
     UPDATE librishelf.books SET reading_status = NULL
@@ -200,7 +258,8 @@ export const AUTH_QUERIES = {
 
 export const AUTHOR_QUERIES = {
   GET_AUTHORS_BY_USER: `
-    SELECT a.name, COUNT(DISTINCT b.id)::int AS count
+    SELECT a.name, COUNT(DISTINCT b.id)::int AS count,
+           COUNT(DISTINCT b.id) FILTER (WHERE b.read_date IS NOT NULL)::int AS read
     FROM librishelf.authors a
     JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
     JOIN librishelf.books b ON b.id = bal.book_id
@@ -222,7 +281,8 @@ export const AUTHOR_QUERIES = {
 
 export const PUBLISHER_QUERIES = {
   GET_PUBLISHERS_BY_USER: `
-    SELECT p.name, COUNT(DISTINCT b.id)::int AS count
+    SELECT p.name, COUNT(DISTINCT b.id)::int AS count,
+           COUNT(DISTINCT b.id) FILTER (WHERE b.read_date IS NOT NULL)::int AS read
     FROM librishelf.publishers p
     JOIN librishelf.books b ON b.publisher_id = p.id
     WHERE p.user_id = $1
@@ -243,7 +303,8 @@ export const PUBLISHER_QUERIES = {
 
 export const TAG_QUERIES = {
   GET_TAGS_BY_USER: `
-    SELECT t.name, COUNT(DISTINCT b.id)::int AS count
+    SELECT t.name, COUNT(DISTINCT b.id)::int AS count,
+           COUNT(DISTINCT b.id) FILTER (WHERE b.read_date IS NOT NULL)::int AS read
     FROM librishelf.tags t
     JOIN librishelf.books_tags_link btl ON t.id = btl.tag_id
     JOIN librishelf.books b ON b.id = btl.book_id
diff --git a/backend/src/repositories/libraryRepository.js b/backend/src/repositories/libraryRepository.js
index c7a6278..551e5f7 100644
--- a/backend/src/repositories/libraryRepository.js
+++ b/backend/src/repositories/libraryRepository.js
@@ -25,6 +25,7 @@ async function getAllBooksByUser(userId, filters = {}) {
     readState,
     readYear,
     readMonth,
+    series,
     author,
     publisher,
     tags,
@@ -69,6 +70,7 @@ async function getAllBooksByUser(userId, filters = {}) {
     query += ` AND (
       b.title ILIKE $${paramIndex}
       OR b.isbn ILIKE $${paramIndex}
+      OR b.series ILIKE $${paramIndex}
       OR EXISTS (
         SELECT 1 FROM librishelf.books_authors_link bal_s
         JOIN librishelf.authors a_s ON bal_s.author_id = a_s.id
@@ -108,6 +110,12 @@ async function getAllBooksByUser(userId, filters = {}) {
     paramIndex++
   }
 
+  if (series) {
+    query += ` AND lower(b.series) = lower($${paramIndex})`
+    params.push(series)
+    paramIndex++
+  }
+
   // Livros com ISBN preenchido que não passa na validação (para o usuário corrigir).
   if (isbnStatus === 'invalid') {
     query += ` AND b.isbn IS NOT NULL AND btrim(b.isbn) <> '' AND b.isbn13 IS NULL`
@@ -126,7 +134,12 @@ async function getAllBooksByUser(userId, filters = {}) {
   const dbSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
 
   // Sem nota/data vai para o fim nas duas direções; b.id desempata (paginação estável).
-  query += ` ORDER BY ${dbSortField} ${dbSortOrder} NULLS LAST, b.id ${dbSortOrder}`
+  if (sortField === 'series') {
+    // Série em ordem e, dentro dela, pelo número do volume.
+    query += ` ORDER BY lower(b.series) ${dbSortOrder} NULLS LAST, b.series_index ${dbSortOrder} NULLS LAST, b.id ${dbSortOrder}`
+  } else {
+    query += ` ORDER BY ${dbSortField} ${dbSortOrder} NULLS LAST, b.id ${dbSortOrder}`
+  }
 
   const { page: pageVal, limit: limitVal, offset } = resolvePagination(page, limit)
 
@@ -238,6 +251,55 @@ async function clearWantIfRead(bookId) {
   await db.query(q.CLEAR_WANT_IF_READ, [bookId])
 }
 
+async function updateExtras(bookId, { series, seriesIndex, notes }) {
+  await db.query(q.UPDATE_EXTRAS, [series, seriesIndex, notes, bookId])
+}
+
+async function getExtras(bookId) {
+  const result = await db.query(q.GET_EXTRAS, [bookId])
+  return result.rows[0] ?? null
+}
+
+async function getSeriesByUser(userId) {
+  const result = await db.query(q.SERIES_BY_USER, [userId])
+  return result.rows
+}
+
+async function filterOwnedIds(userId, ids) {
+  const result = await db.query(q.OWNED_IDS, [userId, ids])
+  return result.rows.map(row => row.id)
+}
+
+const BATCH_STATUS_QUERY = {
+  read: q.BATCH_STATUS_READ,
+  reading: q.BATCH_STATUS_READING,
+  want: q.BATCH_STATUS_WANT,
+  none: q.BATCH_STATUS_NONE
+}
+
+async function batchSetStatus(ids, status, date) {
+  const sql = BATCH_STATUS_QUERY[status]
+  const params = status === 'read' || status === 'reading' ? [ids, date] : [ids]
+  const result = await db.query(sql, params)
+  return result.rowCount
+}
+
+async function batchAddTag(userId, ids, tagName) {
+  const { rows } = await db.query(q.ENSURE_TAG, [tagName, userId])
+  const result = await db.query(q.BATCH_ADD_TAG, [ids, rows[0].id])
+  return result.rowCount
+}
+
+async function batchRemoveTag(userId, ids, tagName) {
+  const result = await db.query(q.BATCH_REMOVE_TAG, [ids, userId, tagName])
+  return result.rowCount
+}
+
+async function batchDelete(ids) {
+  const result = await db.query(q.BATCH_DELETE, [ids])
+  return result.rowCount
+}
+
 async function pruneUserNames(userId) {
   await db.query(q.PRUNE_USER_NAMES, [userId])
 }
@@ -261,5 +323,13 @@ export {
   updateRating,
   setReadingStatus,
   clearWantIfRead,
+  updateExtras,
+  getExtras,
+  getSeriesByUser,
+  filterOwnedIds,
+  batchSetStatus,
+  batchAddTag,
+  batchRemoveTag,
+  batchDelete,
   pruneUserNames
 }
\ No newline at end of file
diff --git a/backend/src/routes/author.js b/backend/src/routes/author.js
index af65fd6..1ebd584 100644
--- a/backend/src/routes/author.js
+++ b/backend/src/routes/author.js
@@ -2,6 +2,7 @@ import express from 'express'
 import * as authorService from '../services/authorService.js'
 import { authenticateToken } from '../middlewares/auth.js'
 import STATUS from '../utils/statusCodes.js'
+import { mergeNames } from '../services/namesService.js'
 import sendError from '../utils/sendError.js'
 
 const router = express.Router()
@@ -21,4 +22,13 @@ router.get('/', async (req, res) => {
   }
 })
 
+// Renomear (um nome em "from") ou mesclar vários num só: { from: [...], to: '...' }
+router.post('/merge', async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await mergeNames('author', req.user.id, req.body ?? {}))
+  } catch (error) {
+    sendError(res, error, 'Erro ao renomear/mesclar')
+  }
+})
+
 export default router
\ No newline at end of file
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 787fbb8..64c3d6d 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -113,6 +113,24 @@ router.get('/', async (req, res) => {
   }
 })
 
+// Séries do usuário (filtro e autocompletar). Antes de '/:id'.
+router.get('/series', async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await libraryService.getSeries(req.user.id))
+  } catch (error) {
+    sendError(res, error, 'Erro ao listar séries')
+  }
+})
+
+// Ações em lote: { ids: [1, 2], action: 'status' | 'addTag' | 'removeTag' | 'delete', ... }
+router.post('/batch', async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await libraryService.batchUpdate(req.user.id, req.body ?? {}))
+  } catch (error) {
+    sendError(res, error, 'Erro na ação em lote')
+  }
+})
+
 router.get('/:id', validateNumericId(), async (req, res) => {
   try {
     const { id } = req.params
diff --git a/backend/src/routes/publisher.js b/backend/src/routes/publisher.js
index 42d03ea..b96b3a9 100644
--- a/backend/src/routes/publisher.js
+++ b/backend/src/routes/publisher.js
@@ -2,6 +2,7 @@ import * as publisherService from '../services/publisherService.js'
 import { authenticateToken } from '../middlewares/auth.js'
 import express from 'express'
 import STATUS from '../utils/statusCodes.js'
+import { mergeNames } from '../services/namesService.js'
 import sendError from '../utils/sendError.js'
 
 const router = express.Router()
@@ -21,4 +22,13 @@ router.get('/', async (req, res) => {
   }
 })
 
+// Renomear (um nome em "from") ou mesclar vários num só: { from: [...], to: '...' }
+router.post('/merge', async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await mergeNames('publisher', req.user.id, req.body ?? {}))
+  } catch (error) {
+    sendError(res, error, 'Erro ao renomear/mesclar')
+  }
+})
+
 export default router
\ No newline at end of file
diff --git a/backend/src/routes/tags.js b/backend/src/routes/tags.js
index a603641..2a1191f 100644
--- a/backend/src/routes/tags.js
+++ b/backend/src/routes/tags.js
@@ -2,6 +2,7 @@ import express from 'express'
 import * as tagService from '../services/tagService.js'
 import { authenticateToken } from '../middlewares/auth.js'
 import STATUS from '../utils/statusCodes.js'
+import { mergeNames } from '../services/namesService.js'
 import sendError from '../utils/sendError.js'
 
 const router = express.Router()
@@ -18,4 +19,13 @@ router.get('/', async (req, res) => {
   }
 })
 
+// Renomear (um nome em "from") ou mesclar vários num só: { from: [...], to: '...' }
+router.post('/merge', async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await mergeNames('tag', req.user.id, req.body ?? {}))
+  } catch (error) {
+    sendError(res, error, 'Erro ao renomear/mesclar')
+  }
+})
+
 export default router
\ No newline at end of file
diff --git a/backend/src/scripts/seed.js b/backend/src/scripts/seed.js
index 47aef98..e1a391a 100644
--- a/backend/src/scripts/seed.js
+++ b/backend/src/scripts/seed.js
@@ -454,6 +454,26 @@ async function insertReadingStatusAndGoals() {
   `)
 }
 
+/** Série a partir de títulos como "X: Volume 3" e algumas anotações. */
+async function insertSeriesAndNotes() {
+  await db.query(`
+    UPDATE librishelf.books
+    SET series = regexp_replace(title, ':\\s*Volume \\d+$', ''),
+        series_index = substring(title from 'Volume (\\d+)$')::real
+    WHERE title ~ ':\\s*Volume \\d+$'
+  `)
+  await db.query(`
+    UPDATE librishelf.books
+    SET notes = (ARRAY[
+      'Comprei num sebo em Ouro Preto.',
+      'Emprestado para a Júlia em março.',
+      E'Parei no capítulo 7.\\nRetomar com calma.',
+      'Final melhor que o começo.'
+    ])[1 + (id % 4)]
+    WHERE id % 11 = 0
+  `)
+}
+
 async function insertFollows(users) {
   const byName = new Map(users.map(user => [user.name, user]))
   const pairs = new Map()
@@ -579,6 +599,7 @@ async function main() {
   await insertUsers(users)
   const books = await insertBooks(users, catalog)
   await insertReadingStatusAndGoals()
+  await insertSeriesAndNotes()
   const follows = await insertFollows(users)
   const covers = CONFIG.covers ? await generateCovers(catalog) : 0
 
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index 71676b5..9f3e90d 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -2,6 +2,7 @@ import * as libraryRepository from '../repositories/libraryRepository.js'
 import * as authRepository from '../repositories/authRepository.js'
 import STATUS from '../utils/statusCodes.js'
 import { deleteBookCover } from '../utils/imageProcessor.js'
+import logger from '../utils/logger.js'
 import { parseNameList, parseTagList, validateNameList } from '../utils/nameList.js'
 
 const READ_YEAR_PATTERN = /^\d{4}$/
@@ -68,6 +69,39 @@ function normalizeReadMonth(value) {
   return month
 }
 
+const MAX_SERIES_LENGTH = 200
+const MAX_NOTES_LENGTH = 5000
+
+function normalizeSeries(value) {
+  if (value === undefined || value === null) return null
+  if (typeof value !== 'string') throw httpError("'series' precisa ser texto.", STATUS.BAD_REQUEST)
+  const series = value.trim().replace(/\s+/g, ' ')
+  if (series.length > MAX_SERIES_LENGTH) {
+    throw httpError(`O nome da série pode ter até ${MAX_SERIES_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+  }
+  return series || null
+}
+
+// Volume: 1, 2, 3… e também 1.5 (conto entre volumes). Vírgula decimal vale.
+function normalizeSeriesIndex(value) {
+  if (value === undefined || value === null || value === '') return null
+  const number = Number(String(value).replace(',', '.'))
+  if (!Number.isFinite(number) || number < 0 || number > 9999) {
+    throw httpError('O volume precisa ser um número de 0 a 9999.', STATUS.BAD_REQUEST)
+  }
+  return Math.round(number * 100) / 100
+}
+
+function normalizeNotes(value) {
+  if (value === undefined || value === null) return null
+  if (typeof value !== 'string') throw httpError("'notes' precisa ser texto.", STATUS.BAD_REQUEST)
+  const notes = value.replace(/\r\n/g, '\n').trim()
+  if (notes.length > MAX_NOTES_LENGTH) {
+    throw httpError(`A anotação pode ter até ${MAX_NOTES_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
+  }
+  return notes || null
+}
+
 function normalizeReadYear(readYear) {
   if (readYear === undefined || readYear === null || readYear === '' || readYear === 'all') return 'all'
 
@@ -103,7 +137,11 @@ async function getPublicBook(username, bookId) {
   const user = await authRepository.getUserByName(username)
   if (!user || !user.is_public) return null
 
-  return await libraryRepository.getBookByIdForUser(bookId, user.id)
+  const book = await libraryRepository.getBookByIdForUser(bookId, user.id)
+  if (!book) return null
+  // A anotação é só do dono.
+  const { notes, ...publicBook } = book
+  return publicBook
 }
 
 async function getAllBooksByUser(userId, query) {
@@ -112,6 +150,7 @@ async function getAllBooksByUser(userId, query) {
     readState: normalizeReadState(query.readState),
     readYear: normalizeReadYear(query.readYear),
     readMonth: normalizeReadMonth(query.readMonth),
+    series: typeof query.series === 'string' && query.series.trim() ? query.series.trim() : undefined,
     author: query.author || undefined,
     publisher: query.publisher || undefined,
     tags: query.tags || undefined,
@@ -185,7 +224,10 @@ function normalizeBookInput(raw = {}) {
     readDate: normalizeReadDate(raw.readDate),
     rating: normalizeRating(raw.rating),
     olWorkKey: normalizeOlKey(raw.olWorkKey, OL_WORK_KEY, 'olWorkKey'),
-    olEditionKey: normalizeOlKey(raw.olEditionKey, OL_EDITION_KEY, 'olEditionKey')
+    olEditionKey: normalizeOlKey(raw.olEditionKey, OL_EDITION_KEY, 'olEditionKey'),
+    series: normalizeSeries(raw.series),
+    seriesIndex: normalizeSeriesIndex(raw.seriesIndex),
+    notes: normalizeNotes(raw.notes)
   }
 }
 
@@ -202,7 +244,11 @@ async function addNewBook(bookData) {
     }
   }
 
-  return await libraryRepository.createBook(bookData)
+  const bookId = await libraryRepository.createBook(bookData)
+  if (bookData.series || bookData.seriesIndex !== null || bookData.notes) {
+    await libraryRepository.updateExtras(bookId, bookData)
+  }
+  return bookId
 }
 
 async function updateBookDetails(bookId, userId, rawBook) {
@@ -219,6 +265,15 @@ async function updateBookDetails(bookId, userId, rawBook) {
 
   await libraryRepository.updateBook(bookId, input)
   if (input.readDate) await libraryRepository.clearWantIfRead(bookId)
+
+  // Série, volume e anotação: campo que não veio (cliente antigo) fica como estava.
+  const body = rawBook ?? {}
+  const current = await libraryRepository.getExtras(bookId)
+  await libraryRepository.updateExtras(bookId, {
+    series: Object.hasOwn(body, 'series') ? input.series : current?.series ?? null,
+    seriesIndex: Object.hasOwn(body, 'seriesIndex') ? input.seriesIndex : current?.series_index ?? null,
+    notes: Object.hasOwn(body, 'notes') ? input.notes : current?.notes ?? null
+  })
   return true
 }
 
@@ -313,6 +368,66 @@ async function setReadingStatus(bookId, userId, rawStatus, rawDate) {
   }
 }
 
+async function getSeries(userId) {
+  return await libraryRepository.getSeriesByUser(userId)
+}
+
+const MAX_BATCH = 500
+const BATCH_ACTIONS = ['status', 'addTag', 'removeTag', 'delete']
+
+/**
+ * Ações em vários livros de uma vez: { ids, action, status?, date?, tag? }.
+ * Todos os ids precisam ser do usuário; se algum não for, nada é feito (403).
+ */
+async function batchUpdate(userId, body = {}) {
+  const { action } = body
+  if (!BATCH_ACTIONS.includes(action)) {
+    throw httpError("Ação inválida: use 'status', 'addTag', 'removeTag' ou 'delete'.", STATUS.BAD_REQUEST)
+  }
+
+  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))]
+  if (ids.length === 0 || ids.length > MAX_BATCH || !ids.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
+    throw httpError(`Envie de 1 a ${MAX_BATCH} ids de livros válidos.`, STATUS.BAD_REQUEST)
+  }
+
+  const owned = await libraryRepository.filterOwnedIds(userId, ids)
+  if (owned.length !== ids.length) {
+    throw httpError('Alguns livros não foram encontrados na sua biblioteca.', STATUS.FORBIDDEN)
+  }
+
+  if (action === 'status') {
+    const status = String(body.status ?? '')
+    if (!READING_STATUSES.includes(status)) {
+      throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST)
+    }
+    const date = normalizeReadDate(body.date) ?? new Date().toISOString().slice(0, 10)
+    return { updated: await libraryRepository.batchSetStatus(ids, status, date) }
+  }
+
+  if (action === 'addTag' || action === 'removeTag') {
+    const [tag] = parseTagList(body.tag)
+    const tagError = tag ? validateNameList([tag], 'tags') : 'Informe a categoria.'
+    if (tagError) throw httpError(tagError, STATUS.BAD_REQUEST)
+
+    if (action === 'addTag') {
+      return { updated: await libraryRepository.batchAddTag(userId, ids, tag) }
+    }
+    const updated = await libraryRepository.batchRemoveTag(userId, ids, tag)
+    await libraryRepository.pruneUserNames(userId)
+    return { updated }
+  }
+
+  // delete
+  const deleted = await libraryRepository.batchDelete(ids)
+  await libraryRepository.pruneUserNames(userId)
+  const failed = []
+  for (const id of ids) {
+    try { await deleteBookCover(id) } catch { failed.push(id) }
+  }
+  if (failed.length) logger.warn('Capas não removidas na exclusão em lote', { userId, failed })
+  return { updated: deleted }
+}
+
 export {
   getAllBooksByUser,
   getBookById,
@@ -326,6 +441,8 @@ export {
   markBookAsRead,
   markBookAsUnread,
   setReadingStatus,
+  getSeries,
+  batchUpdate,
   setRating,
   getPublicLibraryByUsername,
   normalizeDate,
diff --git a/backend/src/services/namesService.js b/backend/src/services/namesService.js
new file mode 100644
index 0000000..90ae8e2
--- /dev/null
+++ b/backend/src/services/namesService.js
@@ -0,0 +1,99 @@
+import { db } from '../database/connection.js'
+import STATUS from '../utils/statusCodes.js'
+import { parseNameList, parseTagList, validateNameList } from '../utils/nameList.js'
+
+/**
+ * Renomear e mesclar autores, editoras e categorias (sempre do próprio usuário).
+ *
+ * POST /author/merge { from: ['Asimov', 'Isaac Asimov'], to: 'Isaac Asimov' }
+ *
+ * Um nome só em `from` = renomear. Se `to` já existe (sem diferenciar
+ * maiúsculas), os livros passam para ele e os nomes de `from` somem: é a mesma
+ * operação que mesclar. Tudo numa transação.
+ */
+const KINDS = {
+  author: { table: 'authors', link: 'books_authors_link', column: 'author_id', label: 'autores', parse: parseNameList },
+  tag: { table: 'tags', link: 'books_tags_link', column: 'tag_id', label: 'tags', parse: parseTagList },
+  publisher: { table: 'publishers', label: 'editoras', parse: parseNameList }
+}
+
+function httpError(message, status) {
+  const error = new Error(message)
+  error.status = status
+  return error
+}
+
+async function moveBooks(client, kind, fromId, toId, userId) {
+  const { table, link, column } = KINDS[kind]
+
+  if (kind === 'publisher') {
+    await client.query(
+      'UPDATE librishelf.books SET publisher_id = $1, last_modified = now() WHERE publisher_id = $2 AND user_id = $3',
+      [toId, fromId, userId]
+    )
+  } else {
+    // Livro que já tem o nome de destino: só tira o vínculo antigo (sem duplicar).
+    await client.query(
+      `DELETE FROM librishelf.${link} WHERE ${column} = $1
+         AND book_id IN (SELECT book_id FROM librishelf.${link} WHERE ${column} = $2)`,
+      [fromId, toId]
+    )
+    await client.query(`UPDATE librishelf.${link} SET ${column} = $1 WHERE ${column} = $2`, [toId, fromId])
+  }
+
+  await client.query(`DELETE FROM librishelf.${table} WHERE id = $1 AND user_id = $2`, [fromId, userId])
+}
+
+export async function mergeNames(kind, userId, body = {}) {
+  const config = KINDS[kind]
+  const from = config.parse(body.from)
+  const [to] = config.parse(body.to)
+
+  if (from.length === 0 || !to) {
+    throw httpError('Informe os nomes de origem (from) e o nome final (to).', STATUS.BAD_REQUEST)
+  }
+  const listError = validateNameList(from, config.label) || validateNameList([to], config.label)
+  if (listError) throw httpError(listError, STATUS.BAD_REQUEST)
+
+  const client = await db.connect()
+  try {
+    await client.query('BEGIN')
+
+    const { rows: sources } = await client.query(
+      `SELECT id, name FROM librishelf.${config.table}
+       WHERE user_id = $1 AND lower(name) = ANY($2::text[]) FOR UPDATE`,
+      [userId, from.map(name => name.toLocaleLowerCase())]
+    )
+    if (sources.length !== from.length) {
+      throw httpError('Algum dos nomes não existe na sua biblioteca.', STATUS.NOT_FOUND)
+    }
+
+    const { rows: [existing] } = await client.query(
+      `SELECT id FROM librishelf.${config.table} WHERE user_id = $1 AND lower(name) = lower($2) FOR UPDATE`,
+      [userId, to]
+    )
+
+    let targetId
+    if (existing) {
+      targetId = existing.id
+      // Só mudou maiúscula/minúscula: grava a grafia nova.
+      await client.query(`UPDATE librishelf.${config.table} SET name = $1 WHERE id = $2`, [to, targetId])
+    } else {
+      // O primeiro de `from` vira o nome final; os outros são mesclados nele.
+      targetId = sources[0].id
+      await client.query(`UPDATE librishelf.${config.table} SET name = $1 WHERE id = $2`, [to, targetId])
+    }
+
+    for (const source of sources) {
+      if (source.id !== targetId) await moveBooks(client, kind, source.id, targetId, userId)
+    }
+
+    await client.query('COMMIT')
+    return { name: to, merged: sources.filter(source => source.id !== targetId).length }
+  } catch (error) {
+    await client.query('ROLLBACK')
+    throw error
+  } finally {
+    client.release()
+  }
+}
diff --git a/backend/src/tests/integration/authors.test.js b/backend/src/tests/integration/authors.test.js
index b635ab7..94b97d9 100644
--- a/backend/src/tests/integration/authors.test.js
+++ b/backend/src/tests/integration/authors.test.js
@@ -136,6 +136,6 @@ describe('Tags e conflitos', () => {
     expect(results.map(r => r.statusCode)).toEqual([201, 201, 201, 201, 201])
 
     const authors = await request(app).get('/author').set(auth())
-    expect(authors.body.filter(a => a.name === 'Autor Novíssimo')).toEqual([{ name: 'Autor Novíssimo', count: 5 }])
+    expect(authors.body.filter(a => a.name === 'Autor Novíssimo')).toEqual([{ name: 'Autor Novíssimo', count: 5, read: 0 }])
   })
 })
diff --git a/backend/src/tests/integration/community.test.js b/backend/src/tests/integration/community.test.js
index 1e6a67d..a01bd1a 100644
--- a/backend/src/tests/integration/community.test.js
+++ b/backend/src/tests/integration/community.test.js
@@ -63,7 +63,7 @@ describe('Nomes por usuário', () => {
   it('maiúsculas diferentes viram o mesmo autor (mantém a 1ª grafia)', async () => {
     await addBook('ana', { title: 'O Senhor dos Anéis' }, ['TOLKIEN'])
     const res = await request(app).get('/author').set(auth('ana'))
-    expect(res.body.filter(a => a.name.toLowerCase() === 'tolkien')).toEqual([{ name: 'Tolkien', count: 2 }])
+    expect(res.body.filter(a => a.name.toLowerCase() === 'tolkien')).toEqual([{ name: 'Tolkien', count: 2, read: 0 }])
   })
 
   it('excluir o último livro de um autor tira o autor da lista', async () => {
diff --git a/backend/src/tests/integration/organize.test.js b/backend/src/tests/integration/organize.test.js
new file mode 100644
index 0000000..6b65c5d
--- /dev/null
+++ b/backend/src/tests/integration/organize.test.js
@@ -0,0 +1,215 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { confirmEmail } from '../helpers/confirmEmail.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+let auth
+let otherAuth
+
+async function signUp(name) {
+  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
+  return { Authorization: `Bearer ${tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))}` }
+}
+
+async function addBook(fields, who = auth) {
+  const res = await request(app).post('/library').set(who).field(fields)
+  expect(res.statusCode).toBe(201)
+  return res.body.bookId
+}
+
+const getBook = async id => (await request(app).get(`/library/${id}`).set(auth)).body
+const list = async query => (await request(app).get('/library').set(auth).query(query)).body.result
+
+beforeAll(async () => {
+  await clearDatabase()
+  auth = await signUp('organiza')
+  otherAuth = await signUp('outra')
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+describe('Série, volume e anotação', () => {
+  let duna1, duna2
+
+  it('grava série, volume e anotação no cadastro', async () => {
+    duna2 = await addBook({ title: 'O Messias de Duna', authors: 'Frank Herbert', series: ' Duna ', seriesIndex: '2', notes: 'Melhor que o primeiro?' })
+    duna1 = await addBook({ title: 'Duna', authors: 'Frank Herbert', series: 'duna', seriesIndex: '1' })
+    await addBook({ title: 'Conto', authors: 'Frank Herbert', series: 'Duna', seriesIndex: '1,5' })
+    await addBook({ title: 'Avulso', authors: 'Outro' })
+
+    const book = await getBook(duna2)
+    expect(book.series).toBe('Duna')
+    expect(book.series_index).toBe(2)
+    expect(book.notes).toBe('Melhor que o primeiro?')
+  })
+
+  it('ordena pela série e pelo volume; filtra e busca pela série', async () => {
+    const sorted = await list({ sort: 'series', order: 'asc' })
+    expect(sorted.map(b => b.title)).toEqual(['Duna', 'Conto', 'O Messias de Duna', 'Avulso'])
+
+    expect((await list({ series: 'DUNA' })).length).toBe(3)
+    expect((await list({ search: 'duna' })).length).toBe(3)
+  })
+
+  it('lista as séries do usuário com contagem', async () => {
+    const res = await request(app).get('/library/series').set(auth)
+    expect(res.statusCode).toBe(200)
+    expect(res.body).toEqual([{ name: 'Duna', count: 3, read: 0 }].map(s => ({ ...s, name: expect.stringMatching(/^duna$/i) })))
+  })
+
+  it('a lista não traz a anotação; editar sem mandar os campos novos não apaga nada', async () => {
+    const row = (await list({ search: 'Messias' }))[0]
+    expect(row).not.toHaveProperty('notes')
+    expect(row.series_index).toBe(2)
+
+    await request(app).put(`/library/${duna2}`).set(auth).send({ title: 'O Messias de Duna', authors: ['Frank Herbert'] })
+    const book = await getBook(duna2)
+    expect(book.notes).toBe('Melhor que o primeiro?')
+    expect(book.series).toBe('Duna')
+  })
+
+  it('editar troca e apaga os campos', async () => {
+    await request(app).put(`/library/${duna1}`).set(auth).send({ title: 'Duna', authors: ['Frank Herbert'], series: '', seriesIndex: null, notes: '  Reler  ' })
+    const book = await getBook(duna1)
+    expect(book.series).toBeNull()
+    expect(book.series_index).toBeNull()
+    expect(book.notes).toBe('Reler')
+  })
+
+  it('valida tamanhos e volume', async () => {
+    expect((await request(app).post('/library').set(auth).field({ title: 'X', authors: 'Y', seriesIndex: 'dois' })).statusCode).toBe(400)
+    expect((await request(app).post('/library').set(auth).field({ title: 'X', authors: 'Y', seriesIndex: '-1' })).statusCode).toBe(400)
+    expect((await request(app).post('/library').set(auth).field({ title: 'X', authors: 'Y', series: 'a'.repeat(201) })).statusCode).toBe(400)
+    expect((await request(app).post('/library').set(auth).send({ title: 'X', authors: ['Y'], notes: 'a'.repeat(5001) })).statusCode).toBe(400)
+  })
+
+  it('a biblioteca pública nunca mostra a anotação', async () => {
+    await confirmEmail('organiza')
+    await request(app).patch('/auth/me/visibility').set(auth).send({ isPublic: true })
+    const res = await request(app).get(`/library/public/u/organiza/book/${duna2}`)
+    expect(res.statusCode).toBe(200)
+    expect(res.body.series).toBe('Duna')
+    expect(res.body).not.toHaveProperty('notes')
+  })
+})
+
+describe('Ações em lote', () => {
+  let ids
+
+  beforeAll(async () => {
+    ids = [
+      await addBook({ title: 'Lote A', authors: 'L' }),
+      await addBook({ title: 'Lote B', authors: 'L', tags: 'velha' }),
+      await addBook({ title: 'Lote C', authors: 'L', readDate: '2024-05-05' })
+    ]
+  })
+
+  const batch = body => request(app).post('/library/batch').set(auth).send(body)
+
+  it('marca vários como lidos sem mudar a data de quem já tinha', async () => {
+    const res = await batch({ ids, action: 'status', status: 'read', date: '2026-01-02' })
+    expect(res.body.updated).toBe(3)
+    expect((await getBook(ids[0])).read_date).toBeTruthy()
+    const c = await getBook(ids[2])
+    expect(new Date(c.read_date).getUTCFullYear()).toBe(2024)
+  })
+
+  it('Quero ler / Lendo / nenhum em lote', async () => {
+    await batch({ ids, action: 'status', status: 'want' })
+    expect((await list({ readState: 'want', search: 'Lote' })).length).toBe(3)
+    await batch({ ids: [ids[0]], action: 'status', status: 'reading' })
+    expect((await getBook(ids[0])).reading_status).toBe('reading')
+    await batch({ ids, action: 'status', status: 'none' })
+    expect((await list({ readState: 'want', search: 'Lote' })).length).toBe(0)
+  })
+
+  it('adiciona e remove categoria', async () => {
+    expect((await batch({ ids, action: 'addTag', tag: 'Emprestados' })).body.updated).toBe(3)
+    expect((await list({ tags: 'Emprestados' })).length).toBe(3)
+    // repetir não duplica
+    expect((await batch({ ids, action: 'addTag', tag: 'emprestados' })).body.updated).toBe(0)
+
+    expect((await batch({ ids: [ids[1]], action: 'removeTag', tag: 'velha' })).body.updated).toBe(1)
+    const tags = (await request(app).get('/tags').set(auth)).body.map(t => t.name)
+    expect(tags).not.toContain('velha') // categoria sem livros some
+  })
+
+  it('não mexe em livro de outra pessoa (nem nos próprios, na mesma chamada)', async () => {
+    const alien = await addBook({ title: 'Alheio', authors: 'Z' }, otherAuth)
+    const res = await batch({ ids: [ids[0], alien], action: 'delete' })
+    expect(res.statusCode).toBe(403)
+    expect((await getBook(ids[0])).title).toBe('Lote A')
+  })
+
+  it('valida ação, ids e status', async () => {
+    expect((await batch({ ids, action: 'explodir' })).statusCode).toBe(400)
+    expect((await batch({ ids: [], action: 'delete' })).statusCode).toBe(400)
+    expect((await batch({ ids: ['x'], action: 'delete' })).statusCode).toBe(400)
+    expect((await batch({ ids: Array.from({ length: 501 }, (_, i) => i + 1), action: 'delete' })).statusCode).toBe(400)
+    expect((await batch({ ids, action: 'status', status: 'talvez' })).statusCode).toBe(400)
+    expect((await batch({ ids, action: 'addTag', tag: '' })).statusCode).toBe(400)
+  })
+
+  it('exclui em lote', async () => {
+    expect((await batch({ ids, action: 'delete' })).body.updated).toBe(3)
+    expect((await request(app).get(`/library/${ids[0]}`).set(auth)).statusCode).toBe(404)
+  })
+})
+
+describe('Autores, editoras e categorias: contagem, renomear e mesclar', () => {
+  beforeAll(async () => {
+    await addBook({ title: 'Fundação', authors: 'Asimov', publisher: 'Aleph', tags: 'ficção' })
+    await addBook({ title: 'Eu, Robô', authors: 'Isaac Asimov', publisher: 'aleph ', tags: 'Ficcao' })
+    await addBook({ title: 'O Fim da Eternidade', authors: ['Asimov', 'Isaac Asimov'], publisher: 'Editora Aleph', readDate: '2025-01-01', tags: 'ficção, Ficcao' })
+  })
+
+  const authors = async () => (await request(app).get('/author').set(auth)).body
+
+  it('a lista traz lidos/total', async () => {
+    const asimov = (await authors()).find(a => a.name === 'Asimov')
+    expect(asimov).toEqual({ name: 'Asimov', count: 2, read: 1 })
+  })
+
+  it('renomear um autor', async () => {
+    const res = await request(app).post('/author/merge').set(auth).send({ from: ['Frank Herbert'], to: 'Frank P. Herbert' })
+    expect(res.body).toEqual({ name: 'Frank P. Herbert', merged: 0 })
+    expect((await authors()).map(a => a.name)).toContain('Frank P. Herbert')
+  })
+
+  it('mesclar dois autores junta os livros sem duplicar no livro que tinha os dois', async () => {
+    const res = await request(app).post('/author/merge').set(auth).send({ from: ['Asimov', 'Isaac Asimov'], to: 'Isaac Asimov' })
+    expect(res.body).toEqual({ name: 'Isaac Asimov', merged: 1 })
+
+    const list = await authors()
+    expect(list.find(a => a.name === 'Asimov')).toBeUndefined()
+    expect(list.find(a => a.name === 'Isaac Asimov')).toEqual({ name: 'Isaac Asimov', count: 3, read: 1 })
+
+    const eternidade = (await request(app).get('/library').set(auth).query({ search: 'Eternidade' })).body.result[0]
+    expect(eternidade.author_names).toEqual(['Isaac Asimov'])
+  })
+
+  it('renomear para um nome que já existe = mesclar (editoras)', async () => {
+    const res = await request(app).post('/publisher/merge').set(auth).send({ from: ['Editora Aleph'], to: 'ALEPH' })
+    expect(res.body.merged).toBe(1)
+    const publishers = (await request(app).get('/publisher').set(auth)).body
+    expect(publishers.filter(p => /aleph/i.test(p.name))).toEqual([{ name: 'ALEPH', count: 3, read: 1 }])
+  })
+
+  it('mesclar categorias', async () => {
+    await request(app).post('/tags/merge').set(auth).send({ from: ['Ficcao', 'ficção'], to: 'Ficção científica' })
+    const tags = (await request(app).get('/tags').set(auth)).body
+    expect(tags.find(t => t.name === 'Ficção científica')).toEqual({ name: 'Ficção científica', count: 3, read: 1 })
+    expect(tags.find(t => t.name === 'ficção')).toBeUndefined()
+  })
+
+  it('nome inexistente → 404; de outra pessoa não conta; vazio → 400', async () => {
+    expect((await request(app).post('/author/merge').set(auth).send({ from: ['Ninguém'], to: 'X' })).statusCode).toBe(404)
+    await addBook({ title: 'Dela', authors: 'Autora Dela' }, otherAuth)
+    expect((await request(app).post('/author/merge').set(auth).send({ from: ['Autora Dela'], to: 'Minha' })).statusCode).toBe(404)
+    expect((await request(app).post('/author/merge').set(auth).send({ from: [], to: 'X' })).statusCode).toBe(400)
+    expect((await request(app).post('/tags/merge').set(auth).send({ from: ['Ficção científica'], to: '' })).statusCode).toBe(400)
+  })
+})
diff --git a/frontend/src/components/AddBookDialog.vue b/frontend/src/components/AddBookDialog.vue
index 9659be7..a9d3b84 100644
--- a/frontend/src/components/AddBookDialog.vue
+++ b/frontend/src/components/AddBookDialog.vue
@@ -180,6 +180,41 @@
             />
           </div>
 
+          <div class="series-grid">
+            <div class="input-group">
+              <label for="new-book-series">{{ t('series.name') }}</label>
+              <input
+                id="new-book-series"
+                v-model="book.series"
+                class="modern-input meta-input"
+                list="new-book-series-options"
+                maxlength="200"
+                autocomplete="off"
+                :placeholder="t('series.namePlaceholder')"
+                @focus="loadSeriesOptions"
+              />
+              <datalist id="new-book-series-options">
+                <option
+                  v-for="item in seriesOptions"
+                  :key="item.name"
+                  :value="item.name"
+                ></option>
+              </datalist>
+            </div>
+            <div class="input-group">
+              <label for="new-book-series-index">{{ t('series.volume') }}</label>
+              <input
+                id="new-book-series-index"
+                v-model="book.seriesIndex"
+                class="modern-input meta-input"
+                inputmode="decimal"
+                maxlength="7"
+                autocomplete="off"
+                placeholder="-"
+              />
+            </div>
+          </div>
+
           <div class="dates-grid">
             <div class="input-group">
               <label for="new-book-read-date">{{ t('book.read_status') }}</label>
@@ -307,7 +342,20 @@ const initialBookState = {
   isbn: '',
   readDate: null,
   pubDate: null,
-  rating: null
+  rating: null,
+  series: '',
+  seriesIndex: ''
+}
+
+// Séries já usadas, para autocompletar (carrega na primeira vez que o campo recebe foco).
+const seriesOptions = ref([])
+async function loadSeriesOptions() {
+  if (seriesOptions.value.length) return
+  try {
+    seriesOptions.value = await api.getSeries()
+  } catch {
+    seriesOptions.value = []
+  }
 }
 
 // Resultado da busca por ISBN: as chaves do Open Library só valem para o ISBN
@@ -448,6 +496,8 @@ async function saveBook() {
     if (book.pubDate) formData.append('pubDate', toApiDate(book.pubDate))
     if (book.readDate) formData.append('readDate', toApiDate(book.readDate))
     if (book.rating) formData.append('rating', String(book.rating))
+    if (book.series?.trim()) formData.append('series', book.series.trim())
+    if (String(book.seriesIndex ?? '').trim()) formData.append('seriesIndex', String(book.seriesIndex).trim())
 
     if (lookup.isbn && lookup.isbn === book.isbn.trim()) {
       if (lookup.olWorkKey) formData.append('olWorkKey', lookup.olWorkKey)
@@ -844,6 +894,12 @@ button.upload-container {
   gap: 1.5rem;
 }
 
+.series-grid {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) 6.5rem;
+  gap: 1rem;
+}
+
 .date-wrapper {
   display: flex;
   align-items: center;
diff --git a/frontend/src/components/BatchBar.vue b/frontend/src/components/BatchBar.vue
new file mode 100644
index 0000000..fcf596c
--- /dev/null
+++ b/frontend/src/components/BatchBar.vue
@@ -0,0 +1,296 @@
+<template>
+  <div
+    class="batch-bar"
+    role="toolbar"
+    :aria-label="t('batch.toolbar')"
+  >
+    <span
+      class="batch-count"
+      aria-live="polite"
+    >{{ t('batch.selected', { n: count }, count) }}</span>
+
+    <button
+      type="button"
+      class="batch-link"
+      @click="emit('select-all')"
+    >{{ allSelected ? t('batch.selectNone') : t('batch.selectAll') }}</button>
+
+    <div class="batch-actions">
+      <Button
+        :label="t('batch.status')"
+        :aria-label="t('batch.status')"
+        icon="pi pi-check-circle"
+        class="p-button-sm p-button-outlined batch-btn"
+        :disabled="!count || busy"
+        aria-haspopup="true"
+        aria-controls="batch-status-menu"
+        @click="event => statusMenu.toggle(event)"
+      />
+      <Menu
+        id="batch-status-menu"
+        ref="statusMenu"
+        :model="statusItems"
+        popup
+      />
+
+      <Button
+        :label="t('batch.category')"
+        :aria-label="t('batch.category')"
+        icon="pi pi-tags"
+        class="p-button-sm p-button-outlined batch-btn"
+        :disabled="!count || busy"
+        @click="openTagDialog"
+      />
+
+      <Button
+        :label="t('batch.delete')"
+        :aria-label="t('batch.delete')"
+        icon="pi pi-trash"
+        class="p-button-sm p-button-outlined p-button-danger batch-btn"
+        :disabled="!count || busy"
+        @click="confirmDelete"
+      />
+
+      <Button
+        icon="pi pi-times"
+        class="p-button-sm p-button-text p-button-rounded close-btn"
+        :aria-label="t('batch.cancel')"
+        v-tooltip.top="t('batch.cancel')"
+        @click="emit('cancel')"
+      />
+    </div>
+
+    <Dialog
+      v-model:visible="tagDialog"
+      modal
+      :header="t('batch.categoryTitle', { n: count }, count)"
+      :style="{ width: 'min(26rem, 92vw)' }"
+      :draggable="false"
+    >
+      <form
+        class="tag-form"
+        @submit.prevent="applyTag('addTag')"
+      >
+        <label for="batch-tag">{{ t('batch.categoryName') }}</label>
+        <input
+          id="batch-tag"
+          v-model="tagName"
+          class="modern-input"
+          list="batch-tag-options"
+          maxlength="200"
+          autocomplete="off"
+          :placeholder="t('batch.categoryPlaceholder')"
+        />
+        <datalist id="batch-tag-options">
+          <option
+            v-for="tag in tags"
+            :key="tag.name"
+            :value="tag.name"
+          ></option>
+        </datalist>
+        <div class="tag-form-actions">
+          <Button
+            type="button"
+            :label="t('batch.removeCategory')"
+            icon="pi pi-minus"
+            class="p-button-sm p-button-text p-button-danger"
+            :disabled="!tagName.trim() || busy"
+            @click="applyTag('removeTag')"
+          />
+          <Button
+            type="submit"
+            :label="t('batch.addCategory')"
+            icon="pi pi-plus"
+            class="p-button-sm btn-action-primary"
+            :disabled="!tagName.trim() || busy"
+            :loading="busy"
+          />
+        </div>
+      </form>
+    </Dialog>
+  </div>
+</template>
+
+<script setup>
+import { ref, computed } from 'vue'
+import { useI18n } from 'vue-i18n'
+import { useConfirm } from 'primevue/useconfirm'
+import { useToast } from 'primevue/usetoast'
+import Button from 'primevue/button'
+import Menu from 'primevue/menu'
+import Dialog from 'primevue/dialog'
+import api from '../services/api.js'
+import { toApiDate } from '../utils/dates.js'
+
+/**
+ * Barra de ações em lote da biblioteca: status, categoria e excluir para os
+ * livros selecionados. Avisa o pai com `done` para recarregar a lista.
+ */
+const props = defineProps({
+  ids: { type: Array, required: true },
+  allSelected: { type: Boolean, default: false }
+})
+
+const emit = defineEmits(['select-all', 'cancel', 'done'])
+const { t } = useI18n()
+const confirm = useConfirm()
+const toast = useToast()
+
+const count = computed(() => props.ids.length)
+const busy = ref(false)
+const statusMenu = ref(null)
+const tagDialog = ref(false)
+const tagName = ref('')
+const tags = ref([])
+
+async function run(body, successKey) {
+  busy.value = true
+  try {
+    const { updated } = await api.batchBooks({ ids: props.ids, ...body })
+    toast.add({ severity: 'success', summary: t('common.success'), detail: t(successKey, { n: updated }, updated), life: 3000 })
+    emit('done')
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    busy.value = false
+  }
+}
+
+const statusItems = computed(() => [
+  { label: t('status.want'), icon: 'pi pi-bookmark', command: () => setStatus('want') },
+  { label: t('status.reading'), icon: 'pi pi-book', command: () => setStatus('reading') },
+  { label: t('status.read'), icon: 'pi pi-check', command: () => setStatus('read') },
+  { separator: true },
+  { label: t('status.clear'), icon: 'pi pi-times', command: () => setStatus('none') }
+])
+
+function setStatus(status) {
+  run({ action: 'status', status, date: toApiDate(new Date()) }, 'batch.doneStatus')
+}
+
+async function openTagDialog() {
+  tagName.value = ''
+  tagDialog.value = true
+  try {
+    tags.value = await api.getTags()
+  } catch {
+    tags.value = []
+  }
+}
+
+async function applyTag(action) {
+  const tag = tagName.value.trim()
+  if (!tag) return
+  await run({ action, tag }, action === 'addTag' ? 'batch.doneAddTag' : 'batch.doneRemoveTag')
+  tagDialog.value = false
+}
+
+function confirmDelete() {
+  confirm.require({
+    message: t('batch.confirmDelete', { n: count.value }, count.value),
+    header: t('bookDialog.confirm'),
+    icon: 'pi pi-exclamation-triangle',
+    acceptClass: 'p-button-rounded p-button-danger',
+    rejectClass: 'p-button-text p-button-secondary',
+    acceptLabel: t('batch.delete'),
+    rejectLabel: t('common.cancel'),
+    accept: () => run({ action: 'delete' }, 'batch.doneDelete')
+  })
+}
+</script>
+
+<style scoped>
+.batch-bar {
+  position: sticky;
+  bottom: 1rem;
+  z-index: 120;
+  margin: 1.5rem auto 0;
+  width: fit-content;
+  max-width: calc(100% - 2rem);
+  display: flex;
+  align-items: center;
+  gap: 0.75rem 1rem;
+  flex-wrap: wrap;
+  padding: 0.6rem 0.75rem 0.6rem 1.1rem;
+  border-radius: 16px;
+  background: var(--bg-panel);
+  border: 1px solid rgba(var(--main-color-rgb), 0.45);
+  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
+}
+
+.batch-count {
+  font-weight: 700;
+  color: var(--text-primary);
+  white-space: nowrap;
+}
+
+.batch-link {
+  background: none;
+  border: none;
+  padding: 0.25rem;
+  font: inherit;
+  font-size: 0.88rem;
+  color: var(--main-color);
+  cursor: pointer;
+  text-decoration: underline;
+  text-underline-offset: 3px;
+}
+
+.batch-actions {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  flex-wrap: wrap;
+}
+
+.batch-btn.p-button {
+  border-radius: 999px;
+}
+
+.tag-form {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+}
+
+.tag-form label {
+  font-size: 0.9rem;
+  color: var(--text-secondary);
+}
+
+.tag-form-actions {
+  display: flex;
+  justify-content: space-between;
+  gap: 0.5rem;
+  margin-top: 0.5rem;
+}
+
+/* No celular a lista rola dentro de uma área mais alta que a tela: a barra
+   fica presa à janela para não sumir embaixo. */
+@media (max-width: 768px) {
+  .batch-bar {
+    position: fixed;
+    left: 50%;
+    transform: translateX(-50%);
+    bottom: 0.75rem;
+    margin: 0;
+    width: max-content;
+    max-width: calc(100vw - 1.5rem);
+  }
+}
+
+@media (max-width: 600px) {
+  .batch-bar {
+    padding: 0.6rem 0.75rem;
+    gap: 0.5rem;
+  }
+
+  .batch-btn.p-button :deep(.p-button-label) {
+    display: none;
+  }
+
+  .batch-btn.p-button :deep(.p-button-icon) {
+    margin: 0;
+  }
+}
+</style>
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index 292b60f..844b04d 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -115,6 +115,31 @@
               <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}
               </h1>
               <h2 class="book-author">{{ book.authors || (loading ? '' : t('bookDialog.unknownAuthor')) }}</h2>
+              <template v-if="book.series && !loading">
+                <router-link
+                  v-if="!isReadOnly"
+                  :to="{ name: 'library', query: { series: book.series, sort: 'series', order: 'asc' } }"
+                  class="series-line"
+                  :title="t('series.seeAll', { series: book.series })"
+                  @click="visible = false"
+                >
+                  <i
+                    class="pi pi-clone"
+                    aria-hidden="true"
+                  ></i>
+                  {{ seriesLabel }}
+                </router-link>
+                <span
+                  v-else
+                  class="series-line"
+                >
+                  <i
+                    class="pi pi-clone"
+                    aria-hidden="true"
+                  ></i>
+                  {{ seriesLabel }}
+                </span>
+              </template>
               <template v-if="!loading && !loadFailed">
                 <StarRating
                   v-if="!isReadOnly"
@@ -151,6 +176,53 @@
             />
           </div>
 
+          <div class="series-grid">
+            <div class="info-group">
+              <label for="book-series">{{ t('series.name') }}</label>
+              <input
+                id="book-series"
+                v-model="book.series"
+                class="modern-input"
+                list="book-series-options"
+                maxlength="200"
+                autocomplete="off"
+                :placeholder="t('series.namePlaceholder')"
+              />
+              <datalist id="book-series-options">
+                <option
+                  v-for="item in seriesOptions"
+                  :key="item.name"
+                  :value="item.name"
+                ></option>
+              </datalist>
+            </div>
+            <div class="info-group">
+              <label for="book-series-index">{{ t('series.volume') }}</label>
+              <input
+                id="book-series-index"
+                v-model="book.series_index"
+                class="modern-input"
+                inputmode="decimal"
+                maxlength="7"
+                autocomplete="off"
+                placeholder="-"
+              />
+            </div>
+          </div>
+
+          <div class="info-group">
+            <label for="book-notes">{{ t('notes.label') }}</label>
+            <textarea
+              id="book-notes"
+              v-model="book.notes"
+              class="modern-input notes-input"
+              rows="4"
+              maxlength="5000"
+              :placeholder="t('notes.placeholder')"
+            ></textarea>
+            <span class="field-hint">{{ t('notes.privateHint') }} · {{ (book.notes || '').length }}/5000</span>
+          </div>
+
           <div class="dates-grid">
             <div class="info-group">
               <label for="book-read-date">{{ t('bookDialog.readDateLabel') }}</label>
@@ -308,6 +380,21 @@
             >{{ tag }}</span>
           </div>
 
+          <section
+            v-if="!isReadOnly && book.notes"
+            class="notes-section"
+            aria-labelledby="book-notes-title"
+          >
+            <h3 id="book-notes-title">
+              <i
+                class="pi pi-pencil"
+                aria-hidden="true"
+              ></i>
+              {{ t('notes.title') }}
+            </h3>
+            <p class="notes-text">{{ book.notes }}</p>
+          </section>
+
           <section
             v-if="showCommunity"
             class="community-section"
@@ -499,6 +586,7 @@ import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import GeneratedCover from './GeneratedCover.vue'
 import { fromApiDate, toApiDate } from '../utils/dates.js'
 import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../utils/readingStatus.js'
+import { seriesText } from '../utils/series.js'
 import { validateImageFile, createPreviewHandle } from '../utils/files.js'
 
 const { t, locale } = useI18n()
@@ -532,7 +620,7 @@ const preview = createPreviewHandle()
 
 function emptyBook() {
   // authors: texto para exibir; authorNames: a lista que é editada e salva.
-  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, pubdate: null }
+  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, series: '', series_index: null, notes: '', pubdate: null }
 }
 
 const book = ref(emptyBook())
@@ -577,6 +665,19 @@ const metaItems = computed(() => {
 
 const currentStatus = computed(() => statusOf(book.value))
 
+const seriesLabel = computed(() => seriesText(book.value, t, locale.value))
+
+// Séries já usadas, para autocompletar ao editar.
+const seriesOptions = ref([])
+async function loadSeriesOptions() {
+  if (props.isReadOnly || seriesOptions.value.length) return
+  try {
+    seriesOptions.value = await api.getSeries()
+  } catch {
+    seriesOptions.value = []
+  }
+}
+
 const statusCaption = computed(() => {
   const status = currentStatus.value
   if (status === 'read') return t('bookDialog.readOn', { date: formatDate(book.value.read_date) })
@@ -720,6 +821,7 @@ function editMode() {
   originalBook = cloneBook(book.value)
   submitted.value = false
   isEditing.value = true
+  loadSeriesOptions()
 }
 
 function cancelEdit() {
@@ -778,7 +880,10 @@ async function saveBookDetails() {
       isbn: book.value.isbn,
       rating: book.value.rating,
       pubDate: toApiDate(book.value.pubdate),
-      readDate: toApiDate(book.value.read_date)
+      readDate: toApiDate(book.value.read_date),
+      series: (book.value.series || '').trim(),
+      seriesIndex: String(book.value.series_index ?? '').trim() || null,
+      notes: book.value.notes || ''
     })
 
     if (selectedFile.value) {
@@ -816,6 +921,9 @@ function applyResponse(data) {
     tags: data.tags || '',
     read_date: fromApiDate(data.read_date),
     reading_status: data.reading_status ?? null,
+    series: data.series || '',
+    series_index: data.series_index ?? null,
+    notes: data.notes || '',
     started_at: fromApiDate(data.started_at),
     pubdate: fromApiDate(data.publication_date)
   }
@@ -1222,6 +1330,72 @@ button.cover-wrapper {
 }
 
 /* Editora · ano · ISBN */
+.series-line {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  margin-top: 0.35rem;
+  color: var(--main-color);
+  font-size: 0.92rem;
+  font-weight: 600;
+  text-decoration: none;
+}
+
+.series-line .pi {
+  font-size: 0.8rem;
+}
+
+a.series-line:hover {
+  text-decoration: underline;
+}
+
+.series-grid {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) 6.5rem;
+  gap: 1rem;
+}
+
+.notes-input {
+  resize: vertical;
+  min-height: 5.5rem;
+  font: inherit;
+  line-height: 1.5;
+}
+
+.field-hint {
+  font-size: 0.78rem;
+  color: var(--text-secondary);
+}
+
+.notes-section {
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  padding: 0.85rem 1rem;
+  background: rgba(var(--main-color-rgb), 0.05);
+}
+
+.notes-section h3 {
+  margin: 0 0 0.4rem;
+  font-size: 0.82rem;
+  font-weight: 700;
+  text-transform: uppercase;
+  letter-spacing: 0.4px;
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  gap: 0.4rem;
+}
+
+.notes-text {
+  margin: 0;
+  white-space: pre-wrap;
+  overflow-wrap: anywhere;
+  color: var(--text-primary);
+  line-height: 1.55;
+  max-height: 12rem;
+  overflow-y: auto;
+}
+
 .meta-line {
   list-style: none;
   margin: 0;
diff --git a/frontend/src/components/BookItem.vue b/frontend/src/components/BookItem.vue
index 4345665..d6e71cf 100644
--- a/frontend/src/components/BookItem.vue
+++ b/frontend/src/components/BookItem.vue
@@ -3,8 +3,10 @@
     <button
       type="button"
       class="book-card"
+      :class="{ 'is-selected': selectable && selected }"
       :aria-label="ariaLabel"
-      @click="displayDialog = true"
+      :aria-pressed="selectable ? selected : undefined"
+      @click="onCardClick"
     >
       <span class="cover-wrapper">
         <img
@@ -26,6 +28,13 @@
           aria-hidden="true"
         ></span>
 
+        <span
+          v-if="selectable"
+          class="select-check"
+          :class="{ checked: selected }"
+          aria-hidden="true"
+        ><i class="pi pi-check"></i></span>
+
         <span
           v-if="status === 'reading' || status === 'want'"
           class="status-badge"
@@ -49,11 +58,15 @@
           class="book-author"
           :title="book.authors"
         >{{ book.authors }}</span>
+        <span
+          v-if="book.series"
+          class="book-series"
+        >{{ seriesText(book, t, locale) }}</span>
       </span>
     </button>
 
     <button
-      v-if="quickActions && !readOnly"
+      v-if="quickActions && !readOnly && !selectable"
       type="button"
       class="quick-read"
       :class="{ 'is-read': isRead, busy: saving }"
@@ -88,10 +101,11 @@ import { useI18n } from 'vue-i18n'
 import BookDialog from './BookDialog.vue'
 import { useReadToggle } from '../composables/useReadToggle.js'
 import { statusOf } from '../utils/readingStatus.js'
+import { seriesText } from '../utils/series.js'
 import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import GeneratedCover from './GeneratedCover.vue'
 
-const { t } = useI18n()
+const { t, locale } = useI18n()
 
 const props = defineProps({
   book: { type: Object, required: true },
@@ -99,10 +113,18 @@ const props = defineProps({
   readOnly: { type: Boolean, default: false },
   ownerUsername: { type: String, default: '' },
   /** Botão de marcar como lido sobre a capa (só na biblioteca do dono). */
-  quickActions: { type: Boolean, default: false }
+  quickActions: { type: Boolean, default: false },
+  /** Modo seleção (ações em lote): clicar marca/desmarca em vez de abrir. */
+  selectable: { type: Boolean, default: false },
+  selected: { type: Boolean, default: false }
 })
 
-const emit = defineEmits(['updated', 'deleted'])
+const emit = defineEmits(['updated', 'deleted', 'toggle-select'])
+
+function onCardClick() {
+  if (props.selectable) emit('toggle-select', bookId.value)
+  else displayDialog.value = true
+}
 const displayDialog = ref(false)
 
 const bookId = computed(() => props.book.book_id ?? props.book.id)
@@ -293,6 +315,39 @@ button.book-card {
   font-weight: bold;
 }
 
+.select-check {
+  position: absolute;
+  top: 8px;
+  left: 8px;
+  z-index: 4;
+  width: 28px;
+  height: 28px;
+  border-radius: 8px;
+  border: 2px solid #ffffff;
+  background: rgba(0, 0, 0, 0.45);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  color: transparent;
+  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
+}
+
+.select-check.checked {
+  background: var(--main-color);
+  border-color: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.select-check .pi {
+  font-size: 0.8rem;
+  font-weight: 700;
+}
+
+.book-card.is-selected {
+  outline: 3px solid var(--main-color);
+  outline-offset: 2px;
+}
+
 .status-badge {
   position: absolute;
   left: 8px;
@@ -351,4 +406,13 @@ button.book-card {
   overflow: hidden;
   text-overflow: ellipsis;
 }
+.book-series {
+  display: block;
+  font-size: 0.78rem;
+  font-weight: 600;
+  color: var(--main-color);
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
+}
 </style>
diff --git a/frontend/src/components/BookRow.vue b/frontend/src/components/BookRow.vue
index 7e3b556..ef8a94e 100644
--- a/frontend/src/components/BookRow.vue
+++ b/frontend/src/components/BookRow.vue
@@ -1,11 +1,21 @@
 <template>
-  <li class="book-row">
+  <li
+    class="book-row"
+    :class="{ 'is-selected': selectable && selected }"
+  >
     <button
       type="button"
       class="row-main"
       :aria-label="ariaLabel"
-      @click="displayDialog = true"
+      :aria-pressed="selectable ? selected : undefined"
+      @click="onRowClick"
     >
+      <span
+        v-if="selectable"
+        class="row-check"
+        :class="{ checked: selected }"
+        aria-hidden="true"
+      ><i class="pi pi-check"></i></span>
       <span class="thumb">
         <img
           v-if="!coverMissing"
@@ -24,7 +34,9 @@
 
       <span class="main-text">
         <span class="title">{{ book.title }}</span>
-        <span class="authors">{{ book.authors }}</span>
+        <span class="authors">
+          {{ book.authors }}<template v-if="book.series"><span class="series"> · {{ seriesText(book, t, locale) }}</span></template>
+        </span>
       </span>
 
       <span class="col publisher">{{ book.publisher_name || '—' }}</span>
@@ -55,6 +67,7 @@
     </button>
 
     <button
+      v-if="!selectable"
       type="button"
       class="row-read"
       :class="{ 'is-read': isRead }"
@@ -90,14 +103,22 @@ import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import { fromApiDate } from '../utils/dates.js'
 import { useReadToggle } from '../composables/useReadToggle.js'
 import { statusOf } from '../utils/readingStatus.js'
+import { seriesText } from '../utils/series.js'
 
 /** Linha da biblioteca no modo lista: mais livros por tela, com os dados principais. */
 const props = defineProps({
   book: { type: Object, required: true },
-  coverVersion: { type: Number, default: 0 }
+  coverVersion: { type: Number, default: 0 },
+  selectable: { type: Boolean, default: false },
+  selected: { type: Boolean, default: false }
 })
 
-const emit = defineEmits(['updated', 'deleted'])
+const emit = defineEmits(['updated', 'deleted', 'toggle-select'])
+
+function onRowClick() {
+  if (props.selectable) emit('toggle-select', bookId.value)
+  else displayDialog.value = true
+}
 const { t, locale } = useI18n()
 const displayDialog = ref(false)
 
@@ -150,6 +171,38 @@ const ariaLabel = computed(() => {
   transition: border-color 0.15s ease, background-color 0.15s ease;
 }
 
+.book-row.is-selected {
+  border-color: var(--main-color);
+  background: rgba(var(--main-color-rgb), 0.08);
+}
+
+/* No modo seleção a caixinha entra antes da capa. */
+.row-main:has(.row-check) {
+  grid-template-columns: 22px 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 3.5rem 6rem 6rem;
+}
+
+.row-check {
+  width: 22px;
+  height: 22px;
+  border-radius: 6px;
+  border: 2px solid var(--border-color);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  color: transparent;
+}
+
+.row-check.checked {
+  background: var(--main-color);
+  border-color: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.row-check .pi {
+  font-size: 0.7rem;
+  font-weight: 700;
+}
+
 .book-row:hover {
   border-color: rgba(var(--main-color-rgb), 0.45);
 }
@@ -222,6 +275,10 @@ const ariaLabel = computed(() => {
   text-overflow: ellipsis;
 }
 
+.authors .series {
+  color: var(--main-color);
+}
+
 .year {
   font-variant-numeric: tabular-nums;
 }
@@ -295,6 +352,10 @@ const ariaLabel = computed(() => {
     grid-template-columns: 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
   }
 
+  .row-main:has(.row-check) {
+    grid-template-columns: 22px 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
+  }
+
   .year {
     display: none;
   }
@@ -306,6 +367,10 @@ const ariaLabel = computed(() => {
     gap: 0.75rem;
   }
 
+  .row-main:has(.row-check) {
+    grid-template-columns: 22px 40px minmax(0, 1fr) 5.75rem;
+  }
+
   .publisher,
   .rating {
     display: none;
@@ -321,6 +386,10 @@ const ariaLabel = computed(() => {
     grid-template-columns: 36px minmax(0, 1fr);
   }
 
+  .row-main:has(.row-check) {
+    grid-template-columns: 22px 36px minmax(0, 1fr);
+  }
+
   .thumb {
     width: 36px;
   }
diff --git a/frontend/src/components/EntityListView.vue b/frontend/src/components/EntityListView.vue
index 2db2874..358853d 100644
--- a/frontend/src/components/EntityListView.vue
+++ b/frontend/src/components/EntityListView.vue
@@ -29,6 +29,48 @@
       </div>
     </div>
 
+    <div
+      v-if="!loading && !loadError && items.length"
+      class="toolbar"
+    >
+      <span class="total">{{ t(`${i18nKey}.total`, { n: items.length }, items.length) }}</span>
+
+      <div
+        class="sort-group"
+        role="group"
+        :aria-label="t('entities.sortLabel')"
+      >
+        <button
+          v-for="option in sortOptions"
+          :key="option.value"
+          type="button"
+          class="pill"
+          :class="{ active: sortBy === option.value }"
+          :aria-pressed="sortBy === option.value"
+          @click="sortBy = option.value"
+        >{{ option.label }}</button>
+      </div>
+
+      <button
+        type="button"
+        class="pill merge-toggle"
+        :class="{ active: merging }"
+        :aria-pressed="merging"
+        @click="toggleMerging"
+      >
+        <i
+          class="pi pi-sitemap"
+          aria-hidden="true"
+        ></i>
+        {{ merging ? t('entities.mergeCancel') : t('entities.mergeMode') }}
+      </button>
+    </div>
+
+    <p
+      v-if="merging"
+      class="merge-help"
+    >{{ t('entities.mergeHelp') }}</p>
+
     <div class="content-body">
       <div
         v-if="loading"
@@ -76,14 +118,26 @@
         class="entity-grid"
       >
         <li
-          v-for="(item, index) in filteredItems"
+          v-for="item in filteredItems"
           :key="item.name"
+          class="entity-item"
         >
-          <router-link
-            :to="{ path: '/books', query: { [queryParam]: item.name } }"
+          <component
+            :is="merging ? 'button' : 'router-link'"
+            v-bind="merging
+              ? { type: 'button', 'aria-pressed': selected.has(item.name) }
+              : { to: { path: '/books', query: { [queryParam]: item.name } } }"
             class="entity-card"
+            :class="{ 'is-selected': merging && selected.has(item.name) }"
             :style="{ '--accent-color': tagColor(item.name) }"
+            @click="merging && toggleSelected(item.name)"
           >
+            <span
+              v-if="merging"
+              class="select-check"
+              :class="{ checked: selected.has(item.name) }"
+              aria-hidden="true"
+            ><i class="pi pi-check"></i></span>
             <span
               class="avatar-wrapper"
               aria-hidden="true"
@@ -106,25 +160,132 @@
               <span class="entity-name">{{ item.name }}</span>
               <span class="entity-meta">
                 {{ item.count ? t(`${i18nKey}.bookCount`, { count: item.count }, item.count) : t(viewKey) }}
+                <template v-if="item.count && item.read !== undefined"> · {{ t('entities.readCount', { n: item.read }, item.read) }}</template>
               </span>
+              <span
+                v-if="item.count && item.read !== undefined"
+                class="read-bar"
+                aria-hidden="true"
+              ><span :style="{ width: `${Math.round((item.read / item.count) * 100)}%` }"></span></span>
             </span>
 
             <i
+              v-if="!merging"
               class="pi pi-chevron-right arrow-icon"
               aria-hidden="true"
             ></i>
-          </router-link>
+          </component>
+
+          <button
+            v-if="!merging"
+            type="button"
+            class="rename-btn"
+            :aria-label="t('entities.renameOf', { name: item.name })"
+            v-tooltip.top="t('entities.rename')"
+            @click="openRename(item)"
+          >
+            <i
+              class="pi pi-pencil"
+              aria-hidden="true"
+            ></i>
+          </button>
         </li>
       </ul>
     </div>
+
+    <div
+      v-if="merging"
+      class="merge-bar"
+      role="toolbar"
+      :aria-label="t('entities.mergeMode')"
+    >
+      <span aria-live="polite">{{ t('entities.selected', { n: selected.size }, selected.size) }}</span>
+      <Button
+        :label="t('entities.mergeAction')"
+        icon="pi pi-sitemap"
+        class="p-button-sm btn-action-primary"
+        :disabled="selected.size < 2"
+        @click="openMerge"
+      />
+    </div>
+
+    <Dialog
+      v-model:visible="nameDialog.visible"
+      modal
+      :header="nameDialog.mode === 'merge' ? t('entities.mergeTitle', { n: nameDialog.from.length }) : t('entities.renameTitle')"
+      :style="{ width: 'min(28rem, 92vw)' }"
+      :draggable="false"
+    >
+      <form
+        class="name-form"
+        @submit.prevent="submitName"
+      >
+        <p
+          v-if="nameDialog.mode === 'merge'"
+          class="name-hint"
+        >{{ t('entities.mergeExplain') }}</p>
+        <ul
+          v-if="nameDialog.mode === 'merge'"
+          class="merge-list"
+        >
+          <li
+            v-for="name in nameDialog.from"
+            :key="name"
+          >
+            <button
+              type="button"
+              class="pill"
+              :class="{ active: nameDialog.to === name }"
+              @click="nameDialog.to = name"
+            >{{ name }}</button>
+          </li>
+        </ul>
+        <label for="entity-new-name">{{ t('entities.finalName') }}</label>
+        <input
+          id="entity-new-name"
+          v-model="nameDialog.to"
+          class="plain-input"
+          maxlength="200"
+          autocomplete="off"
+        />
+        <p
+          v-if="mergeTarget"
+          class="name-warning"
+        >
+          <i
+            class="pi pi-info-circle"
+            aria-hidden="true"
+          ></i>
+          {{ t('entities.willMerge', { name: mergeTarget }) }}
+        </p>
+        <div class="name-actions">
+          <Button
+            type="button"
+            :label="t('common.cancel')"
+            class="p-button-text p-button-sm"
+            @click="nameDialog.visible = false"
+          />
+          <Button
+            type="submit"
+            :label="nameDialog.mode === 'merge' || mergeTarget ? t('entities.mergeAction') : t('common.save')"
+            class="p-button-sm btn-action-primary"
+            :loading="saving"
+            :disabled="!nameDialog.to.trim()"
+          />
+        </div>
+      </form>
+    </Dialog>
   </div>
 </template>
 
 <script setup>
 import { tagColor } from '../utils/tagColors.js'
-import { ref, computed, onMounted } from 'vue'
+import { ref, reactive, computed, onMounted } from 'vue'
 import { useI18n } from 'vue-i18n'
+import { useToast } from 'primevue/usetoast'
 import Button from 'primevue/button'
+import Dialog from 'primevue/dialog'
+import api from '../services/api.js'
 
 /**
  * Tela de lista usada por Autores, Editoras e Tags (antes eram três arquivos
@@ -142,6 +303,7 @@ const props = defineProps({
 })
 
 const { t } = useI18n()
+const toast = useToast()
 
 
 const items = ref([])
@@ -149,12 +311,95 @@ const loading = ref(true)
 const loadError = ref(false)
 const search = ref('')
 
+// Ordem: nome (A–Z), mais livros ou mais lidos. Lembrada neste navegador.
+const SORT_KEY = `entities-sort-${props.queryParam}`
+const sortBy = ref((() => {
+  try { return localStorage.getItem(SORT_KEY) || 'name' } catch { return 'name' }
+})())
+
+const sortOptions = computed(() => [
+  { value: 'name', label: t('entities.sortName') },
+  { value: 'count', label: t('entities.sortCount') },
+  { value: 'read', label: t('entities.sortRead') }
+])
+
 const filteredItems = computed(() => {
+  try { localStorage.setItem(SORT_KEY, sortBy.value) } catch { /* modo privado */ }
   const term = search.value.trim().toLocaleLowerCase()
-  if (!term) return items.value
-  return items.value.filter(item => item.name.toLocaleLowerCase().includes(term))
+  const list = term ? items.value.filter(item => item.name.toLocaleLowerCase().includes(term)) : [...items.value]
+  const byName = (a, b) => a.name.localeCompare(b.name)
+  if (sortBy.value === 'count') return list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || byName(a, b))
+  if (sortBy.value === 'read') return list.sort((a, b) => (b.read ?? 0) - (a.read ?? 0) || byName(a, b))
+  return list.sort(byName)
 })
 
+// ---------------------------------------------------------------------------
+// Renomear e mesclar
+// ---------------------------------------------------------------------------
+const merging = ref(false)
+const selected = ref(new Set())
+const saving = ref(false)
+const nameDialog = reactive({ visible: false, mode: 'rename', from: [], to: '' })
+
+function toggleMerging() {
+  merging.value = !merging.value
+  selected.value = new Set()
+}
+
+function toggleSelected(name) {
+  const next = new Set(selected.value)
+  if (next.has(name)) next.delete(name)
+  else next.add(name)
+  selected.value = next
+}
+
+function openRename(item) {
+  Object.assign(nameDialog, { visible: true, mode: 'rename', from: [item.name], to: item.name })
+}
+
+function openMerge() {
+  const chosen = items.value.filter(item => selected.value.has(item.name))
+  // Sugere o nome com mais livros como nome final.
+  const best = [...chosen].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]
+  Object.assign(nameDialog, { visible: true, mode: 'merge', from: chosen.map(item => item.name), to: best?.name ?? '' })
+}
+
+// Renomear para um nome que já existe (e não está na lista de origem) junta os dois.
+const mergeTarget = computed(() => {
+  const to = nameDialog.to.trim().toLocaleLowerCase()
+  if (!to) return null
+  const fromKeys = nameDialog.from.map(name => name.toLocaleLowerCase())
+  const existing = items.value.find(item => item.name.toLocaleLowerCase() === to)
+  return existing && !fromKeys.includes(to) ? existing.name : null
+})
+
+async function submitName() {
+  const to = nameDialog.to.trim()
+  if (!to) return
+  if (nameDialog.mode === 'rename' && to === nameDialog.from[0]) {
+    nameDialog.visible = false
+    return
+  }
+  saving.value = true
+  try {
+    await api.mergeNames(props.queryParam, nameDialog.from, to)
+    toast.add({
+      severity: 'success',
+      summary: t('common.success'),
+      detail: nameDialog.mode === 'merge' || mergeTarget.value ? t('entities.mergedToast', { name: to }) : t('entities.renamedToast', { name: to }),
+      life: 3000
+    })
+    nameDialog.visible = false
+    merging.value = false
+    selected.value = new Set()
+    await load()
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    saving.value = false
+  }
+}
+
 function initials(name) {
   if (!name) return '?'
   // "Sobrenome, Nome" vira "Nome Sobrenome" antes de pegar as letras.
@@ -175,7 +420,6 @@ async function load() {
     const response = await props.fetcher()
     items.value = response
       .map(item => (typeof item === 'string' ? { name: item, count: null } : item))
-      .sort((a, b) => a.name.localeCompare(b.name))
   } catch (error) {
     loadError.value = true
   } finally {
@@ -247,6 +491,231 @@ onMounted(load)
   background-color: var(--bg-panel);
 }
 
+.toolbar {
+  display: flex;
+  align-items: center;
+  gap: 0.75rem 1rem;
+  flex-wrap: wrap;
+  margin: -1.5rem 0 1.5rem;
+}
+
+.total {
+  color: var(--text-secondary);
+  font-size: 0.9rem;
+  margin-right: auto;
+}
+
+.sort-group {
+  display: inline-flex;
+  gap: 0.35rem;
+  flex-wrap: wrap;
+}
+
+.pill {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  padding: 0.4rem 0.85rem;
+  border-radius: 999px;
+  border: 1px solid var(--border-color);
+  background: transparent;
+  color: var(--text-secondary);
+  font: inherit;
+  font-size: 0.85rem;
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.pill:hover {
+  color: var(--text-primary);
+  border-color: var(--main-color);
+}
+
+.pill.active {
+  background: var(--main-color);
+  border-color: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.pill:focus-visible,
+.rename-btn:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+.merge-help {
+  margin: -0.75rem 0 1.25rem;
+  color: var(--text-secondary);
+  font-size: 0.9rem;
+}
+
+.entity-item {
+  position: relative;
+}
+
+button.entity-card {
+  width: 100%;
+  font: inherit;
+  text-align: left;
+}
+
+.entity-card.is-selected {
+  border-color: var(--main-color);
+  background: rgba(var(--main-color-rgb), 0.08);
+}
+
+.select-check {
+  width: 24px;
+  height: 24px;
+  flex-shrink: 0;
+  border-radius: 7px;
+  border: 2px solid var(--border-color);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  color: transparent;
+}
+
+.select-check.checked {
+  background: var(--main-color);
+  border-color: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.select-check .pi {
+  font-size: 0.75rem;
+  font-weight: 700;
+}
+
+.read-bar {
+  display: block;
+  height: 4px;
+  margin-top: 0.45rem;
+  border-radius: 999px;
+  background: var(--bg-hover);
+  overflow: hidden;
+  max-width: 10rem;
+}
+
+.read-bar span {
+  display: block;
+  height: 100%;
+  border-radius: 999px;
+  background: var(--accent-color);
+}
+
+/* Lápis de renomear: canto superior direito do card. */
+.rename-btn {
+  position: absolute;
+  top: 0.5rem;
+  right: 0.5rem;
+  width: 30px;
+  height: 30px;
+  border-radius: 50%;
+  border: 1px solid var(--border-color);
+  background: var(--bg-panel);
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  cursor: pointer;
+}
+
+.rename-btn .pi {
+  font-size: 0.75rem;
+}
+
+.rename-btn:hover {
+  color: var(--text-primary);
+  border-color: var(--main-color);
+}
+
+@media (hover: hover) {
+  .rename-btn {
+    opacity: 0;
+    transition: opacity 0.15s ease;
+  }
+
+  .entity-item:hover .rename-btn,
+  .rename-btn:focus-visible {
+    opacity: 1;
+  }
+}
+
+.merge-bar {
+  position: sticky;
+  bottom: 1rem;
+  z-index: 50;
+  margin: 1.5rem auto 0;
+  width: fit-content;
+  display: flex;
+  align-items: center;
+  gap: 1rem;
+  padding: 0.6rem 0.75rem 0.6rem 1.1rem;
+  border-radius: 16px;
+  background: var(--bg-panel);
+  border: 1px solid rgba(var(--main-color-rgb), 0.45);
+  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
+  font-weight: 700;
+  color: var(--text-primary);
+}
+
+.name-form {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+}
+
+.name-form label,
+.name-hint {
+  margin: 0;
+  font-size: 0.9rem;
+  color: var(--text-secondary);
+}
+
+.merge-list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
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
+}
+
+.plain-input:focus {
+  border-color: var(--main-color);
+  outline: none;
+}
+
+.name-warning {
+  margin: 0;
+  display: flex;
+  gap: 0.4rem;
+  align-items: flex-start;
+  font-size: 0.85rem;
+  color: var(--text-primary);
+  background: rgba(var(--main-color-rgb), 0.1);
+  border-radius: 8px;
+  padding: 0.6rem 0.75rem;
+}
+
+.name-actions {
+  display: flex;
+  justify-content: flex-end;
+  gap: 0.5rem;
+  margin-top: 0.5rem;
+}
+
 .entity-grid {
   list-style: none;
   margin: 0;
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 88f3eef..7448410 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -71,6 +71,16 @@
           </button>
         </div>
 
+        <Button
+          icon="pi pi-check-square"
+          class="p-button-rounded p-button-text action-btn"
+          :class="{ 'active-filter': selecting }"
+          :aria-pressed="selecting"
+          :aria-label="t('batch.selectMode')"
+          v-tooltip.bottom="t('batch.selectMode')"
+          @click="emit('toggle-select')"
+        />
+
         <Button
           icon="pi pi-filter"
           class="p-button-rounded p-button-text action-btn"
@@ -110,6 +120,13 @@
           @remove="clearReadPeriod"
           class="custom-chip theme-border"
         />
+        <Chip
+          v-if="filters.series"
+          :label="t('series.chip', { series: filters.series })"
+          removable
+          @remove="emitFilter('series', '')"
+          class="custom-chip theme-border"
+        />
         <Chip
           v-if="filters.isbnStatus === 'invalid'"
           :label="t('library.invalid_isbn_chip')"
@@ -307,10 +324,11 @@ const { t, locale } = useI18n()
 const props = defineProps({
   booksQuantity: Number,
   filters: { type: Object, required: true },
-  view: { type: String, default: 'grid' }
+  view: { type: String, default: 'grid' },
+  selecting: { type: Boolean, default: false }
 })
 
-const emit = defineEmits(['filter-change', 'reset', 'book-created', 'view-change'])
+const emit = defineEmits(['filter-change', 'reset', 'book-created', 'view-change', 'toggle-select'])
 
 const viewModes = computed(() => [
   { value: 'grid', icon: 'pi pi-th-large', label: t('library.view_grid') },
@@ -337,7 +355,8 @@ const sortOptions = computed(() => [
   { label: t('library.sort.author'), value: 'authors' },
   { label: t('library.sort.read_date'), value: 'readDate' },
   { label: t('library.sort.pub_date'), value: 'pubDate' },
-  { label: t('library.sort.rating'), value: 'rating' }
+  { label: t('library.sort.rating'), value: 'rating' },
+  { label: t('library.sort.series'), value: 'series' }
 ])
 
 const yearOptions = computed(() => {
@@ -392,6 +411,7 @@ const hasActiveFilters = computed(() => {
   return f.readState !== 'all' ||
     hasReadYear.value ||
     f.isbnStatus === 'invalid' ||
+    Boolean(f.series) ||
     f.author.length > 0 ||
     f.publisher.length > 0 ||
     f.tags.length > 0
diff --git a/frontend/src/composables/useLibrary.js b/frontend/src/composables/useLibrary.js
index 38d8cda..a996c58 100644
--- a/frontend/src/composables/useLibrary.js
+++ b/frontend/src/composables/useLibrary.js
@@ -12,6 +12,7 @@ function defaultFilters() {
     author: [],
     publisher: [],
     tags: [],
+    series: '',
     isbnStatus: 'all',
     sortField: 'recent',
     sortOrder: 'desc',
@@ -47,6 +48,7 @@ function buildParams(filters) {
     params.tags = filters.tags.map(t => t.name || t)
   }
 
+  if (filters.series) params.series = filters.series
   if (filters.isbnStatus === 'invalid') params.isbn = 'invalid'
 
   if (filters.readYear && filters.readYear !== 'all') {
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index f19d373..3dae467 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -126,7 +126,8 @@
       "read_date": "Date Read",
       "pub_date": "Publication Date",
       "all_years": "All years",
-      "rating": "Rating"
+      "rating": "Rating",
+      "series": "Series and volume"
     },
     "empty_title": "No books found",
     "empty_msg": "We couldn't find anything with the current filters.",
@@ -200,7 +201,8 @@
     "notFound": "No authors found.",
     "bookCount": "{count} book | {count} books",
     "viewBooks": "View Books",
-    "loadError": "Could not load authors."
+    "loadError": "Could not load authors.",
+    "total": "{n} author | {n} authors"
   },
   "publishers": {
     "title": "Publishers",
@@ -209,7 +211,8 @@
     "notFound": "No publishers found.",
     "viewCollection": "View Collection",
     "loadError": "Could not load publishers.",
-    "bookCount": "{count} book | {count} books"
+    "bookCount": "{count} book | {count} books",
+    "total": "{n} publisher | {n} publishers"
   },
   "tags": {
     "title": "Categories",
@@ -218,7 +221,8 @@
     "empty": "No categories found.",
     "error": "Could not load categories.",
     "bookCount": "{count} book | {count} books",
-    "viewBooks": "View books"
+    "viewBooks": "View books",
+    "total": "{n} category | {n} categories"
   },
   "dashboard": {
     "title": "Dashboard",
@@ -589,5 +593,61 @@
     "future": "This year has not started yet",
     "empty": "No goal for this year. You have read no books so far. | No goal for this year. You have read {n} book so far. | No goal for this year. You have read {n} books so far.",
     "paceMarker": "Where you need to be today"
+  },
+  "series": {
+    "name": "Series",
+    "namePlaceholder": "E.g. Dune",
+    "volume": "Volume",
+    "label": "{series} #{n}",
+    "seeAll": "See all of {series}",
+    "chip": "Series: {series}"
+  },
+  "notes": {
+    "label": "Personal note",
+    "title": "My note",
+    "placeholder": "Thoughts, quotes, where you stopped, who borrowed it...",
+    "privateHint": "Only you can see it"
+  },
+  "batch": {
+    "toolbar": "Actions on selected books",
+    "selectMode": "Select several",
+    "selected": "none selected | {n} selected | {n} selected",
+    "selectAll": "Select all",
+    "selectNone": "Deselect all",
+    "status": "Status",
+    "category": "Category",
+    "delete": "Delete",
+    "cancel": "Leave selection",
+    "categoryTitle": "Category on {n} book | Category on {n} books",
+    "categoryName": "Category name",
+    "categoryPlaceholder": "E.g. Lent",
+    "addCategory": "Add",
+    "removeCategory": "Remove",
+    "confirmDelete": "Delete {n} book? This cannot be undone. | Delete {n} books? This cannot be undone.",
+    "doneStatus": "No book changed | Status updated on {n} book | Status updated on {n} books",
+    "doneAddTag": "No book changed (they already had it) | Category added to {n} book | Category added to {n} books",
+    "doneRemoveTag": "No book had this category | Category removed from {n} book | Category removed from {n} books",
+    "doneDelete": "No book deleted | {n} book deleted | {n} books deleted"
+  },
+  "entities": {
+    "sortLabel": "Sort",
+    "sortName": "A–Z",
+    "sortCount": "Most books",
+    "sortRead": "Most read",
+    "readCount": "none read | {n} read | {n} read",
+    "rename": "Rename",
+    "renameOf": "Rename {name}",
+    "renameTitle": "Rename",
+    "mergeMode": "Merge",
+    "mergeCancel": "Cancel",
+    "mergeHelp": "Pick the names that are the same thing (e.g. \"Asimov\" and \"Isaac Asimov\") and click Merge.",
+    "selected": "none selected | {n} selected | {n} selected",
+    "mergeAction": "Merge",
+    "mergeTitle": "Merge {n} names",
+    "mergeExplain": "All their books move to a single name. Choose which one stays:",
+    "finalName": "Final name",
+    "willMerge": "\"{name}\" already exists: the books will be merged into it.",
+    "mergedToast": "Everything is now under \"{name}\".",
+    "renamedToast": "Renamed to \"{name}\"."
   }
 }
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 710f0fb..867d058 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -126,7 +126,8 @@
       "read_date": "Data de Leitura",
       "pub_date": "Data de Publicação",
       "all_years": "Todos os anos",
-      "rating": "Nota"
+      "rating": "Nota",
+      "series": "Série e volume"
     },
     "empty_title": "Nenhum livro encontrado",
     "empty_msg": "Não encontramos nada com os filtros atuais.",
@@ -200,7 +201,8 @@
     "notFound": "Nenhum autor encontrado.",
     "bookCount": "{count} livro | {count} livros",
     "viewBooks": "Ver Livros",
-    "loadError": "Não foi possível carregar os autores."
+    "loadError": "Não foi possível carregar os autores.",
+    "total": "{n} autor | {n} autores"
   },
   "publishers": {
     "title": "Editoras",
@@ -209,7 +211,8 @@
     "notFound": "Nenhuma editora encontrada.",
     "viewCollection": "Ver Coleção",
     "loadError": "Não foi possível carregar as editoras.",
-    "bookCount": "{count} livro | {count} livros"
+    "bookCount": "{count} livro | {count} livros",
+    "total": "{n} editora | {n} editoras"
   },
   "tags": {
     "title": "Categorias",
@@ -218,7 +221,8 @@
     "empty": "Nenhuma categoria encontrada.",
     "error": "Não foi possível carregar as categorias.",
     "bookCount": "{count} livro | {count} livros",
-    "viewBooks": "Ver livros"
+    "viewBooks": "Ver livros",
+    "total": "{n} categoria | {n} categorias"
   },
   "dashboard": {
     "title": "Painel",
@@ -589,5 +593,61 @@
     "future": "O ano ainda não começou",
     "empty": "Sem meta para este ano. Você leu nenhum livro até agora. | Sem meta para este ano. Você leu {n} livro até agora. | Sem meta para este ano. Você leu {n} livros até agora.",
     "paceMarker": "Onde você precisa estar hoje"
+  },
+  "series": {
+    "name": "Série",
+    "namePlaceholder": "Ex.: Duna",
+    "volume": "Volume",
+    "label": "{series} #{n}",
+    "seeAll": "Ver todos de {series}",
+    "chip": "Série: {series}"
+  },
+  "notes": {
+    "label": "Anotação pessoal",
+    "title": "Minha anotação",
+    "placeholder": "Impressões, citações, onde parou, para quem emprestou...",
+    "privateHint": "Só você vê"
+  },
+  "batch": {
+    "toolbar": "Ações nos livros selecionados",
+    "selectMode": "Selecionar vários",
+    "selected": "nenhum selecionado | {n} selecionado | {n} selecionados",
+    "selectAll": "Selecionar todos",
+    "selectNone": "Desmarcar todos",
+    "status": "Status",
+    "category": "Categoria",
+    "delete": "Excluir",
+    "cancel": "Sair da seleção",
+    "categoryTitle": "Categoria em {n} livro | Categoria em {n} livros",
+    "categoryName": "Nome da categoria",
+    "categoryPlaceholder": "Ex.: Emprestados",
+    "addCategory": "Adicionar",
+    "removeCategory": "Remover",
+    "confirmDelete": "Excluir {n} livro? Isso não pode ser desfeito. | Excluir {n} livros? Isso não pode ser desfeito.",
+    "doneStatus": "Nenhum livro mudou | Status de {n} livro atualizado | Status de {n} livros atualizado",
+    "doneAddTag": "Nenhum livro mudou (já tinham a categoria) | Categoria adicionada a {n} livro | Categoria adicionada a {n} livros",
+    "doneRemoveTag": "Nenhum livro tinha essa categoria | Categoria removida de {n} livro | Categoria removida de {n} livros",
+    "doneDelete": "Nenhum livro excluído | {n} livro excluído | {n} livros excluídos"
+  },
+  "entities": {
+    "sortLabel": "Ordenar",
+    "sortName": "A–Z",
+    "sortCount": "Mais livros",
+    "sortRead": "Mais lidos",
+    "readCount": "nenhum lido | {n} lido | {n} lidos",
+    "rename": "Renomear",
+    "renameOf": "Renomear {name}",
+    "renameTitle": "Renomear",
+    "mergeMode": "Mesclar",
+    "mergeCancel": "Cancelar",
+    "mergeHelp": "Escolha os nomes que são a mesma coisa (ex.: \"Asimov\" e \"Isaac Asimov\") e clique em Mesclar.",
+    "selected": "nenhum selecionado | {n} selecionado | {n} selecionados",
+    "mergeAction": "Mesclar",
+    "mergeTitle": "Mesclar {n} nomes",
+    "mergeExplain": "Os livros de todos passam para um nome só. Escolha qual fica:",
+    "finalName": "Nome final",
+    "willMerge": "\"{name}\" já existe: os livros serão juntados nele.",
+    "mergedToast": "Agora tudo está em \"{name}\".",
+    "renamedToast": "Renomeado para \"{name}\"."
   }
 }
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index b845ef4..9ef3143 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -109,6 +109,20 @@ export default {
     return client.patch(`/library/${id}/status`, date ? { status, date } : { status })
   },
 
+  getSeries() {
+    return client.get('/library/series')
+  },
+
+  /** Ações em vários livros: { ids, action: 'status' | 'addTag' | 'removeTag' | 'delete', status?, date?, tag? } */
+  batchBooks(body) {
+    return client.post('/library/batch', body)
+  },
+
+  /** kind: 'author' | 'publisher' | 'tags'. Renomeia (um nome em from) ou mescla vários em `to`. */
+  mergeNames(kind, from, to) {
+    return client.post(`/${kind}/merge`, { from, to })
+  },
+
   setRating(id, rating) {
     return client.patch(`/library/${id}/rating`, { rating })
   },
diff --git a/frontend/src/utils/libraryQuery.js b/frontend/src/utils/libraryQuery.js
index ce82640..76908a3 100644
--- a/frontend/src/utils/libraryQuery.js
+++ b/frontend/src/utils/libraryQuery.js
@@ -8,7 +8,7 @@
  *   /books?q=asimov&status=read&year=2025&month=3&tags=Fantasia&sort=title&order=asc&view=list
  */
 
-const SORT_FIELDS = ['recent', 'title', 'authors', 'readDate', 'pubDate', 'rating']
+const SORT_FIELDS = ['recent', 'title', 'authors', 'readDate', 'pubDate', 'rating', 'series']
 const READ_STATES = ['read', 'unread', 'reading', 'want']
 export const VIEW_MODES = ['grid', 'list']
 
@@ -37,6 +37,7 @@ export function queryToFilters(query = {}) {
     author: asList(query.author),
     publisher: asList(query.publisher),
     tags: asList(query.tags),
+    series: String(asSingle(query.series) ?? '').trim(),
     isbnStatus: asSingle(query.isbn) === 'invalid' ? 'invalid' : 'all',
     sortField: SORT_FIELDS.includes(sort) ? sort : 'recent',
     sortOrder: order === 'asc' ? 'asc' : 'desc'
@@ -60,6 +61,7 @@ export function filtersToQuery(filters, view = 'grid') {
   if (filters.author?.length) query.author = [...filters.author]
   if (filters.publisher?.length) query.publisher = [...filters.publisher]
   if (filters.tags?.length) query.tags = [...filters.tags]
+  if (filters.series) query.series = filters.series
   if (filters.isbnStatus === 'invalid') query.isbn = 'invalid'
   if (filters.sortField && filters.sortField !== 'recent') query.sort = filters.sortField
   if (filters.sortOrder === 'asc') query.order = 'asc'
diff --git a/frontend/src/utils/series.js b/frontend/src/utils/series.js
new file mode 100644
index 0000000..d346af6
--- /dev/null
+++ b/frontend/src/utils/series.js
@@ -0,0 +1,9 @@
+/** "Duna #2", "Duna #1,5" (pt) ou só "Duna" quando não há volume. */
+export function seriesText(book, t, locale) {
+  if (!book?.series) return ''
+  const index = book.series_index
+  if (index === null || index === undefined || index === '') return book.series
+  const number = Number(String(index).replace(',', '.'))
+  const n = Number.isFinite(number) ? number.toLocaleString(locale) : String(index)
+  return t('series.label', { series: book.series, n })
+}
diff --git a/frontend/src/views/Library.vue b/frontend/src/views/Library.vue
index 778731a..09601ba 100644
--- a/frontend/src/views/Library.vue
+++ b/frontend/src/views/Library.vue
@@ -10,6 +10,8 @@
         :books-quantity="totalRecords"
         :filters="filters"
         :view="viewMode"
+        :selecting="selecting"
+        @toggle-select="toggleSelecting"
         @filter-change="handleFilterChange"
         @view-change="setViewMode"
         @reset="clearFilters"
@@ -83,6 +85,9 @@
             :book="item"
             :cover-version="coverVersions[item.book_id || item.id]"
             quick-actions
+            :selectable="selecting"
+            :selected="selectedIds.has(item.book_id || item.id)"
+            @toggle-select="toggleSelected"
             @updated="onBookUpdated"
             @deleted="onBookDeleted"
           />
@@ -98,11 +103,23 @@
             :key="item.book_id || item.id"
             :book="item"
             :cover-version="coverVersions[item.book_id || item.id]"
+            :selectable="selecting"
+            :selected="selectedIds.has(item.book_id || item.id)"
+            @toggle-select="toggleSelected"
             @updated="onBookUpdated"
             @deleted="onBookDeleted"
           />
         </ul>
 
+        <BatchBar
+          v-if="selecting"
+          :ids="[...selectedIds]"
+          :all-selected="books.length > 0 && selectedIds.size === books.length"
+          @select-all="toggleSelectAll"
+          @cancel="toggleSelecting"
+          @done="afterBatch"
+        />
+
         <div
           v-if="books.length < totalRecords"
           ref="sentinel"
@@ -148,6 +165,7 @@ import { useI18n } from 'vue-i18n'
 import LibraryHeader from '../components/LibraryHeader.vue'
 import BookItem from '../components/BookItem.vue'
 import BookRow from '../components/BookRow.vue'
+import BatchBar from '../components/BatchBar.vue'
 import { queryToFilters, queryToView, filtersToQuery, sameQuery, VIEW_MODES } from '../utils/libraryQuery.js'
 import Skeleton from 'primevue/skeleton'
 import Button from 'primevue/button'
@@ -231,6 +249,41 @@ watchEffect(() => {
   }
 })
 
+// ---------------------------------------------------------------------------
+// Seleção para ações em lote
+// ---------------------------------------------------------------------------
+const selecting = ref(false)
+const selectedIds = ref(new Set())
+
+function toggleSelecting() {
+  selecting.value = !selecting.value
+  selectedIds.value = new Set()
+}
+
+function toggleSelected(id) {
+  const next = new Set(selectedIds.value)
+  if (next.has(id)) next.delete(id)
+  else next.add(id)
+  selectedIds.value = next
+}
+
+// "Selecionar todos" vale para os livros já carregados na tela.
+function toggleSelectAll() {
+  const all = books.value.map(book => book.book_id ?? book.id)
+  selectedIds.value = selectedIds.value.size === all.length ? new Set() : new Set(all)
+}
+
+function afterBatch() {
+  selecting.value = false
+  selectedIds.value = new Set()
+  refreshData()
+  header.value?.reloadOptions()
+}
+
+function onKeydown(event) {
+  if (event.key === 'Escape' && selecting.value && !document.querySelector('.p-dialog-mask')) toggleSelecting()
+}
+
 // Grade ou lista: vem da URL (?view=list); sem ela, a última escolha neste navegador.
 const VIEW_STORAGE_KEY = 'library-view'
 
@@ -268,12 +321,14 @@ watch(() => route.query, (query) => {
 })
 
 onMounted(() => {
+  window.addEventListener('keydown', onKeydown)
   // Filtros da URL (inclusive os que vêm de Autores/Editoras/Categorias) entram
   // no estado compartilhado: aparecem como chips e podem ser removidos.
   setFilters(queryToFilters(route.query))
 })
 
 onUnmounted(() => {
+  window.removeEventListener('keydown', onKeydown)
   if (observer) observer.disconnect()
 })
 </script>
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
1. Migration nova (006).  Local: npm run db:migrate:local
   Produção (no deploy, depois do backup): docker compose run --rm backend npm run db:migrate:docker
2. Suíte completa no backend:  npm test
   (teste novo: src/tests/integration/organize.test.js; authors/community
   ganharam o campo "read" nas listas)
3. npm run db:seed recria o banco de teste com séries e anotações de exemplo.
4. Teste: edite um livro (Série, Volume, Anotação); na Biblioteca, clique no
   ícone ☑ ao lado do filtro e selecione vários; em Autores, use "Mesclar".
5. Commite e rode o pacote 4.

Sugestão de commit
------------------
feat(organização): série/volume, anotação, ações em lote e mesclar nomes

- migration 006: books.series e books.notes (anotação nunca sai no público)
- série e volume no cadastro/edição, card, lista, filtro ?series= e ordenação
- POST /library/batch: status, adicionar/remover categoria e excluir em lote
- POST /author|/publisher|/tags/merge: renomear e mesclar nomes do usuário
- Autores/Editoras/Categorias: ordenar por quantidade/lidos e barra lidos/total
MSG