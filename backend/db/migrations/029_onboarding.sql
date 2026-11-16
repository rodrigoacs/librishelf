-- Onboarding (pacote 42): primeiros passos depois de confirmar o e-mail.
-- Quem já tinha conta entra como 'done' (não vê o onboarding); conta nova
-- começa 'pending'. 'skipped' = pulou, pode retomar pelo Início.
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'done'
  CHECK (onboarding_status IN ('pending', 'skipped', 'done'));
ALTER TABLE librishelf.users ALTER COLUMN onboarding_status SET DEFAULT 'pending';
-- Passo em que parou: start (como começar), books (3 primeiros), public (biblioteca pública), finish
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'start'
  CHECK (onboarding_step IN ('start', 'books', 'public', 'finish'));
-- Como preferiu começar: importar (Goodreads/CSV), código de barras ou busca por título
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS onboarding_start text
  CHECK (onboarding_start IN ('import', 'scan', 'search'));
