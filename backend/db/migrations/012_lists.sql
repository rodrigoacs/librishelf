-- 012 — listas de livros
-- Idempotente: pode rodar mais de uma vez.
--
-- Listas do leitor ("Melhores de 2026", "Para as férias"…), só com livros da
-- própria estante, em ordem escolhida por ele (position). Privada por padrão;
-- pública aparece no perfil e tem página própria quando a biblioteca também é
-- pública. "ranked" mostra a numeração (1º, 2º…).
CREATE TABLE IF NOT EXISTS librishelf.lists (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  is_public   boolean NOT NULL DEFAULT false,
  ranked      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lists_user ON librishelf.lists (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS librishelf.list_items (
  list_id  integer NOT NULL REFERENCES librishelf.lists(id) ON DELETE CASCADE,
  book_id  integer NOT NULL REFERENCES librishelf.books(id) ON DELETE CASCADE,
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_list_items_order ON librishelf.list_items (list_id, position);
-- "Em quais listas está este livro?" e o CASCADE ao apagar o livro
CREATE INDEX IF NOT EXISTS idx_list_items_book ON librishelf.list_items (book_id);
