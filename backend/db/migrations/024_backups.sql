-- Pacote 30: backup automático (Pro: auto_backup). O conteúdo é o mesmo da
-- exportação JSON; o arquivo (gzip) fica em BACKUP_DIR/{usuário}/{id}.json.gz
CREATE TABLE IF NOT EXISTS librishelf.backup_settings (
  user_id      integer PRIMARY KEY REFERENCES librishelf.users(id) ON DELETE CASCADE,
  enabled      boolean NOT NULL DEFAULT false,
  frequency    text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),
  notify       boolean NOT NULL DEFAULT true,
  next_run_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_settings_due ON librishelf.backup_settings (next_run_at) WHERE enabled;

CREATE TABLE IF NOT EXISTS librishelf.backups (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  trigger     text NOT NULL CHECK (trigger IN ('scheduled', 'manual')),
  books       integer NOT NULL,
  bytes       integer NOT NULL CHECK (bytes > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backups_user ON librishelf.backups (user_id, created_at DESC);
