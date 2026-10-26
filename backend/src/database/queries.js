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
      b.publication_date
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
    WHERE u.is_public = true AND u.is_active IS NOT FALSE
    ORDER BY random()
    LIMIT $1
  `
}

export const AUTH_QUERIES = {
  FIND_USER_BY_USERNAME: `
    SELECT id, name, password_hash, email, is_active
    FROM librishelf.users
    WHERE name = $1 OR email = $1
  `,
  // Só por nome (sem e-mail), usado nas rotas públicas. Conta suspensa
  // responde como inexistente.
  FIND_USER_BY_NAME: `
    SELECT id, name, is_public, show_in_community, show_activity, allow_indexing, is_active
    FROM librishelf.users
    WHERE name = $1 AND is_active IS NOT FALSE
  `,
  FIND_USER_BY_ID: `
    SELECT id, name, email, role, is_public, show_in_community, show_activity, allow_indexing, follow_emails, email_verified_at
    FROM librishelf.users
    WHERE id = $1
  `,
  // "Esqueci minha senha": e-mail sem diferenciar maiúsculas.
  FIND_USER_BY_EMAIL: `
    SELECT id, name, email, email_verified_at
    FROM librishelf.users
    WHERE lower(email) = lower($1) AND is_active IS NOT FALSE
  `,
  EMAIL_TAKEN: 'SELECT 1 FROM librishelf.users WHERE lower(email) = lower($1) AND id <> $2',
  NAME_TAKEN: 'SELECT 1 FROM librishelf.users WHERE lower(name) = lower($1) AND id <> $2',
  // E-mail novo começa sem confirmação.
  UPDATE_EMAIL: `
    UPDATE librishelf.users SET email = $2, email_verified_at = NULL, updated_at = now()
    WHERE id = $1
    RETURNING id, name, email, role, email_verified_at, is_public, show_in_community, show_activity, allow_indexing, follow_emails
  `,
  UPDATE_NAME: `
    UPDATE librishelf.users SET name = $2, updated_at = now()
    WHERE id = $1
    RETURNING id, name, email, role, email_verified_at, is_public, show_in_community, show_activity, allow_indexing, follow_emails
  `,
  MARK_EMAIL_VERIFIED: `
    UPDATE librishelf.users
    SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
    WHERE id = $1
    RETURNING email_verified_at
  `,
  // Usado pelo middleware de auth a cada requisição autenticada.
  FIND_SESSION_BY_ID: `
    SELECT id, role, password_changed_at
    FROM librishelf.users
    WHERE id = $1 AND is_active IS NOT FALSE
  `,
  FIND_PASSWORD_HASH_BY_ID: `
    SELECT id, password_hash
    FROM librishelf.users
    WHERE id = $1
  `,
  CREATE_USER: `
    INSERT INTO librishelf.users (name, password_hash, email)
    VALUES ($1, $2, $3)
    RETURNING id, name, email, is_public, show_in_community, show_activity, allow_indexing, follow_emails, email_verified_at
  `,
  UPDATE_PASSWORD: `
    UPDATE librishelf.users
    SET password_hash = $2, password_changed_at = now(), updated_at = now()
    WHERE id = $1
    RETURNING password_changed_at
  `,
  // Só altera o que vier preenchido (NULL mantém o valor atual).
  SET_PRIVACY: `
    UPDATE librishelf.users
    SET is_public = COALESCE($2, is_public),
        show_in_community = COALESCE($3, show_in_community),
        show_activity = COALESCE($4, show_activity),
        allow_indexing = COALESCE($5, allow_indexing),
        updated_at = now()
    WHERE id = $1
    RETURNING is_public, show_in_community, show_activity, allow_indexing
  `,
  MARK_LOGIN: 'UPDATE librishelf.users SET last_login_at = now(), last_seen_at = now() WHERE id = $1',
  MARK_SEEN: 'UPDATE librishelf.users SET last_seen_at = now() WHERE id = $1',
  // books.user_id tem ON DELETE CASCADE: livros e vínculos vão junto.
  DELETE_USER: 'DELETE FROM librishelf.users WHERE id = $1',
  LIST_BOOK_IDS_BY_USER: 'SELECT id FROM librishelf.books WHERE user_id = $1'
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

export const DASHBOARD_QUERIES = {
  // Uma única ida ao banco: o CTE filtra os livros do usuário uma vez e cada
  // bloco agrega a partir dele. json_agg devolve números (não strings, como o
  // COUNT/EXTRACT puros do pg), e COALESCE garante [] quando não há dados.
  STATS: `
    WITH user_books AS (
      SELECT id, read_date, reading_status, publisher_id
      FROM librishelf.books
      WHERE user_id = $1
    ),
    -- Leituras concluídas (releituras contam de novo).
    finished AS (
      SELECT r.finished_on
      FROM librishelf.readings r
      JOIN user_books ub ON ub.id = r.book_id
      WHERE r.finished_on IS NOT NULL
    ),
    -- Histórico completo (todos os anos com leitura).
    reading_by_year AS (
      SELECT EXTRACT(YEAR FROM finished_on)::int AS year, COUNT(*)::int AS count
      FROM finished
      GROUP BY 1
    ),
    -- Mês a mês no ano $2 (os 12 meses, inclusive os zerados).
    reading_by_month AS (
      SELECT m.month, COUNT(f.finished_on)::int AS count
      FROM generate_series(1, 12) AS m(month)
      LEFT JOIN finished f
        ON EXTRACT(YEAR FROM f.finished_on) = $2
       AND EXTRACT(MONTH FROM f.finished_on) = m.month
      GROUP BY m.month
    ),
    top_publishers AS (
      SELECT p.name, COUNT(ub.id)::int AS count
      FROM user_books ub
      JOIN librishelf.publishers p ON p.id = ub.publisher_id
      GROUP BY p.name
      ORDER BY count DESC, p.name ASC
      LIMIT 6
    ),
    top_authors AS (
      SELECT a.name, COUNT(ub.id)::int AS count
      FROM user_books ub
      JOIN librishelf.books_authors_link bal ON bal.book_id = ub.id
      JOIN librishelf.authors a ON a.id = bal.author_id
      GROUP BY a.name
      ORDER BY count DESC, a.name ASC
      LIMIT 6
    ),
    top_tags AS (
      SELECT t.name, COUNT(ub.id)::int AS count
      FROM user_books ub
      JOIN librishelf.books_tags_link btl ON btl.book_id = ub.id
      JOIN librishelf.tags t ON t.id = btl.tag_id
      GROUP BY t.name
      ORDER BY count DESC, t.name ASC
      LIMIT 6
    )
    SELECT
      (SELECT COUNT(*)::int FROM librishelf.books
        WHERE user_id = $1 AND isbn IS NOT NULL AND btrim(isbn) <> '' AND isbn13 IS NULL) AS invalid_isbn,
      (SELECT COUNT(*)::int FROM user_books) AS total_books,
      (SELECT COUNT(*)::int FROM user_books WHERE read_date IS NOT NULL) AS read_books,
      (SELECT COUNT(*)::int FROM user_books WHERE reading_status = 'reading') AS reading_books,
      (SELECT COUNT(*)::int FROM user_books WHERE reading_status = 'want') AS want_books,
      (SELECT target FROM librishelf.reading_goals WHERE user_id = $1 AND year = $2) AS goal_target,
      COALESCE((SELECT json_agg(r ORDER BY r.year DESC) FROM reading_by_year r), '[]'::json) AS reading_by_year,
      COALESCE((SELECT json_agg(m ORDER BY m.month) FROM reading_by_month m), '[]'::json) AS reading_by_month,
      COALESCE((SELECT json_agg(p ORDER BY p.count DESC, p.name ASC) FROM top_publishers p), '[]'::json) AS top_publishers,
      COALESCE((SELECT json_agg(a ORDER BY a.count DESC, a.name ASC) FROM top_authors a), '[]'::json) AS top_authors,
      COALESCE((SELECT json_agg(t ORDER BY t.count DESC, t.name ASC) FROM top_tags t), '[]'::json) AS top_tags
  `
}

// ---------------------------------------------------------------------------
// Comunidade — livros "iguais" entre usuários: mesma obra do Open Library ou
// mesmo ISBN-13. Só entram usuários com biblioteca pública E que ligaram
// "aparecer para outros leitores" (show_in_community).
// ---------------------------------------------------------------------------
const SAME_BOOK = (a, b) => `(
  (${a}.ol_work_key IS NOT NULL AND ${b}.ol_work_key = ${a}.ol_work_key)
  OR (${a}.isbn13 IS NOT NULL AND ${b}.isbn13 = ${a}.isbn13)
)`

// Nenhum dos dois bloqueou o outro (tabela librishelf.blocks, migration 007).
const NOT_BLOCKED = (a, b) => `NOT EXISTS (
  SELECT 1 FROM librishelf.blocks bl
  WHERE (bl.blocker_id = ${a} AND bl.blocked_id = ${b}) OR (bl.blocker_id = ${b} AND bl.blocked_id = ${a})
)`

const AUTHORS_OF = (bookExpr) => `(
  SELECT string_agg(a.name, ', ' ORDER BY bal.position, a.id)
  FROM librishelf.books_authors_link bal
  JOIN librishelf.authors a ON a.id = bal.author_id
  WHERE bal.book_id = ${bookExpr}
)`

export const COMMUNITY_QUERIES = {
  // Outros leitores do livro $1 (que pertence a $2).
  READERS_OF_BOOK: `
    WITH me AS (
      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE id = $1 AND user_id = $2
    )
    SELECT DISTINCT ON (u.id)
      u.name AS username,
      b.rating,
      (b.read_date IS NOT NULL) AS has_read
    FROM me
    JOIN librishelf.books b ON ${SAME_BOOK('me', 'b')}
    JOIN librishelf.users u ON u.id = b.user_id
    WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community AND u.is_active IS NOT FALSE AND ${NOT_BLOCKED('u.id', '$2')}
    ORDER BY u.id, b.rating DESC NULLS LAST
  `,

  // "Quem tem este livro também tem": obras mais frequentes nas bibliotecas
  // desses leitores que $2 ainda não tem.
  ALSO_HAVE: `
    WITH me AS (
      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE id = $1 AND user_id = $2
    ),
    peers AS (
      SELECT DISTINCT b.user_id
      FROM me
      JOIN librishelf.books b ON ${SAME_BOOK('me', 'b')}
      JOIN librishelf.users u ON u.id = b.user_id
      WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community AND u.is_active IS NOT FALSE AND ${NOT_BLOCKED('u.id', '$2')}
    ),
    candidates AS (
      SELECT b.id, b.title, b.user_id, COALESCE(b.ol_work_key, 'isbn:' || b.isbn13) AS book_key
      FROM librishelf.books b
      WHERE b.user_id IN (SELECT user_id FROM peers)
        AND (b.ol_work_key IS NOT NULL OR b.isbn13 IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM librishelf.books m WHERE m.user_id = $2 AND ${SAME_BOOK('m', 'b')}
        )
    ),
    ranked AS (
      SELECT book_key,
             count(DISTINCT user_id)::int AS readers,
             (array_agg(id ORDER BY id))[1] AS sample_book_id,
             (array_agg(title ORDER BY id))[1] AS title
      FROM candidates
      GROUP BY book_key
      ORDER BY readers DESC, title
      LIMIT $3
    )
    SELECT r.title, r.readers, r.sample_book_id, u.name AS sample_owner, ${AUTHORS_OF('r.sample_book_id')} AS authors
    FROM ranked r
    JOIN librishelf.books sb ON sb.id = r.sample_book_id
    JOIN librishelf.users u ON u.id = sb.user_id
    ORDER BY r.readers DESC, r.title
  `,

  // Encontrar leitores: só quem tem biblioteca pública E participa da comunidade.
  // $1 = quem procura, $2 = texto (vazio = sugestões), $3 = padrão ILIKE, $4 = limite.
  FIND_READERS: `
    WITH mine AS (
      SELECT ol_work_key, isbn13 FROM librishelf.books
      WHERE user_id = $1 AND (ol_work_key IS NOT NULL OR isbn13 IS NOT NULL)
    ),
    readers AS (
      SELECT u.id, u.name, u.show_activity,
        (SELECT count(*)::int FROM librishelf.books b WHERE b.user_id = u.id) AS total_books,
        (SELECT count(*)::int FROM librishelf.books b WHERE b.user_id = u.id AND b.read_date IS NOT NULL) AS read_books,
        (SELECT count(*)::int FROM librishelf.books b
          WHERE b.user_id = u.id AND EXISTS (SELECT 1 FROM mine m WHERE ${SAME_BOOK('m', 'b')})) AS common_books
      FROM librishelf.users u
      WHERE u.id <> $1 AND u.is_public AND u.show_in_community AND u.is_active IS NOT FALSE
        AND ${NOT_BLOCKED('u.id', '$1')}
        AND ($2 = '' OR u.name ILIKE $3)
    )
    SELECT r.name AS username, r.show_activity AS accepts_followers, r.total_books, r.read_books,
           r.common_books, f.status AS follow_status
    FROM readers r
    LEFT JOIN librishelf.follows f ON f.follower_id = $1 AND f.followee_id = r.id
    WHERE $2 <> '' OR r.common_books > 0 OR r.total_books > 0
    ORDER BY (lower(r.name) = lower($2)) DESC, r.common_books DESC, r.total_books DESC, r.name
    LIMIT $4
  `,

  // Recomendações para o Início: obras das bibliotecas da comunidade que $1
  // não tem. Pesa mais quem tem livros em comum com $1 e as notas altas; sem
  // ninguém em comum, vira "populares na comunidade".
  RECOMMENDATIONS: `
    WITH mine AS (
      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE user_id = $1
    ),
    community AS (
      SELECT id FROM librishelf.users
      WHERE is_public AND show_in_community AND id <> $1 AND is_active IS NOT FALSE
        AND ${NOT_BLOCKED('id', '$1')}
    ),
    peers AS (
      SELECT b.user_id, count(*)::int AS shared
      FROM librishelf.books b
      JOIN mine m ON ${SAME_BOOK('m', 'b')}
      WHERE b.user_id IN (SELECT id FROM community)
      GROUP BY b.user_id
    ),
    candidates AS (
      SELECT b.id, b.user_id, b.rating, COALESCE(p.shared, 0) AS shared,
             COALESCE(b.ol_work_key, 'isbn:' || b.isbn13) AS book_key
      FROM librishelf.books b
      LEFT JOIN peers p ON p.user_id = b.user_id
      WHERE b.user_id IN (SELECT id FROM community)
        AND (b.ol_work_key IS NOT NULL OR b.isbn13 IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM librishelf.books m WHERE m.user_id = $1 AND ${SAME_BOOK('m', 'b')})
    ),
    ranked AS (
      SELECT book_key,
             count(DISTINCT user_id)::int AS readers,
             count(DISTINCT user_id) FILTER (WHERE shared > 0)::int AS similar_readers,
             round(avg(rating)::numeric, 1)::float AS average_rating,
             sum(1 + LEAST(shared, 10) + CASE WHEN rating >= 4 THEN 2 ELSE 0 END) AS score,
             (array_agg(id ORDER BY rating DESC NULLS LAST, id))[1] AS sample_book_id
      FROM candidates
      GROUP BY book_key
      ORDER BY score DESC, readers DESC, book_key
      LIMIT $2
    )
    SELECT sb.title, r.readers, r.similar_readers, r.average_rating, r.sample_book_id,
           u.name AS sample_owner, ${AUTHORS_OF('r.sample_book_id')} AS authors
    FROM ranked r
    JOIN librishelf.books sb ON sb.id = r.sample_book_id
    JOIN librishelf.users u ON u.id = sb.user_id
    ORDER BY r.score DESC, r.readers DESC, sb.title
  `,

  // Livro de outro leitor (público + comunidade) para copiar para "Quero ler".
  SOURCE_BOOK: `
    SELECT b.id, b.title, b.isbn, b.ol_work_key, b.ol_edition_key, to_char(b.publication_date, 'YYYY-MM-DD') AS publication_date,
           p.name AS publisher,
           COALESCE((SELECT json_agg(a.name ORDER BY bal.position, a.id)
             FROM librishelf.books_authors_link bal JOIN librishelf.authors a ON a.id = bal.author_id
             WHERE bal.book_id = b.id), '[]'::json) AS authors,
           EXISTS (SELECT 1 FROM librishelf.books m WHERE m.user_id = $2 AND ${SAME_BOOK('m', 'b')}) AS already_have
    FROM librishelf.books b
    JOIN librishelf.users u ON u.id = b.user_id
    LEFT JOIN librishelf.publishers p ON p.id = b.publisher_id
    WHERE b.id = $1 AND b.user_id <> $2 AND u.is_public AND u.show_in_community AND u.is_active IS NOT FALSE AND ${NOT_BLOCKED('u.id', '$2')}
  `,

  // Livros de $2 que $1 também tem.
  COMMON_BOOKS: `
    SELECT b.id AS book_id, b.title, ${AUTHORS_OF('b.id')} AS authors, count(*) OVER()::int AS total
    FROM librishelf.books b
    WHERE b.user_id = $2
      AND EXISTS (SELECT 1 FROM librishelf.books m WHERE m.user_id = $1 AND ${SAME_BOOK('m', 'b')})
    ORDER BY b.title
    LIMIT $3
  `
}

// Exportar / importar dados da conta.
export const DATA_QUERIES = {
  EXPORT_USER: `
    SELECT name, email, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           is_public, show_in_community, show_activity, allow_indexing, follow_emails,
           email_verified_at IS NOT NULL AS email_verified
    FROM librishelf.users WHERE id = $1
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

export const GOAL_QUERIES = {
  UPSERT: `
    INSERT INTO librishelf.reading_goals (user_id, year, target)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, year) DO UPDATE SET target = EXCLUDED.target, updated_at = now()
    RETURNING year, target
  `,
  DELETE: 'DELETE FROM librishelf.reading_goals WHERE user_id = $1 AND year = $2'
}

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

export const SOCIAL_QUERIES = {
  FOLLOW_STATUS: 'SELECT status FROM librishelf.follows WHERE follower_id = $1 AND followee_id = $2',
  REQUEST_FOLLOW: `
    INSERT INTO librishelf.follows (follower_id, followee_id) VALUES ($1, $2)
    ON CONFLICT (follower_id, followee_id) DO NOTHING
  `,
  DELETE_FOLLOW: 'DELETE FROM librishelf.follows WHERE follower_id = $1 AND followee_id = $2 AND status = ANY($3) RETURNING status',
  ACCEPT_FOLLOW: `
    UPDATE librishelf.follows SET status = 'accepted', accepted_at = now()
    WHERE follower_id = $1 AND followee_id = $2 AND status = 'pending'
    RETURNING status
  `,
  // Bloqueios (migration 007)
  IS_BLOCKED: `
    SELECT
      EXISTS (SELECT 1 FROM librishelf.blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
      EXISTS (SELECT 1 FROM librishelf.blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_me
  `,
  BLOCK: `
    INSERT INTO librishelf.blocks (blocker_id, blocked_id) VALUES ($1, $2)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING
  `,
  DELETE_FOLLOWS_BETWEEN: `
    DELETE FROM librishelf.follows
    WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)
  `,
  UNBLOCK: 'DELETE FROM librishelf.blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING blocked_id',
  BLOCKED_LIST: `
    SELECT u.name AS username, bl.created_at
    FROM librishelf.blocks bl JOIN librishelf.users u ON u.id = bl.blocked_id
    WHERE bl.blocker_id = $1
    ORDER BY bl.created_at DESC
  `,
  PENDING_COUNT: `
    SELECT count(*)::int AS count
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.follower_id
    WHERE f.followee_id = $1 AND f.status = 'pending' AND u.is_active IS NOT FALSE
  `,
  CONNECTIONS: `
    SELECT 'following' AS kind, u.name AS username, f.status, f.created_at, u.is_public
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.followee_id
    WHERE f.follower_id = $1 AND u.is_active IS NOT FALSE
    UNION ALL
    SELECT CASE WHEN f.status = 'pending' THEN 'request' ELSE 'follower' END, u.name, f.status, f.created_at, u.is_public
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.follower_id
    WHERE f.followee_id = $1 AND u.is_active IS NOT FALSE
    ORDER BY created_at DESC
  `,
  // Feed: leituras concluídas e livros adicionados por quem $1 segue (pedido
  // aceito) e que mantém "mostrar minha atividade" ligado.
  FEED: `
    WITH followed AS (
      SELECT f.followee_id
      FROM librishelf.follows f
      JOIN librishelf.users u ON u.id = f.followee_id
      WHERE f.follower_id = $1 AND f.status = 'accepted' AND u.show_activity AND u.is_active IS NOT FALSE
    ),
    events AS (
      SELECT 'read' AS type, (r.finished_on::timestamp AT TIME ZONE 'UTC') AS at, b.id AS book_id, b.user_id, b.title, b.rating,
             (row_number() OVER (PARTITION BY r.book_id ORDER BY r.finished_on, r.id) > 1) AS reread
      FROM librishelf.readings r
      JOIN librishelf.books b ON b.id = r.book_id
      WHERE b.user_id IN (SELECT followee_id FROM followed) AND r.finished_on IS NOT NULL
      UNION ALL
      SELECT 'added', b.created_at, b.id, b.user_id, b.title, b.rating, false
      FROM librishelf.books b
      WHERE b.user_id IN (SELECT followee_id FROM followed)
    )
    SELECT e.type, e.at, e.book_id, e.title, e.rating, e.reread, u.name AS username, u.is_public,
           ${AUTHORS_OF('e.book_id')} AS authors
    FROM events e
    JOIN librishelf.users u ON u.id = e.user_id
    ORDER BY e.at DESC, e.book_id DESC, e.type
    LIMIT $2 OFFSET $3
  `
}

export const TOKEN_QUERIES = {
  DELETE_UNUSED: 'DELETE FROM librishelf.user_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
  INSERT: `
    INSERT INTO librishelf.user_tokens (user_id, purpose, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
  `,
  // Atômico: dois cliques no mesmo link não usam o link duas vezes.
  CONSUME: `
    UPDATE librishelf.user_tokens
    SET used_at = now()
    WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `,
  DELETE_STALE: `
    DELETE FROM librishelf.user_tokens
    WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'
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

// Aviso por e-mail de seguidores (migration 010)
export const FOLLOW_EMAIL_QUERIES = {
  // Só entra na fila quem quer o aviso e tem e-mail confirmado
  ENQUEUE: `
    INSERT INTO librishelf.follow_email_queue (user_id, kind, actor_id)
    SELECT u.id, $2, $3 FROM librishelf.users u
    WHERE u.id = $1 AND u.follow_emails AND u.email_verified_at IS NOT NULL AND u.is_active IS NOT FALSE
    ON CONFLICT (user_id, kind, actor_id) DO NOTHING
    RETURNING user_id
  `,
  DEQUEUE: 'DELETE FROM librishelf.follow_email_queue WHERE user_id = $1 AND kind = $2 AND actor_id = $3',
  // Bloqueio: some tudo entre os dois, nos dois sentidos
  DEQUEUE_PAIR: `
    DELETE FROM librishelf.follow_email_queue
    WHERE (user_id = $1 AND actor_id = $2) OR (user_id = $2 AND actor_id = $1)
  `,
  CLEAR_USER: 'DELETE FROM librishelf.follow_email_queue WHERE user_id = $1',
  // Quem tem aviso na fila e já pode receber (último e-mail há mais de $1 segundos)
  DUE_USERS: `
    SELECT DISTINCT q.user_id
    FROM librishelf.follow_email_queue q
    JOIN librishelf.users u ON u.id = q.user_id
    WHERE u.follow_emails
      AND (u.follow_email_sent_at IS NULL OR u.follow_email_sent_at <= now() - make_interval(secs => $1))
    LIMIT 200
  `,
  // Reserva o envio (vale com mais de um processo): só um consegue
  CLAIM: `
    WITH prev AS (SELECT follow_email_sent_at FROM librishelf.users WHERE id = $1)
    UPDATE librishelf.users u
    SET follow_email_sent_at = now()
    WHERE u.id = $1 AND u.follow_emails AND u.email_verified_at IS NOT NULL AND u.is_active IS NOT FALSE
      AND (u.follow_email_sent_at IS NULL OR u.follow_email_sent_at <= now() - make_interval(secs => $2))
      AND EXISTS (SELECT 1 FROM librishelf.follow_email_queue q WHERE q.user_id = u.id)
    RETURNING u.id, u.name, u.email, u.email_locale, (SELECT follow_email_sent_at FROM prev) AS previous_sent_at, now() AS claimed_at
  `,
  RELEASE: 'UPDATE librishelf.users SET follow_email_sent_at = $2 WHERE id = $1',
  // Avisos que ainda valem: pedido ainda pendente / seguir ainda aceito, sem bloqueio
  PENDING_ITEMS: `
    SELECT q.kind, q.actor_id, a.name AS actor, q.created_at
    FROM librishelf.follow_email_queue q
    JOIN librishelf.users a ON a.id = q.actor_id
    WHERE q.user_id = $1
      AND a.is_active IS NOT FALSE
      AND (
        (q.kind = 'request' AND EXISTS (SELECT 1 FROM librishelf.follows f
          WHERE f.follower_id = q.actor_id AND f.followee_id = q.user_id AND f.status = 'pending'))
        OR
        (q.kind = 'accepted' AND EXISTS (SELECT 1 FROM librishelf.follows f
          WHERE f.follower_id = q.user_id AND f.followee_id = q.actor_id AND f.status = 'accepted'))
      )
      AND NOT EXISTS (SELECT 1 FROM librishelf.blocks b
        WHERE (b.blocker_id = q.user_id AND b.blocked_id = q.actor_id) OR (b.blocker_id = q.actor_id AND b.blocked_id = q.user_id))
    ORDER BY q.created_at
  `,
  DELETE_UPTO: 'DELETE FROM librishelf.follow_email_queue WHERE user_id = $1 AND created_at <= $2',
  SET_PREFS: `
    UPDATE librishelf.users
    SET follow_emails = COALESCE($2, follow_emails),
        email_locale = COALESCE($3, email_locale),
        updated_at = now()
    WHERE id = $1
    RETURNING follow_emails, email_locale
  `
}

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
  u.name AS username, u.is_public,
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
  // Denúncias desde a última revisão (quem revisou e manteve "zera a conta")
  OPEN_REPORTS: `
    SELECT count(DISTINCT rr.reporter_id)::int AS total
    FROM librishelf.review_reports rr
    JOIN librishelf.reviews r ON r.id = rr.review_id
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

// Listas: resumo (para as grades) com as 4 primeiras capas e a contagem
const LIST_SUMMARY = `
  l.id, l.user_id, l.title, l.description, l.is_public, l.ranked, l.created_at, l.updated_at,
  (SELECT count(*)::int FROM librishelf.list_items li WHERE li.list_id = l.id) AS item_count,
  (SELECT COALESCE(json_agg(json_build_object('bookId', c.id, 'title', c.title, 'authors', c.authors) ORDER BY c.ord), '[]')
   FROM (
     SELECT b.id, b.title, ${AUTHORS_OF('b.id')} AS authors, row_number() OVER (ORDER BY li.position, li.added_at) AS ord
     FROM librishelf.list_items li
     JOIN librishelf.books b ON b.id = li.book_id
     WHERE li.list_id = l.id
     ORDER BY li.position, li.added_at
     LIMIT 4
   ) c
  ) AS covers
`

export const LIST_QUERIES = {
  // Do dono; $2 (opcional) marca as listas que já têm aquele livro
  OF_OWNER: `
    SELECT ${LIST_SUMMARY},
      ($2::int IS NOT NULL AND EXISTS (
        SELECT 1 FROM librishelf.list_items li WHERE li.list_id = l.id AND li.book_id = $2::int)) AS has_book
    FROM librishelf.lists l
    WHERE l.user_id = $1
    ORDER BY l.updated_at DESC, l.id DESC
  `,
  COUNT_OF_OWNER: 'SELECT count(*)::int AS total FROM librishelf.lists WHERE user_id = $1',
  GET: `SELECT ${LIST_SUMMARY} FROM librishelf.lists l WHERE l.id = $1`,
  CREATE: `
    INSERT INTO librishelf.lists (user_id, title, description, is_public, ranked)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `,
  UPDATE: `
    UPDATE librishelf.lists
    SET title = $3, description = $4, is_public = $5, ranked = $6, updated_at = now()
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `,
  DELETE: 'DELETE FROM librishelf.lists WHERE id = $1 AND user_id = $2 RETURNING id',
  TOUCH: 'UPDATE librishelf.lists SET updated_at = now() WHERE id = $1',
  ITEMS: `
    SELECT li.book_id, li.position, li.added_at,
           b.title, ${AUTHORS_OF('b.id')} AS authors, b.rating, b.read_date, b.reading_status,
           b.series, b.series_index
    FROM librishelf.list_items li
    JOIN librishelf.books b ON b.id = li.book_id
    WHERE li.list_id = $1
    ORDER BY li.position, li.added_at
  `,
  BOOK_IDS: 'SELECT book_id FROM librishelf.list_items WHERE list_id = $1',
  COUNT_ITEMS: 'SELECT count(*)::int AS total FROM librishelf.list_items WHERE list_id = $1',
  // No fim da lista; repetido não faz nada
  ADD_ITEM: `
    INSERT INTO librishelf.list_items (list_id, book_id, position)
    SELECT $1, $2, COALESCE(max(position), 0) + 1 FROM librishelf.list_items WHERE list_id = $1
    ON CONFLICT (list_id, book_id) DO NOTHING
    RETURNING book_id
  `,
  REMOVE_ITEM: 'DELETE FROM librishelf.list_items WHERE list_id = $1 AND book_id = $2 RETURNING book_id',
  // $2 = ids na ordem nova (1, 2, 3…)
  REORDER: `
    UPDATE librishelf.list_items li
    SET position = o.ord
    FROM unnest($2::int[]) WITH ORDINALITY AS o(book_id, ord)
    WHERE li.list_id = $1 AND li.book_id = o.book_id
  `,
  // Perfil público: listas públicas com pelo menos um livro
  PUBLIC_OF_USER: `
    SELECT ${LIST_SUMMARY}
    FROM librishelf.lists l
    WHERE l.user_id = $1 AND l.is_public
      AND EXISTS (SELECT 1 FROM librishelf.list_items li WHERE li.list_id = l.id)
    ORDER BY l.updated_at DESC, l.id DESC
    LIMIT $2
  `,
  EXPORT: `
    SELECT l.title, l.description, l.is_public, l.ranked, l.created_at,
      COALESCE(json_agg(json_build_object('title', b.title, 'isbn', b.isbn) ORDER BY li.position, li.added_at)
        FILTER (WHERE b.id IS NOT NULL), '[]') AS books
    FROM librishelf.lists l
    LEFT JOIN librishelf.list_items li ON li.list_id = l.id
    LEFT JOIN librishelf.books b ON b.id = li.book_id
    WHERE l.user_id = $1
    GROUP BY l.id
    ORDER BY l.created_at, l.id
  `
}

// Retrospectiva do ano ($1 usuário, $2 ano): leituras concluídas no ano
// (releitura conta de novo), com a nota daquela leitura ou a do livro.
const IN_YEAR = (col) => `${col} >= make_date($2::int, 1, 1) AND ${col} < make_date($2::int + 1, 1, 1)`

export const YEAR_QUERIES = {
  FINISHED: `
    SELECT r.id, r.book_id, r.started_on, r.finished_on,
           COALESCE(r.rating, b.rating) AS rating,
           b.title, ${AUTHORS_OF('b.id')} AS authors, b.page_count,
           EXISTS (
             SELECT 1 FROM librishelf.readings e
             WHERE e.book_id = r.book_id AND e.finished_on IS NOT NULL
               AND (e.finished_on < r.finished_on OR (e.finished_on = r.finished_on AND e.id < r.id))
           ) AS reread
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE b.user_id = $1 AND ${IN_YEAR('r.finished_on')}
    ORDER BY r.finished_on, r.id
  `,
  TOP_AUTHORS: `
    SELECT a.name, count(DISTINCT r.book_id)::int AS count
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    JOIN librishelf.books_authors_link bal ON bal.book_id = b.id
    JOIN librishelf.authors a ON a.id = bal.author_id
    WHERE b.user_id = $1 AND ${IN_YEAR('r.finished_on')}
    GROUP BY a.name
    ORDER BY count DESC, a.name
    LIMIT 5
  `,
  TOP_TAGS: `
    SELECT t.name, count(DISTINCT r.book_id)::int AS count
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    JOIN librishelf.books_tags_link btl ON btl.book_id = b.id
    JOIN librishelf.tags t ON t.id = btl.tag_id
    WHERE b.user_id = $1 AND ${IN_YEAR('r.finished_on')}
    GROUP BY t.name
    ORDER BY count DESC, t.name
    LIMIT 5
  `,
  // Anos com alguma leitura concluída (o atual entra sempre, no serviço)
  YEARS: `
    SELECT DISTINCT extract(year FROM r.finished_on)::int AS year
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE b.user_id = $1 AND r.finished_on IS NOT NULL
    ORDER BY year DESC
  `,
  PREVIOUS_COUNT: `
    SELECT count(*)::int AS total
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE b.user_id = $1 AND r.finished_on >= make_date($2::int - 1, 1, 1) AND r.finished_on < make_date($2::int, 1, 1)
  `,
  GOAL: 'SELECT target FROM librishelf.reading_goals WHERE user_id = $1 AND year = $2',
  REVIEWS: `SELECT count(*)::int AS total FROM librishelf.reviews WHERE user_id = $1 AND ${IN_YEAR('created_at')}`
}

// Área administrativa. Denúncia "aberta" = feita depois da última revisão
// (ocultar ou manter zera a conta, como no link do e-mail).
const OPEN_REPORT = 'rr.review_id = r.id AND (r.reviewed_at IS NULL OR rr.created_at > r.reviewed_at)'

export const ADMIN_QUERIES = {
  STATS: `
    SELECT
      (SELECT count(*) FROM librishelf.users)::int AS users,
      (SELECT count(*) FROM librishelf.users WHERE email_verified_at IS NOT NULL)::int AS verified,
      (SELECT count(*) FROM librishelf.users WHERE GREATEST(last_seen_at, last_login_at) > now() - interval '30 days')::int AS active30,
      (SELECT count(*) FROM librishelf.users WHERE GREATEST(last_seen_at, last_login_at) > now() - interval '7 days')::int AS active7,
      (SELECT count(*) FROM librishelf.users
        WHERE email_verified_at IS NULL AND is_active IS NOT FALSE AND created_at < now() - interval '7 days')::int AS stale_signups,
      (SELECT count(*) FROM librishelf.users WHERE created_at > now() - interval '7 days')::int AS signups7,
      (SELECT count(*) FROM librishelf.users WHERE created_at > now() - interval '30 days')::int AS signups30,
      (SELECT count(*) FROM librishelf.users WHERE is_active = false)::int AS suspended,
      (SELECT count(*) FROM librishelf.users WHERE is_public AND is_active IS NOT FALSE)::int AS public_libraries,
      (SELECT count(*) FROM librishelf.users WHERE is_public AND show_in_community AND is_active IS NOT FALSE)::int AS community,
      (SELECT count(*) FROM librishelf.books)::int AS books,
      (SELECT count(*) FROM librishelf.reviews)::int AS reviews,
      (SELECT count(*) FROM librishelf.reviews WHERE hidden_at IS NOT NULL)::int AS hidden_reviews,
      (SELECT count(*) FROM librishelf.lists)::int AS lists,
      (SELECT count(DISTINCT r.id) FROM librishelf.reviews r JOIN librishelf.review_reports rr ON ${OPEN_REPORT})::int AS open_reports
  `,
  // Cadastros por semana (segunda a domingo), as últimas 12, com zeros
  SIGNUPS_BY_WEEK: `
    SELECT to_char(w, 'YYYY-MM-DD') AS week, count(u.id)::int AS total
    FROM generate_series(date_trunc('week', now()::timestamp) - interval '11 weeks', date_trunc('week', now()::timestamp), interval '1 week') AS w
    LEFT JOIN librishelf.users u ON u.created_at >= w AND u.created_at < w + interval '1 week'
    GROUP BY w
    ORDER BY w
  `,
  // Fila: $1 = 'open' (denúncia sem revisão), 'hidden' (ocultas) ou 'all'
  REPORT_QUEUE: `
    SELECT r.id, r.body, r.has_spoiler, r.visibility, r.created_at, r.hidden_at, r.hidden_reason, r.reviewed_at,
           u.name AS username, (u.is_active IS NOT FALSE) AS author_active, b.title,
           rep.open_count, rep.total_count, rep.last_report_at, rep.reasons
    FROM librishelf.reviews r
    JOIN librishelf.users u ON u.id = r.user_id
    JOIN librishelf.books b ON b.id = r.book_id
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.reviewed_at IS NULL OR rr.created_at > r.reviewed_at)::int AS open_count,
             count(*)::int AS total_count,
             max(rr.created_at) AS last_report_at,
             COALESCE(array_agg(DISTINCT rr.reason) FILTER (WHERE rr.reason IS NOT NULL), '{}') AS reasons
      FROM librishelf.review_reports rr
      WHERE rr.review_id = r.id
    ) rep
    WHERE (EXISTS (SELECT 1 FROM librishelf.review_reports rr WHERE rr.review_id = r.id) OR r.hidden_at IS NOT NULL)
      AND CASE $1
            WHEN 'open' THEN rep.open_count > 0
            WHEN 'hidden' THEN r.hidden_at IS NOT NULL
            ELSE true
          END
    ORDER BY rep.open_count > 0 DESC, rep.last_report_at DESC NULLS LAST, r.id DESC
    LIMIT 100
  `,
  REVIEW_TARGET: `
    SELECT r.id, r.user_id, u.name AS username, b.title
    FROM librishelf.reviews r
    JOIN librishelf.users u ON u.id = r.user_id
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE r.id = $1
  `,
  // Contas: $1 trecho do nome ou e-mail (padrão ILIKE já escapado), $2 'all' ou 'suspended'
  USERS: `
    SELECT u.id, u.name, u.email, u.role, (u.is_active IS NOT FALSE) AS active,
           u.suspended_at, u.suspended_reason, u.created_at, GREATEST(u.last_seen_at, u.last_login_at) AS last_login_at,
           (u.email_verified_at IS NOT NULL) AS email_verified, u.is_public,
           (SELECT count(*) FROM librishelf.books b WHERE b.user_id = u.id)::int AS books,
           (SELECT count(*) FROM librishelf.reviews r WHERE r.user_id = u.id)::int AS reviews,
           (SELECT count(*) FROM librishelf.review_reports rr JOIN librishelf.reviews r ON r.id = rr.review_id
             WHERE r.user_id = u.id)::int AS reports_received,
           count(*) OVER()::int AS total
    FROM librishelf.users u
    WHERE ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)
      AND ($2 <> 'suspended' OR u.is_active = false)
      AND ($2 <> 'unverified' OR (u.email_verified_at IS NULL AND u.is_active IS NOT FALSE AND u.created_at < now() - interval '7 days'))
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT $3 OFFSET $4
  `,
  USER_TARGET: 'SELECT id, name, role, (is_active IS NOT FALSE) AS active, email_verified_at, email_locale FROM librishelf.users WHERE id = $1',
  SUSPEND: `
    UPDATE librishelf.users
    SET is_active = false, suspended_at = now(), suspended_reason = $2, updated_at = now()
    WHERE id = $1 AND is_active IS NOT FALSE
    RETURNING id
  `,
  REACTIVATE: `
    UPDATE librishelf.users
    SET is_active = true, suspended_at = NULL, suspended_reason = NULL, updated_at = now()
    WHERE id = $1 AND is_active = false
    RETURNING id
  `,
  // Funil: cadastrou → confirmou → 1 livro → 10 livros; voltou depois de 7 dias
  ENGAGEMENT: `
    WITH shelf AS (SELECT user_id, count(*) AS n FROM librishelf.books GROUP BY user_id)
    SELECT
      count(*)::int AS users,
      count(*) FILTER (WHERE u.email_verified_at IS NOT NULL)::int AS verified,
      count(*) FILTER (WHERE shelf.n >= 1)::int AS with_book,
      count(*) FILTER (WHERE shelf.n >= 10)::int AS with_10_books,
      count(*) FILTER (WHERE u.created_at < now() - interval '7 days')::int AS older_than_week,
      count(*) FILTER (WHERE u.created_at < now() - interval '7 days'
        AND GREATEST(u.last_seen_at, u.last_login_at) > u.created_at + interval '7 days')::int AS returned,
      (SELECT count(*) FROM librishelf.books WHERE created_at > now() - interval '7 days')::int AS books7,
      (SELECT count(*) FROM librishelf.books WHERE created_at > now() - interval '30 days')::int AS books30,
      (SELECT count(*) FROM librishelf.readings WHERE finished_on > current_date - 30)::int AS finished30,
      (SELECT count(*) FROM librishelf.reviews WHERE created_at > now() - interval '30 days')::int AS reviews30
    FROM librishelf.users u
    LEFT JOIN shelf ON shelf.user_id = u.id
  `,
  // Quantas pessoas usam cada recurso (contas, não ações)
  ADOPTION: `
    SELECT
      (SELECT count(*) FROM librishelf.users)::int AS users,
      (SELECT count(DISTINCT user_id) FROM librishelf.lists)::int AS lists,
      (SELECT count(DISTINCT user_id) FROM librishelf.reviews)::int AS reviews,
      (SELECT count(DISTINCT user_id) FROM librishelf.reading_goals WHERE year = extract(year FROM now())::int)::int AS goals,
      (SELECT count(DISTINCT user_id) FROM librishelf.books WHERE series IS NOT NULL)::int AS series,
      (SELECT count(DISTINCT user_id) FROM librishelf.books WHERE notes IS NOT NULL AND btrim(notes) <> '')::int AS notes,
      (SELECT count(DISTINCT user_id) FROM librishelf.books WHERE reading_status = 'reading')::int AS reading_now,
      (SELECT count(DISTINCT b.user_id) FROM librishelf.books b
        WHERE (SELECT count(*) FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NOT NULL) >= 2)::int AS rereads,
      (SELECT count(*) FROM librishelf.users WHERE is_public)::int AS public_library,
      (SELECT count(*) FROM librishelf.users WHERE is_public AND show_in_community)::int AS community,
      (SELECT count(*) FROM librishelf.users WHERE show_activity)::int AS accepts_followers,
      (SELECT count(DISTINCT follower_id) FROM librishelf.follows WHERE status = 'accepted')::int AS following,
      (SELECT count(*) FROM librishelf.users WHERE follow_emails)::int AS follow_emails,
      (SELECT count(DISTINCT blocker_id) FROM librishelf.blocks)::int AS blocks,
      (SELECT count(*) FROM librishelf.users WHERE allow_indexing AND is_public)::int AS indexing
  `,
  // Contadores dos últimos $1 dias, por evento
  COUNTERS: `
    SELECT event, sum(count)::int AS total
    FROM librishelf.usage_counters
    WHERE day > current_date - $1::int
    GROUP BY event
  `,
  // Série diária (com zeros) dos eventos que começam com $1, últimos $2 dias
  COUNTER_SERIES: `
    SELECT to_char(d, 'YYYY-MM-DD') AS day, e.event, COALESCE(c.count, 0)::int AS total
    FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') AS d
    CROSS JOIN unnest($1::text[]) AS e(event)
    LEFT JOIN librishelf.usage_counters c ON c.day = d::date AND c.event = e.event
    ORDER BY d, e.event
  `,
  OPENLIBRARY_BOOKS: `
    SELECT
      count(*) FILTER (WHERE ol_work_key IS NOT NULL)::int AS linked,
      count(*) FILTER (WHERE ol_work_key IS NULL AND isbn13 IS NOT NULL)::int AS linkable,
      count(*) FILTER (WHERE ol_work_key IS NULL AND isbn13 IS NULL)::int AS unlinked
    FROM librishelf.books
  `,
  DB_INFO: `
    SELECT current_setting('server_version') AS version,
           pg_database_size(current_database())::bigint AS size,
           (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections
  `,
  LAST_MIGRATION: 'SELECT version, applied_at FROM librishelf.schema_migrations ORDER BY version DESC LIMIT 1',
  // Moderação: quem denuncia muito, e quanto do que denunciou foi mantido no ar
  SERIAL_REPORTERS: `
    SELECT u.id, u.name, (u.is_active IS NOT FALSE) AS active, u.created_at,
           count(*)::int AS reports,
           count(*) FILTER (WHERE r.hidden_at IS NOT NULL)::int AS upheld,
           count(*) FILTER (WHERE r.hidden_at IS NULL AND r.reviewed_at IS NOT NULL AND rr.created_at <= r.reviewed_at)::int AS rejected,
           count(*) FILTER (WHERE rr.created_at > now() - interval '7 days')::int AS last7
    FROM librishelf.review_reports rr
    JOIN librishelf.users u ON u.id = rr.reporter_id
    JOIN librishelf.reviews r ON r.id = rr.review_id
    GROUP BY u.id
    HAVING count(*) >= 3
    ORDER BY reports DESC, last7 DESC
    LIMIT 15
  `,
  // Contas com até 30 dias que já recebem denúncias
  NEW_REPORTED: `
    SELECT u.id, u.name, (u.is_active IS NOT FALSE) AS active, u.created_at,
           count(rr.id)::int AS reports, count(DISTINCT r.id)::int AS reviews_reported
    FROM librishelf.users u
    JOIN librishelf.reviews r ON r.user_id = u.id
    JOIN librishelf.review_reports rr ON rr.review_id = r.id
    WHERE u.created_at > now() - interval '30 days'
    GROUP BY u.id
    ORDER BY reports DESC
    LIMIT 15
  `,
  MOST_REPORTED: `
    SELECT u.id, u.name, (u.is_active IS NOT FALSE) AS active, u.created_at,
           count(rr.id)::int AS reports, count(DISTINCT r.id)::int AS reviews_reported,
           count(DISTINCT r.id) FILTER (WHERE r.hidden_at IS NOT NULL)::int AS hidden
    FROM librishelf.users u
    JOIN librishelf.reviews r ON r.user_id = u.id
    JOIN librishelf.review_reports rr ON rr.review_id = r.id
    GROUP BY u.id
    ORDER BY reports DESC
    LIMIT 10
  `,
  USER_DETAIL: `
    SELECT u.id, u.name, u.email, u.role, (u.is_active IS NOT FALSE) AS active, u.suspended_at, u.suspended_reason,
           u.created_at, u.last_login_at, GREATEST(u.last_seen_at, u.last_login_at) AS last_seen_at, u.email_verified_at,
           u.is_public, u.show_in_community, u.show_activity, u.allow_indexing, u.follow_emails, u.email_locale,
           (SELECT count(*) FROM librishelf.books WHERE user_id = u.id)::int AS books,
           (SELECT count(*) FROM librishelf.books WHERE user_id = u.id AND read_date IS NOT NULL)::int AS read_books,
           (SELECT max(created_at) FROM librishelf.books WHERE user_id = u.id) AS last_book_at,
           (SELECT count(*) FROM librishelf.reviews WHERE user_id = u.id)::int AS reviews,
           (SELECT count(*) FROM librishelf.reviews WHERE user_id = u.id AND hidden_at IS NOT NULL)::int AS hidden_reviews,
           (SELECT count(*) FROM librishelf.lists WHERE user_id = u.id)::int AS lists,
           (SELECT count(*) FROM librishelf.lists WHERE user_id = u.id AND is_public)::int AS public_lists,
           (SELECT count(*) FROM librishelf.follows WHERE followee_id = u.id AND status = 'accepted')::int AS followers,
           (SELECT count(*) FROM librishelf.follows WHERE follower_id = u.id AND status = 'accepted')::int AS following,
           (SELECT count(*) FROM librishelf.blocks WHERE blocker_id = u.id)::int AS blocks_made,
           (SELECT count(*) FROM librishelf.blocks WHERE blocked_id = u.id)::int AS blocked_by,
           (SELECT count(*) FROM librishelf.review_reports rr JOIN librishelf.reviews r ON r.id = rr.review_id
             WHERE r.user_id = u.id)::int AS reports_received,
           (SELECT count(*) FROM librishelf.review_reports WHERE reporter_id = u.id)::int AS reports_made
    FROM librishelf.users u
    WHERE u.id = $1
  `,
  USER_REPORTED_REVIEWS: `
    SELECT r.id, b.title, (r.hidden_at IS NOT NULL) AS hidden, r.hidden_reason,
           count(rr.id)::int AS reports,
           count(rr.id) FILTER (WHERE r.reviewed_at IS NULL OR rr.created_at > r.reviewed_at)::int AS open,
           max(rr.created_at) AS last_report_at
    FROM librishelf.reviews r
    JOIN librishelf.books b ON b.id = r.book_id
    JOIN librishelf.review_reports rr ON rr.review_id = r.id
    WHERE r.user_id = $1
    GROUP BY r.id, b.title
    ORDER BY last_report_at DESC
    LIMIT 20
  `,
  USER_ACTIONS: `
    SELECT a.id, a.action, a.target_review_id, a.details, a.created_at, adm.name AS admin
    FROM librishelf.admin_actions a
    LEFT JOIN librishelf.users adm ON adm.id = a.admin_id
    WHERE a.target_user_id = $1
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 30
  `,
  LOG: `
    INSERT INTO librishelf.admin_actions (admin_id, action, target_user_id, target_review_id, details)
    VALUES ($1, $2, $3, $4, $5)
  `,
  ACTIONS: `
    SELECT a.id, a.action, a.target_review_id, a.details, a.created_at,
           adm.name AS admin, tgt.name AS target_user, bk.title AS book,
           count(*) OVER()::int AS total
    FROM librishelf.admin_actions a
    LEFT JOIN librishelf.users adm ON adm.id = a.admin_id
    LEFT JOIN librishelf.users tgt ON tgt.id = a.target_user_id
    LEFT JOIN librishelf.reviews rv ON rv.id = a.target_review_id
    LEFT JOIN librishelf.books bk ON bk.id = rv.book_id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $1 OFFSET $2
  `
}
