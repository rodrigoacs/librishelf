-- 020 — registro de envios de e-mail (limite da caixa SMTP)
--
-- A Hostinger limita os envios por caixa numa janela móvel de 24 horas. Cada
-- e-mail enviado de verdade entra aqui; a fila de e-mails (job email.send) e
-- os avisos de seguidores contam esta tabela antes de enviar. Linhas com mais
-- de 2 dias saem na limpeza diária (jobs.cleanup).
--   https://www.hostinger.com/support/4625828-parameters-and-limits-of-hostinger-email/
CREATE TABLE IF NOT EXISTS librishelf.email_sends (
  id       bigserial PRIMARY KEY,
  kind     text NOT NULL CHECK (char_length(kind) <= 60),
  user_id  integer REFERENCES librishelf.users(id) ON DELETE SET NULL,
  sent_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_sent ON librishelf.email_sends (sent_at);
CREATE INDEX IF NOT EXISTS idx_email_sends_user ON librishelf.email_sends (user_id) WHERE user_id IS NOT NULL;
