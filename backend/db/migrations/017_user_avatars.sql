-- 017 — foto de perfil
--
-- users.avatar_version: null = sem foto (o app mostra a inicial); um número =
-- tem foto, e o número entra na URL para furar o cache quando a foto muda.
-- Os arquivos ficam em UPLOAD_DIR/avatars/{id}-{sm|lg}.{avif|jpg}.
-- users.avatar_visibility: quem vê a foto — 'everyone' (todo mundo que vê o
-- nome), 'followers' (só quem segue, aprovado) ou 'nobody' (só a própria
-- pessoa). Os outros veem a inicial.
-- users.avatar_hidden_at: a foto saiu do ar por denúncias (ocultação
-- automática ou da moderação) até alguém revisar; o arquivo continua.
-- users.avatar_reviewed_at: a moderação revisou e manteve a foto; denúncias
-- anteriores a isso não contam mais.
CREATE SEQUENCE IF NOT EXISTS librishelf.avatar_version_seq AS integer;

ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS avatar_version integer;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS avatar_visibility text NOT NULL DEFAULT 'followers';
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS avatar_hidden_at timestamptz;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS avatar_hidden_reason text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS avatar_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_avatar_visibility_check') THEN
    ALTER TABLE librishelf.users
      ADD CONSTRAINT users_avatar_visibility_check CHECK (avatar_visibility IN ('everyone', 'followers', 'nobody'));
  END IF;
END $$;

-- Denúncias de foto: valem para a versão denunciada (trocar a foto começa do zero)
CREATE TABLE IF NOT EXISTS librishelf.avatar_reports (
  id             serial PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  avatar_version integer NOT NULL,
  reporter_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  reason         text NOT NULL CHECK (reason IN ('offensive', 'impersonation', 'spam', 'other')),
  note           text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, avatar_version, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_avatar_reports_user ON librishelf.avatar_reports (user_id, avatar_version);
CREATE INDEX IF NOT EXISTS idx_avatar_reports_reporter ON librishelf.avatar_reports (reporter_id);
