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
    SELECT b.user_id, u.is_public
    FROM librishelf.books b
    JOIN librishelf.users u ON u.id = b.user_id
    WHERE b.id = $1
  `,
  GET_OWNER: 'SELECT user_id FROM librishelf.books WHERE id = $1',
  FIND_BY_ISBN: 'SELECT * FROM librishelf.books WHERE isbn = $1 AND user_id = $2',
  DELETE_BOOK: 'DELETE FROM librishelf.books WHERE id = $1',
  UPDATE_READ_DATE: 'UPDATE librishelf.books SET read_date = $1 WHERE id = $2',
  ADD_BOOK_FUNC: 'SELECT librishelf.add_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS book_id',
  UPDATE_BOOK_FUNC: 'SELECT librishelf.update_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
  UPDATE_RATING: 'UPDATE librishelf.books SET rating = $1, last_modified = now() WHERE id = $2 RETURNING rating',
  PRUNE_USER_NAMES: 'SELECT librishelf.prune_user_names($1)',
  // Mosaico do login/cadastro: só livros de quem tornou a biblioteca pública.
  RANDOM_PUBLIC_BOOK_IDS: `
    SELECT b.id
    FROM librishelf.books b
    JOIN librishelf.users u ON u.id = b.user_id
    WHERE u.is_public = true
    ORDER BY random()
    LIMIT $1
  `
}

export const AUTH_QUERIES = {
  FIND_USER_BY_USERNAME: `
    SELECT id, name, password_hash, email
    FROM librishelf.users
    WHERE name = $1 OR email = $1
  `,
  // Só por nome (sem e-mail), usado nas rotas públicas.
  FIND_USER_BY_NAME: `
    SELECT id, name, is_public, show_in_community, show_activity
    FROM librishelf.users
    WHERE name = $1
  `,
  FIND_USER_BY_ID: `
    SELECT id, name, email, is_public, show_in_community, show_activity, email_verified_at
    FROM librishelf.users
    WHERE id = $1
  `,
  // "Esqueci minha senha": e-mail sem diferenciar maiúsculas.
  FIND_USER_BY_EMAIL: `
    SELECT id, name, email, email_verified_at
    FROM librishelf.users
    WHERE lower(email) = lower($1) AND is_active IS NOT FALSE
  `,
  MARK_EMAIL_VERIFIED: `
    UPDATE librishelf.users
    SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
    WHERE id = $1
    RETURNING email_verified_at
  `,
  // Usado pelo middleware de auth a cada requisição autenticada.
  FIND_SESSION_BY_ID: `
    SELECT id, password_changed_at
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
    RETURNING id, name, email, is_public, show_in_community, show_activity, email_verified_at
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
        updated_at = now()
    WHERE id = $1
    RETURNING is_public, show_in_community, show_activity
  `,
  // books.user_id tem ON DELETE CASCADE: livros e vínculos vão junto.
  DELETE_USER: 'DELETE FROM librishelf.users WHERE id = $1',
  LIST_BOOK_IDS_BY_USER: 'SELECT id FROM librishelf.books WHERE user_id = $1'
}

export const AUTHOR_QUERIES = {
  GET_AUTHORS_BY_USER: `
    SELECT a.name, COUNT(DISTINCT b.id)::int AS count
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
    SELECT p.name, COUNT(DISTINCT b.id)::int AS count
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
    SELECT t.name, COUNT(DISTINCT b.id)::int AS count
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
      SELECT id, read_date
      FROM librishelf.books
      WHERE user_id = $1
    ),
    reading_by_year AS (
      SELECT EXTRACT(YEAR FROM read_date::date)::int AS year, COUNT(*)::int AS count
      FROM user_books
      WHERE read_date IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 5
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
      COALESCE((SELECT json_agg(r ORDER BY r.year DESC) FROM reading_by_year r), '[]'::json) AS reading_by_year,
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
    WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community
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
      WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community
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
          SELECT EXTRACT(YEAR FROM read_date)::int AS year, count(*)::int AS count
          FROM ub WHERE read_date IS NOT NULL GROUP BY 1
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
  PENDING_COUNT: `SELECT count(*)::int AS count FROM librishelf.follows WHERE followee_id = $1 AND status = 'pending'`,
  CONNECTIONS: `
    SELECT 'following' AS kind, u.name AS username, f.status, f.created_at, u.is_public
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.followee_id
    WHERE f.follower_id = $1
    UNION ALL
    SELECT CASE WHEN f.status = 'pending' THEN 'request' ELSE 'follower' END, u.name, f.status, f.created_at, u.is_public
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.follower_id
    WHERE f.followee_id = $1
    ORDER BY created_at DESC
  `,
  // Feed: leituras concluídas e livros adicionados por quem $1 segue (pedido
  // aceito) e que mantém "mostrar minha atividade" ligado.
  FEED: `
    WITH followed AS (
      SELECT f.followee_id
      FROM librishelf.follows f
      JOIN librishelf.users u ON u.id = f.followee_id
      WHERE f.follower_id = $1 AND f.status = 'accepted' AND u.show_activity
    ),
    events AS (
      SELECT 'read' AS type, (b.read_date AT TIME ZONE 'UTC') AS at, b.id AS book_id, b.user_id, b.title, b.rating
      FROM librishelf.books b
      WHERE b.user_id IN (SELECT followee_id FROM followed) AND b.read_date IS NOT NULL
      UNION ALL
      SELECT 'added', b.created_at, b.id, b.user_id, b.title, b.rating
      FROM librishelf.books b
      WHERE b.user_id IN (SELECT followee_id FROM followed)
    )
    SELECT e.type, e.at, e.book_id, e.title, e.rating, u.name AS username, u.is_public,
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
