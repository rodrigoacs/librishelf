-- 016 — versão da capa no livro; índices das chaves usadas pelo ON DELETE CASCADE
--
-- books.cover_version: null = livro sem capa (o app desenha uma e não pede a
-- imagem ao servidor); um número = tem capa, e o número entra como ?v= na URL
-- para furar o cache quando a capa é trocada. Cada capa gravada recebe o
-- próximo número da sequência, que nunca se repete.
--
-- Esta migration só cria a coluna (vazia). O migrate.js, logo depois dela e na
-- mesma transação, preenche a coluna a partir dos arquivos {id}.avif/{id}.jpg
-- da pasta de capas (UPLOAD_DIR). Para refazer essa conferência depois (pasta
-- restaurada de backup, por exemplo): npm run covers:sync (ou covers:sync:docker).
CREATE SEQUENCE IF NOT EXISTS librishelf.cover_version_seq AS integer;

ALTER TABLE librishelf.books ADD COLUMN IF NOT EXISTS cover_version integer;

-- Sem índice, apagar uma conta ou uma editora percorre a tabela inteira
-- procurando as linhas a apagar (ou a anular) em cascata.
CREATE INDEX IF NOT EXISTS idx_review_likes_user ON librishelf.review_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_review_reports_reporter ON librishelf.review_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_follow_email_queue_actor ON librishelf.follow_email_queue (actor_id);
CREATE INDEX IF NOT EXISTS idx_books_publisher ON librishelf.books (publisher_id) WHERE publisher_id IS NOT NULL;
