-- 006 — série/volume e anotação pessoal
-- Idempotente: pode rodar mais de uma vez.

-- Nome da série ("Duna"). O número do volume usa a coluna series_index, que
-- já existia (real: aceita 1.5 para contos entre volumes).
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS series text;

-- Anotação pessoal: só o dono vê (nunca sai na biblioteca pública).
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_series_length_check' AND conrelid = 'librishelf.books'::regclass) THEN
    ALTER TABLE librishelf.books ADD CONSTRAINT books_series_length_check CHECK (char_length(series) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_notes_length_check' AND conrelid = 'librishelf.books'::regclass) THEN
    ALTER TABLE librishelf.books ADD CONSTRAINT books_notes_length_check CHECK (char_length(notes) <= 5000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_series_index_check' AND conrelid = 'librishelf.books'::regclass) THEN
    ALTER TABLE librishelf.books ADD CONSTRAINT books_series_index_check CHECK (series_index IS NULL OR (series_index >= 0 AND series_index <= 9999)) NOT VALID; -- dados antigos não são revalidados
  END IF;
END $$;

-- Filtro e lista de séries do usuário.
CREATE INDEX IF NOT EXISTS idx_books_user_series
  ON librishelf.books (user_id, lower(series))
  WHERE series IS NOT NULL;
