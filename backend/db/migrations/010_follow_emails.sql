-- 010 — aviso por e-mail de seguidores
-- Idempotente: pode rodar mais de uma vez.
--
-- Opt-in na Conta: e-mail quando alguém pede para seguir e quando aceitam
-- o seu pedido. No máximo um e-mail a cada N horas por pessoa (padrão 6);
-- o que acontece no intervalo vai junto no próximo (fila abaixo).
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS follow_emails boolean NOT NULL DEFAULT false;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS follow_email_sent_at timestamptz;
-- Idioma dos avisos (o do app quando a pessoa ligou a opção)
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS email_locale text NOT NULL DEFAULT 'pt';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_locale_check' AND conrelid = 'librishelf.users'::regclass
  ) THEN
    ALTER TABLE librishelf.users
      ADD CONSTRAINT users_email_locale_check CHECK (email_locale IN ('pt', 'en'));
  END IF;
END $$;

-- Avisos esperando o próximo e-mail. Saem da fila quando o e-mail vai, ou
-- quando deixam de valer (pedido cancelado/recusado, bloqueio, opção desligada).
CREATE TABLE IF NOT EXISTS librishelf.follow_email_queue (
  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('request', 'accepted')),
  actor_id   integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, actor_id)
);
