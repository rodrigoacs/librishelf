export const LIBRARY_QUERIES = {
  BASE_SELECT: `
    SELECT
      b.id AS book_id,
      b.title,
      u.name AS user_owner,
      p.name AS publisher_name,
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
  GET_OWNER: 'SELECT user_id FROM librishelf.books WHERE id = $1',
  FIND_BY_ISBN: 'SELECT * FROM librishelf.books WHERE isbn = $1 AND user_id = $2',
  DELETE_BOOK: 'DELETE FROM librishelf.books WHERE id = $1',
  UPDATE_READ_DATE: 'UPDATE librishelf.books SET read_date = $1 WHERE id = $2',
  ADD_BOOK_FUNC: 'SELECT librishelf.add_book($1, $2, $3, $4, $5, $6, $7, $8) AS book_id',
  UPDATE_BOOK_FUNC: 'SELECT librishelf.update_book($1, $2, $3, $4, $5, $6, $7, $8)'
}

export const AUTH_QUERIES = {
  FIND_USER_BY_USERNAME: 'SELECT * FROM librishelf.users WHERE name = $1',
  CREATE_USER: `
    INSERT INTO librishelf.users (name, password) 
    VALUES ($1, $2) 
    RETURNING id, name
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
  `
}

export const PUBLISHER_QUERIES = {
  GET_ALL_PUBLISHERS: 'SELECT DISTINCT name FROM librishelf.publishers ORDER BY name',

  GET_PUBLISHERS_BY_AUTHOR: `
    SELECT DISTINCT p.name, a.name AS author_name
    FROM librishelf.publishers p
    JOIN librishelf.books b ON p.id = b.publisher_id
    JOIN librishelf.books_authors_link bal ON b.id = bal.book_id
    JOIN librishelf.authors a ON bal.author_id = a.id
    WHERE a.name = ANY($1)
    ORDER BY p.name
  `
}