-- 021 — importações em etapas (prévia, fila, relatório) e capas buscadas depois
--
-- imports: uma linha por arquivo enviado. content guarda o CSV até a
-- importação terminar (aí vira NULL). Rascunho ('draft') que ninguém começou
-- sai depois de 24 h (job imports.cleanup). Uma importação andando por conta.
CREATE TABLE IF NOT EXISTS librishelf.imports (
  id               bigserial PRIMARY KEY,
  user_id          integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'running', 'done', 'failed')),
  format           text NOT NULL CHECK (format IN ('goodreads', 'librishelf', 'generic')),
  filename         text CHECK (filename IS NULL OR char_length(filename) <= 255),
  content          text,
  headers          jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping          jsonb,
  include_want     boolean NOT NULL DEFAULT false,
  total            integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  processed        integer NOT NULL DEFAULT 0 CHECK (processed >= 0),
  imported         integer NOT NULL DEFAULT 0 CHECK (imported >= 0),
  duplicates       integer NOT NULL DEFAULT 0 CHECK (duplicates >= 0),
  skipped_want     integer NOT NULL DEFAULT 0 CHECK (skipped_want >= 0),
  failed           integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  -- Goodreads: releituras além da última (o arquivo só traz a data da última)
  rereads_undated  integer NOT NULL DEFAULT 0 CHECK (rereads_undated >= 0),
  errors           jsonb NOT NULL DEFAULT '[]'::jsonb,
  covers_total     integer NOT NULL DEFAULT 0,
  covers_done      integer NOT NULL DEFAULT 0,
  covers_found     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_imports_user ON librishelf.imports (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_imports_active ON librishelf.imports (user_id) WHERE status IN ('queued', 'running');

-- Livros importados com ISBN, à espera da capa
CREATE TABLE IF NOT EXISTS librishelf.import_covers (
  import_id  bigint NOT NULL REFERENCES librishelf.imports(id) ON DELETE CASCADE,
  book_id    integer NOT NULL REFERENCES librishelf.books(id) ON DELETE CASCADE,
  isbn13     text NOT NULL CHECK (char_length(isbn13) = 13),
  done       boolean NOT NULL DEFAULT false,
  found      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (import_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_import_covers_book ON librishelf.import_covers (book_id);
