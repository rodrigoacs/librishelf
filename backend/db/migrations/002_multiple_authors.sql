-- 002 — vários autores por livro
--
-- * add_book/update_book passam a receber uma LISTA de autores (text[]).
--   Antes recebiam um texto só: "Fulano, Beltrano" virava um autor com esse nome.
-- * books_authors_link ganha "position" para manter a ordem dos autores.
-- * Autores/editoras/tags são criados com ON CONFLICT (sem corrida entre
--   requisições simultâneas) e listas repetidas são deduplicadas.
-- * Nomes compostos já gravados ("A Sobrenome, B Sobrenome") são separados
--   quando TODAS as partes têm pelo menos duas palavras. Assim o formato
--   "Sobrenome, Nome" ("Tolkien, J.R.R.") fica como está.
--
-- Idempotente: pode rodar mais de uma vez.

-- ---------------------------------------------------------------------------
-- Ordem dos autores
-- ---------------------------------------------------------------------------
ALTER TABLE librishelf.books_authors_link
  ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Separa nomes compostos já existentes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  composite RECORD;
  part TEXT;
  part_index INT;
  new_author_id INT;
BEGIN
  FOR composite IN
    SELECT a.id, a.name
    FROM librishelf.authors a
    WHERE a.name LIKE '%,%'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(string_to_array(a.name, ',')) AS p(piece)
        WHERE array_length(regexp_split_to_array(btrim(p.piece), '\s+'), 1) < 2
           OR btrim(p.piece) = ''
      )
  LOOP
    part_index := 0;

    FOREACH part IN ARRAY string_to_array(composite.name, ',')
    LOOP
      part := btrim(part);

      INSERT INTO librishelf.authors (name) VALUES (part)
      ON CONFLICT (name) DO NOTHING;
      SELECT id INTO new_author_id FROM librishelf.authors WHERE name = part;

      -- Cada livro que apontava para o nome composto passa a apontar para as
      -- partes, na ordem em que estavam escritas.
      INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
      SELECT bal.book_id, new_author_id, bal.position + part_index
      FROM librishelf.books_authors_link bal
      WHERE bal.author_id = composite.id
      ON CONFLICT (book_id, author_id) DO NOTHING;

      part_index := part_index + 1;
    END LOOP;

    DELETE FROM librishelf.authors WHERE id = composite.id;  -- vínculos saem em cascata
    RAISE NOTICE 'Autor composto separado: %', composite.name;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Funções novas (assinaturas antigas removidas para não haver ambiguidade)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS librishelf.add_book(text, text, text, text, text[], text, text, integer);
DROP FUNCTION IF EXISTS librishelf.update_book(integer, text, text, text, text, text[], text, text);

-- Encontra ou cria um nome numa tabela de nomes únicos, sem corrida.
CREATE OR REPLACE FUNCTION librishelf.upsert_name_id(p_table regclass, p_name text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_id integer;
BEGIN
  EXECUTE format('INSERT INTO %s (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', p_table) USING p_name;
  EXECUTE format('SELECT id FROM %s WHERE name = $1', p_table) INTO v_id USING p_name;
  RETURN v_id;
END;
$$;

-- Normaliza uma lista: tira espaços, vazios e repetidos, mantendo a 1ª ocorrência.
CREATE OR REPLACE FUNCTION librishelf.clean_name_list(p_names text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(name ORDER BY first_pos), ARRAY[]::text[])
  FROM (
    SELECT btrim(n) AS name, min(ord) AS first_pos
    FROM unnest(COALESCE(p_names, ARRAY[]::text[])) WITH ORDINALITY AS t(n, ord)
    WHERE btrim(n) <> ''
    GROUP BY btrim(n)
  ) cleaned
$$;

CREATE OR REPLACE FUNCTION librishelf.set_book_relations(p_book_id integer, p_authors text[], p_tags text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_name text;
  v_pos integer := 0;
BEGIN
  DELETE FROM librishelf.books_authors_link WHERE book_id = p_book_id;
  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_authors)
  LOOP
    INSERT INTO librishelf.books_authors_link (book_id, author_id, position)
    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.authors', v_name), v_pos);
    v_pos := v_pos + 1;
  END LOOP;

  DELETE FROM librishelf.books_tags_link WHERE book_id = p_book_id;
  FOREACH v_name IN ARRAY librishelf.clean_name_list(p_tags)
  LOOP
    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
    VALUES (p_book_id, librishelf.upsert_name_id('librishelf.tags', v_name));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION librishelf.add_book(
  p_title text, p_pubdate text, p_authors text[], p_publisher_name text,
  p_tags text[], p_read_date text, p_isbn text, p_user_id integer
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
    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', btrim(p_publisher_name));
  END IF;

  INSERT INTO librishelf.books (title, publication_date, read_date, isbn, user_id, publisher_id)
  VALUES (p_title, p_pubdate::date, p_read_date::date, p_isbn, p_user_id, v_publisher_id)
  RETURNING id INTO v_book_id;

  PERFORM librishelf.set_book_relations(v_book_id, p_authors, p_tags);

  RETURN v_book_id;
END;
$$;

CREATE OR REPLACE FUNCTION librishelf.update_book(
  p_book_id integer, p_title text, p_pubdate text, p_authors text[],
  p_publisher_name text, p_tags text[], p_read_date text, p_isbn text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_publisher_id integer := NULL;
BEGIN
  IF cardinality(librishelf.clean_name_list(p_authors)) = 0 THEN
    RAISE EXCEPTION 'Pelo menos um autor é obrigatório' USING ERRCODE = '22023';
  END IF;

  IF p_publisher_name IS NOT NULL AND btrim(p_publisher_name) <> '' THEN
    v_publisher_id := librishelf.upsert_name_id('librishelf.publishers', btrim(p_publisher_name));
  END IF;

  UPDATE librishelf.books
  SET title = p_title,
      publication_date = p_pubdate::date,
      read_date = p_read_date::date,
      isbn = p_isbn,
      publisher_id = v_publisher_id,
      last_modified = now()
  WHERE id = p_book_id;

  PERFORM librishelf.set_book_relations(p_book_id, p_authors, p_tags);
END;
$$;
