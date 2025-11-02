import { db } from "../database/connection.js"

async function getAllBooksByUser(userId, readState) {
  const result = await db.query(`
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
  WHERE b.user_id = $1
    AND ($2::boolean IS TRUE OR b.read_date IS NOT NULL)`, [userId, readState])
  return result.rows || null
}

async function getBookById(id) {
  const result = await db.query(`SELECT
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
  WHERE 
    b.id = $1`, [id])
  return result.rows[0] || null
}

export { getAllBooksByUser, getBookById }
