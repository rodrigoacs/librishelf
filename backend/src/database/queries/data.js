// Exportar, importar e backups.
// Parte de database/queries.js, que reexporta todos os grupos.

// Exportar / importar dados da conta.
export const DATA_QUERIES = {
  EXPORT_USER: `
    SELECT name, email, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           is_public, show_in_community, show_activity, allow_indexing, follow_emails,
           email_locale,
           email_verified_at IS NOT NULL AS email_verified,
           last_login_at, last_seen_at,
           avatar_version IS NOT NULL AS has_avatar, avatar_visibility
    FROM librishelf.users WHERE id = $1
  `,
  // Exportação (LGPD, art. 18, II e V): vínculos e ações da pessoa. Os outros
  // aparecem só pelo nome de usuário; conta excluída some pelo ON DELETE CASCADE.
  EXPORT_FOLLOWS: `
    SELECT CASE WHEN f.follower_id = $1 THEN 'following' ELSE 'follower' END AS direction,
           f.status, u.name AS username, f.created_at, f.accepted_at
    FROM librishelf.follows f
    JOIN librishelf.users u ON u.id = CASE WHEN f.follower_id = $1 THEN f.followee_id ELSE f.follower_id END
    WHERE f.follower_id = $1 OR f.followee_id = $1
    ORDER BY f.created_at, u.name
  `,
  EXPORT_BLOCKS: `
    SELECT u.name AS username, b.created_at
    FROM librishelf.blocks b JOIN librishelf.users u ON u.id = b.blocked_id
    WHERE b.blocker_id = $1
    ORDER BY b.created_at, u.name
  `,
  EXPORT_LIKES: `
    SELECT a.name AS author, bk.title AS book, l.created_at
    FROM librishelf.review_likes l
    JOIN librishelf.reviews r ON r.id = l.review_id
    JOIN librishelf.users a ON a.id = r.user_id
    JOIN librishelf.books bk ON bk.id = r.book_id
    WHERE l.user_id = $1
    ORDER BY l.created_at
  `,
  EXPORT_REPORTS: `
    SELECT a.name AS author, bk.title AS book, rr.reason, rr.note, rr.created_at
    FROM librishelf.review_reports rr
    JOIN librishelf.reviews r ON r.id = rr.review_id
    JOIN librishelf.users a ON a.id = r.user_id
    JOIN librishelf.books bk ON bk.id = r.book_id
    WHERE rr.reporter_id = $1
    ORDER BY rr.created_at
  `,
  EXPORT_GOALS: 'SELECT year, target FROM librishelf.reading_goals WHERE user_id = $1 ORDER BY year',
  EXPORT_BOOKS: `
    SELECT
      b.id,
      b.title,
      COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
        FROM librishelf.books_authors_link bal JOIN librishelf.authors a ON a.id = bal.author_id
        WHERE bal.book_id = b.id), '[]'::json) AS authors,
      p.name AS publisher,
      COALESCE((SELECT json_agg(t.name ORDER BY t.name)
        FROM librishelf.books_tags_link btl JOIN librishelf.tags t ON t.id = btl.tag_id
        WHERE btl.book_id = b.id), '[]'::json) AS tags,
      b.isbn,
      b.rating,
      CASE
        WHEN b.reading_status = 'reading' THEN 'reading'
        WHEN b.read_date IS NOT NULL THEN 'read'
        WHEN b.reading_status = 'want' THEN 'want'
        ELSE 'none'
      END AS status,
      to_char(b.read_date, 'YYYY-MM-DD') AS read_date,
      to_char(b.started_at, 'YYYY-MM-DD') AS started_at,
      to_char(b.publication_date, 'YYYY-MM-DD') AS publication_date,
      b.series,
      b.series_index,
      b.notes,
      b.page_count,
      -- Todas as leituras, da mais antiga para a mais recente
      COALESCE((SELECT json_agg(json_build_object(
          'startedOn', to_char(r.started_on, 'YYYY-MM-DD'),
          'finishedOn', to_char(r.finished_on, 'YYYY-MM-DD'),
          'rating', r.rating,
          'currentPage', r.current_page,
          'progressPercent', r.progress_percent)
          ORDER BY r.finished_on NULLS LAST, r.started_on, r.id)
        FROM librishelf.readings r WHERE r.book_id = b.id), '[]'::json) AS readings,
      (SELECT json_build_object('body', rv.body, 'hasSpoiler', rv.has_spoiler, 'visibility', rv.visibility)
        FROM librishelf.reviews rv WHERE rv.book_id = b.id) AS review,
      to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS added_at
    FROM librishelf.books b
    LEFT JOIN librishelf.publishers p ON p.id = b.publisher_id
    WHERE b.user_id = $1
    ORDER BY b.id
  `,
  // Para não importar o mesmo livro duas vezes.
  EXISTING_KEYS: `
    SELECT b.isbn13, lower(b.title) AS title,
           (SELECT lower(a.name) FROM librishelf.books_authors_link bal
              JOIN librishelf.authors a ON a.id = bal.author_id
            WHERE bal.book_id = b.id ORDER BY bal.position, a.id LIMIT 1) AS author
    FROM librishelf.books b WHERE b.user_id = $1
  `
}

// Importação em etapas (services/importService.js). Tudo menos o arquivo:
// content só é lido pelo job.
const IMPORT_COLUMNS = `
  id, user_id, status, format, filename, headers, mapping, include_want, total, processed, imported,
  duplicates, skipped_want, failed, rereads_undated, errors, covers_total, covers_done, covers_found,
  created_at, updated_at, started_at, finished_at
`

export const IMPORT_QUERIES = {
  INSERT_DRAFT: `
    INSERT INTO librishelf.imports (user_id, format, filename, content, headers, mapping, total)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${IMPORT_COLUMNS}
  `,

  GET: `SELECT ${IMPORT_COLUMNS}, content FROM librishelf.imports WHERE id = $1 AND user_id = $2`,

  LIST: `
    SELECT ${IMPORT_COLUMNS} FROM librishelf.imports
    WHERE user_id = $1 AND status <> 'draft'
    ORDER BY created_at DESC, id DESC
    LIMIT 5
  `,

  SET_MAPPING: `UPDATE librishelf.imports SET mapping = $2, updated_at = now() WHERE id = $1`,

  QUEUE: `
    UPDATE librishelf.imports
    SET status = 'queued', include_want = $2, mapping = $3, updated_at = now()
    WHERE id = $1 AND status = 'draft'
    RETURNING ${IMPORT_COLUMNS}
  `,

  // O job pega (ou retoma, se o worker caiu no meio)
  CLAIM: `
    UPDATE librishelf.imports
    SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE id = $1 AND status IN ('queued', 'running')
    RETURNING ${IMPORT_COLUMNS}, content
  `,

  PROGRESS: `
    UPDATE librishelf.imports
    SET processed = $2, imported = $3, duplicates = $4, skipped_want = $5, failed = $6,
        rereads_undated = $7, errors = $8, updated_at = now()
    WHERE id = $1
  `,

  FAIL: `
    UPDATE librishelf.imports
    SET status = 'failed', errors = $2, content = NULL, finished_at = now(), updated_at = now()
    WHERE id = $1
  `,

  FINISH: `
    UPDATE librishelf.imports
    SET status = 'done', content = NULL, finished_at = now(), updated_at = now(),
        covers_total = (SELECT count(*) FROM librishelf.import_covers WHERE import_id = $1)::int
    WHERE id = $1
    RETURNING covers_total
  `,

  ADD_COVER: `
    INSERT INTO librishelf.import_covers (import_id, book_id, isbn13) VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
  `,

  PENDING_COVERS: `
    SELECT ic.book_id, ic.isbn13, b.cover_version
    FROM librishelf.import_covers ic
    JOIN librishelf.books b ON b.id = ic.book_id
    WHERE ic.import_id = $1 AND NOT ic.done
    ORDER BY ic.book_id
    LIMIT $2
  `,

  COVER_DONE: `UPDATE librishelf.import_covers SET done = true, found = $3 WHERE import_id = $1 AND book_id = $2`,

  COUNT_COVERS: `
    UPDATE librishelf.imports i
    SET covers_total = c.total, covers_done = c.done, covers_found = c.found, updated_at = now()
    FROM (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE done)::int AS done,
             count(*) FILTER (WHERE found)::int AS found
      FROM librishelf.import_covers WHERE import_id = $1
    ) c
    WHERE i.id = $1
    RETURNING i.covers_total, i.covers_done
  `,

  DELETE: `DELETE FROM librishelf.imports WHERE id = $1`,

  CLEANUP: `
    DELETE FROM librishelf.imports
    WHERE status = 'draft' AND created_at < now() - make_interval(hours => $1)
  `
}

// ---------------------------------------------------------------------------
// Backup automático (pacote 30, Pro: auto_backup)
// ---------------------------------------------------------------------------
export const BACKUP_QUERIES = {
  SETTINGS: `
    SELECT enabled, frequency, notify, next_run_at FROM librishelf.backup_settings WHERE user_id = $1
  `,
  SAVE_SETTINGS: `
    INSERT INTO librishelf.backup_settings (user_id, enabled, frequency, notify, next_run_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id) DO UPDATE SET
      enabled = EXCLUDED.enabled, frequency = EXCLUDED.frequency, notify = EXCLUDED.notify,
      next_run_at = EXCLUDED.next_run_at, updated_at = now()
  `,
  SET_NEXT: 'UPDATE librishelf.backup_settings SET next_run_at = $2 WHERE user_id = $1',
  // Vencidos de quem tem Pro agora (sem Pro, o agendamento espera e nada é excluído)
  DUE: `
    SELECT s.user_id, s.next_run_at
    FROM librishelf.backup_settings s
    WHERE s.enabled AND s.next_run_at <= now()
      AND EXISTS (
        SELECT 1 FROM librishelf.entitlements e
        WHERE e.user_id = s.user_id AND e.status = 'active' AND e.starts_at <= now()
          AND (e.ends_at IS NULL OR e.ends_at > now())
      )
    ORDER BY s.next_run_at
    LIMIT 200
  `,
  LIST: `
    SELECT id, trigger, books, bytes, created_at FROM librishelf.backups
    WHERE user_id = $1 ORDER BY created_at DESC, id DESC
  `,
  ONE: 'SELECT id, user_id, created_at FROM librishelf.backups WHERE id = $1 AND user_id = $2',
  INSERT: `
    INSERT INTO librishelf.backups (user_id, trigger, books, bytes) VALUES ($1, $2, $3, $4)
    RETURNING id, trigger, books, bytes, created_at
  `,
  DELETE: 'DELETE FROM librishelf.backups WHERE id = $1 AND user_id = $2',
  // Os mais antigos além dos que ficam guardados
  OVERFLOW: `
    SELECT id FROM librishelf.backups WHERE user_id = $1
    ORDER BY created_at DESC, id DESC OFFSET $2
  `,
  EMAIL: `
    SELECT b.id, b.user_id, b.books, b.created_at, u.name, u.email, u.email_verified_at, u.email_locale,
           s.notify
    FROM librishelf.backups b
    JOIN librishelf.users u ON u.id = b.user_id
    LEFT JOIN librishelf.backup_settings s ON s.user_id = b.user_id
    WHERE b.id = $1
  `
}
