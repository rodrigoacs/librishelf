-- 003 — nomes por usuário, ISBN normalizado, avaliação, comunidade e seguidores
--
-- 1. authors / publishers / tags passam a pertencer a um usuário (user_id).
--    Registros usados por mais de um usuário são duplicados (cada um fica com
--    a sua cópia); registros sem nenhum livro são removidos; nomes que só
--    diferem em maiúsculas dentro da mesma biblioteca são mesclados.
--    O nome passa a ser único por (usuário, nome sem diferenciar maiúsculas).
-- 2. FK composta books(publisher_id, user_id) → publishers(id, user_id) e
--    triggers nos vínculos de autor/tag: o banco impede um livro de usar
--    autor, editora ou tag de outro usuário.
-- 3. books ganha isbn13 (normalizado e validado, calculado pelo banco),
--    rating (1–5), chaves do Open Library e created_at.
-- 4. users ganha show_in_community e show_activity (ambos desligados).
-- 5. Tabela follows (pedido de seguir com aprovação).
--
-- Requer PostgreSQL 15+ (ON DELETE SET NULL com lista de colunas).
-- Idempotente: pode rodar mais de uma vez.

-- ===========================================================================
-- ISBN
-- ===========================================================================

-- ISBN-10 ou ISBN-13 (com ou sem hífen/espaço) → ISBN-13 com dígito
-- verificador conferido. Qualquer outra coisa → NULL.
CREATE OR REPLACE FUNCTION librishelf.normalize_isbn13(p_isbn text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  d text;
  total int := 0;
  i int;
  digit int;
BEGIN
  IF p_isbn IS NULL THEN
    RETURN NULL;
  END IF;

  d := upper(regexp_replace(p_isbn, '[^0-9Xx]', '', 'g'));

  IF length(d) = 10 THEN
    IF d !~ '^[0-9]{9}[0-9X]$' THEN
      RETURN NULL;
    END IF;

    FOR i IN 1..10 LOOP
      digit := CASE WHEN substr(d, i, 1) = 'X' THEN 10 ELSE substr(d, i, 1)::int END;
      total := total + digit * (11 - i);
    END LOOP;

    IF total % 11 <> 0 THEN
      RETURN NULL;
    END IF;

    d := '978' || substr(d, 1, 9);
    total := 0;
    FOR i IN 1..12 LOOP
      total := total + substr(d, i, 1)::int * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END;
    END LOOP;

    RETURN d || ((10 - total % 10) % 10)::text;
  END IF;

  IF length(d) = 13 AND d ~ '^97[89][0-9]{10}$' THEN
    FOR i IN 1..13 LOOP
      total := total + substr(d, i, 1)::int * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END;
    END LOOP;

    IF total % 10 <> 0 THEN
      RETURN NULL;
    END IF;

    RETURN d;
  END IF;

  RETURN NULL;
END;
$$;

ALTER TABLE librishelf.books
  ADD COLUMN IF NOT EXISTS isbn13 text
  GENERATED ALWAYS AS (librishelf.normalize_isbn13(isbn)) STORED;

CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON librishelf.books (isbn13) WHERE isbn13 IS NOT NULL;

-- ===========================================================================
-- Avaliação, Open Library e data de cadastro
-- ===========================================================================

ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS rating smallint;
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS ol_work_key text;
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS ol_edition_key text;
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS created_at timestamp with time zone;

UPDATE librishelf.books SET created_at = COALESCE(last_modified, now()) WHERE created_at IS NULL;
ALTER TABLE librishelf.books ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE librishelf.books ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_rating_range') THEN
    ALTER TABLE librishelf.books ADD CONSTRAINT books_rating_range CHECK (rating BETWEEN 1 AND 5);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_books_ol_work_key ON librishelf.books (ol_work_key) WHERE ol_work_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_books_user_created ON librishelf.books (user_id, created_at DESC);

-- ===========================================================================
-- Privacidade da comunidade
-- ===========================================================================

ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS show_in_community boolean NOT NULL DEFAULT false;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS show_activity boolean NOT NULL DEFAULT false;

-- ===========================================================================
-- Seguidores
-- ===========================================================================

CREATE TABLE IF NOT EXISTS librishelf.follows (
  follower_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  followee_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_at timestamp with time zone,
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_not_self CHECK (follower_id <> followee_id),
  CONSTRAINT follows_status_valid CHECK (status IN ('pending', 'accepted'))
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON librishelf.follows (followee_id, status);

-- ===========================================================================
-- Nomes por usuário
-- ===========================================================================

ALTER TABLE librishelf.authors    ADD COLUMN IF NOT EXISTS user_id integer;
ALTER TABLE librishelf.publishers ADD COLUMN IF NOT EXISTS user_id integer;
ALTER TABLE librishelf.tags       ADD COLUMN IF NOT EXISTS user_id integer;

-- Unicidade global sai antes de criar as cópias por usuário.
ALTER TABLE librishelf.authors    DROP CONSTRAINT IF EXISTS authors_name_key;
ALTER TABLE librishelf.publishers DROP CONSTRAINT IF EXISTS publishers_name_key;
ALTER TABLE librishelf.tags       DROP CONSTRAINT IF EXISTS tags_name_key;

-- --- Autores ---------------------------------------------------------------
DO $$
DECLARE
  pair RECORD;
  new_id integer;
BEGIN
  -- Dono = menor user_id entre quem usa o registro.
  UPDATE librishelf.authors a
  SET user_id = owners.user_id
  FROM (
    SELECT bal.author_id, min(b.user_id) AS user_id
    FROM librishelf.books_authors_link bal
    JOIN librishelf.books b ON b.id = bal.book_id
    GROUP BY bal.author_id
  ) owners
  WHERE a.id = owners.author_id AND a.user_id IS NULL;

  -- Os outros usuários ganham uma cópia e seus vínculos passam para ela.
  FOR pair IN
    SELECT DISTINCT bal.author_id, b.user_id, a.name
    FROM librishelf.books_authors_link bal
    JOIN librishelf.books b ON b.id = bal.book_id
    JOIN librishelf.authors a ON a.id = bal.author_id
    WHERE a.user_id <> b.user_id
  LOOP
    SELECT id INTO new_id FROM librishelf.authors
    WHERE user_id = pair.user_id AND name = pair.name
    ORDER BY id LIMIT 1;

    IF new_id IS NULL THEN
      INSERT INTO librishelf.authors (name, user_id) VALUES (pair.name, pair.user_id) RETURNING id INTO new_id;
    END IF;

    INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
    SELECT bal.book_id, new_id, bal.position
    FROM librishelf.books_authors_link bal
    JOIN librishelf.books b ON b.id = bal.book_id
    WHERE bal.author_id = pair.author_id AND b.user_id = pair.user_id
    ON CONFLICT (book_id, author_id) DO NOTHING;

    DELETE FROM librishelf.books_authors_link bal
    USING librishelf.books b
    WHERE b.id = bal.book_id AND bal.author_id = pair.author_id AND b.user_id = pair.user_id;

    new_id := NULL;
  END LOOP;

  DELETE FROM librishelf.authors WHERE user_id IS NULL;  -- sem nenhum livro

  -- Mescla nomes que só diferem em maiúsculas/espaços (mantém o menor id).
  FOR pair IN
    SELECT a.id AS dup_id, keep.id AS keep_id
    FROM librishelf.authors a
    JOIN LATERAL (
      SELECT min(k.id) AS id FROM librishelf.authors k
      WHERE k.user_id = a.user_id AND lower(btrim(k.name)) = lower(btrim(a.name))
    ) keep ON keep.id <> a.id
  LOOP
    INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
    SELECT book_id, pair.keep_id, position FROM librishelf.books_authors_link WHERE author_id = pair.dup_id
    ON CONFLICT (book_id, author_id) DO NOTHING;
    DELETE FROM librishelf.authors WHERE id = pair.dup_id;
  END LOOP;
END
$$;

-- --- Tags ------------------------------------------------------------------
DO $$
DECLARE
  pair RECORD;
  new_id integer;
BEGIN
  UPDATE librishelf.tags t
  SET user_id = owners.user_id
  FROM (
    SELECT btl.tag_id, min(b.user_id) AS user_id
    FROM librishelf.books_tags_link btl
    JOIN librishelf.books b ON b.id = btl.book_id
    GROUP BY btl.tag_id
  ) owners
  WHERE t.id = owners.tag_id AND t.user_id IS NULL;

  FOR pair IN
    SELECT DISTINCT btl.tag_id, b.user_id, t.name
    FROM librishelf.books_tags_link btl
    JOIN librishelf.books b ON b.id = btl.book_id
    JOIN librishelf.tags t ON t.id = btl.tag_id
    WHERE t.user_id <> b.user_id
  LOOP
    SELECT id INTO new_id FROM librishelf.tags
    WHERE user_id = pair.user_id AND name = pair.name
    ORDER BY id LIMIT 1;

    IF new_id IS NULL THEN
      INSERT INTO librishelf.tags (name, user_id) VALUES (pair.name, pair.user_id) RETURNING id INTO new_id;
    END IF;

    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
    SELECT btl.book_id, new_id
    FROM librishelf.books_tags_link btl
    JOIN librishelf.books b ON b.id = btl.book_id
    WHERE btl.tag_id = pair.tag_id AND b.user_id = pair.user_id
    ON CONFLICT (book_id, tag_id) DO NOTHING;

    DELETE FROM librishelf.books_tags_link btl
    USING librishelf.books b
    WHERE b.id = btl.book_id AND btl.tag_id = pair.tag_id AND b.user_id = pair.user_id;

    new_id := NULL;
  END LOOP;

  DELETE FROM librishelf.tags WHERE user_id IS NULL;

  FOR pair IN
    SELECT t.id AS dup_id, keep.id AS keep_id
    FROM librishelf.tags t
    JOIN LATERAL (
      SELECT min(k.id) AS id FROM librishelf.tags k
      WHERE k.user_id = t.user_id AND lower(btrim(k.name)) = lower(btrim(t.name))
    ) keep ON keep.id <> t.id
  LOOP
    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
    SELECT book_id, pair.keep_id FROM librishelf.books_tags_link WHERE tag_id = pair.dup_id
    ON CONFLICT (book_id, tag_id) DO NOTHING;
    DELETE FROM librishelf.tags WHERE id = pair.dup_id;
  END LOOP;
END
$$;

-- --- Editoras --------------------------------------------------------------
DO $$
DECLARE
  pair RECORD;
  new_id integer;
BEGIN
  UPDATE librishelf.publishers p
  SET user_id = owners.user_id
  FROM (
    SELECT publisher_id, min(user_id) AS user_id
    FROM librishelf.books
    WHERE publisher_id IS NOT NULL
    GROUP BY publisher_id
  ) owners
  WHERE p.id = owners.publisher_id AND p.user_id IS NULL;

  FOR pair IN
    SELECT DISTINCT b.publisher_id, b.user_id, p.name
    FROM librishelf.books b
    JOIN librishelf.publishers p ON p.id = b.publisher_id
    WHERE p.user_id <> b.user_id
  LOOP
    SELECT id INTO new_id FROM librishelf.publishers
    WHERE user_id = pair.user_id AND name = pair.name
    ORDER BY id LIMIT 1;

    IF new_id IS NULL THEN
      INSERT INTO librishelf.publishers (name, user_id) VALUES (pair.name, pair.user_id) RETURNING id INTO new_id;
    END IF;

    UPDATE librishelf.books SET publisher_id = new_id
    WHERE publisher_id = pair.publisher_id AND user_id = pair.user_id;

    new_id := NULL;
  END LOOP;

  DELETE FROM librishelf.publishers WHERE user_id IS NULL;

  FOR pair IN
    SELECT p.id AS dup_id, keep.id AS keep_id
    FROM librishelf.publishers p
    JOIN LATERAL (
      SELECT min(k.id) AS id FROM librishelf.publishers k
      WHERE k.user_id = p.user_id AND lower(btrim(k.name)) = lower(btrim(p.name))
    ) keep ON keep.id <> p.id
  LOOP
    UPDATE librishelf.books SET publisher_id = pair.keep_id WHERE publisher_id = pair.dup_id;
    DELETE FROM librishelf.publishers WHERE id = pair.dup_id;
  END LOOP;
END
$$;

-- --- Restrições ------------------------------------------------------------
ALTER TABLE librishelf.authors    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE librishelf.publishers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE librishelf.tags       ALTER COLUMN user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_user_name    ON librishelf.authors    (user_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_publishers_user_name ON librishelf.publishers (user_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_user_name       ON librishelf.tags       (user_id, lower(name));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_authors_user') THEN
    ALTER TABLE librishelf.authors ADD CONSTRAINT fk_authors_user
      FOREIGN KEY (user_id) REFERENCES librishelf.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_publishers_user') THEN
    ALTER TABLE librishelf.publishers ADD CONSTRAINT fk_publishers_user
      FOREIGN KEY (user_id) REFERENCES librishelf.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tags_user') THEN
    ALTER TABLE librishelf.tags ADD CONSTRAINT fk_tags_user
      FOREIGN KEY (user_id) REFERENCES librishelf.users(id) ON DELETE CASCADE;
  END IF;

  -- FK composta: o livro só pode apontar para editora do mesmo usuário.
  -- Ao apagar a editora, só publisher_id vira NULL (user_id fica).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publishers_id_user_key') THEN
    ALTER TABLE librishelf.publishers ADD CONSTRAINT publishers_id_user_key UNIQUE (id, user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_books_publisher_owner') THEN
    ALTER TABLE librishelf.books DROP CONSTRAINT IF EXISTS fk_publisher;
    ALTER TABLE librishelf.books ADD CONSTRAINT fk_books_publisher_owner
      FOREIGN KEY (publisher_id, user_id) REFERENCES librishelf.publishers(id, user_id)
      ON DELETE SET NULL (publisher_id);
  END IF;
END
$$;

-- Vínculos de autor/tag: mesmo dono do livro (os vínculos não têm user_id,
-- então a garantia é por trigger).
CREATE OR REPLACE FUNCTION librishelf.check_same_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  book_owner integer;
  name_owner integer;
BEGIN
  SELECT user_id INTO book_owner FROM librishelf.books WHERE id = NEW.book_id;

  IF TG_TABLE_NAME = 'books_authors_link' THEN
    SELECT user_id INTO name_owner FROM librishelf.authors WHERE id = NEW.author_id;
  ELSE
    SELECT user_id INTO name_owner FROM librishelf.tags WHERE id = NEW.tag_id;
  END IF;

  IF book_owner IS DISTINCT FROM name_owner THEN
    RAISE EXCEPTION 'Vínculo entre usuários diferentes em %', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_books_authors_same_owner ON librishelf.books_authors_link;
CREATE TRIGGER trg_books_authors_same_owner
  BEFORE INSERT OR UPDATE ON librishelf.books_authors_link
  FOR EACH ROW EXECUTE FUNCTION librishelf.check_same_owner();

DROP TRIGGER IF EXISTS trg_books_tags_same_owner ON librishelf.books_tags_link;
CREATE TRIGGER trg_books_tags_same_owner
  BEFORE INSERT OR UPDATE ON librishelf.books_tags_link
  FOR EACH ROW EXECUTE FUNCTION librishelf.check_same_owner();

-- ===========================================================================
-- Funções de livro (versões por usuário)
-- ===========================================================================

DROP FUNCTION IF EXISTS librishelf.add_book(text, text, text[], text, text[], text, text, integer);
DROP FUNCTION IF EXISTS librishelf.update_book(integer, text, text, text[], text, text[], text, text);
DROP FUNCTION IF EXISTS librishelf.set_book_relations(integer, text[], text[]);
DROP FUNCTION IF EXISTS librishelf.upsert_name_id(regclass, text);

-- Remove espaços, vazios e repetidos (sem diferenciar maiúsculas), mantendo a 1ª grafia.
CREATE OR REPLACE FUNCTION librishelf.clean_name_list(p_names text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(name ORDER BY first_pos), ARRAY[]::text[])
  FROM (
    SELECT DISTINCT ON (lower(regexp_replace(btrim(n), '\s+', ' ', 'g')))
      regexp_replace(btrim(n), '\s+', ' ', 'g') AS name,
      ord AS first_pos
    FROM unnest(COALESCE(p_names, ARRAY[]::text[])) WITH ORDINALITY AS t(n, ord)
    WHERE btrim(n) <> ''
    ORDER BY lower(regexp_replace(btrim(n), '\s+', ' ', 'g')), ord
  ) cleaned
$$;

-- Encontra (sem diferenciar maiúsculas) ou cria o nome do usuário, sem corrida.
CREATE OR REPLACE FUNCTION librishelf.upsert_name_id(p_table regclass, p_user_id integer, p_name text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_id integer;
BEGIN
  EXECUTE format(
    'INSERT INTO %s (name, user_id) VALUES ($1, $2) ON CONFLICT (user_id, (lower(name))) DO NOTHING',
    p_table
  ) USING p_name, p_user_id;

  EXECUTE format('SELECT id FROM %s WHERE user_id = $1 AND lower(name) = lower($2)', p_table)
    INTO v_id USING p_user_id, p_name;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION librishelf.set_book_relations(p_book_id integer, p_authors text[], p_tags text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id integer;
  v_name text;
  v_pos integer := 0;
BEGIN
  SELECT user_id INTO v_user_id FROM librishelf.books WHERE id = p_book_id;

  DELETE FROM librishelf.books_authors_link WHERE book_id = p_book_id;
  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_authors)
  LOOP
    INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.authors', v_user_id, v_name), v_pos);
    v_pos := v_pos + 1;
  END LOOP;

  DELETE FROM librishelf.books_tags_link WHERE book_id = p_book_id;
  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_tags)
  LOOP
    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.tags', v_user_id, v_name));
  END LOOP;
END;
$$;

-- Remove autores/editoras/tags do usuário que não têm mais nenhum livro.
CREATE OR REPLACE FUNCTION librishelf.prune_user_names(p_user_id integer)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM librishelf.authors a
  WHERE a.user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM librishelf.books_authors_link bal WHERE bal.author_id = a.id);

  DELETE FROM librishelf.tags t
  WHERE t.user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM librishelf.books_tags_link btl WHERE btl.tag_id = t.id);

  DELETE FROM librishelf.publishers p
  WHERE p.user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM librishelf.books b WHERE b.publisher_id = p.id);
$$;

CREATE OR REPLACE FUNCTION librishelf.add_book(
  p_title text, p_pubdate text, p_authors text[], p_publisher_name text,
  p_tags text[], p_read_date text, p_isbn text, p_user_id integer,
  p_rating smallint DEFAULT NULL, p_ol_work_key text DEFAULT NULL, p_ol_edition_key text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_book_id integer;
  v_publisher_id integer := NULL;
BEGIN
  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
  END IF;

  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', p_user_id, btrim(p_publisher_name));
  END IF;

  INSERT INTO librishelf.books (
    title, publication_date, read_date, isbn, user_id, publisher_id, rating, ol_work_key, ol_edition_key
  ) VALUES (
    p_title, p_pubdate::date, p_read_date::date, p_isbn, p_user_id, v_publisher_id, p_rating, p_ol_work_key, p_ol_edition_key
  )
  RETURNING id INTO v_book_id;

  PERFORM librishelf.set_book_relations(v_book_id, p_authors, p_tags);

  RETURN v_book_id;
END;
$$;

CREATE OR REPLACE FUNCTION librishelf.update_book(
  p_book_id integer, p_title text, p_pubdate text, p_authors text[],
  p_publisher_name text, p_tags text[], p_read_date text, p_isbn text,
  p_rating smallint DEFAULT NULL, p_ol_work_key text DEFAULT NULL, p_ol_edition_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id integer;
  v_publisher_id integer := NULL;
BEGIN
  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_user_id FROM librishelf.books WHERE id = p_book_id;

  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', v_user_id, btrim(p_publisher_name));
  END IF;

  UPDATE librishelf.books
  SET title = p_title,
      publication_date = p_pubdate::date,
      read_date = p_read_date::date,
      isbn = p_isbn,
      publisher_id = v_publisher_id,
      rating = p_rating,
      -- Chaves do Open Library: novas quando vêm preenchidas; mantidas se o
      -- ISBN não mudou; apagadas se o ISBN mudou (apontariam para outro livro).
      -- (Nas expressões do SET, isbn13 ainda é o valor antigo.)
      ol_work_key = CASE
        WHEN p_ol_work_key IS NOT NULL THEN p_ol_work_key
        WHEN librishelf.normalize_isbn13(p_isbn) IS DISTINCT FROM isbn13 THEN NULL
        ELSE ol_work_key
      END,
      ol_edition_key = CASE
        WHEN p_ol_edition_key IS NOT NULL THEN p_ol_edition_key
        WHEN librishelf.normalize_isbn13(p_isbn) IS DISTINCT FROM isbn13 THEN NULL
        ELSE ol_edition_key
      END,
      last_modified = now()
  WHERE id = p_book_id;

  PERFORM librishelf.set_book_relations(p_book_id, p_authors, p_tags);
  PERFORM librishelf.prune_user_names(v_user_id);
END;
$$;
