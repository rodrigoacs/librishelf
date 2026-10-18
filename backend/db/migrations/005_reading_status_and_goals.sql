-- 005 — status de leitura ("Quero ler" / "Lendo") e meta anual
-- Idempotente: pode rodar mais de uma vez.

-- "Lido" continua sendo read_date preenchida. reading_status guarda os outros
-- dois estados: 'want' (quero ler) e 'reading' (lendo — inclusive releitura de
-- um livro que já tem data de leitura). NULL = só está na estante.
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS reading_status text;
ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS started_at timestamp without time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_reading_status_check'
      AND conrelid = 'librishelf.books'::regclass
  ) THEN
    ALTER TABLE librishelf.books
      ADD CONSTRAINT books_reading_status_check CHECK (reading_status IN ('want', 'reading'));
  END IF;
END $$;

-- "Lendo agora" e "Quero ler" são consultados direto (Início, filtros, painel).
CREATE INDEX IF NOT EXISTS idx_books_user_reading_status
  ON librishelf.books (user_id, reading_status)
  WHERE reading_status IS NOT NULL;

-- Meta de livros lidos por ano.
CREATE TABLE IF NOT EXISTS librishelf.reading_goals (
  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  year       integer NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  target     integer NOT NULL CHECK (target BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year)
);
