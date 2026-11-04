-- Pacote 29: personalização (Pro). Fica na conta para valer em todo aparelho
-- e para o perfil público mostrar a capa de fundo. Sem Pro, o que foi
-- escolhido continua valendo; só a troca é recusada.
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS ui_palette text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS ui_accent text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS app_icon text;
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS profile_cover_book_id integer
  REFERENCES librishelf.books(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_ui_palette_check' AND conrelid = 'librishelf.users'::regclass) THEN
    ALTER TABLE librishelf.users ADD CONSTRAINT users_ui_palette_check
      CHECK (ui_palette IS NULL OR ui_palette IN ('paper', 'amoled', 'slate', 'forest'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_ui_accent_check' AND conrelid = 'librishelf.users'::regclass) THEN
    ALTER TABLE librishelf.users ADD CONSTRAINT users_ui_accent_check
      CHECK (ui_accent IS NULL OR ui_accent IN ('teal', 'pink', 'indigo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_app_icon_check' AND conrelid = 'librishelf.users'::regclass) THEN
    ALTER TABLE librishelf.users ADD CONSTRAINT users_app_icon_check
      CHECK (app_icon IS NULL OR app_icon IN ('night', 'paper', 'mono'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_profile_cover ON librishelf.users (profile_cover_book_id) WHERE profile_cover_book_id IS NOT NULL;
