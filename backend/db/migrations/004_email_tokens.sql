-- 004 — e-mail confirmado e links de uso único (recuperar senha / confirmar e-mail)
-- Idempotente: pode rodar mais de uma vez.

-- Quando o e-mail foi confirmado (NULL = ainda não).
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Contas que já existiam antes desta versão contam como confirmadas: quem já
-- usava biblioteca pública ou comunidade não perde nada na atualização.
-- (Só roda na primeira vez: depois a migration fica registrada.)
UPDATE librishelf.users SET email_verified_at = COALESCE(created_at, now())
WHERE email_verified_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM librishelf.schema_migrations WHERE version = '004_email_tokens');

-- Links enviados por e-mail. Só o hash SHA-256 fica no banco: quem lê o banco
-- não consegue usar um link ainda válido.
CREATE TABLE IF NOT EXISTS librishelf.user_tokens (
  id          bigserial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('reset_password', 'verify_email')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_purpose
  ON librishelf.user_tokens (user_id, purpose);

-- E-mail sem diferenciar maiúsculas (busca do "esqueci minha senha").
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON librishelf.users (lower(email));
