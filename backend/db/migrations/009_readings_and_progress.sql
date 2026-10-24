-- 009 — releituras e progresso de leitura
-- Idempotente: pode rodar mais de uma vez.
--
-- Cada leitura vira uma linha em librishelf.readings (início, fim, nota
-- opcional daquela leitura e progresso). Ler de novo não apaga a anterior.
--
-- books.read_date, books.started_at e books.reading_status = 'reading' passam
-- a ser um resumo das leituras, mantido por librishelf.sync_book_reading()
-- (trigger em readings). Assim o payload do livro e as consultas antigas
-- continuam valendo:
--   read_date      = fim da leitura concluída mais recente
--   started_at     = início da leitura em andamento
--   reading_status = 'reading' se há leitura em andamento; 'want' só fica
--                    enquanto o livro não tem nenhuma leitura
--
-- books.page_count: total de páginas (Open Library ou digitado), usado no
-- progresso e na retrospectiva.

ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS page_count integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_page_count_check' AND conrelid = 'librishelf.books'::regclass
  ) THEN
    ALTER TABLE librishelf.books
      ADD CONSTRAINT books_page_count_check CHECK (page_count BETWEEN 1 AND 20000);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS librishelf.readings (
  id                  serial PRIMARY KEY,
  book_id             integer NOT NULL REFERENCES librishelf.books(id) ON DELETE CASCADE,
  started_on          date,
  finished_on         date,
  rating              smallint CHECK (rating BETWEEN 1 AND 5),
  current_page        integer CHECK (current_page BETWEEN 0 AND 20000),
  progress_percent    smallint CHECK (progress_percent BETWEEN 0 AND 100),
  progress_updated_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT readings_dates_order CHECK (started_on IS NULL OR finished_on IS NULL OR started_on <= finished_on)
);

-- No máximo uma leitura em andamento por livro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_one_open
  ON librishelf.readings (book_id) WHERE finished_on IS NULL;

CREATE INDEX IF NOT EXISTS idx_readings_book_finished
  ON librishelf.readings (book_id, finished_on DESC);

-- Painel, meta e filtros por ano/mês contam leituras concluídas.
CREATE INDEX IF NOT EXISTS idx_readings_finished
  ON librishelf.readings (finished_on) WHERE finished_on IS NOT NULL;

-- Recalcula o resumo das leituras em books.
CREATE OR REPLACE FUNCTION librishelf.sync_book_reading(p_book_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_finished date;
  v_open_started  date;
  v_has_open      boolean;
  v_has_any       boolean;
BEGIN
  SELECT max(finished_on),
         bool_or(finished_on IS NULL),
         count(*) > 0
    INTO v_last_finished, v_has_open, v_has_any
    FROM librishelf.readings
   WHERE book_id = p_book_id;

  SELECT started_on INTO v_open_started
    FROM librishelf.readings
   WHERE book_id = p_book_id AND finished_on IS NULL;

  UPDATE librishelf.books
     SET read_date = v_last_finished::timestamp,
         started_at = CASE WHEN coalesce(v_has_open, false) THEN v_open_started::timestamp ELSE NULL END,
         reading_status = CASE
           WHEN coalesce(v_has_open, false) THEN 'reading'
           WHEN v_has_any THEN NULL
           WHEN reading_status = 'want' THEN 'want'
           ELSE NULL
         END
   WHERE id = p_book_id
     AND (read_date::date IS DISTINCT FROM v_last_finished
          OR started_at::date IS DISTINCT FROM (CASE WHEN coalesce(v_has_open, false) THEN v_open_started END)
          OR reading_status IS DISTINCT FROM (CASE
               WHEN coalesce(v_has_open, false) THEN 'reading'
               WHEN v_has_any THEN NULL
               WHEN reading_status = 'want' THEN 'want'
               ELSE NULL
             END));
END;
$$;

CREATE OR REPLACE FUNCTION librishelf.readings_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM librishelf.sync_book_reading(OLD.book_id);
    RETURN OLD;
  END IF;
  PERFORM librishelf.sync_book_reading(NEW.book_id);
  IF TG_OP = 'UPDATE' AND OLD.book_id <> NEW.book_id THEN
    PERFORM librishelf.sync_book_reading(OLD.book_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS readings_sync ON librishelf.readings;
CREATE TRIGGER readings_sync
  AFTER INSERT OR UPDATE OR DELETE ON librishelf.readings
  FOR EACH ROW EXECUTE FUNCTION librishelf.readings_sync_trigger();

-- Leituras que já existem (só livros ainda sem nenhuma linha em readings).
-- Um INSERT só: o SELECT lê o estado de antes (o trigger de resumo roda no
-- fim do comando, então uma linha não interfere na outra).
--   Lido:            leitura concluída em read_date (início = started_at, se
--                    não for releitura em andamento e não vier depois do fim)
--   Lendo:           leitura em andamento desde started_at
--   Lendo + já lido: releitura → as duas
WITH src AS (
  SELECT b.id, b.read_date, b.started_at, b.reading_status, coalesce(b.created_at, now()) AS created_at
    FROM librishelf.books b
   WHERE (b.read_date IS NOT NULL OR b.reading_status = 'reading')
     AND NOT EXISTS (SELECT 1 FROM librishelf.readings r WHERE r.book_id = b.id)
)
INSERT INTO librishelf.readings (book_id, started_on, finished_on, created_at, updated_at)
SELECT id,
       CASE WHEN reading_status IS DISTINCT FROM 'reading'
                 AND started_at IS NOT NULL
                 AND started_at::date <= read_date::date
            THEN started_at::date END,
       read_date::date,
       created_at,
       now()
  FROM src
 WHERE read_date IS NOT NULL
UNION ALL
SELECT id, started_at::date, NULL, created_at, now()
  FROM src
 WHERE reading_status = 'reading';
