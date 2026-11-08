// Trechos de SQL usados por mais de um domínio (comunidade, resenhas, perfil, listas…).
// Parte de database/queries.js, que reexporta todos os grupos.

// ---------------------------------------------------------------------------
// Comunidade — livros "iguais" entre usuários: mesma obra do Open Library ou
// mesmo ISBN-13. Só entram usuários com biblioteca pública E que ligaram
// "aparecer para outros leitores" (show_in_community).
// ---------------------------------------------------------------------------
export const SAME_BOOK = (a, b) => `(
  (${a}.ol_work_key IS NOT NULL AND ${b}.ol_work_key = ${a}.ol_work_key)
  OR (${a}.isbn13 IS NOT NULL AND ${b}.isbn13 = ${a}.isbn13)
)`

// Nenhum dos dois bloqueou o outro (tabela librishelf.blocks, migration 007).
export const NOT_BLOCKED = (a, b) => `NOT EXISTS (
  SELECT 1 FROM librishelf.blocks bl
  WHERE (bl.blocker_id = ${a} AND bl.blocked_id = ${b}) OR (bl.blocker_id = ${b} AND bl.blocked_id = ${a})
)`

export const AUTHORS_OF = (bookExpr) => `(
  SELECT string_agg(a.name, ', ' ORDER BY bal.position, a.id)
  FROM librishelf.books_authors_link bal
  JOIN librishelf.authors a ON a.id = bal.author_id
  WHERE bal.book_id = ${bookExpr}
)`

/**
 * Versão da foto de perfil de u que quem vê (viewer) pode ver, ou null (a
 * inicial no lugar): sem foto, foto ocultada por denúncia ou conta suspensa
 * → null; a própria pessoa sempre vê; 'everyone' → todos; 'followers' → só
 * quem segue com pedido aceito; 'nobody' → só a própria pessoa.
 * viewer pode ser 'NULL' (sem login, e-mail de moderação): só 'everyone'.
 */

export const AVATAR_FOR = (u, viewer) => `(CASE
    WHEN ${u}.avatar_version IS NULL OR ${u}.avatar_hidden_at IS NOT NULL OR ${u}.is_active IS FALSE THEN NULL
    WHEN ${u}.id = ${viewer}::int THEN ${u}.avatar_version
    WHEN ${u}.avatar_visibility = 'everyone' THEN ${u}.avatar_version
    WHEN ${u}.avatar_visibility = 'followers' AND EXISTS (
      SELECT 1 FROM librishelf.follows af
      WHERE af.follower_id = ${viewer}::int AND af.followee_id = ${u}.id AND af.status = 'accepted'
    ) THEN ${u}.avatar_version
    ELSE NULL
  END)`
