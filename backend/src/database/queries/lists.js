// Listas, séries e empréstimos.
// Parte de database/queries.js, que reexporta todos os grupos.

import { AUTHORS_OF } from './fragments.js'

// Listas: resumo (para as grades) com as 4 primeiras capas e a contagem
const LIST_SUMMARY = `
  l.id, l.user_id, l.title, l.description, l.is_public, l.ranked, l.created_at, l.updated_at,
  (SELECT count(*)::int FROM librishelf.list_items li WHERE li.list_id = l.id) AS item_count,
  (SELECT COALESCE(json_agg(json_build_object('bookId', c.id, 'title', c.title, 'authors', c.authors, 'coverVersion', c.cover_version) ORDER BY c.ord), '[]')
   FROM (
     SELECT b.id, b.title, b.cover_version, ${AUTHORS_OF('b.id')} AS authors, row_number() OVER (ORDER BY li.position, li.added_at) AS ord
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
           b.series, b.series_index, b.cover_version
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

// ---------------------------------------------------------------------------
// Coleção (pacote 28): empréstimos (grátis) e exemplar (Pro: collector).
// Datas saem como texto (AAAA-MM-DD).
// ---------------------------------------------------------------------------
const COLLECTION_LOAN_FIELDS = `l.id, l.book_id, l.borrower, l.lent_on::text AS lent_on, l.due_on::text AS due_on,
       l.returned_on::text AS returned_on, l.notes, l.remind`

export const COLLECTION_QUERIES = {
  OWNED_BOOK: 'SELECT id, title FROM librishelf.books WHERE id = $1 AND user_id = $2',
  LOANS_OF_BOOK: `
    SELECT ${COLLECTION_LOAN_FIELDS}
    FROM librishelf.loans l
    WHERE l.book_id = $1 AND l.user_id = $2
    ORDER BY l.returned_on IS NULL DESC, l.lent_on DESC, l.id DESC
  `,
  // status: 'open' | 'returned' | 'all'
  LOANS: `
    SELECT ${COLLECTION_LOAN_FIELDS}, b.title, b.cover_version,
           (SELECT string_agg(a.name, ', ' ORDER BY bal.position, a.id)
              FROM librishelf.books_authors_link bal JOIN librishelf.authors a ON a.id = bal.author_id
             WHERE bal.book_id = b.id) AS authors,
           (l.returned_on IS NULL AND l.due_on < CURRENT_DATE) AS overdue
    FROM librishelf.loans l
    JOIN librishelf.books b ON b.id = l.book_id
    WHERE l.user_id = $1
      AND ($2 = 'all' OR ($2 = 'open' AND l.returned_on IS NULL) OR ($2 = 'returned' AND l.returned_on IS NOT NULL))
    ORDER BY l.returned_on IS NULL DESC, l.due_on NULLS LAST, l.lent_on DESC, l.id DESC
    LIMIT 500
  `,
  LOAN: `SELECT ${COLLECTION_LOAN_FIELDS}, l.user_id FROM librishelf.loans l WHERE l.id = $1 AND l.user_id = $2`,
  INSERT_LOAN: `
    INSERT INTO librishelf.loans (user_id, book_id, borrower, lent_on, due_on, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `,
  UPDATE_LOAN: `
    UPDATE librishelf.loans
    SET borrower = $3, lent_on = $4, due_on = $5, notes = $6, updated_at = now()
    WHERE id = $1 AND user_id = $2
  `,
  RETURN_LOAN: `
    UPDATE librishelf.loans SET returned_on = $3, updated_at = now()
    WHERE id = $1 AND user_id = $2 AND returned_on IS NULL
  `,
  DELETE_LOAN: 'DELETE FROM librishelf.loans WHERE id = $1 AND user_id = $2',
  SET_REMIND: 'UPDATE librishelf.loans SET remind = $3, updated_at = now() WHERE id = $1 AND user_id = $2',

  // E-mail de lembrete: montado na hora de enviar
  REMINDER: `
    SELECT l.id, l.user_id, l.borrower, l.due_on::text AS due_on, l.returned_on, l.remind, l.book_id,
           b.title, u.name, u.email, u.email_verified_at, u.email_locale
    FROM librishelf.loans l
    JOIN librishelf.books b ON b.id = l.book_id
    JOIN librishelf.users u ON u.id = l.user_id
    WHERE l.id = $1
  `,

  COPY: `
    SELECT location, price_cents, value_cents, currency, acquired_on::text AS acquired_on
    FROM librishelf.book_copies WHERE book_id = $1 AND user_id = $2
  `,
  UPSERT_COPY: `
    INSERT INTO librishelf.book_copies (book_id, user_id, location, price_cents, value_cents, currency, acquired_on)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (book_id) DO UPDATE SET
      location = EXCLUDED.location, price_cents = EXCLUDED.price_cents, value_cents = EXCLUDED.value_cents,
      currency = EXCLUDED.currency, acquired_on = EXCLUDED.acquired_on, updated_at = now()
  `,
  DELETE_COPY: 'DELETE FROM librishelf.book_copies WHERE book_id = $1 AND user_id = $2',

  PHOTOS_OF_BOOK: `
    SELECT id, width, height, created_at FROM librishelf.copy_photos
    WHERE book_id = $1 AND user_id = $2 ORDER BY id
  `,
  PHOTO: 'SELECT id, book_id, user_id FROM librishelf.copy_photos WHERE id = $1 AND book_id = $2 AND user_id = $3',
  // Trava a conta enquanto confere a cota (dois envios juntos não passam do limite)
  LOCK_USER: 'SELECT id FROM librishelf.users WHERE id = $1 FOR UPDATE',
  PHOTO_COUNTS: `
    SELECT count(*)::int AS total, count(*) FILTER (WHERE book_id = $2)::int AS in_book
    FROM librishelf.copy_photos WHERE user_id = $1
  `,
  INSERT_PHOTO: `
    INSERT INTO librishelf.copy_photos (book_id, user_id, bytes, width, height)
    VALUES ($1, $2, $3, $4, $5) RETURNING id, width, height, created_at
  `,
  DELETE_PHOTO: 'DELETE FROM librishelf.copy_photos WHERE id = $1 AND user_id = $2',

  SUMMARY: `
    SELECT
      (SELECT count(*)::int FROM librishelf.loans WHERE user_id = $1 AND returned_on IS NULL) AS open_loans,
      (SELECT count(*)::int FROM librishelf.loans WHERE user_id = $1 AND returned_on IS NULL AND due_on < CURRENT_DATE) AS overdue_loans,
      (SELECT count(*)::int FROM librishelf.book_copies WHERE user_id = $1 AND location IS NOT NULL) AS located,
      (SELECT count(*)::int FROM librishelf.copy_photos WHERE user_id = $1) AS photos,
      COALESCE((
        SELECT json_agg(x ORDER BY x.currency)
        FROM (
          SELECT currency, count(*)::int AS books,
                 COALESCE(sum(price_cents), 0)::bigint::text AS paid_cents,
                 COALESCE(sum(COALESCE(value_cents, price_cents)), 0)::bigint::text AS value_cents
          FROM librishelf.book_copies
          WHERE user_id = $1 AND (price_cents IS NOT NULL OR value_cents IS NOT NULL)
          GROUP BY currency
        ) x
      ), '[]'::json) AS totals
  `,

  EXPORT_LOANS: `
    SELECT l.book_id, b.title, l.borrower, l.lent_on::text AS lent_on, l.due_on::text AS due_on,
           l.returned_on::text AS returned_on, l.notes, l.remind
    FROM librishelf.loans l JOIN librishelf.books b ON b.id = l.book_id
    WHERE l.user_id = $1 ORDER BY l.lent_on, l.id
  `,
  EXPORT_COPIES: `
    SELECT c.book_id, b.title, c.location, c.price_cents, c.value_cents, c.currency, c.acquired_on::text AS acquired_on,
           (SELECT count(*)::int FROM librishelf.copy_photos p WHERE p.book_id = c.book_id) AS photos
    FROM librishelf.book_copies c JOIN librishelf.books b ON b.id = c.book_id
    WHERE c.user_id = $1 ORDER BY b.title, c.book_id
  `,
  BOOKS_OF_USER: 'SELECT id FROM librishelf.books WHERE user_id = $1'
}
