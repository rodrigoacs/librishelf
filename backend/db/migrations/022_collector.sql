-- Pacote 28: empréstimos (grátis) e dados do exemplar (Pro: collector).

-- Um empréstimo por linha; no máximo um em aberto por livro. O lembrete por
-- e-mail (remind) é do Pro e vai para a própria pessoa, nunca para quem pegou.
CREATE TABLE IF NOT EXISTS librishelf.loans (
  id           serial PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  book_id      integer NOT NULL REFERENCES librishelf.books(id) ON DELETE CASCADE,
  borrower     text NOT NULL CHECK (char_length(btrim(borrower)) BETWEEN 1 AND 120),
  lent_on      date NOT NULL DEFAULT CURRENT_DATE,
  due_on       date,
  returned_on  date,
  notes        text CHECK (notes IS NULL OR char_length(notes) <= 500),
  remind       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loans_due_after_lent CHECK (due_on IS NULL OR due_on >= lent_on),
  CONSTRAINT loans_returned_after_lent CHECK (returned_on IS NULL OR returned_on >= lent_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_one_open ON librishelf.loans (book_id) WHERE returned_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_loans_user ON librishelf.loans (user_id, returned_on);

-- Exemplar físico (Pro): onde está, quanto custou, quanto vale hoje.
CREATE TABLE IF NOT EXISTS librishelf.book_copies (
  book_id      integer PRIMARY KEY REFERENCES librishelf.books(id) ON DELETE CASCADE,
  user_id      integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  location     text CHECK (location IS NULL OR char_length(location) <= 200),
  price_cents  integer CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 100000000),
  value_cents  integer CHECK (value_cents IS NULL OR value_cents BETWEEN 0 AND 100000000),
  currency     char(3) NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  acquired_on  date,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_book_copies_user ON librishelf.book_copies (user_id);

-- Fotos do exemplar (Pro), com cota por conta. Os arquivos ficam em
-- UPLOAD_DIR/copies/{usuário}/{livro}-{foto}-{sm|lg}.jpg
CREATE TABLE IF NOT EXISTS librishelf.copy_photos (
  id          serial PRIMARY KEY,
  book_id     integer NOT NULL REFERENCES librishelf.books(id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  bytes       integer NOT NULL CHECK (bytes > 0),
  width       integer NOT NULL,
  height      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_photos_book ON librishelf.copy_photos (book_id, id);
CREATE INDEX IF NOT EXISTS idx_copy_photos_user ON librishelf.copy_photos (user_id);
