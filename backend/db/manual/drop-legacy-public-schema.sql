-- =============================================================================
-- OPCIONAL e DESTRUTIVO — remove o modelo antigo que ficou no schema `public`
-- (tabelas estilo Calibre e as versões antigas de add_book/update_book).
-- A aplicação usa só o schema `librishelf`; nada abaixo é lido pelo código.
--
-- NÃO roda pelo `npm run db:migrate`. Faça backup antes e rode à mão:
--   pg_dump -n public SEU_BANCO > public-legacy-backup.sql
--   psql -d SEU_BANCO -f backend/db/manual/drop-legacy-public-schema.sql
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.add_book(text, date, text, text, text[], date, text, integer);
DROP FUNCTION IF EXISTS public.update_book(integer, text, date, text, text, text[], date, text);

DROP TABLE IF EXISTS public.books_authors_link;
DROP TABLE IF EXISTS public.books_publishers_link;
DROP TABLE IF EXISTS public.books_tags_link;
DROP TABLE IF EXISTS public.books;
DROP TABLE IF EXISTS public.authors;
DROP TABLE IF EXISTS public.publishers;
DROP TABLE IF EXISTS public.tags;
DROP TABLE IF EXISTS public.users;

DROP SEQUENCE IF EXISTS public.authors_id_seq;
DROP SEQUENCE IF EXISTS public.books_id_seq;
DROP SEQUENCE IF EXISTS public.publisher_id_seq;
DROP SEQUENCE IF EXISTS public.tags_id_seq;
DROP SEQUENCE IF EXISTS public.users_id_seq;

COMMIT;
