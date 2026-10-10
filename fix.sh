#!/usr/bin/env bash
# =============================================================================
#  Librishelf — vários autores por livro e nomes com vírgula
#
#  Uso:   bash librishelf-autores.sh [caminho/do/repo]     (padrão: pasta atual)
#
#  NÃO commita, NÃO faz push e NÃO mexe no banco.
#  Base esperada: commit a7e457c. Se o patch não encaixar, para antes de
#  alterar qualquer coisa.
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
[ -d backend/src ] && [ -d frontend/src ] || fail "Não parece ser o repositório do Librishelf."

PATCH_FILE="$(mktemp)"
trap 'rm -f "$PATCH_FILE"' EXIT
cat > "$PATCH_FILE" <<'PATCH_EOF'
diff --git a/backend/db/migrations/002_multiple_authors.sql b/backend/db/migrations/002_multiple_authors.sql
new file mode 100644
index 0000000..49c6353
--- /dev/null
+++ b/backend/db/migrations/002_multiple_authors.sql
@@ -0,0 +1,184 @@
+-- 002 — vários autores por livro
+--
+-- * add_book/update_book passam a receber uma LISTA de autores (text[]).
+--   Antes recebiam um texto só: "Fulano, Beltrano" virava um autor com esse nome.
+-- * books_authors_link ganha "position" para manter a ordem dos autores.
+-- * Autores/editoras/tags são criados com ON CONFLICT (sem corrida entre
+--   requisições simultâneas) e listas repetidas são deduplicadas.
+-- * Nomes compostos já gravados ("A Sobrenome, B Sobrenome") são separados
+--   quando TODAS as partes têm pelo menos duas palavras. Assim o formato
+--   "Sobrenome, Nome" ("Tolkien, J.R.R.") fica como está.
+--
+-- Idempotente: pode rodar mais de uma vez.
+
+-- ---------------------------------------------------------------------------
+-- Ordem dos autores
+-- ---------------------------------------------------------------------------
+ALTER TABLE librishelf.books_authors_link
+  ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;
+
+-- ---------------------------------------------------------------------------
+-- Separa nomes compostos já existentes
+-- ---------------------------------------------------------------------------
+DO $$
+DECLARE
+  composite RECORD;
+  part TEXT;
+  part_index INT;
+  new_author_id INT;
+BEGIN
+  FOR composite IN
+    SELECT a.id, a.name
+    FROM librishelf.authors a
+    WHERE a.name LIKE '%,%'
+      AND NOT EXISTS (
+        SELECT 1
+        FROM unnest(string_to_array(a.name, ',')) AS p(piece)
+        WHERE array_length(regexp_split_to_array(btrim(p.piece), '\s+'), 1) < 2
+           OR btrim(p.piece) = ''
+      )
+  LOOP
+    part_index := 0;
+
+    FOREACH part IN ARRAY string_to_array(composite.name, ',')
+    LOOP
+      part := btrim(part);
+
+      INSERT INTO librishelf.authors (name) VALUES (part)
+      ON CONFLICT (name) DO NOTHING;
+      SELECT id INTO new_author_id FROM librishelf.authors WHERE name = part;
+
+      -- Cada livro que apontava para o nome composto passa a apontar para as
+      -- partes, na ordem em que estavam escritas.
+      INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
+      SELECT bal.book_id, new_author_id, bal.position + part_index
+      FROM librishelf.books_authors_link bal
+      WHERE bal.author_id = composite.id
+      ON CONFLICT (book_id, author_id) DO NOTHING;
+
+      part_index := part_index + 1;
+    END LOOP;
+
+    DELETE FROM librishelf.authors WHERE id = composite.id;  -- vínculos saem em cascata
+    RAISE NOTICE 'Autor composto separado: %', composite.name;
+  END LOOP;
+END
+$$;
+
+-- ---------------------------------------------------------------------------
+-- Funções novas (assinaturas antigas removidas para não haver ambiguidade)
+-- ---------------------------------------------------------------------------
+DROP FUNCTION IF EXISTS librishelf.add_book(text, text, text, text, text[], text, text, integer);
+DROP FUNCTION IF EXISTS librishelf.update_book(integer, text, text, text, text, text[], text, text);
+
+-- Encontra ou cria um nome numa tabela de nomes únicos, sem corrida.
+CREATE OR REPLACE FUNCTION librishelf.upsert_name_id(p_table regclass, p_name text)
+RETURNS integer
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_id integer;
+BEGIN
+  EXECUTE format('INSERT INTO %s (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', p_table) USING p_name;
+  EXECUTE format('SELECT id FROM %s WHERE name = $1', p_table) INTO v_id USING p_name;
+  RETURN v_id;
+END;
+$$;
+
+-- Normaliza uma lista: tira espaços, vazios e repetidos, mantendo a 1ª ocorrência.
+CREATE OR REPLACE FUNCTION librishelf.clean_name_list(p_names text[])
+RETURNS text[]
+LANGUAGE sql
+IMMUTABLE
+AS $$
+  SELECT COALESCE(array_agg(name ORDER BY first_pos), ARRAY[]::text[])
+  FROM (
+    SELECT btrim(n) AS name, min(ord) AS first_pos
+    FROM unnest(COALESCE(p_names, ARRAY[]::text[])) WITH ORDINALITY AS t(n, ord)
+    WHERE btrim(n) <> ''
+    GROUP BY btrim(n)
+  ) cleaned
+$$;
+
+CREATE OR REPLACE FUNCTION librishelf.set_book_relations(p_book_id integer, p_authors text[], p_tags text[])
+RETURNS void
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_name text;
+  v_pos integer := 0;
+BEGIN
+  DELETE FROM librishelf.books_authors_link WHERE book_id = p_book_id;
+  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_authors)
+  LOOP
+    INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
+    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.authors', v_name), v_pos);
+    v_pos := v_pos + 1;
+  END LOOP;
+
+  DELETE FROM librishelf.books_tags_link WHERE book_id = p_book_id;
+  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_tags)
+  LOOP
+    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
+    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.tags', v_name));
+  END LOOP;
+END;
+$$;
+
+CREATE OR REPLACE FUNCTION librishelf.add_book(
+  p_title text, p_pubdate text, p_authors text[], p_publisher_name text,
+  p_tags text[], p_read_date text, p_isbn text, p_user_id integer
+) RETURNS integer
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_book_id integer;
+  v_publisher_id integer := NULL;
+BEGIN
+  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
+    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
+  END IF;
+
+  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
+    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', btrim(p_publisher_name));
+  END IF;
+
+  INSERT INTO librishelf.books (title, publication_date, read_date, isbn, user_id, publisher_id)
+  VALUES (p_title, p_pubdate::date, p_read_date::date, p_isbn, p_user_id, v_publisher_id)
+  RETURNING id INTO v_book_id;
+
+  PERFORM librishelf.set_book_relations(v_book_id, p_authors, p_tags);
+
+  RETURN v_book_id;
+END;
+$$;
+
+CREATE OR REPLACE FUNCTION librishelf.update_book(
+  p_book_id integer, p_title text, p_pubdate text, p_authors text[],
+  p_publisher_name text, p_tags text[], p_read_date text, p_isbn text
+) RETURNS void
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_publisher_id integer := NULL;
+BEGIN
+  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
+    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
+  END IF;
+
+  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
+    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', btrim(p_publisher_name));
+  END IF;
+
+  UPDATE librishelf.books
+  SET title = p_title,
+      publication_date = p_pubdate::date,
+      read_date = p_read_date::date,
+      isbn = p_isbn,
+      publisher_id = v_publisher_id,
+      last_modified = now()
+  WHERE id = p_book_id;
+
+  PERFORM librishelf.set_book_relations(p_book_id, p_authors, p_tags);
+END;
+$$;
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index feb6d6a..706a07a 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -405,3 +405,182 @@ CREATE TABLE IF NOT EXISTS librishelf.schema_migrations (
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('001_public_opt_in_and_indexes')
 ON CONFLICT (version) DO NOTHING;
+
+-- ---------------------------------------------------------------------------
+-- 002 — vários autores por livro
+-- ---------------------------------------------------------------------------
+-- ---------------------------------------------------------------------------
+-- Ordem dos autores
+-- ---------------------------------------------------------------------------
+ALTER TABLE librishelf.books_authors_link
+  ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;
+
+-- ---------------------------------------------------------------------------
+-- Separa nomes compostos já existentes
+-- ---------------------------------------------------------------------------
+DO $$
+DECLARE
+  composite RECORD;
+  part TEXT;
+  part_index INT;
+  new_author_id INT;
+BEGIN
+  FOR composite IN
+    SELECT a.id, a.name
+    FROM librishelf.authors a
+    WHERE a.name LIKE '%,%'
+      AND NOT EXISTS (
+        SELECT 1
+        FROM unnest(string_to_array(a.name, ',')) AS p(piece)
+        WHERE array_length(regexp_split_to_array(btrim(p.piece), '\s+'), 1) < 2
+           OR btrim(p.piece) = ''
+      )
+  LOOP
+    part_index := 0;
+
+    FOREACH part IN ARRAY string_to_array(composite.name, ',')
+    LOOP
+      part := btrim(part);
+
+      INSERT INTO librishelf.authors (name) VALUES (part)
+      ON CONFLICT (name) DO NOTHING;
+      SELECT id INTO new_author_id FROM librishelf.authors WHERE name = part;
+
+      -- Cada livro que apontava para o nome composto passa a apontar para as
+      -- partes, na ordem em que estavam escritas.
+      INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
+      SELECT bal.book_id, new_author_id, bal.position + part_index
+      FROM librishelf.books_authors_link bal
+      WHERE bal.author_id = composite.id
+      ON CONFLICT (book_id, author_id) DO NOTHING;
+
+      part_index := part_index + 1;
+    END LOOP;
+
+    DELETE FROM librishelf.authors WHERE id = composite.id;  -- vínculos saem em cascata
+    RAISE NOTICE 'Autor composto separado: %', composite.name;
+  END LOOP;
+END
+$$;
+
+-- ---------------------------------------------------------------------------
+-- Funções novas (assinaturas antigas removidas para não haver ambiguidade)
+-- ---------------------------------------------------------------------------
+DROP FUNCTION IF EXISTS librishelf.add_book(text, text, text, text, text[], text, text, integer);
+DROP FUNCTION IF EXISTS librishelf.update_book(integer, text, text, text, text, text[], text, text);
+
+-- Encontra ou cria um nome numa tabela de nomes únicos, sem corrida.
+CREATE OR REPLACE FUNCTION librishelf.upsert_name_id(p_table regclass, p_name text)
+RETURNS integer
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_id integer;
+BEGIN
+  EXECUTE format('INSERT INTO %s (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', p_table) USING p_name;
+  EXECUTE format('SELECT id FROM %s WHERE name = $1', p_table) INTO v_id USING p_name;
+  RETURN v_id;
+END;
+$$;
+
+-- Normaliza uma lista: tira espaços, vazios e repetidos, mantendo a 1ª ocorrência.
+CREATE OR REPLACE FUNCTION librishelf.clean_name_list(p_names text[])
+RETURNS text[]
+LANGUAGE sql
+IMMUTABLE
+AS $$
+  SELECT COALESCE(array_agg(name ORDER BY first_pos), ARRAY[]::text[])
+  FROM (
+    SELECT btrim(n) AS name, min(ord) AS first_pos
+    FROM unnest(COALESCE(p_names, ARRAY[]::text[])) WITH ORDINALITY AS t(n, ord)
+    WHERE btrim(n) <> ''
+    GROUP BY btrim(n)
+  ) cleaned
+$$;
+
+CREATE OR REPLACE FUNCTION librishelf.set_book_relations(p_book_id integer, p_authors text[], p_tags text[])
+RETURNS void
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_name text;
+  v_pos integer := 0;
+BEGIN
+  DELETE FROM librishelf.books_authors_link WHERE book_id = p_book_id;
+  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_authors)
+  LOOP
+    INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
+    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.authors', v_name), v_pos);
+    v_pos := v_pos + 1;
+  END LOOP;
+
+  DELETE FROM librishelf.books_tags_link WHERE book_id = p_book_id;
+  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_tags)
+  LOOP
+    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
+    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.tags', v_name));
+  END LOOP;
+END;
+$$;
+
+CREATE OR REPLACE FUNCTION librishelf.add_book(
+  p_title text, p_pubdate text, p_authors text[], p_publisher_name text,
+  p_tags text[], p_read_date text, p_isbn text, p_user_id integer
+) RETURNS integer
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_book_id integer;
+  v_publisher_id integer := NULL;
+BEGIN
+  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
+    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
+  END IF;
+
+  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
+    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', btrim(p_publisher_name));
+  END IF;
+
+  INSERT INTO librishelf.books (title, publication_date, read_date, isbn, user_id, publisher_id)
+  VALUES (p_title, p_pubdate::date, p_read_date::date, p_isbn, p_user_id, v_publisher_id)
+  RETURNING id INTO v_book_id;
+
+  PERFORM librishelf.set_book_relations(v_book_id, p_authors, p_tags);
+
+  RETURN v_book_id;
+END;
+$$;
+
+CREATE OR REPLACE FUNCTION librishelf.update_book(
+  p_book_id integer, p_title text, p_pubdate text, p_authors text[],
+  p_publisher_name text, p_tags text[], p_read_date text, p_isbn text
+) RETURNS void
+LANGUAGE plpgsql
+AS $$
+DECLARE
+  v_publisher_id integer := NULL;
+BEGIN
+  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
+    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
+  END IF;
+
+  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
+    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', btrim(p_publisher_name));
+  END IF;
+
+  UPDATE librishelf.books
+  SET title = p_title,
+      publication_date = p_pubdate::date,
+      read_date = p_read_date::date,
+      isbn = p_isbn,
+      publisher_id = v_publisher_id,
+      last_modified = now()
+  WHERE id = p_book_id;
+
+  PERFORM librishelf.set_book_relations(p_book_id, p_authors, p_tags);
+END;
+$$;
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('002_multiple_authors')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index 28d53a1..f7882df 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -5,16 +5,28 @@ export const LIBRARY_QUERIES = {
       b.title,
       u.name AS user_owner,
       p.name AS publisher_name, -- Alias essencial
-      (SELECT STRING_AGG(a.name, ', ')
+      (SELECT STRING_AGG(a.name, ', ' ORDER BY bal.position, a.id)
        FROM librishelf.books_authors_link AS bal
        JOIN librishelf.authors AS a ON bal.author_id = a.id
        WHERE bal.book_id = b.id
       ) AS authors,
-      (SELECT STRING_AGG(t.name, ', ')
+      -- Lista de verdade: nomes podem conter vírgula, então "authors" (texto
+      -- para exibir) não serve para editar nem filtrar.
+      COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
+       FROM librishelf.books_authors_link AS bal
+       JOIN librishelf.authors AS a ON bal.author_id = a.id
+       WHERE bal.book_id = b.id
+      ), '[]'::json) AS author_names,
+      (SELECT STRING_AGG(t.name, ', ' ORDER BY t.name)
        FROM librishelf.books_tags_link AS btl
        JOIN librishelf.tags AS t ON btl.tag_id = t.id
        WHERE btl.book_id = b.id
       ) AS tags,
+      COALESCE((SELECT json_agg(t.name ORDER BY t.name)
+       FROM librishelf.books_tags_link AS btl
+       JOIN librishelf.tags AS t ON btl.tag_id = t.id
+       WHERE btl.book_id = b.id
+      ), '[]'::json) AS tag_names,
       b.isbn,
       b.read_date,
       b.publication_date
@@ -32,16 +44,28 @@ export const LIBRARY_QUERIES = {
       b.read_date,
       b.publication_date,
       p.name AS publisher_name, -- O Frontend procura por .publisher_name
-      (SELECT STRING_AGG(a.name, ', ')
+      (SELECT STRING_AGG(a.name, ', ' ORDER BY bal.position, a.id)
        FROM librishelf.books_authors_link AS bal
        JOIN librishelf.authors AS a ON bal.author_id = a.id
        WHERE bal.book_id = b.id
       ) AS authors,
-      (SELECT STRING_AGG(t.name, ', ')
+      -- Lista de verdade: nomes podem conter vírgula, então "authors" (texto
+      -- para exibir) não serve para editar nem filtrar.
+      COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
+       FROM librishelf.books_authors_link AS bal
+       JOIN librishelf.authors AS a ON bal.author_id = a.id
+       WHERE bal.book_id = b.id
+      ), '[]'::json) AS author_names,
+      (SELECT STRING_AGG(t.name, ', ' ORDER BY t.name)
+       FROM librishelf.books_tags_link AS btl
+       JOIN librishelf.tags AS t ON btl.tag_id = t.id
+       WHERE btl.book_id = b.id
+      ) AS tags,
+      COALESCE((SELECT json_agg(t.name ORDER BY t.name)
        FROM librishelf.books_tags_link AS btl
        JOIN librishelf.tags AS t ON btl.tag_id = t.id
        WHERE btl.book_id = b.id
-      ) AS tags
+      ), '[]'::json) AS tag_names
     FROM librishelf.books AS b
     LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
     WHERE b.id = $1 AND b.user_id = $2
diff --git a/backend/src/repositories/libraryRepository.js b/backend/src/repositories/libraryRepository.js
index ce9ac7c..1bc3425 100644
--- a/backend/src/repositories/libraryRepository.js
+++ b/backend/src/repositories/libraryRepository.js
@@ -2,11 +2,15 @@ import { db } from "../database/connection.js"
 import { LIBRARY_QUERIES as q } from "../database/queries.js"
 import { resolvePagination } from "../utils/pagination.js"
 import STATUS from "../utils/statusCodes.js"
+import { parseNameList } from "../utils/nameList.js"
 
-const ISBN_UNIQUE_VIOLATION = '23505'
+const UNIQUE_VIOLATION = '23505'
+const ISBN_CONSTRAINT = 'idx_books_isbn_user'
 
+// Só a violação do índice de ISBN vira 409 "ISBN já existe". Antes qualquer
+// 23505 (ex.: tag repetida no mesmo livro) aparecia como conflito de ISBN.
 function toIsbnConflictError(err) {
-  if (err.code === ISBN_UNIQUE_VIOLATION) {
+  if (err.code === UNIQUE_VIOLATION && err.constraint === ISBN_CONSTRAINT) {
     const conflictError = new Error('ISBN already exists for this user.')
     conflictError.status = STATUS.CONFLICT
     return conflictError
@@ -52,8 +56,8 @@ async function getAllBooksByUser(userId, filters = {}) {
     paramIndex++
   }
 
-  if (author) {
-    const authorList = Array.isArray(author) ? author : author.split(',').map(a => a.trim())
+  if (parseNameList(author).length > 0) {
+    const authorList = parseNameList(author)
     query += ` AND EXISTS (
       SELECT 1 FROM librishelf.books_authors_link bal 
       JOIN librishelf.authors a ON bal.author_id = a.id 
@@ -63,15 +67,15 @@ async function getAllBooksByUser(userId, filters = {}) {
     paramIndex++
   }
 
-  if (publisher) {
-    const publisherList = Array.isArray(publisher) ? publisher : publisher.split(',').map(p => p.trim())
+  if (parseNameList(publisher).length > 0) {
+    const publisherList = parseNameList(publisher)
     query += ` AND p.name = ANY($${paramIndex})`
     params.push(publisherList)
     paramIndex++
   }
 
-  if (tags) {
-    const tagsList = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())
+  if (parseNameList(tags).length > 0) {
+    const tagsList = parseNameList(tags)
     query += ` AND EXISTS (
       SELECT 1 FROM librishelf.books_tags_link btl
       JOIN librishelf.tags t ON btl.tag_id = t.id
@@ -128,14 +132,12 @@ async function findBookByIsbn(isbn, userId) {
 }
 
 async function createBook(bookInfo) {
-  const tagsArray = Array.isArray(bookInfo.tags) ? bookInfo.tags : (bookInfo.tags ? bookInfo.tags.split(',') : [])
-
   const params = [
     bookInfo.title,
     bookInfo.pubDate,
     bookInfo.authors,
     bookInfo.publisher,
-    tagsArray,
+    bookInfo.tags,
     bookInfo.readDate,
     bookInfo.isbn,
     bookInfo.user_id
@@ -157,15 +159,13 @@ async function getBookOwner(bookId) {
 async function updateBook(bookId, bookInfo) {
   const pubDate = bookInfo.pubDate ?? null
   const readDate = bookInfo.readDate ?? null
-  const tagsArray = Array.isArray(bookInfo.tags) ? bookInfo.tags : []
-
   const params = [
     bookId,
     bookInfo.title,
     pubDate,
     bookInfo.authors,
     bookInfo.publisher,
-    tagsArray,
+    bookInfo.tags,
     readDate,
     bookInfo.isbn
   ]
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 8cd70c9..739cdb4 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -116,21 +116,10 @@ router.get('/:id', validateNumericId(), async (req, res) => {
 
 router.post('/', uploadLimiter, handleUpload(upload.single('coverImage')), async (req, res) => {
   try {
-    const { title, pubDate, authors, publisher, tags, isbn, readDate } = req.body ?? {}
-    const userId = req.user.id
-
-    if (typeof title !== 'string' || !title.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Title is required.' })
-    if (typeof authors !== 'string' || !authors.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Authors is required.' })
-
+    // Autores chegam como campo repetido (authors=A&authors=B) ou um só valor.
     const bookData = {
-      title,
-      pubDate,
-      authors,
-      publisher,
-      tags: typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
-      isbn,
-      readDate: readDate || null,
-      user_id: userId
+      ...libraryService.normalizeBookInput(req.body ?? {}),
+      user_id: req.user.id
     }
 
     // Valida a imagem ANTES de criar o livro: com imagem inválida a resposta é
diff --git a/backend/src/services/authorService.js b/backend/src/services/authorService.js
index 88e7806..352f028 100644
--- a/backend/src/services/authorService.js
+++ b/backend/src/services/authorService.js
@@ -1,18 +1,15 @@
 import * as authorRepository from '../repositories/authorRepository.js'
+import { parseNameList } from '../utils/nameList.js'
 
+// ?publishers=A&publishers=B (nome de editora pode ter vírgula: não separa).
 async function getAuthorsByUserId(userId, publisherFilter) {
-  // ?x=a&x=b chega como array; aceita os dois formatos em vez de estourar 500.
-  const rawFilter = Array.isArray(publisherFilter) ? publisherFilter.join(',') : publisherFilter
+  const publishersList = parseNameList(publisherFilter)
 
-  if (typeof rawFilter === 'string' && rawFilter) {
-    const publishersList = rawFilter.split(',').map(item => item.trim()).filter(Boolean)
-
-    if (publishersList.length > 0) {
-      return await authorRepository.getAuthorsByUserAndPublishers(userId, publishersList)
-    }
+  if (publishersList.length > 0) {
+    return await authorRepository.getAuthorsByUserAndPublishers(userId, publishersList)
   }
 
   return await authorRepository.getAuthorsByUserId(userId)
 }
 
-export { getAuthorsByUserId }
\ No newline at end of file
+export { getAuthorsByUserId }
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index a279600..fd81e96 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -2,6 +2,7 @@ import * as libraryRepository from '../repositories/libraryRepository.js'
 import * as authRepository from '../repositories/authRepository.js'
 import STATUS from '../utils/statusCodes.js'
 import { deleteBookCover } from '../utils/imageProcessor.js'
+import { parseNameList, parseTagList, validateNameList } from '../utils/nameList.js'
 
 const READ_YEAR_PATTERN = /^\d{4}$/
 
@@ -99,15 +100,40 @@ function requireText(value, fieldName) {
   return value.trim()
 }
 
+/**
+ * Valida e normaliza o livro vindo do cliente (POST multipart ou PUT JSON).
+ *
+ * authors: lista (JSON array, campo repetido no multipart) ou um nome só.
+ *          Nunca é separado por vírgula: "Fulano, Beltrano" como texto é UM nome.
+ * tags:    lista ou texto "a, b, c".
+ */
+function normalizeBookInput(raw = {}) {
+  const authors = parseNameList(raw.authors)
+  if (authors.length === 0) throw httpError('Authors is required.', STATUS.BAD_REQUEST)
+
+  const tags = parseTagList(raw.tags)
+
+  const listError = validateNameList(authors, 'autores') || validateNameList(tags, 'tags')
+  if (listError) throw httpError(listError, STATUS.BAD_REQUEST)
+
+  const publisher = typeof raw.publisher === 'string' ? raw.publisher.trim() : ''
+
+  return {
+    title: requireText(raw.title, 'Title'),
+    authors,
+    tags,
+    publisher: publisher || null,
+    isbn: normalizeIsbn(raw.isbn),
+    pubDate: normalizeDate(raw.pubDate, 'pubDate'),
+    readDate: normalizeDate(raw.readDate, 'readDate')
+  }
+}
+
 async function getBookById(id, userId) {
   return await libraryRepository.getBookByIdForUser(id, userId)
 }
 
 async function addNewBook(bookData) {
-  bookData.isbn = normalizeIsbn(bookData.isbn)
-  bookData.pubDate = normalizeDate(bookData.pubDate, 'pubDate')
-  bookData.readDate = normalizeDate(bookData.readDate, 'readDate')
-
   if (bookData.isbn) {
     const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)
 
@@ -116,30 +142,14 @@ async function addNewBook(bookData) {
     }
   }
 
-  const newBookId = await libraryRepository.createBook(bookData)
-
-  return newBookId
+  return await libraryRepository.createBook(bookData)
 }
 
-async function updateBookDetails(bookId, userId, bookData) {
+async function updateBookDetails(bookId, userId, rawBook) {
   await checkBookOwnership(bookId, userId)
 
-  // Mesmo contrato do POST: título e autores são obrigatórios na edição também.
-  bookData.title = requireText(bookData.title, 'Title')
-  bookData.authors = requireText(bookData.authors, 'Authors')
-
-  if (typeof bookData.tags === 'string') {
-    bookData.tags = bookData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
-  }
-
-  if ('isbn' in bookData) {
-    bookData.isbn = normalizeIsbn(bookData.isbn)
-  }
-
-  bookData.pubDate = normalizeDate(bookData.pubDate, 'pubDate')
-  bookData.readDate = normalizeDate(bookData.readDate, 'readDate')
-
-  return await libraryRepository.updateBook(bookId, bookData)
+  // Mesmo contrato e mesma validação do POST.
+  return await libraryRepository.updateBook(bookId, normalizeBookInput(rawBook))
 }
 
 async function checkBookOwnership(bookId, userId) {
@@ -180,6 +190,7 @@ export {
   getBookById,
   getPublicBook,
   getRandomPublicBookIds,
+  normalizeBookInput,
   addNewBook,
   updateBookDetails,
   checkBookOwnership,
diff --git a/backend/src/services/publisherService.js b/backend/src/services/publisherService.js
index fac5220..8f6a47c 100644
--- a/backend/src/services/publisherService.js
+++ b/backend/src/services/publisherService.js
@@ -1,18 +1,15 @@
 import * as publisherRepository from '../repositories/publisherRepository.js'
+import { parseNameList } from '../utils/nameList.js'
 
+// ?authors=A&authors=B (nome de autor pode ter vírgula: não separa).
 async function getPublishersByUserId(userId, authorFilter) {
-  // ?x=a&x=b chega como array; aceita os dois formatos em vez de estourar 500.
-  const rawFilter = Array.isArray(authorFilter) ? authorFilter.join(',') : authorFilter
+  const authorsList = parseNameList(authorFilter)
 
-  if (typeof rawFilter === 'string' && rawFilter) {
-    const authorsList = rawFilter.split(',').map(item => item.trim()).filter(Boolean)
-
-    if (authorsList.length > 0) {
-      return await publisherRepository.getPublishersByUserAndAuthors(userId, authorsList)
-    }
+  if (authorsList.length > 0) {
+    return await publisherRepository.getPublishersByUserAndAuthors(userId, authorsList)
   }
 
   return await publisherRepository.getPublishersByUserId(userId)
 }
 
-export { getPublishersByUserId }
\ No newline at end of file
+export { getPublishersByUserId }
diff --git a/backend/src/tests/integration/authors.test.js b/backend/src/tests/integration/authors.test.js
new file mode 100644
index 0000000..b635ab7
--- /dev/null
+++ b/backend/src/tests/integration/authors.test.js
@@ -0,0 +1,141 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+let token
+
+beforeAll(async () => {
+  await clearDatabase()
+  await request(app).post('/auth/register').send({ username: 'multiautor', password: 'senha12345', email: 'multiautor@example.com' })
+  const res = await request(app).post('/auth/login').send({ username: 'multiautor', password: 'senha12345' })
+  token = tokenFrom(res)
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+const auth = () => ({ Authorization: `Bearer ${token}` })
+
+async function create(fields, authors) {
+  const req = request(app).post('/library').set(auth()).field(fields)
+  // Campo repetido no multipart: um "authors" por autor.
+  for (const name of authors) req.field('authors', name)
+  return req
+}
+
+describe('Vários autores por livro', () => {
+  let bookId
+
+  it('cria com dois autores (campo repetido) e mantém a ordem', async () => {
+    const res = await create({ title: 'Belas Maldições' }, ['Terry Pratchett', 'Neil Gaiman'])
+    expect(res.statusCode).toBe(201)
+    bookId = res.body.bookId
+
+    const book = await request(app).get(`/library/${bookId}`).set(auth())
+    expect(book.body.author_names).toEqual(['Terry Pratchett', 'Neil Gaiman'])
+    expect(book.body.authors).toBe('Terry Pratchett, Neil Gaiman')
+  })
+
+  it('cada autor aparece separado na lista de autores', async () => {
+    const res = await request(app).get('/author').set(auth())
+    const names = res.body.map(a => a.name)
+    expect(names).toEqual(expect.arrayContaining(['Terry Pratchett', 'Neil Gaiman']))
+    expect(names).not.toContain('Terry Pratchett, Neil Gaiman')
+  })
+
+  it('um único texto com vírgula é UM autor (não é separado)', async () => {
+    const res = await create({ title: 'Formato sobrenome' }, ['Tolkien, J.R.R.'])
+    expect(res.statusCode).toBe(201)
+
+    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth())
+    expect(book.body.author_names).toEqual(['Tolkien, J.R.R.'])
+  })
+
+  it('PUT aceita lista JSON, troca a ordem e remove autor', async () => {
+    const res = await request(app)
+      .put(`/library/${bookId}`)
+      .set(auth())
+      .send({ title: 'Belas Maldições', authors: ['Neil Gaiman', 'Terry Pratchett'] })
+    expect(res.statusCode).toBe(200)
+    expect(res.body.book.author_names).toEqual(['Neil Gaiman', 'Terry Pratchett'])
+
+    const single = await request(app)
+      .put(`/library/${bookId}`)
+      .set(auth())
+      .send({ title: 'Belas Maldições', authors: ['Neil Gaiman'] })
+    expect(single.body.book.author_names).toEqual(['Neil Gaiman'])
+  })
+
+  it('lista vazia ou só com espaços é recusada', async () => {
+    const res = await request(app)
+      .put(`/library/${bookId}`)
+      .set(auth())
+      .send({ title: 'X', authors: ['  ', ''] })
+    expect(res.statusCode).toBe(400)
+  })
+
+  it('autores repetidos são deduplicados', async () => {
+    const res = await create({ title: 'Repetido' }, ['Ana Silva', 'ana silva', 'Ana Silva'])
+    expect(res.statusCode).toBe(201)
+    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth())
+    expect(book.body.author_names).toEqual(['Ana Silva'])
+  })
+})
+
+describe('Nomes com vírgula nos filtros', () => {
+  beforeAll(async () => {
+    await create({ title: 'Piquenique na Estrada', publisher: 'Editora A, B & Cia' }, ['Strugátski, Boris'])
+    await create({ title: 'Outro livro' }, ['Boris'])
+  })
+
+  it('filtrar por autor com vírgula encontra o livro', async () => {
+    const res = await request(app).get('/library').query({ author: 'Strugátski, Boris' }).set(auth())
+    expect(res.statusCode).toBe(200)
+    expect(res.body.result.map(b => b.title)).toEqual(['Piquenique na Estrada'])
+  })
+
+  it('filtrar por editora com vírgula encontra o livro', async () => {
+    const res = await request(app).get('/library').query({ publisher: 'Editora A, B & Cia' }).set(auth())
+    expect(res.body.result.map(b => b.title)).toEqual(['Piquenique na Estrada'])
+  })
+
+  it('vários autores no filtro via parâmetro repetido', async () => {
+    const res = await request(app)
+      .get('/library')
+      .query('author=Strugátski%2C%20Boris&author=Boris&sort=title&order=asc')
+      .set(auth())
+    expect(res.body.result.map(b => b.title)).toEqual(['Outro livro', 'Piquenique na Estrada'])
+  })
+
+  it('editoras de um autor com vírgula', async () => {
+    const res = await request(app).get('/publisher').query({ authors: 'Strugátski, Boris' }).set(auth())
+    expect(res.body.map(p => p.name)).toEqual(['Editora A, B & Cia'])
+  })
+})
+
+describe('Tags e conflitos', () => {
+  it('tag repetida não vira "ISBN já existe"', async () => {
+    const res = await create({ title: 'Tags repetidas', tags: 'ficção, ficção, Ficção' }, ['Autor T'])
+    expect(res.statusCode).toBe(201)
+    const book = await request(app).get(`/library/${res.body.bookId}`).set(auth())
+    expect(book.body.tag_names).toEqual(['ficção'])
+  })
+
+  it('ISBN duplicado continua sendo 409', async () => {
+    await create({ title: 'Com ISBN', isbn: '978-0000000001' }, ['Autor I'])
+    const res = await create({ title: 'Mesmo ISBN', isbn: '978-0000000001' }, ['Autor I'])
+    expect(res.statusCode).toBe(409)
+  })
+
+  it('criações simultâneas com o mesmo autor novo não falham', async () => {
+    const results = await Promise.all(
+      Array.from({ length: 5 }, (_, i) => create({ title: `Paralelo ${i}` }, ['Autor Novíssimo']))
+    )
+    expect(results.map(r => r.statusCode)).toEqual([201, 201, 201, 201, 201])
+
+    const authors = await request(app).get('/author').set(auth())
+    expect(authors.body.filter(a => a.name === 'Autor Novíssimo')).toEqual([{ name: 'Autor Novíssimo', count: 5 }])
+  })
+})
diff --git a/backend/src/tests/integration/publisher.test.js b/backend/src/tests/integration/publisher.test.js
index 4550169..006edb4 100644
--- a/backend/src/tests/integration/publisher.test.js
+++ b/backend/src/tests/integration/publisher.test.js
@@ -48,9 +48,10 @@ describe('Publisher Endpoints', () => {
     expect(res.body[0].name).toBe('Viking Press')
   })
 
-  it('should handle multiple authors in filter', async () => {
+  it('should handle multiple authors in filter (parâmetro repetido)', async () => {
     const res = await request(app)
-      .get('/publisher?authors=Stephen King,J.R.R. Tolkien')
+      .get('/publisher')
+      .query('authors=Stephen%20King&authors=J.R.R.%20Tolkien')
       .set('Authorization', `Bearer ${token}`)
 
     expect(res.statusCode).toEqual(200)
diff --git a/backend/src/tests/unit/nameList.test.js b/backend/src/tests/unit/nameList.test.js
new file mode 100644
index 0000000..5a81814
--- /dev/null
+++ b/backend/src/tests/unit/nameList.test.js
@@ -0,0 +1,47 @@
+import { parseNameList, parseTagList, validateNameList, MAX_NAMES } from '../../utils/nameList.js'
+
+describe('parseNameList (autores, editoras, filtros)', () => {
+  it('não separa por vírgula: texto é UM nome', () => {
+    expect(parseNameList('Strugátski, Boris')).toEqual(['Strugátski, Boris'])
+  })
+
+  it('aceita array (campo/parâmetro repetido)', () => {
+    expect(parseNameList(['Neil Gaiman', 'Terry Pratchett'])).toEqual(['Neil Gaiman', 'Terry Pratchett'])
+  })
+
+  it('aceita array em JSON', () => {
+    expect(parseNameList('["A, com vírgula","B"]')).toEqual(['A, com vírgula', 'B'])
+  })
+
+  it('texto que parece JSON mas não é vira um nome', () => {
+    expect(parseNameList('[Edição especial]')).toEqual(['[Edição especial]'])
+  })
+
+  it('tira espaços extras, vazios e repetidos (sem diferenciar maiúsculas), mantendo a ordem', () => {
+    expect(parseNameList(['  Ana  Maria ', '', 'ana maria', 'Bruno', 42])).toEqual(['Ana Maria', 'Bruno'])
+  })
+
+  it('valores ausentes viram lista vazia', () => {
+    expect(parseNameList(undefined)).toEqual([])
+    expect(parseNameList(null)).toEqual([])
+    expect(parseNameList('')).toEqual([])
+  })
+})
+
+describe('parseTagList', () => {
+  it('separa o texto do formulário por vírgula', () => {
+    expect(parseTagList('ficção, clássico ,  , ficção')).toEqual(['ficção', 'clássico'])
+  })
+
+  it('aceita array', () => {
+    expect(parseTagList(['a', 'b, c'])).toEqual(['a', 'b', 'c'])
+  })
+})
+
+describe('validateNameList', () => {
+  it('limita a quantidade e o tamanho', () => {
+    expect(validateNameList(Array.from({ length: MAX_NAMES + 1 }, (_, i) => `n${i}`), 'autores')).toMatch(/No máximo/)
+    expect(validateNameList(['x'.repeat(201)], 'autores')).toMatch(/muito longo/)
+    expect(validateNameList(['ok'], 'autores')).toBeNull()
+  })
+})
diff --git a/backend/src/utils/nameList.js b/backend/src/utils/nameList.js
new file mode 100644
index 0000000..6de61c3
--- /dev/null
+++ b/backend/src/utils/nameList.js
@@ -0,0 +1,66 @@
+/**
+ * Listas de nomes (autores, tags, filtros).
+ *
+ * Nomes de autor e de editora podem conter vírgula, então nunca são separados
+ * por vírgula: chegam como lista (JSON array, campo repetido no multipart ou
+ * parâmetro repetido na query string). Tags continuam aceitando o texto
+ * "a, b, c" do formulário, porque o nome de tag não pode ter vírgula.
+ */
+
+export const MAX_NAMES = 30
+export const MAX_NAME_LENGTH = 200
+
+function dedupe(names) {
+  const seen = new Set()
+  const result = []
+
+  for (const raw of names) {
+    if (typeof raw !== 'string') continue
+    const name = raw.trim().replace(/\s+/g, ' ')
+    const key = name.toLocaleLowerCase()
+    if (!name || seen.has(key)) continue
+    seen.add(key)
+    result.push(name)
+  }
+
+  return result
+}
+
+/** Valor vindo do cliente (array, string JSON ou string simples) → array de strings. */
+function toArray(value) {
+  if (value === undefined || value === null || value === '') return []
+  if (Array.isArray(value)) return value
+
+  if (typeof value === 'string') {
+    const trimmed = value.trim()
+    if (trimmed.startsWith('[')) {
+      try {
+        const parsed = JSON.parse(trimmed)
+        if (Array.isArray(parsed)) return parsed
+      } catch {
+        // não é JSON: trata como um nome só
+      }
+    }
+    return [value]
+  }
+
+  return []
+}
+
+/** Autores, editoras e filtros: nunca separa por vírgula. */
+export function parseNameList(value) {
+  return dedupe(toArray(value))
+}
+
+/** Tags: o formulário manda "a, b, c"; listas também são aceitas. */
+export function parseTagList(value) {
+  return dedupe(toArray(value).flatMap(item => (typeof item === 'string' ? item.split(',') : [])))
+}
+
+/** Erro de validação (status 400) ou null. */
+export function validateNameList(names, label) {
+  if (names.length > MAX_NAMES) return `No máximo ${MAX_NAMES} ${label}.`
+  const tooLong = names.find(name => name.length > MAX_NAME_LENGTH)
+  if (tooLong) return `Nome muito longo em ${label} (máximo ${MAX_NAME_LENGTH} caracteres).`
+  return null
+}
diff --git a/frontend/src/components/AddBookDialog.vue b/frontend/src/components/AddBookDialog.vue
index b1cdb38..8875a7a 100644
--- a/frontend/src/components/AddBookDialog.vue
+++ b/frontend/src/components/AddBookDialog.vue
@@ -115,26 +115,18 @@
           </div>
 
           <div class="input-group">
-            <i
-              class="pi pi-user input-icon"
-              aria-hidden="true"
-            ></i>
             <label
               for="new-book-authors"
               class="sr-only"
             >{{ t('book.author_ph') }}</label>
-            <input
-              id="new-book-authors"
+            <AuthorsInput
               v-model="book.authors"
-              class="modern-input"
+              input-id="new-book-authors"
               :placeholder="`${t('book.author_ph')} *`"
-              :class="{ 'error': submitted && !book.authors.trim() }"
-              :aria-invalid="submitted && !book.authors.trim()"
-              aria-describedby="new-book-authors-error"
-              required
+              :invalid="submitted && book.authors.length === 0"
             />
             <small
-              v-if="submitted && !book.authors.trim()"
+              v-if="submitted && book.authors.length === 0"
               id="new-book-authors-error"
               class="error-msg"
             >{{ t('book.validation_authors') }}</small>
@@ -248,6 +240,7 @@ import Button from 'primevue/button'
 import Calendar from 'primevue/calendar'
 import { useToast } from 'primevue/usetoast'
 import api from '../services/api.js'
+import AuthorsInput from './AuthorsInput.vue'
 import { useI18n } from 'vue-i18n'
 import { toApiDate } from '../utils/dates.js'
 import { validateImageFile, createPreviewHandle } from '../utils/files.js'
@@ -271,7 +264,7 @@ const preview = createPreviewHandle()
 
 const initialBookState = {
   title: '',
-  authors: '',
+  authors: [],
   publisher: '',
   tags: '',
   isbn: '',
@@ -292,7 +285,7 @@ watch(visible, (newVal) => {
 })
 
 function resetForm() {
-  Object.assign(book, initialBookState)
+  Object.assign(book, { ...initialBookState, authors: [] })
   selectedFile.value = null
   previewUrl.value = null
   preview.clear()
@@ -322,7 +315,7 @@ async function saveBook() {
     return
   }
 
-  if (!book.authors.trim()) {
+  if (book.authors.length === 0) {
     toast.add({ severity: 'warn', summary: t('common.error'), detail: t('book.validation_authors'), life: 3000 })
     return
   }
@@ -333,7 +326,8 @@ async function saveBook() {
     const formData = new FormData()
 
     formData.append('title', book.title.trim())
-    formData.append('authors', book.authors.trim())
+    // Um campo "authors" por autor: nomes podem conter vírgula.
+    book.authors.forEach(name => formData.append('authors', name))
     formData.append('publisher', book.publisher || '')
     formData.append('isbn', book.isbn || '')
     formData.append('tags', book.tags || '')
diff --git a/frontend/src/components/AuthorsInput.vue b/frontend/src/components/AuthorsInput.vue
new file mode 100644
index 0000000..447c1d4
--- /dev/null
+++ b/frontend/src/components/AuthorsInput.vue
@@ -0,0 +1,122 @@
+<template>
+  <div
+    class="authors-input"
+    :class="{ invalid }"
+  >
+    <Chips
+      :modelValue="modelValue"
+      :inputId="inputId"
+      :placeholder="modelValue.length ? '' : placeholder"
+      :allowDuplicate="false"
+      addOnBlur
+      :max="maxAuthors"
+      :aria-invalid="invalid || undefined"
+      :aria-describedby="`${inputId}-hint`"
+      @update:modelValue="onUpdate"
+    />
+    <small
+      :id="`${inputId}-hint`"
+      class="authors-hint"
+    >{{ t('book.authors_hint') }}</small>
+  </div>
+</template>
+
+<script setup>
+import Chips from 'primevue/chips'
+import { useI18n } from 'vue-i18n'
+
+/**
+ * Lista de autores como etiquetas. Cada autor entra com Enter (ou ao sair do
+ * campo), então vírgula faz parte do nome e nunca separa autores.
+ */
+const props = defineProps({
+  modelValue: { type: Array, default: () => [] },
+  inputId: { type: String, required: true },
+  placeholder: { type: String, default: '' },
+  invalid: { type: Boolean, default: false }
+})
+
+const emit = defineEmits(['update:modelValue'])
+const { t } = useI18n()
+
+// Mesmo limite do backend (utils/nameList.js → MAX_NAMES).
+const maxAuthors = 30
+
+function onUpdate(values) {
+  const seen = new Set()
+  const cleaned = []
+
+  for (const value of values) {
+    const name = String(value).trim().replace(/\s+/g, ' ')
+    const key = name.toLocaleLowerCase()
+    if (!name || seen.has(key)) continue
+    seen.add(key)
+    cleaned.push(name)
+  }
+
+  emit('update:modelValue', cleaned)
+}
+</script>
+
+<style scoped>
+.authors-input {
+  display: flex;
+  flex-direction: column;
+  gap: 0.35rem;
+  width: 100%;
+}
+
+.authors-input :deep(.p-chips) {
+  width: 100%;
+}
+
+.authors-input :deep(.p-chips-multiple-container) {
+  width: 100%;
+  min-height: 2.75rem;
+  background-color: var(--bg-input);
+  border: 1px solid var(--border-color);
+  border-radius: 8px;
+  padding: 0.35rem 0.5rem;
+  gap: 0.35rem;
+  flex-wrap: wrap;
+}
+
+.authors-input :deep(.p-chips.p-focus .p-chips-multiple-container) {
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
+}
+
+.authors-input.invalid :deep(.p-chips-multiple-container) {
+  border-color: var(--red);
+}
+
+.authors-input :deep(.p-chips-token) {
+  background-color: rgba(var(--main-color-rgb), 0.15);
+  color: var(--text-primary);
+  border-radius: 999px;
+  padding: 0.2rem 0.65rem;
+  font-size: 0.9rem;
+}
+
+.authors-input :deep(.p-chips-input-token) {
+  flex: 1;
+  min-width: 8rem;
+}
+
+.authors-input :deep(.p-chips-input-token input),
+.authors-input :deep(.p-chips-input-token input:focus) {
+  width: 100%;
+  color: var(--text-primary);
+  background: transparent !important;
+  border: none !important;
+  box-shadow: none !important;
+  outline: none;
+  padding: 0.25rem 0.15rem;
+  font-size: 0.95rem;
+}
+
+.authors-hint {
+  color: var(--text-muted);
+  font-size: 0.75rem;
+}
+</style>
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index 5d2357f..532fcf9 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -86,12 +86,12 @@
                 for="book-edit-authors"
                 class="sr-only"
               >{{ t('bookDialog.authorNames') }}</label>
-              <input
-                id="book-edit-authors"
-                v-model="book.authors"
-                class="modern-input author-input"
+              <AuthorsInput
+                v-model="book.authorNames"
+                input-id="book-edit-authors"
+                class="author-input"
                 :placeholder="t('bookDialog.authorNames')"
-                :aria-invalid="submitted && !book.authors.trim()"
+                :invalid="submitted && book.authorNames.length === 0"
               />
             </template>
             <template v-else>
@@ -259,6 +259,7 @@ import Button from 'primevue/button'
 import { useToast } from 'primevue/usetoast'
 import { useConfirm } from 'primevue/useconfirm'
 import api from '../services/api.js'
+import AuthorsInput from './AuthorsInput.vue'
 import { coverUrl, handleCoverError } from '../utils/covers.js'
 import { fromApiDate, toApiDate } from '../utils/dates.js'
 import { validateImageFile, createPreviewHandle } from '../utils/files.js'
@@ -291,7 +292,8 @@ const coverVersion = ref(0)
 const preview = createPreviewHandle()
 
 function emptyBook() {
-  return { title: '', authors: '', publisher: '', tags: '', isbn: '', read_date: null, pubdate: null }
+  // authors: texto para exibir; authorNames: a lista que é editada e salva.
+  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', read_date: null, pubdate: null }
 }
 
 const book = ref(emptyBook())
@@ -336,6 +338,7 @@ function clearSelectedFile() {
 function cloneBook(source) {
   return {
     ...source,
+    authorNames: [...(source.authorNames || [])],
     read_date: source.read_date ? new Date(source.read_date) : null,
     pubdate: source.pubdate ? new Date(source.pubdate) : null
   }
@@ -390,7 +393,7 @@ function validate() {
     return false
   }
 
-  if (!book.value.authors.trim()) {
+  if (book.value.authorNames.length === 0) {
     toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t('bookDialog.validationAuthors'), life: 3000 })
     return false
   }
@@ -420,7 +423,7 @@ async function saveBookDetails() {
   try {
     const response = await api.updateBook(props.bookId, {
       title: book.value.title.trim(),
-      authors: book.value.authors.trim(),
+      authors: book.value.authorNames,
       publisher: book.value.publisher,
       tags: tagList.value,
       isbn: book.value.isbn,
@@ -455,6 +458,7 @@ function applyResponse(data) {
   book.value = {
     title: data.title || '',
     authors: data.authors || '',
+    authorNames: Array.isArray(data.author_names) ? data.author_names : (data.authors ? [data.authors] : []),
     isbn: data.isbn || '',
     publisher: data.publisher_name || data.publisher || '',
     tags: data.tags || '',
diff --git a/frontend/src/composables/useLibrary.js b/frontend/src/composables/useLibrary.js
index b591c9e..37bf902 100644
--- a/frontend/src/composables/useLibrary.js
+++ b/frontend/src/composables/useLibrary.js
@@ -32,16 +32,17 @@ function buildParams(filters) {
     params.readState = filters.readState === 'read' ? 'true' : 'false'
   }
 
+  // Listas vão como parâmetro repetido (author=A&author=B): o nome pode ter vírgula.
   if (filters.author?.length > 0) {
-    params.author = filters.author.map(a => a.name || a).join(',')
+    params.author = filters.author.map(a => a.name || a)
   }
 
   if (filters.publisher?.length > 0) {
-    params.publisher = filters.publisher.map(p => p.name || p).join(',')
+    params.publisher = filters.publisher.map(p => p.name || p)
   }
 
   if (filters.tags?.length > 0) {
-    params.tags = filters.tags.map(t => t.name || t).join(',')
+    params.tags = filters.tags.map(t => t.name || t)
   }
 
   if (filters.readYear && filters.readYear !== 'all') {
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 4f7d294..6c92ae0 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -66,7 +66,7 @@
     "add_cover": "Add Cover",
     "click_select": "Click to select",
     "title_ph": "Book Title *",
-    "author_ph": "Author Name",
+    "author_ph": "Authors",
     "tags_ph": "Tags (comma separated)",
     "read_status": "Reading Status",
     "read": "Read",
@@ -85,7 +85,8 @@
     "cover_not_saved": "The book was saved, but the cover could not be uploaded. Try changing the cover later.",
     "select_cover": "Select cover image",
     "read_ribbon": "Read",
-    "dialog_label": "Add book"
+    "dialog_label": "Add book",
+    "authors_hint": "Type an author and press Enter to add the next one."
   },
   "library": {
     "search_ph": "Search by title, ISBN...",
@@ -377,4 +378,4 @@
     "message": "The address you opened does not exist or has moved.",
     "goHome": "Go to home"
   }
-}
\ No newline at end of file
+}
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index f082e0f..60e116a 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -66,7 +66,7 @@
     "add_cover": "Adicionar Capa",
     "click_select": "Clique para selecionar",
     "title_ph": "Título do Livro *",
-    "author_ph": "Nome do Autor",
+    "author_ph": "Autores",
     "tags_ph": "Tags (separadas por vírgula)",
     "read_status": "Status de Leitura",
     "read": "Lido",
@@ -85,7 +85,8 @@
     "cover_not_saved": "O livro foi salvo, mas a capa não pôde ser enviada. Tente trocar a capa depois.",
     "select_cover": "Selecionar imagem de capa",
     "read_ribbon": "Lido",
-    "dialog_label": "Adicionar livro"
+    "dialog_label": "Adicionar livro",
+    "authors_hint": "Digite um autor e tecle Enter para adicionar o próximo."
   },
   "library": {
     "search_ph": "Pesquisar por título, ISBN...",
@@ -377,4 +378,4 @@
     "message": "O endereço que você abriu não existe ou foi movido.",
     "goHome": "Ir para o início"
   }
-}
\ No newline at end of file
+}
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index cf92ba2..42e9598 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -2,6 +2,26 @@ import client from './fetchClient.js'
 
 const enc = encodeURIComponent
 
+/**
+ * Monta a query string repetindo o parâmetro para listas (author=A&author=B).
+ * Nomes de autor e editora podem ter vírgula, então nunca são juntados com ",".
+ */
+function toQuery(params = {}) {
+  const search = new URLSearchParams()
+
+  for (const [key, value] of Object.entries(params)) {
+    if (value === undefined || value === null || value === '') continue
+    if (Array.isArray(value)) {
+      value.forEach(item => search.append(key, item))
+    } else {
+      search.append(key, value)
+    }
+  }
+
+  const query = search.toString()
+  return query ? `?${query}` : ''
+}
+
 export default {
   // --- Auth / conta ---
   login(credentials) {
@@ -34,10 +54,7 @@ export default {
 
   // --- Livros ---
   getBooks(queryParams = {}, config = {}) {
-    const queryString = new URLSearchParams(queryParams).toString()
-    const url = queryString ? `/library?${queryString}` : '/library'
-
-    return client.get(url, config)
+    return client.get(`/library${toQuery(queryParams)}`, config)
   },
 
   getBookById(id) {
@@ -69,14 +86,12 @@ export default {
   },
 
   // --- Listas ---
-  getAuthors(publisherFilter) {
-    const url = publisherFilter ? `/author?publishers=${enc(publisherFilter)}` : '/author'
-    return client.get(url)
+  getAuthors(publishers = []) {
+    return client.get(`/author${toQuery({ publishers })}`)
   },
 
-  getPublishers(authorFilter) {
-    const url = authorFilter ? `/publisher?authors=${enc(authorFilter)}` : '/publisher'
-    return client.get(url)
+  getPublishers(authors = []) {
+    return client.get(`/publisher${toQuery({ authors })}`)
   },
 
   getTags() {
@@ -93,8 +108,7 @@ export default {
   },
 
   getPublicLibrary(username, params = {}) {
-    const queryString = new URLSearchParams(params).toString()
-    return client.get(`/library/public/u/${enc(username)}?${queryString}`)
+    return client.get(`/library/public/u/${enc(username)}${toQuery(params)}`)
   },
 
   getPublicBook(username, id) {
PATCH_EOF

step "1/3 Aplicando o patch"
if git apply --check --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
  git apply --whitespace=nowarn "$PATCH_FILE"
  ok "Patch aplicado ($(grep -c '^diff --git' "$PATCH_FILE") arquivos)."
elif git apply --reverse --check --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
  ok "Patch já estava aplicado."
else
  printf '%s  ✘ O patch não encaixa no estado atual. Nada foi alterado.%s\n' "$R" "$N" >&2
  git apply --check --whitespace=nowarn "$PATCH_FILE" 2>&1 | sed 's/^/      /' >&2 || true
  echo "    Dica: 'git stash' nas mudanças locais e rode de novo." >&2
  exit 1
fi

step "2/3 Testes unitários"
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd backend && npm run --silent test:unit -- --silent 2>&1 | grep -E '^(Tests|Test Suites):' | sed 's/^/  /'; exit "${PIPESTATUS[0]}"); then
  ok "Passando"
else
  fail "Falharam (rode 'npm run test:unit' em backend/)."
fi

step "3/3 Build do frontend"
[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd frontend && npx --no-install vite build >/tmp/librishelf-build.log 2>&1); then ok "OK"; else tail -20 /tmp/librishelf-build.log >&2; fail "Build falhou."; fi

step "Pronto — nada foi commitado"
git status --short | sed 's/^/  /'

cat <<'MSG'

Próximos passos
  1. Migration 002 no banco local (obrigatório: o código novo chama as funções novas):
       cd backend && npm run db:migrate
     Ela separa nomes compostos já gravados ("Arkádi Strugátski, Boris Strugátski"
     vira dois autores). Nomes no formato "Sobrenome, Nome" ficam como estão.
  2. Testes de integração:  cd backend && npm run db:migrate:test && npm test
  3. Produção (backup antes):
       docker compose build
       docker compose run --rm backend npm run db:migrate:docker
       docker compose up -d

Sugestão de commit
  fix: vários autores por livro e nomes com vírgula nos filtros

  - add_book/update_book recebem lista de autores (text[]) com ordem preservada
  - migration 002 separa nomes compostos já gravados
  - filtros por autor/editora/tag usam parâmetro repetido, sem separar por vírgula
  - tag repetida no mesmo livro não vira mais "ISBN já existe"
  - criação de autor/editora/tag sem corrida (ON CONFLICT)
  - campo de autores em chips no cadastro e na edição
MSG