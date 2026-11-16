-- Métricas da página pública (pacote 41): quantas visitas cada /u/:usuario
-- recebe, quantos compartilham, quantos clicam em "Criar conta" ou "Entrar"
-- no convite e quantos se cadastram vindos dela. Só contagem por dono e por
-- dia: sem visitante, sem IP, sem cookie. A visita conta uma vez por sessão
-- do navegador (o frontend guarda o "já contei" em sessionStorage).
CREATE TABLE IF NOT EXISTS librishelf.public_page_daily (
  owner_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  day      date NOT NULL,
  event    text NOT NULL CHECK (event IN ('visit', 'share', 'invite_register', 'invite_login', 'signup')),
  count    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day, event)
);
CREATE INDEX IF NOT EXISTS public_page_daily_day ON librishelf.public_page_daily (day);
