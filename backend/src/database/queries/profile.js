// Perfil, prévia pública, foto, personalização e página pública.
// Parte de database/queries.js, que reexporta todos os grupos.

import { AUTHORS_OF, AVATAR_FOR } from './fragments.js'

export const PROFILE_QUERIES = {
  STATS: `
    WITH ub AS (
      SELECT id, title, read_date, rating FROM librishelf.books WHERE user_id = $1
    )
    SELECT
      (SELECT count(*)::int FROM ub) AS total_books,
      (SELECT count(*)::int FROM ub WHERE read_date IS NOT NULL) AS read_books,
      (SELECT round(avg(rating)::numeric, 1)::float FROM ub WHERE rating IS NOT NULL) AS avg_rating,
      (SELECT count(*)::int FROM ub WHERE rating IS NOT NULL) AS rated_books,
      COALESCE((
        SELECT json_agg(y ORDER BY y.year)
        FROM (
          SELECT EXTRACT(YEAR FROM r.finished_on)::int AS year, count(*)::int AS count
          FROM librishelf.readings r JOIN ub ON ub.id = r.book_id
          WHERE r.finished_on IS NOT NULL GROUP BY 1
        ) y
      ), '[]'::json) AS reading_by_year,
      COALESCE((
        SELECT json_agg(a ORDER BY a.count DESC, a.name)
        FROM (
          SELECT a.name, count(DISTINCT ub.id)::int AS count
          FROM ub
          JOIN librishelf.books_authors_link bal ON bal.book_id = ub.id
          JOIN librishelf.authors a ON a.id = bal.author_id
          GROUP BY a.name ORDER BY count DESC, a.name LIMIT 5
        ) a
      ), '[]'::json) AS top_authors,
      COALESCE((
        SELECT json_agg(t ORDER BY t.count DESC, t.name)
        FROM (
          SELECT t.name, count(DISTINCT ub.id)::int AS count
          FROM ub
          JOIN librishelf.books_tags_link btl ON btl.book_id = ub.id
          JOIN librishelf.tags t ON t.id = btl.tag_id
          GROUP BY t.name ORDER BY count DESC, t.name LIMIT 5
        ) t
      ), '[]'::json) AS top_tags,
      COALESCE((
        SELECT json_agg(r ORDER BY r.read_date DESC, r.book_id DESC)
        FROM (
          SELECT ub.id AS book_id, ub.title, ub.rating, to_char(ub.read_date, 'YYYY-MM-DD') AS read_date,
                 ${AUTHORS_OF('ub.id')} AS authors
          FROM ub WHERE read_date IS NOT NULL
          ORDER BY read_date DESC, id DESC LIMIT 6
        ) r
      ), '[]'::json) AS recently_read
  `
}

// Prévia das bibliotecas públicas (Open Graph, metaService)
export const META_QUERIES = {
  LIBRARY_STATS: `
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE read_date IS NOT NULL)::int AS read,
           extract(epoch FROM max(coalesce(last_modified, created_at)))::bigint AS changed
    FROM librishelf.books WHERE user_id = $1
  `,
  // Candidatas a aparecer no mosaico: melhor avaliadas e lidas por último
  COVER_CANDIDATES: `
    SELECT id FROM librishelf.books
    WHERE user_id = $1
    ORDER BY rating DESC NULLS LAST, read_date DESC NULLS LAST, id DESC
    LIMIT $2
  `,
  // Capa nova muda a versão da imagem da prévia
  TOUCH_BOOK: 'UPDATE librishelf.books SET last_modified = now() WHERE id = $1'
}

// Foto de perfil (migration 017; services/avatarService.js)
export const AVATAR_QUERIES = {
  VISIBLE: `SELECT ${AVATAR_FOR('u', '$2')} AS avatar_version FROM librishelf.users u WHERE u.id = $1`,
  // Quem pede o arquivo: a foto de $1 (nome) que $2 (ou NULL) pode ver
  ACCESS_BY_NAME: `
    SELECT u.id, u.avatar_visibility, ${AVATAR_FOR('u', '$2')} AS avatar_version
    FROM librishelf.users u
    WHERE lower(u.name) = lower($1) AND u.is_active IS NOT FALSE
  `,
  SET: `
    UPDATE librishelf.users
    SET avatar_version = nextval('librishelf.avatar_version_seq'),
        avatar_visibility = COALESCE($2, avatar_visibility),
        avatar_hidden_at = NULL, avatar_hidden_reason = NULL, avatar_reviewed_at = NULL,
        updated_at = now()
    WHERE id = $1
    RETURNING avatar_version, avatar_visibility, avatar_hidden_at
  `,
  CLEAR: `
    UPDATE librishelf.users
    SET avatar_version = NULL, avatar_hidden_at = NULL, avatar_hidden_reason = NULL, avatar_reviewed_at = NULL,
        updated_at = now()
    WHERE id = $1
    RETURNING id
  `,
  SET_VISIBILITY: `
    UPDATE librishelf.users SET avatar_visibility = $2, updated_at = now()
    WHERE id = $1
    RETURNING avatar_version, avatar_visibility, avatar_hidden_at
  `,
  REPORT: `
    INSERT INTO librishelf.avatar_reports (user_id, avatar_version, reporter_id, reason, note)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, avatar_version, reporter_id) DO NOTHING
    RETURNING id
  `,
  // Mesma regra das resenhas: só contas confirmadas, ativas e com mais de $3
  // dias contam para ocultar sozinho; a revisão "zera a conta"
  OPEN_REPORTS: `
    SELECT count(DISTINCT ar.reporter_id)::int AS total,
           count(DISTINCT ar.reporter_id) FILTER (
             WHERE r.email_verified_at IS NOT NULL
               AND r.is_active IS NOT FALSE
               AND r.created_at < now() - make_interval(days => $3)
           )::int AS trusted
    FROM librishelf.avatar_reports ar
    JOIN librishelf.users o ON o.id = ar.user_id
    JOIN librishelf.users r ON r.id = ar.reporter_id
    WHERE ar.user_id = $1 AND ar.avatar_version = $2
      AND (o.avatar_reviewed_at IS NULL OR ar.created_at > o.avatar_reviewed_at)
  `,
  AUTO_HIDE: `
    UPDATE librishelf.users SET avatar_hidden_at = now(), avatar_hidden_reason = 'reports'
    WHERE id = $1 AND avatar_version = $2 AND avatar_hidden_at IS NULL
    RETURNING id
  `,
  BY_VERSION: `
    SELECT id, name, avatar_version, avatar_visibility, avatar_hidden_at, avatar_hidden_reason, avatar_reviewed_at,
           (is_active IS NOT FALSE) AS active
    FROM librishelf.users WHERE avatar_version = $1
  `,
  BY_USER: `
    SELECT id, name, avatar_version, avatar_visibility, avatar_hidden_at, avatar_hidden_reason, avatar_reviewed_at,
           (is_active IS NOT FALSE) AS active
    FROM librishelf.users WHERE id = $1
  `,
  REPORTS_OF: `
    SELECT ar.reason, ar.note, ar.created_at, u.name AS reporter
    FROM librishelf.avatar_reports ar
    JOIN librishelf.users u ON u.id = ar.reporter_id
    WHERE ar.user_id = $1 AND ar.avatar_version = $2
    ORDER BY ar.created_at DESC
  `,
  KEEP: `
    UPDATE librishelf.users SET avatar_hidden_at = NULL, avatar_hidden_reason = NULL, avatar_reviewed_at = now()
    WHERE id = $1 AND avatar_version IS NOT NULL
    RETURNING id
  `,
  // Fila da área administrativa: fotos atuais com denúncias (abertas, ocultas ou todas)
  QUEUE: `
    SELECT u.id, u.name AS username, u.avatar_version, u.avatar_hidden_at, u.avatar_hidden_reason, u.avatar_reviewed_at,
           (u.is_active IS NOT FALSE) AS active,
           rep.open_count, rep.total_count, rep.last_report_at, rep.reasons
    FROM librishelf.users u
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE u.avatar_reviewed_at IS NULL OR ar.created_at > u.avatar_reviewed_at)::int AS open_count,
             count(*)::int AS total_count,
             max(ar.created_at) AS last_report_at,
             COALESCE(array_agg(DISTINCT ar.reason) FILTER (WHERE ar.reason IS NOT NULL), '{}') AS reasons
      FROM librishelf.avatar_reports ar
      WHERE ar.user_id = u.id AND ar.avatar_version = u.avatar_version
    ) rep
    WHERE u.avatar_version IS NOT NULL AND (rep.total_count > 0 OR u.avatar_hidden_at IS NOT NULL)
      AND CASE $1
            WHEN 'open' THEN rep.open_count > 0
            WHEN 'hidden' THEN u.avatar_hidden_at IS NOT NULL
            ELSE true
          END
    ORDER BY rep.open_count > 0 DESC, rep.last_report_at DESC NULLS LAST, u.id DESC
    LIMIT 100
  `
}

// ---------------------------------------------------------------------------
// Personalização (pacote 29, Pro: personalization)
// ---------------------------------------------------------------------------
export const PERSONALIZATION_QUERIES = {
  GET: `
    SELECT u.ui_palette, u.ui_accent, u.app_icon, u.profile_cover_book_id, b.cover_version AS profile_cover_version,
           u.profile_cover_image_version
    FROM librishelf.users u
    LEFT JOIN librishelf.books b ON b.id = u.profile_cover_book_id AND b.user_id = u.id
    WHERE u.id = $1
  `,
  // $2..$5: valor novo; $6..$9: mudar aquele campo? Mudar a capa (livro ou
  // nenhuma) sempre tira a imagem enviada. Devolve se havia imagem (para
  // apagar o arquivo).
  UPDATE: `
    UPDATE librishelf.users u SET
      ui_palette = CASE WHEN $6 THEN $2 ELSE u.ui_palette END,
      ui_accent = CASE WHEN $7 THEN $3 ELSE u.ui_accent END,
      app_icon = CASE WHEN $8 THEN $4 ELSE u.app_icon END,
      profile_cover_book_id = CASE WHEN $9 THEN $5::int ELSE u.profile_cover_book_id END,
      profile_cover_image_version = CASE WHEN $9 THEN NULL ELSE u.profile_cover_image_version END
    FROM librishelf.users old
    WHERE u.id = $1 AND old.id = u.id
    RETURNING old.profile_cover_image_version AS had_image
  `,
  // Imagem enviada: nova versão (fura o cache) e o livro sai
  SET_IMAGE: `
    UPDATE librishelf.users
    SET profile_cover_image_version = COALESCE(profile_cover_image_version, 0) + 1,
        profile_cover_book_id = NULL
    WHERE id = $1
  `,
  // Arquivo da imagem: quem pode ver (biblioteca pública ou a própria pessoa)
  IMAGE_ACCESS: `
    SELECT u.id, u.is_public, u.profile_cover_image_version
    FROM librishelf.users u
    WHERE lower(u.name) = lower($1) AND u.is_active IS NOT FALSE AND u.profile_cover_image_version IS NOT NULL
  `,
  BOOK_WITH_COVER: 'SELECT id FROM librishelf.books WHERE id = $1 AND user_id = $2 AND cover_version IS NOT NULL',
  COVERS: `
    SELECT id, title, cover_version FROM librishelf.books
    WHERE user_id = $1 AND cover_version IS NOT NULL
    ORDER BY lower(title), id
    LIMIT 300
  `,
  // Capa de fundo no perfil público: imagem enviada, ou livro da própria
  // pessoa e com capa
  PUBLIC_COVER: `
    SELECT u.profile_cover_image_version, b.id, b.cover_version
    FROM librishelf.users u
    LEFT JOIN librishelf.books b ON b.id = u.profile_cover_book_id AND b.user_id = u.id AND b.cover_version IS NOT NULL
    WHERE u.id = $1
  `
}

// ------------------------------------------------------------------ página pública (pacote 33)
export const PROFILE_PAGE_QUERIES = {
  BIO: `
    SELECT bio, bio_version, bio_hidden_at, bio_hidden_reason, email_verified_at
    FROM librishelf.users WHERE id = $1
  `,
  // Bio nova (ou nenhuma): nova versão, denúncias da anterior deixam de valer
  SET_BIO: `
    UPDATE librishelf.users
    SET bio = $2,
        bio_version = CASE WHEN $2::text IS NULL THEN NULL ELSE COALESCE(bio_version, 0) + 1 END,
        bio_hidden_at = NULL, bio_hidden_reason = NULL, bio_reviewed_at = NULL
    WHERE id = $1
    RETURNING bio, bio_version
  `,
  FAVORITES: `
    SELECT b.id AS book_id, b.title, b.cover_version, ${AUTHORS_OF('b.id')} AS authors
    FROM librishelf.profile_favorites f
    JOIN librishelf.books b ON b.id = f.book_id AND b.user_id = f.user_id
    WHERE f.user_id = $1
    ORDER BY f.position
  `,
  OWNED_BOOKS: 'SELECT id FROM librishelf.books WHERE user_id = $1 AND id = ANY($2::int[])',
  CLEAR_FAVORITES: 'DELETE FROM librishelf.profile_favorites WHERE user_id = $1',
  ADD_FAVORITES: `
    INSERT INTO librishelf.profile_favorites (user_id, book_id, position)
    SELECT $1, book_id, (ord - 1)::smallint
    FROM unnest($2::int[]) WITH ORDINALITY AS t(book_id, ord)
  `,
  // Lendo agora: até 3, o progresso mais recente primeiro
  READING: `
    SELECT b.id AS book_id, b.title, b.cover_version, b.page_count, ${AUTHORS_OF('b.id')} AS authors,
           r.current_page, r.progress_percent
    FROM librishelf.books b
    LEFT JOIN librishelf.readings r ON r.book_id = b.id AND r.finished_on IS NULL
    WHERE b.user_id = $1 AND b.reading_status = 'reading'
    ORDER BY r.progress_updated_at DESC NULLS LAST, r.started_on DESC NULLS LAST, b.id DESC
    LIMIT 3
  `,
  // Denúncias de bio: mesma régua da foto (contas confirmadas, ativas, com mais de $3 dias)
  REPORT: `
    INSERT INTO librishelf.bio_reports (user_id, bio_version, reporter_id, reason, note)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, bio_version, reporter_id) DO NOTHING
    RETURNING id
  `,
  OPEN_REPORTS: `
    SELECT count(DISTINCT br.reporter_id)::int AS total,
           count(DISTINCT br.reporter_id) FILTER (
             WHERE r.email_verified_at IS NOT NULL
               AND r.is_active IS NOT FALSE
               AND r.created_at < now() - make_interval(days => $3)
           )::int AS trusted
    FROM librishelf.bio_reports br
    JOIN librishelf.users o ON o.id = br.user_id
    JOIN librishelf.users r ON r.id = br.reporter_id
    WHERE br.user_id = $1 AND br.bio_version = $2
      AND (o.bio_reviewed_at IS NULL OR br.created_at > o.bio_reviewed_at)
  `,
  AUTO_HIDE: `
    UPDATE librishelf.users SET bio_hidden_at = now(), bio_hidden_reason = 'reports'
    WHERE id = $1 AND bio_version = $2 AND bio_hidden_at IS NULL
    RETURNING id
  `,
  // Fila do admin: open (denúncia depois da última revisão) | hidden | all
  QUEUE: `
    SELECT u.id, u.name AS username, u.bio, u.bio_version, u.bio_hidden_at, u.bio_hidden_reason,
           u.bio_reviewed_at, (u.is_active IS NOT FALSE) AS active,
           count(br.id) FILTER (WHERE u.bio_reviewed_at IS NULL OR br.created_at > u.bio_reviewed_at)::int AS open_count,
           count(br.id)::int AS total_count,
           max(br.created_at) AS last_report_at,
           array_agg(DISTINCT br.reason) AS reasons
    FROM librishelf.users u
    JOIN librishelf.bio_reports br ON br.user_id = u.id AND br.bio_version = u.bio_version
    WHERE u.bio IS NOT NULL
    GROUP BY u.id
    HAVING CASE $1
      WHEN 'open' THEN count(br.id) FILTER (WHERE u.bio_reviewed_at IS NULL OR br.created_at > u.bio_reviewed_at) > 0
      WHEN 'hidden' THEN u.bio_hidden_at IS NOT NULL
      ELSE true
    END
    ORDER BY max(br.created_at) DESC
    LIMIT 200
  `,
  KEEP: `
    UPDATE librishelf.users SET bio_hidden_at = NULL, bio_hidden_reason = NULL, bio_reviewed_at = now()
    WHERE id = $1 AND bio IS NOT NULL
    RETURNING id
  `,
  CLEAR: `
    UPDATE librishelf.users
    SET bio = NULL, bio_version = NULL, bio_hidden_at = NULL, bio_hidden_reason = NULL, bio_reviewed_at = now()
    WHERE id = $1
    RETURNING id
  `
}
