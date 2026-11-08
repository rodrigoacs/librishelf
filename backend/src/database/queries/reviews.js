// Resenhas.
// Parte de database/queries.js, que reexporta todos os grupos.

import { SAME_BOOK, NOT_BLOCKED, AUTHORS_OF, AVATAR_FOR } from './fragments.js'

// ---------------------------------------------------------------------------
// Resenhas (migration 011)
// ---------------------------------------------------------------------------
// Quem vê a resenha r (autor u) sendo o leitor `viewer` (id ou NULL):
//   - public:    biblioteca do autor pública
//   - followers: leitor é seguidor aprovado (e o autor aceita seguidores)
//   - nunca:     oculta pela moderação, conta inativa, bloqueio entre os dois
const REVIEW_VISIBLE = viewer => `(
  r.hidden_at IS NULL AND u.is_active IS NOT FALSE
  AND (
    (r.visibility = 'public' AND u.is_public)
    OR (r.visibility = 'followers' AND ${viewer}::int IS NOT NULL AND u.show_activity AND EXISTS (
      SELECT 1 FROM librishelf.follows f
      WHERE f.follower_id = ${viewer}::int AND f.followee_id = u.id AND f.status = 'accepted'))
  )
  AND (${viewer}::int IS NULL OR ${NOT_BLOCKED('u.id', `${viewer}::int`)})
)`

const REVIEW_COLUMNS = viewer => `
  r.id, r.book_id, r.user_id, r.body, r.has_spoiler, r.visibility,
  (r.hidden_at IS NOT NULL) AS hidden,
  r.created_at, r.updated_at,
  u.name AS username, u.is_public, ${AVATAR_FOR('u', viewer)} AS avatar_version,
  b.title, b.rating, ${AUTHORS_OF('b.id')} AS authors,
  (SELECT count(*)::int FROM librishelf.review_likes l WHERE l.review_id = r.id) AS like_count,
  (${viewer}::int IS NOT NULL AND EXISTS (
    SELECT 1 FROM librishelf.review_likes l WHERE l.review_id = r.id AND l.user_id = ${viewer}::int)) AS liked_by_me
`

const REVIEW_FROM = `
  FROM librishelf.reviews r
  JOIN librishelf.users u ON u.id = r.user_id
  JOIN librishelf.books b ON b.id = r.book_id
`

export const REVIEW_QUERIES = {
  // A do próprio dono (vê mesmo oculta)
  OWN: `SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM} WHERE r.book_id = $1 AND r.user_id = $2`,
  UPSERT: `
    INSERT INTO librishelf.reviews (book_id, user_id, body, has_spoiler, visibility)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (book_id) DO UPDATE
      SET body = EXCLUDED.body, has_spoiler = EXCLUDED.has_spoiler,
          visibility = EXCLUDED.visibility, updated_at = now()
    RETURNING id
  `,
  DELETE_OWN: 'DELETE FROM librishelf.reviews WHERE book_id = $1 AND user_id = $2',
  // Livro aberto na biblioteca pública ($1 livro, $2 leitor ou NULL)
  OF_BOOK_FOR_VIEWER: `SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM} WHERE r.book_id = $1 AND ${REVIEW_VISIBLE('$2')}`,
  // Perfil público: as mais recentes do autor $1 que o leitor $2 pode ver
  OF_USER_FOR_VIEWER: `
    SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM}
    WHERE r.user_id = $1 AND ${REVIEW_VISIBLE('$2')}
    ORDER BY r.updated_at DESC, r.id DESC
    LIMIT $3
  `,
  COUNT_OF_USER_FOR_VIEWER: `SELECT count(*)::int AS total ${REVIEW_FROM} WHERE r.user_id = $1 AND ${REVIEW_VISIBLE('$2')}`,
  // Comunidade do livro $1 (do leitor $2): resenhas de outros leitores do mesmo
  // livro. Públicas só de quem participa da comunidade; "seguidores" para quem segue.
  OF_SAME_BOOK: `
    WITH me AS (
      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE id = $1 AND user_id = $2
    )
    SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM}
    JOIN me ON ${SAME_BOOK('me', 'b')}
    WHERE r.user_id <> $2 AND ${REVIEW_VISIBLE('$2')}
      AND (r.visibility = 'followers' OR u.show_in_community)
    ORDER BY like_count DESC, r.updated_at DESC
    LIMIT $3
  `,
  // Para curtir/denunciar: a resenha existe e o leitor pode vê-la
  VISIBLE_TO: `SELECT r.id, r.user_id ${REVIEW_FROM} WHERE r.id = $1 AND ${REVIEW_VISIBLE('$2')}`,
  LIKE: 'INSERT INTO librishelf.review_likes (review_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
  UNLIKE: 'DELETE FROM librishelf.review_likes WHERE review_id = $1 AND user_id = $2',
  LIKE_COUNT: 'SELECT count(*)::int AS total FROM librishelf.review_likes WHERE review_id = $1',
  REPORT: `
    INSERT INTO librishelf.review_reports (review_id, reporter_id, reason, note)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (review_id, reporter_id) DO NOTHING
    RETURNING id
  `,
  // Denúncias desde a última revisão (quem revisou e manteve "zera a conta").
  // total: todas; trusted: só as que contam para ocultar sozinho — de contas
  // com e-mail confirmado, ativas e criadas há mais de $2 dias (três contas
  // descartáveis não escondem a resenha de ninguém).
  OPEN_REPORTS: `
    SELECT count(DISTINCT rr.reporter_id)::int AS total,
           count(DISTINCT rr.reporter_id) FILTER (
             WHERE u.email_verified_at IS NOT NULL
               AND u.is_active IS NOT FALSE
               AND u.created_at < now() - make_interval(days => $2)
           )::int AS trusted
    FROM librishelf.review_reports rr
    JOIN librishelf.reviews r ON r.id = rr.review_id
    JOIN librishelf.users u ON u.id = rr.reporter_id
    WHERE rr.review_id = $1 AND (r.reviewed_at IS NULL OR rr.created_at > r.reviewed_at)
  `,
  AUTO_HIDE: `
    UPDATE librishelf.reviews SET hidden_at = now(), hidden_reason = 'reports'
    WHERE id = $1 AND hidden_at IS NULL
    RETURNING id
  `,
  // Moderação (link assinado no e-mail de denúncia)
  FOR_MODERATION: `SELECT ${REVIEW_COLUMNS('NULL')}, r.hidden_at, r.hidden_reason, r.reviewed_at ${REVIEW_FROM} WHERE r.id = $1`,
  REPORTS_OF: `
    SELECT rr.reason, rr.note, rr.created_at, u.name AS reporter
    FROM librishelf.review_reports rr
    JOIN librishelf.users u ON u.id = rr.reporter_id
    WHERE rr.review_id = $1
    ORDER BY rr.created_at DESC
    LIMIT 50
  `,
  HIDE: "UPDATE librishelf.reviews SET hidden_at = now(), hidden_reason = 'moderation', reviewed_at = now() WHERE id = $1 RETURNING id",
  SHOW: 'UPDATE librishelf.reviews SET hidden_at = NULL, hidden_reason = NULL, reviewed_at = now() WHERE id = $1 RETURNING id'
}
