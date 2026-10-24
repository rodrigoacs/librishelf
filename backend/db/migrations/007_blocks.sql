-- 007 — bloquear leitores
-- Idempotente: pode rodar mais de uma vez.
--
-- Quem bloqueia some para o bloqueado (e vice-versa) na comunidade: "quem tem
-- este livro", busca de leitores, recomendações e pedidos para seguir. Ao
-- bloquear, os vínculos de seguir entre os dois são apagados.
CREATE TABLE IF NOT EXISTS librishelf.blocks (
  blocker_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  blocked_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
);

-- A checagem é nos dois sentidos: o índice cobre a busca por quem foi bloqueado.
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON librishelf.blocks (blocked_id, blocker_id);
