-- 015 — usuário e e-mail únicos sem diferenciar maiúsculas; sair encerra a sessão
--
-- "Demo" e "demo" (ou DEMO@exemplo.test e demo@exemplo.test) eram contas
-- diferentes. Antes de criar os índices, confere se há duplicatas: se houver,
-- a migration para com a lista e nada é alterado (cada caso se decide à mão).
DO $$
DECLARE
  dup_names  text;
  dup_emails text;
BEGIN
  SELECT string_agg(k, ', ') INTO dup_names
  FROM (SELECT lower(name) AS k FROM librishelf.users GROUP BY 1 HAVING count(*) > 1) d;

  SELECT string_agg(k, ', ') INTO dup_emails
  FROM (SELECT lower(email) AS k FROM librishelf.users GROUP BY 1 HAVING count(*) > 1) d;

  IF dup_names IS NOT NULL OR dup_emails IS NOT NULL THEN
    RAISE EXCEPTION 'Contas duplicadas sem diferenciar maiúsculas. Nomes: %. E-mails: %. Resolva antes de migrar.',
      COALESCE(dup_names, '-'), COALESCE(dup_emails, '-');
  END IF;
END $$;

-- E-mail guardado sempre em minúsculas (o cadastro e a troca já gravam assim)
UPDATE librishelf.users SET email = lower(email) WHERE email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_name_lower ON librishelf.users (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON librishelf.users (lower(email));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_lowercase_check' AND conrelid = 'librishelf.users'::regclass
  ) THEN
    ALTER TABLE librishelf.users
      ADD CONSTRAINT users_email_lowercase_check CHECK (email = lower(email));
  END IF;
END $$;

-- Os índices acima cobrem estes (único exato e busca por lower(email))
ALTER TABLE librishelf.users DROP CONSTRAINT IF EXISTS users_name_key;
ALTER TABLE librishelf.users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS librishelf.idx_users_email_lower;

-- Sessões encerradas em "Sair": o id do token (jti) fica aqui até o token
-- vencer (7 dias); depois disso o próprio JWT já é recusado e a linha sai.
CREATE TABLE IF NOT EXISTS librishelf.revoked_sessions (
  jti        text PRIMARY KEY CHECK (char_length(jti) <= 64),
  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_sessions_user ON librishelf.revoked_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_sessions_expires ON librishelf.revoked_sessions (expires_at);
