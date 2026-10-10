-- =============================================================================
-- Librishelf — schema completo do banco (estado após todas as migrations)
--
-- Instalação nova:   psql -d SEU_BANCO -f backend/db/schema.sql
-- Banco existente:   aplique só os arquivos de backend/db/migrations/ em ordem.
-- =============================================================================

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- SCHEMA: librishelf
CREATE SCHEMA librishelf;

-- FUNCTION: add_book(text, text, text, text, text[], text, text, integer)
CREATE FUNCTION librishelf.add_book(p_title text, p_pubdate text, p_author_name text, p_publisher_name text, p_tags text[], p_read_date text, p_isbn text, p_user_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_author_id INTEGER;
    v_publisher_id INTEGER := NULL; -- Inicia como NULL
    v_tag_id INTEGER;
    v_book_id INTEGER;
    v_tag_name TEXT;
BEGIN
    
    -- 1. Encontrar ou Inserir o Autor (Sua lógica está correta)
    -- (Assumindo que o autor é obrigatório e nunca será nulo)
    SELECT id INTO v_author_id FROM librishelf.authors WHERE name = p_author_name;
    IF NOT FOUND THEN
        INSERT INTO librishelf.authors (name) VALUES (p_author_name)
        RETURNING id INTO v_author_id;
    END IF;

    -- 2. Encontrar ou Inserir a Editora (LÓGICA CORRIGIDA)
    -- Só execute este bloco se p_publisher_name NÃO for nulo E NÃO for vazio
    IF p_publisher_name IS NOT NULL AND p_publisher_name <> '' THEN
        SELECT id INTO v_publisher_id FROM librishelf.publishers WHERE name = p_publisher_name;

        IF NOT FOUND THEN
            INSERT INTO librishelf.publishers (name) VALUES (p_publisher_name)
            RETURNING id INTO v_publisher_id;
        END IF;
    END IF;
    -- Se p_publisher_name for nulo, v_publisher_id permanecerá NULL.

    -- 3. Inserir o Livro principal
    -- Esta query agora funciona mesmo se v_publisher_id for NULL
    INSERT INTO librishelf.books (
        title, 
        publication_date, 
        read_date, 
        isbn, 
        user_id, 
        publisher_id -- Esta coluna DEVE aceitar NULLs
    ) VALUES (
        p_title,
        p_pubdate::DATE,
        p_read_date::DATE,
        p_isbn,
        p_user_id,
        v_publisher_id -- Insere o ID encontrado ou NULL
    )
    RETURNING id INTO v_book_id;

    -- 4. Ligar o Livro ao Autor (Sua lógica está correta)
    INSERT INTO librishelf.books_authors_link (book_id, author_id)
    VALUES (v_book_id, v_author_id);

    -- 5. Iterar (LOOP) sobre o array de Tags (Sua lógica está correta)
    FOREACH v_tag_name IN ARRAY p_tags
    LOOP
        SELECT id INTO v_tag_id FROM librishelf.tags WHERE name = v_tag_name;
        
        IF NOT FOUND THEN
            INSERT INTO librishelf.tags (name) VALUES (v_tag_name)
            RETURNING id INTO v_tag_id;
        END IF;

        INSERT INTO librishelf.books_tags_link (book_id, tag_id)
        VALUES (v_book_id, v_tag_id);
    END LOOP;

    -- 6. Retornar o ID do novo livro
    RETURN v_book_id;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao inserir livro: %', SQLERRM;
        RAISE;
END;
$$;

-- FUNCTION: update_book(integer, text, text, text, text, text[], text, text)
CREATE FUNCTION librishelf.update_book(p_book_id integer, p_title text, p_pubdate text, p_author_name text, p_publisher_name text, p_tags text[], p_read_date text, p_isbn text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_author_id INTEGER;
    v_publisher_id INTEGER := NULL;
    v_tag_id INTEGER;
    v_tag_name TEXT;
BEGIN
    
    -- 1. Encontrar ou Inserir o Autor
    SELECT id INTO v_author_id FROM librishelf.authors WHERE name = p_author_name;
    IF NOT FOUND THEN
        INSERT INTO librishelf.authors (name) VALUES (p_author_name)
        RETURNING id INTO v_author_id;
    END IF;

    -- 2. Encontrar ou Inserir a Editora (com a lógica de NULL que fizemos)
    IF p_publisher_name IS NOT NULL AND p_publisher_name <> '' THEN
        SELECT id INTO v_publisher_id FROM librishelf.publishers WHERE name = p_publisher_name;
        IF NOT FOUND THEN
            INSERT INTO librishelf.publishers (name) VALUES (p_publisher_name)
            RETURNING id INTO v_publisher_id;
        END IF;
    END IF;

    -- 3. Atualizar a tabela principal 'books'
    UPDATE librishelf.books
    SET 
        title = p_title,
        publication_date = p_pubdate::DATE,
        read_date = p_read_date::DATE,
        isbn = p_isbn,
        publisher_id = v_publisher_id
    WHERE id = p_book_id;

    -- 4. Substituir Autores (DELETE + INSERT)
    DELETE FROM librishelf.books_authors_link WHERE book_id = p_book_id;
    INSERT INTO librishelf.books_authors_link (book_id, author_id)
    VALUES (p_book_id, v_author_id);

    -- 5. Substituir Tags (DELETE + INSERT)
    DELETE FROM librishelf.books_tags_link WHERE book_id = p_book_id;
    
    FOREACH v_tag_name IN ARRAY p_tags
    LOOP
        SELECT id INTO v_tag_id FROM librishelf.tags WHERE name = v_tag_name;
        IF NOT FOUND THEN
            INSERT INTO librishelf.tags (name) VALUES (v_tag_name)
            RETURNING id INTO v_tag_id;
        END IF;
        
        INSERT INTO librishelf.books_tags_link (book_id, tag_id)
        VALUES (p_book_id, v_tag_id);
    END LOOP;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao atualizar livro: %', SQLERRM;
        RAISE;
END;
$$;

-- TABLE: authors
CREATE TABLE librishelf.authors (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- SEQUENCE: authors_id_seq
CREATE SEQUENCE librishelf.authors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: authors_id_seq
ALTER SEQUENCE librishelf.authors_id_seq OWNED BY librishelf.authors.id;

-- TABLE: books
CREATE TABLE librishelf.books (
    id integer NOT NULL,
    title text NOT NULL,
    read_date timestamp without time zone,
    publication_date timestamp without time zone,
    series_index real,
    isbn text,
    last_modified timestamp without time zone DEFAULT now(),
    user_id integer NOT NULL,
    publisher_id integer
);

-- TABLE: books_authors_link
CREATE TABLE librishelf.books_authors_link (
    book_id integer NOT NULL,
    author_id integer NOT NULL
);

-- SEQUENCE: books_id_seq
CREATE SEQUENCE librishelf.books_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: books_id_seq
ALTER SEQUENCE librishelf.books_id_seq OWNED BY librishelf.books.id;

-- TABLE: books_tags_link
CREATE TABLE librishelf.books_tags_link (
    book_id integer NOT NULL,
    tag_id integer NOT NULL
);

-- TABLE: publishers
CREATE TABLE librishelf.publishers (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- SEQUENCE: publishers_id_seq
CREATE SEQUENCE librishelf.publishers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: publishers_id_seq
ALTER SEQUENCE librishelf.publishers_id_seq OWNED BY librishelf.publishers.id;

-- TABLE: tags
CREATE TABLE librishelf.tags (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- SEQUENCE: tags_id_seq
CREATE SEQUENCE librishelf.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: tags_id_seq
ALTER SEQUENCE librishelf.tags_id_seq OWNED BY librishelf.tags.id;

-- TABLE: users
CREATE TABLE librishelf.users (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    role character varying(50) DEFAULT 'user'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- SEQUENCE: users_id_seq
CREATE SEQUENCE librishelf.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: users_id_seq
ALTER SEQUENCE librishelf.users_id_seq OWNED BY librishelf.users.id;

-- DEFAULT: authors id
ALTER TABLE ONLY librishelf.authors ALTER COLUMN id SET DEFAULT nextval('librishelf.authors_id_seq'::regclass);

-- DEFAULT: books id
ALTER TABLE ONLY librishelf.books ALTER COLUMN id SET DEFAULT nextval('librishelf.books_id_seq'::regclass);

-- DEFAULT: publishers id
ALTER TABLE ONLY librishelf.publishers ALTER COLUMN id SET DEFAULT nextval('librishelf.publishers_id_seq'::regclass);

-- DEFAULT: tags id
ALTER TABLE ONLY librishelf.tags ALTER COLUMN id SET DEFAULT nextval('librishelf.tags_id_seq'::regclass);

-- DEFAULT: users id
ALTER TABLE ONLY librishelf.users ALTER COLUMN id SET DEFAULT nextval('librishelf.users_id_seq'::regclass);

-- CONSTRAINT: authors authors_name_key
ALTER TABLE ONLY librishelf.authors
    ADD CONSTRAINT authors_name_key UNIQUE (name);

-- CONSTRAINT: authors authors_pkey
ALTER TABLE ONLY librishelf.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (id);

-- CONSTRAINT: books_authors_link books_authors_link_pkey
ALTER TABLE ONLY librishelf.books_authors_link
    ADD CONSTRAINT books_authors_link_pkey PRIMARY KEY (book_id, author_id);

-- CONSTRAINT: books books_pkey
ALTER TABLE ONLY librishelf.books
    ADD CONSTRAINT books_pkey PRIMARY KEY (id);

-- CONSTRAINT: books_tags_link books_tags_link_pkey
ALTER TABLE ONLY librishelf.books_tags_link
    ADD CONSTRAINT books_tags_link_pkey PRIMARY KEY (book_id, tag_id);

-- CONSTRAINT: publishers publishers_name_key
ALTER TABLE ONLY librishelf.publishers
    ADD CONSTRAINT publishers_name_key UNIQUE (name);

-- CONSTRAINT: publishers publishers_pkey
ALTER TABLE ONLY librishelf.publishers
    ADD CONSTRAINT publishers_pkey PRIMARY KEY (id);

-- CONSTRAINT: tags tags_name_key
ALTER TABLE ONLY librishelf.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);

-- CONSTRAINT: tags tags_pkey
ALTER TABLE ONLY librishelf.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

-- CONSTRAINT: users users_email_key
ALTER TABLE ONLY librishelf.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

-- CONSTRAINT: users users_name_key
ALTER TABLE ONLY librishelf.users
    ADD CONSTRAINT users_name_key UNIQUE (name);

-- CONSTRAINT: users users_pkey
ALTER TABLE ONLY librishelf.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- INDEX: idx_books_isbn_user
CREATE UNIQUE INDEX idx_books_isbn_user ON librishelf.books USING btree (isbn, user_id) WHERE (isbn IS NOT NULL);

-- INDEX: idx_books_title
CREATE INDEX idx_books_title ON librishelf.books USING btree (title);

-- FK CONSTRAINT: books_authors_link fk_author
ALTER TABLE ONLY librishelf.books_authors_link
    ADD CONSTRAINT fk_author FOREIGN KEY (author_id) REFERENCES librishelf.authors(id) ON DELETE CASCADE;

-- FK CONSTRAINT: books_authors_link fk_book
ALTER TABLE ONLY librishelf.books_authors_link
    ADD CONSTRAINT fk_book FOREIGN KEY (book_id) REFERENCES librishelf.books(id) ON DELETE CASCADE;

-- FK CONSTRAINT: books_tags_link fk_book
ALTER TABLE ONLY librishelf.books_tags_link
    ADD CONSTRAINT fk_book FOREIGN KEY (book_id) REFERENCES librishelf.books(id) ON DELETE CASCADE;

-- FK CONSTRAINT: books fk_publisher
ALTER TABLE ONLY librishelf.books
    ADD CONSTRAINT fk_publisher FOREIGN KEY (publisher_id) REFERENCES librishelf.publishers(id) ON DELETE SET NULL;

-- FK CONSTRAINT: books_tags_link fk_tag
ALTER TABLE ONLY librishelf.books_tags_link
    ADD CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES librishelf.tags(id) ON DELETE CASCADE;

-- FK CONSTRAINT: books fk_user
ALTER TABLE ONLY librishelf.books
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES librishelf.users(id) ON DELETE CASCADE;

-- =============================================================================
-- Migrations já incorporadas a este arquivo
-- =============================================================================


-- Bibliotecas passam a ser privadas por padrão; o usuário liga em Configurações.
ALTER TABLE librishelf.users
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Tokens emitidos antes desta data são recusados (troca de senha derruba as
-- outras sessões).
ALTER TABLE librishelf.users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone;

-- Toda listagem filtra por user_id; até aqui era seq scan em books.
CREATE INDEX IF NOT EXISTS idx_books_user_id
  ON librishelf.books (user_id);

-- A PK dos vínculos começa por book_id; os filtros e o dashboard também
-- partem de author_id / tag_id.
CREATE INDEX IF NOT EXISTS idx_books_authors_link_author_id
  ON librishelf.books_authors_link (author_id);

CREATE INDEX IF NOT EXISTS idx_books_tags_link_tag_id
  ON librishelf.books_tags_link (tag_id);

CREATE TABLE IF NOT EXISTS librishelf.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamp without time zone NOT NULL DEFAULT now()
);

INSERT INTO librishelf.schema_migrations (version)
VALUES ('001_public_opt_in_and_indexes')
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 002 — vários autores por livro
-- ---------------------------------------------------------------------------
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

INSERT INTO librishelf.schema_migrations (version)
VALUES ('002_multiple_authors')
ON CONFLICT (version) DO NOTHING;
