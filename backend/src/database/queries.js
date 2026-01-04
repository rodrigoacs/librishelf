export const LIBRARY_QUERIES = {
  BASE_SELECT: `
    SELECT
      b.id AS book_id,
      b.title,
      u.name AS user_owner,
      p.name AS publisher_name, -- Alias essencial
      (SELECT STRING_AGG(a.name, ', ')
       FROM librishelf.books_authors_link AS bal
       JOIN librishelf.authors AS a ON bal.author_id = a.id
       WHERE bal.book_id = b.id
      ) AS authors,
      (SELECT STRING_AGG(t.name, ', ')
       FROM librishelf.books_tags_link AS btl
       JOIN librishelf.tags AS t ON btl.tag_id = t.id
       WHERE btl.book_id = b.id
      ) AS tags,
      b.isbn,
      b.read_date,
      b.publication_date
    FROM
      librishelf.books AS b
      LEFT JOIN librishelf.users AS u ON b.user_id = u.id
      LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
  `,

  GET_BOOK_BY_ID: `
    SELECT
      b.id, -- Frontend aceita 'id' ou 'book_id', aqui retorna 'id'
      b.title,
      b.isbn,
      b.read_date,
      b.publication_date,
      p.name AS publisher_name, -- O Frontend procura por .publisher_name
      (SELECT STRING_AGG(a.name, ', ')
       FROM librishelf.books_authors_link AS bal
       JOIN librishelf.authors AS a ON bal.author_id = a.id
       WHERE bal.book_id = b.id
      ) AS authors,
      (SELECT STRING_AGG(t.name, ', ')
       FROM librishelf.books_tags_link AS btl
       JOIN librishelf.tags AS t ON btl.tag_id = t.id
       WHERE btl.book_id = b.id
      ) AS tags
    FROM librishelf.books AS b
    LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
    WHERE b.id = $1
  `,

  GET_OWNER: 'SELECT user_id FROM librishelf.books WHERE id = $1',
  FIND_BY_ISBN: 'SELECT * FROM librishelf.books WHERE isbn = $1 AND user_id = $2',
  DELETE_BOOK: 'DELETE FROM librishelf.books WHERE id = $1',
  UPDATE_READ_DATE: 'UPDATE librishelf.books SET read_date = $1 WHERE id = $2',
  ADD_BOOK_FUNC: 'SELECT librishelf.add_book($1, $2, $3, $4, $5, $6, $7, $8) AS book_id',
  UPDATE_BOOK_FUNC: 'SELECT librishelf.update_book($1, $2, $3, $4, $5, $6, $7, $8)'
}

export const AUTH_QUERIES = {
  FIND_USER_BY_USERNAME: `
    SELECT id, name, password_hash, email 
    FROM librishelf.users 
    WHERE name = $1 OR email = $1
  `,
  CREATE_USER: `
    INSERT INTO librishelf.users (name, password_hash, email) 
    VALUES ($1, $2, $3) 
    RETURNING id, name, email
  `
}

export const AUTHOR_QUERIES = {
  GET_ALL_AUTHORS: 'SELECT DISTINCT name FROM librishelf.authors ORDER BY name',
  GET_AUTHORS_BY_PUBLISHER: `
    SELECT DISTINCT a.name
    FROM librishelf.authors a
    JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
    JOIN librishelf.books b ON bal.book_id = b.id
    JOIN librishelf.publishers p ON b.publisher_id = p.id
    WHERE p.name = ANY($1)
    ORDER BY a.name
  `,
  GET_AUTHORS_BY_USER: `
    SELECT DISTINCT a.name
    FROM librishelf.authors a
    JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
    JOIN librishelf.books b ON b.id = bal.book_id
    WHERE b.user_id = $1
    ORDER BY a.name ASC
  `
}

export const PUBLISHER_QUERIES = {
  GET_ALL_PUBLISHERS: 'SELECT DISTINCT name FROM librishelf.publishers ORDER BY name',
  GET_PUBLISHERS_BY_AUTHOR: `
    SELECT DISTINCT p.name
    FROM librishelf.publishers p
    JOIN librishelf.books b ON p.id = b.publisher_id
    JOIN librishelf.books_authors_link bal ON b.id = bal.book_id
    JOIN librishelf.authors a ON bal.author_id = a.id
    WHERE a.name = ANY($1)
    ORDER BY p.name
  `,
  GET_PUBLISHERS_BY_USER: `
    SELECT DISTINCT p.name
    FROM librishelf.publishers p
    JOIN librishelf.books b ON b.publisher_id = p.id
    WHERE b.user_id = $1
    ORDER BY p.name ASC
  `,
}

export const TAG_QUERIES = {
  GET_ALL_TAGS: `
    SELECT DISTINCT t.name 
    FROM librishelf.tags t
    JOIN librishelf.books_tags_link btl ON t.id = btl.tag_id
    JOIN librishelf.books b ON btl.book_id = b.id
    WHERE b.user_id = $1
    ORDER BY t.name
  `,
  GET_TAGS_BY_USER: `
    SELECT DISTINCT t.name
    FROM librishelf.tags t
    JOIN librishelf.books_tags_link btl ON t.id = btl.tag_id
    JOIN librishelf.books b ON b.id = btl.book_id
    WHERE b.user_id = $1
    ORDER BY t.name ASC
  `
}

export const DASHBOARD_QUERIES = {
  COUNT_TOTAL: `SELECT COUNT(*) as count FROM librishelf.books WHERE user_id = $1`,

  COUNT_READ: `
    SELECT COUNT(*) as count FROM librishelf.books 
    WHERE user_id = $1 AND read_date IS NOT NULL AND read_date::text not like '%101-01-01%'
  `,

  READ_BY_YEAR: `
    SELECT EXTRACT(YEAR FROM read_date::date) as year, COUNT(*) as count
    FROM librishelf.books
    WHERE user_id = $1 AND read_date IS NOT NULL AND read_date::text <> '0101-01-01'
    GROUP BY year
    ORDER BY year DESC
    LIMIT 5
  `,

  TOP_AUTHORS: `
    SELECT a.name, COUNT(b.id) as count
    FROM librishelf.authors a
    JOIN librishelf.books_authors_link bal ON a.id = bal.author_id
    JOIN librishelf.books b ON bal.book_id = b.id
    WHERE b.user_id = $1
    GROUP BY a.name
    ORDER BY count DESC
    LIMIT 6
  `,

  TOP_TAGS: `
    SELECT t.name, COUNT(b.id) as count
    FROM librishelf.tags t
    JOIN librishelf.books_tags_link btl ON t.id = btl.tag_id
    JOIN librishelf.books b ON btl.book_id = b.id
    WHERE b.user_id = $1
    GROUP BY t.name
    ORDER BY count DESC
    LIMIT 6
  `
}