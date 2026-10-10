-- 001 — biblioteca pública opt-in, invalidação de sessão por troca de senha e índices
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.

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
