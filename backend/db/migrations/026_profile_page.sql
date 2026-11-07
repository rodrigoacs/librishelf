-- Página pública (pacote 33): apresentação curta (bio, denunciável) e até
-- cinco livros favoritos fixados no topo da estante.
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS bio_version integer;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS bio_hidden_at timestamptz;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS bio_hidden_reason text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS bio_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_bio_length' AND conrelid = 'librishelf.users'::regclass) THEN
    ALTER TABLE librishelf.users ADD CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(bio) BETWEEN 1 AND 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_bio_hidden_reason' AND conrelid = 'librishelf.users'::regclass) THEN
    ALTER TABLE librishelf.users ADD CONSTRAINT users_bio_hidden_reason CHECK (bio_hidden_reason IS NULL OR bio_hidden_reason IN ('reports', 'admin'));
  END IF;
END $$;

-- Denúncias valem para a versão denunciada (editar a bio começa do zero)
CREATE TABLE IF NOT EXISTS librishelf.bio_reports (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  bio_version integer NOT NULL,
  reporter_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('offensive', 'impersonation', 'spam', 'other')),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, bio_version, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_bio_reports_user ON librishelf.bio_reports (user_id, bio_version);
CREATE INDEX IF NOT EXISTS idx_bio_reports_reporter ON librishelf.bio_reports (reporter_id);

-- Favoritos: livros da própria estante, posição 0..4
CREATE TABLE IF NOT EXISTS librishelf.profile_favorites (
  user_id  integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  book_id  integer NOT NULL REFERENCES librishelf.books(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 4),
  PRIMARY KEY (user_id, book_id),
  UNIQUE (user_id, position)
);

-- Moderação da apresentação grava bio.keep / bio.remove no registro do admin
ALTER TABLE librishelf.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE librishelf.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate', 'user.resend_verification', 'email.test',
                    'avatar.keep', 'avatar.remove', 'bio.keep', 'bio.remove',
                    'pro.grant', 'pro.revoke', 'payment.refund', 'webhook.reprocess', 'offer.update'));
