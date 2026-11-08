-- Erros (pacote 37): navegador, erros 500 da API, jobs que desistiram,
-- webhooks do Mercado Pago que falharam e violações de CSP, num lugar só.
--
-- Uma linha por assinatura (origem + mensagem normalizada + onde): repetir o
-- erro só soma em occurrences e atualiza last_seen_at. Nada de dados
-- pessoais: sem usuário, sem IP, URLs sem query (errorReportService.js).
CREATE TABLE IF NOT EXISTS librishelf.error_reports (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL CHECK (source IN ('client', 'server', 'worker', 'webhook', 'csp')),
  signature     text NOT NULL UNIQUE,
  message       text NOT NULL,
  location      text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrences   integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  -- Último resumo por e-mail que já incluiu este erro
  notified_at   timestamptz,
  -- Marcado como resolvido no Admin; voltar a acontecer reabre
  resolved_at   timestamptz
);
CREATE INDEX IF NOT EXISTS error_reports_last_seen ON librishelf.error_reports (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS error_reports_open ON librishelf.error_reports (last_seen_at DESC) WHERE resolved_at IS NULL;

-- Marcar como resolvido entra no registro do admin
ALTER TABLE librishelf.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE librishelf.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate', 'user.resend_verification', 'email.test',
                    'avatar.keep', 'avatar.remove', 'bio.keep', 'bio.remove',
                    'pro.grant', 'pro.revoke', 'payment.refund', 'webhook.reprocess', 'offer.update',
                    'error.resolve'));
