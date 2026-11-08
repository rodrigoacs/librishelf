// Livros da estante, autores, editoras e categorias.
// Parte de database/queries.js, que reexporta todos os grupos.

export const LIBRARY_QUERIES = {
  BASE_SELECT: `
    SELECT
      b.id AS book_id,
      b.title,
      u.name AS user_owner,
      p.name AS publisher_name, -- Alias essencial
      (SELECT STRING_AGG(a.name, ', ' ORDER BY bal.position, a.id)
       FROM librishelf.books_authors_link AS bal
       JOIN librishelf.authors AS a ON bal.author_id = a.id
       WHERE bal.book_id = b.id
      ) AS authors,
      -- Lista de verdade: nomes podem conter vírgula, então "authors" (texto
      -- para exibir) não serve para editar nem filtrar.
      COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
       FROM librishelf.books_authors_link AS bal
       JOIN librishelf.authors AS a ON bal.author_id = a.id
       WHERE bal.book_id = b.id
      ), '[]'::json) AS author_names,
      (SELECT STRING_AGG(t.name, ', ' ORDER BY t.name)
       FROM librishelf.books_tags_link AS btl
       JOIN librishelf.tags AS t ON btl.tag_id = t.id
       WHERE btl.book_id = b.id
      ) AS tags,
      COALESCE((SELECT json_agg(t.name ORDER BY t.name)
       FROM librishelf.books_tags_link AS btl
       JOIN librishelf.tags AS t ON btl.tag_id = t.id
       WHERE btl.book_id = b.id
      ), '[]'::json) AS tag_names,
      b.isbn,
      b.isbn13,
      (b.isbn IS NULL OR btrim(b.isbn) = '' OR b.isbn13 IS NOT NULL) AS isbn_valid,
      b.rating,
      b.ol_work_key,
      b.created_at,
      b.read_date,
      b.reading_status,
      b.started_at,
      b.page_count,
      -- Leituras (migration 009): concluídas e progresso da que está em andamento
      (SELECT count(*)::int FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NOT NULL) AS read_count,
      (SELECT r.current_page FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NULL) AS current_page,
      (SELECT r.progress_percent FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NULL) AS progress_percent,
      b.series,
      b.series_index,
      b.publication_date,
      -- Capa (migration 016): null = sem capa; o número entra como ?v= na URL
      b.cover_version
    FROM
      librishelf.books AS b
      LEFT JOIN librishelf.users AS u ON b.user_id = u.id
      LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
  `,

  GET_BOOK_BY_ID_FOR_USER: `
    SELECT
      b.id, -- Frontend aceita 'id' ou 'book_id', aqui retorna 'id'
      b.title,
      b.isbn,
      b.isbn13,
      (b.isbn IS NULL OR btrim(b.isbn) = '' OR b.isbn13 IS NOT NULL) AS isbn_valid,
      b.rating,
      b.ol_work_key,
      b.ol_edition_key,
      b.read_date,
      b.reading_status,
      b.started_at,
      b.page_count,
      -- Leituras (migration 009): concluídas e progresso da que está em andamento
      (SELECT count(*)::int FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NOT NULL) AS read_count,
      (SELECT r.current_page FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NULL) AS current_page,
      (SELECT r.progress_percent FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NULL) AS progress_percent,
      b.series,
      b.series_index,
      b.notes,
      b.publication_date,
      b.cover_version,
      p.name AS publisher_name, -- O Frontend procura por .publisher_name
      (SELECT STRING_AGG(a.name, ', ' ORDER BY bal.position, a.id)
       FROM librishelf.books_authors_link AS bal
       JOIN librishelf.authors AS a ON bal.author_id = a.id
       WHERE bal.book_id = b.id
      ) AS authors,
      -- Lista de verdade: nomes podem conter vírgula, então "authors" (texto
      -- para exibir) não serve para editar nem filtrar.
      COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
       FROM librishelf.books_authors_link AS bal
       JOIN librishelf.authors AS a ON bal.author_id = a.id
       WHERE bal.book_id = b.id
      ), '[]'::json) AS author_names,
      (SELECT STRING_AGG(t.name, ', ' ORDER BY t.name)
       FROM librishelf.books_tags_link AS btl
       JOIN librishelf.tags AS t ON btl.tag_id = t.id
       WHERE btl.book_id = b.id
      ) AS tags,
      COALESCE((SELECT json_agg(t.name ORDER BY t.name)
       FROM librishelf.books_tags_link AS btl
       JOIN librishelf.tags AS t ON btl.tag_id = t.id
       WHERE btl.book_id = b.id
      ), '[]'::json) AS tag_names
    FROM librishelf.books AS b
    LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
    WHERE b.id = $1 AND b.user_id = $2
  `,

  // Quem pode ver a capa: o dono, ou qualquer um se a biblioteca for pública.
  COVER_ACCESS: `
    SELECT b.user_id, (u.is_public AND u.is_active IS NOT FALSE) AS is_public
    FROM librishelf.books b
    JOIN librishelf.users u ON u.id = b.user_id
    WHERE b.id = $1
  `,
  GET_OWNER: 'SELECT user_id FROM librishelf.books WHERE id = $1',
  // Capa nova gravada: versão nova (vira ?v= na URL) e prévia pública atualizada
  MARK_COVER: `
    UPDATE librishelf.books
    SET cover_version = nextval('librishelf.cover_version_seq')::int, last_modified = now()
    WHERE id = $1
    RETURNING cover_version
  `,
  FIND_BY_ISBN: 'SELECT * FROM librishelf.books WHERE isbn = $1 AND user_id = $2',
  DELETE_BOOK: 'DELETE FROM librishelf.books WHERE id = $1',
  UPDATE_EXTRAS: 'UPDATE librishelf.books SET series = $1, series_index = $2, notes = $3, page_count = $4 WHERE id = $5',
  GET_EXTRAS: 'SELECT series, series_index, notes, page_count FROM librishelf.books WHERE id = $1',
  SERIES_BY_USER: `
    SELECT min(series) AS name, COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE read_date IS NOT NULL)::int AS read
    FROM librishelf.books
    WHERE user_id = $1 AND series IS NOT NULL
    GROUP BY lower(series)
    ORDER BY lower(min(series))
  `,
  OWNED_IDS: 'SELECT id FROM librishelf.books WHERE user_id = $1 AND id = ANY($2::int[])',
  ENSURE_TAG: `
    WITH ins AS (
      INSERT INTO librishelf.tags (name, user_id) VALUES ($1, $2)
      ON CONFLICT (user_id, (lower(name))) DO NOTHING
      RETURNING id
    )
    SELECT id FROM ins
    UNION ALL
    SELECT id FROM librishelf.tags WHERE user_id = $2 AND lower(name) = lower($1)
    LIMIT 1
  `,
  BATCH_ADD_TAG: `
    INSERT INTO librishelf.books_tags_link (book_id, tag_id)
    SELECT unnest($1::int[]), $2
    ON CONFLICT (book_id, tag_id) DO NOTHING
  `,
  BATCH_REMOVE_TAG: `
    DELETE FROM librishelf.books_tags_link btl
    USING librishelf.tags t
    WHERE btl.tag_id = t.id AND t.user_id = $2 AND lower(t.name) = lower($3)
      AND btl.book_id = ANY($1::int[])
  `,
  BATCH_DELETE: 'DELETE FROM librishelf.books WHERE id = ANY($1::int[])',
  ADD_BOOK_FUNC: 'SELECT librishelf.add_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS book_id',
  UPDATE_BOOK_FUNC: 'SELECT librishelf.update_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
  UPDATE_RATING: 'UPDATE librishelf.books SET rating = $1, last_modified = now() WHERE id = $2 RETURNING rating',
  PRUNE_USER_NAMES: 'SELECT librishelf.prune_user_names($1)',
  // Mosaico do login/cadastro: só livros de quem tornou a biblioteca pública.
  RANDOM_PUBLIC_BOOK_IDS: `
    SELECT b.id
    FROM librishelf.books b
    JOIN librishelf.users u ON u.id = b.user_id
    WHERE u.is_public = true AND u.is_active IS NOT FALSE AND b.cover_version IS NOT NULL
    ORDER BY random()
    LIMIT $1
  `
}

export const AUTHOR_QUERIES = {
  GET_AUTHORS_BY_USER: `
    SELECT a.name, COUNT(DISTINCT b.id)::int AS count,
           COUNT(DISTINCT b.id) FILTER (WHERE b.read_date IS NOT NULL)::int AS read
    FROM librishelf.authors a
    JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
    JOIN librishelf.books b ON b.id = bal.book_id
    WHERE a.user_id = $1
    GROUP BY a.name
    ORDER BY a.name ASC
  `,
  GET_AUTHORS_BY_USER_AND_PUBLISHERS: `
    SELECT a.name, COUNT(DISTINCT b.id)::int AS count
    FROM librishelf.authors a
    JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
    JOIN librishelf.books b ON bal.book_id = b.id
    JOIN librishelf.publishers p ON b.publisher_id = p.id
    WHERE a.user_id = $1 AND p.name = ANY($2)
    GROUP BY a.name
    ORDER BY a.name ASC
  `
}

export const PUBLISHER_QUERIES = {
  GET_PUBLISHERS_BY_USER: `
    SELECT p.name, COUNT(DISTINCT b.id)::int AS count,
           COUNT(DISTINCT b.id) FILTER (WHERE b.read_date IS NOT NULL)::int AS read
    FROM librishelf.publishers p
    JOIN librishelf.books b ON b.publisher_id = p.id
    WHERE p.user_id = $1
    GROUP BY p.name
    ORDER BY p.name ASC
  `,
  GET_PUBLISHERS_BY_USER_AND_AUTHORS: `
    SELECT p.name, COUNT(DISTINCT b.id)::int AS count
    FROM librishelf.publishers p
    JOIN librishelf.books b ON p.id = b.publisher_id
    JOIN librishelf.books_authors_link bal ON b.id = bal.book_id
    JOIN librishelf.authors a ON bal.author_id = a.id
    WHERE p.user_id = $1 AND a.name = ANY($2)
    GROUP BY p.name
    ORDER BY p.name ASC
  `
}

export const TAG_QUERIES = {
  GET_TAGS_BY_USER: `
    SELECT t.name, COUNT(DISTINCT b.id)::int AS count,
           COUNT(DISTINCT b.id) FILTER (WHERE b.read_date IS NOT NULL)::int AS read
    FROM librishelf.tags t
    JOIN librishelf.books_tags_link btl ON t.id = btl.tag_id
    JOIN librishelf.books b ON b.id = btl.book_id
    WHERE t.user_id = $1
    GROUP BY t.name
    ORDER BY t.name ASC
  `
}
