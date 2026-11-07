-- Capa de fundo do perfil público por imagem enviada (Pro: personalization).
-- A capa é OU um livro da pessoa (profile_cover_book_id) OU uma imagem dela
-- (profile_cover_image_version, que vira ?v= na URL e muda a cada envio).
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS profile_cover_image_version integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_profile_cover_one_source' AND conrelid = 'librishelf.users'::regclass) THEN
    ALTER TABLE librishelf.users ADD CONSTRAINT users_profile_cover_one_source
      CHECK (profile_cover_book_id IS NULL OR profile_cover_image_version IS NULL);
  END IF;
END $$;
