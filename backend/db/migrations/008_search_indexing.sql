-- 008 — aparecer em buscadores
-- Idempotente: pode rodar mais de uma vez.
--
-- Bibliotecas públicas ficam fora dos buscadores (noindex) a menos que o dono
-- ligue esta opção na Conta. Só vale enquanto a biblioteca for pública.
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS allow_indexing boolean NOT NULL DEFAULT false;
