-- 014 — área administrativa: último acesso, contadores de uso e novas ações
-- Último acesso (não só login: a sessão dura 7 dias). Gravado no máximo 1x/hora.
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Contadores agregados por dia (sem usuário, sem IP): buscas no Open Library,
-- leitura por câmera, importações, limites atingidos...
CREATE TABLE IF NOT EXISTS librishelf.usage_counters (
  day   date NOT NULL,
  event text NOT NULL CHECK (char_length(event) <= 60),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);

ALTER TABLE librishelf.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE librishelf.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate', 'user.resend_verification', 'email.test'));
