-- 013 — área administrativa
-- Suspensão usa o is_active que já existe (as consultas públicas e a sessão
-- já recusam is_active = false); aqui só entram quando e por quê.
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS suspended_reason text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Registro do que foi feito pela administração. Nada da pessoa é copiado para
-- cá (excluir a conta apaga tudo, como diz a política): o alvo vira NULL e
-- details guarda só o motivo escrito pela administração.
CREATE TABLE IF NOT EXISTS librishelf.admin_actions (
  id               serial PRIMARY KEY,
  admin_id         integer REFERENCES librishelf.users(id) ON DELETE SET NULL,
  action           text NOT NULL CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate')),
  target_user_id   integer REFERENCES librishelf.users(id) ON DELETE SET NULL,
  target_review_id integer,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON librishelf.admin_actions (created_at DESC, id DESC);
