-- 011 — resenhas públicas
-- Idempotente: pode rodar mais de uma vez.
--
-- Uma resenha por livro da estante (as anotações continuam privadas, em
-- books.notes). Quem vê: "public" (quem vê a biblioteca pública; na
-- comunidade do livro, só se o autor participa da comunidade) ou
-- "followers" (só seguidores aprovados). Bloqueio esconde nos dois sentidos.
-- Moderação: denúncias vão por e-mail para quem administra; com 3 denúncias
-- de pessoas diferentes a resenha some até alguém revisar (hidden_at).
CREATE TABLE IF NOT EXISTS librishelf.reviews (
  id          serial PRIMARY KEY,
  book_id     integer NOT NULL UNIQUE REFERENCES librishelf.books(id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  has_spoiler boolean NOT NULL DEFAULT false,
  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers')),
  hidden_at   timestamptz,
  hidden_reason text,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_user ON librishelf.reviews (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS librishelf.review_likes (
  review_id  integer NOT NULL REFERENCES librishelf.reviews(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS librishelf.review_reports (
  id          serial PRIMARY KEY,
  review_id   integer NOT NULL REFERENCES librishelf.reviews(id) ON DELETE CASCADE,
  reporter_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('spoiler', 'offensive', 'spam', 'other')),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);
