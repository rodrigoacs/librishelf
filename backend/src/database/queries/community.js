// Comunidade: quem mais tem, em comum e recomendações.
// Parte de database/queries.js, que reexporta todos os grupos.

import { SAME_BOOK, NOT_BLOCKED, AUTHORS_OF, AVATAR_FOR } from './fragments.js'

// Usuário $X visível na comunidade para $viewer: biblioteca pública, participa da
// comunidade, conta ativa e sem bloqueio em nenhum dos sentidos.
const IN_COMMUNITY = (u, viewer) => `${u}.is_public AND ${u}.show_in_community AND ${u}.is_active IS NOT FALSE
  AND ${u}.id <> ${viewer} AND ${NOT_BLOCKED(`${u}.id`, viewer)}`

// Obras e ISBNs da estante de $userExpr, cada um sem repetição. Servem para
// achar livros "iguais" com duas buscas indexadas (ol_work_key e isbn13) em vez
// do OR do SAME_BOOK, que obriga o banco a comparar livro a livro.
const MY_KEYS = (userExpr) => `
    my_works AS MATERIALIZED (
      SELECT DISTINCT ol_work_key AS k FROM librishelf.books WHERE user_id = ${userExpr} AND ol_work_key IS NOT NULL
    ),
    my_isbns AS MATERIALIZED (
      SELECT DISTINCT isbn13 AS k FROM librishelf.books WHERE user_id = ${userExpr} AND isbn13 IS NOT NULL
    )`

// Livros das pessoas da CTE people (coluna id) iguais a algum de
// my_works/my_isbns, sem repetir o livro que bate pelos dois lados.
const MATCHING_BOOKS = (people) => `
      SELECT b.id, b.user_id FROM my_works w JOIN librishelf.books b ON b.ol_work_key = w.k
      WHERE b.user_id IN (SELECT id FROM ${people})
      UNION
      SELECT b.id, b.user_id FROM my_isbns i JOIN librishelf.books b ON b.isbn13 = i.k
      WHERE b.user_id IN (SELECT id FROM ${people})`

// O livro b não está na estante dona de my_works/my_isbns.
const NOT_MINE = (b) => `NOT EXISTS (SELECT 1 FROM my_works w WHERE w.k = ${b}.ol_work_key)
        AND NOT EXISTS (SELECT 1 FROM my_isbns i WHERE i.k = ${b}.isbn13)`

export const COMMUNITY_QUERIES = {
  // Outros leitores do livro $1 (que pertence a $2).
  READERS_OF_BOOK: `
    WITH me AS (
      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE id = $1 AND user_id = $2
    )
    SELECT DISTINCT ON (u.id)
      u.name AS username,
      b.rating,
      (b.read_date IS NOT NULL) AS has_read,
      ${AVATAR_FOR('u', '$2')} AS avatar_version
    FROM me
    JOIN librishelf.books b ON ${SAME_BOOK('me', 'b')}
    JOIN librishelf.users u ON u.id = b.user_id
    WHERE b.user_id <> $2 AND u.is_public AND u.show_in_community AND u.is_active IS NOT FALSE AND ${NOT_BLOCKED('u.id', '$2')}
    ORDER BY u.id, b.rating DESC NULLS LAST
  `,

  // "Quem tem este livro também tem": obras mais frequentes nas bibliotecas
  // dos leitores do livro $1 (de $2) que $2 ainda não tem. Devolve só a
  // classificação; título, dono e autores vêm de SAMPLE_BOOKS na hora (o
  // resultado desta fica alguns minutos em cache).
  ALSO_HAVE: `
    WITH me AS MATERIALIZED (
      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE id = $1 AND user_id = $2
    ),
    ${MY_KEYS('$2')},
    peers AS MATERIALIZED (
      SELECT DISTINCT b.user_id
      FROM (
        SELECT b.user_id FROM me JOIN librishelf.books b ON b.ol_work_key = me.ol_work_key
        UNION
        SELECT b.user_id FROM me JOIN librishelf.books b ON b.isbn13 = me.isbn13
      ) b
      JOIN librishelf.users u ON u.id = b.user_id
      WHERE ${IN_COMMUNITY('u', '$2')}
    ),
    candidates AS (
      SELECT b.id, b.title, b.user_id, COALESCE(b.ol_work_key, 'isbn:' || b.isbn13) AS book_key
      FROM librishelf.books b
      WHERE b.user_id IN (SELECT user_id FROM peers)
        AND (b.ol_work_key IS NOT NULL OR b.isbn13 IS NOT NULL)
        AND ${NOT_MINE('b')}
    )
    SELECT book_key,
           count(DISTINCT user_id)::int AS readers,
           (array_agg(id ORDER BY id))[1] AS sample_book_id
    FROM candidates
    GROUP BY book_key
    ORDER BY readers DESC, (array_agg(title ORDER BY id))[1], book_key
    LIMIT $3
  `,

  // Encontrar leitores: só quem tem biblioteca pública E participa da comunidade.
  // $1 = quem procura, $2 = texto (vazio = sugestões), $3 = padrão ILIKE, $4 = limite.
  // Devolve a classificação (id e contagens); nome e "seguir" vêm de
  // READERS_LIVE na hora. "Lidos" só é contado para quem entrou na página.
  FIND_READERS: `
    WITH ${MY_KEYS('$1')},
    readers AS MATERIALIZED (
      SELECT u.id, u.name
      FROM librishelf.users u
      WHERE ${IN_COMMUNITY('u', '$1')}
        AND ($2 = '' OR u.name ILIKE $3)
    ),
    matches AS (${MATCHING_BOOKS('readers')}
    ),
    common AS (
      SELECT user_id, count(*)::int AS n FROM matches GROUP BY user_id
    ),
    totals AS (
      SELECT user_id, count(*)::int AS n FROM librishelf.books
      WHERE user_id IN (SELECT id FROM readers)
      GROUP BY user_id
    ),
    page AS (
      SELECT r.id, r.name, COALESCE(c.n, 0) AS common_books, COALESCE(t.n, 0) AS total_books,
             row_number() OVER (
               ORDER BY (lower(r.name) = lower($2)) DESC, COALESCE(c.n, 0) DESC, COALESCE(t.n, 0) DESC, r.name
             ) AS position
      FROM readers r
      LEFT JOIN common c ON c.user_id = r.id
      LEFT JOIN totals t ON t.user_id = r.id
      WHERE $2 <> '' OR c.n > 0 OR t.n > 0
      ORDER BY position
      LIMIT $4
    )
    SELECT p.id, p.common_books, p.total_books,
           (SELECT count(*)::int FROM librishelf.books b WHERE b.user_id = p.id AND b.read_date IS NOT NULL) AS read_books
    FROM page p
    ORDER BY p.position
  `,

  // Parte "ao vivo" da busca de leitores: dos ids $2 já classificados, quem
  // ainda pode aparecer para $1 agora (privacidade, bloqueio, conta ativa),
  // com o nome atual e a situação de "seguir".
  READERS_LIVE: `
    SELECT u.id, u.name AS username, u.show_activity AS accepts_followers, f.status AS follow_status,
           ${AVATAR_FOR('u', '$1')} AS avatar_version
    FROM librishelf.users u
    LEFT JOIN librishelf.follows f ON f.follower_id = $1 AND f.followee_id = u.id
    WHERE u.id = ANY($2::int[]) AND ${IN_COMMUNITY('u', '$1')}
  `,

  // Recomendações para o Início: obras das bibliotecas da comunidade que $1
  // não tem. Pesa mais quem tem livros em comum com $1 e as notas altas; sem
  // ninguém em comum, vira "populares na comunidade". Devolve a classificação;
  // título, dono e autores vêm de SAMPLE_BOOKS na hora.
  RECOMMENDATIONS: `
    WITH ${MY_KEYS('$1')},
    community AS MATERIALIZED (
      SELECT u.id FROM librishelf.users u WHERE ${IN_COMMUNITY('u', '$1')}
    ),
    matches AS (${MATCHING_BOOKS('community')}
    ),
    peers AS (
      SELECT user_id, count(*)::int AS shared FROM matches GROUP BY user_id
    ),
    candidates AS (
      SELECT b.id, b.user_id, b.rating, COALESCE(p.shared, 0) AS shared,
             COALESCE(b.ol_work_key, 'isbn:' || b.isbn13) AS book_key
      FROM librishelf.books b
      LEFT JOIN peers p ON p.user_id = b.user_id
      WHERE b.user_id IN (SELECT id FROM community)
        AND (b.ol_work_key IS NOT NULL OR b.isbn13 IS NOT NULL)
        AND ${NOT_MINE('b')}
    )
    SELECT book_key,
           count(DISTINCT user_id)::int AS readers,
           count(DISTINCT user_id) FILTER (WHERE shared > 0)::int AS similar_readers,
           round(avg(rating)::numeric, 1)::float AS average_rating,
           sum(1 + LEAST(shared, 10) + CASE WHEN rating >= 4 THEN 2 ELSE 0 END)::int AS score,
           (array_agg(id ORDER BY rating DESC NULLS LAST, id))[1] AS sample_book_id
    FROM candidates
    GROUP BY book_key
    ORDER BY score DESC, readers DESC, book_key
    LIMIT $2
  `,

  // Parte "ao vivo" de recomendações e "também têm": dos livros de exemplo $2,
  // os que ainda podem ser mostrados a $1 (dono visível para ele, sem bloqueio)
  // e que $1 ainda não tem (acabou de pôr em "Quero ler", por exemplo).
  SAMPLE_BOOKS: `
    SELECT sb.id, sb.title, sb.cover_version, u.name AS owner, ${AUTHORS_OF('sb.id')} AS authors
    FROM librishelf.books sb
    JOIN librishelf.users u ON u.id = sb.user_id
    WHERE sb.id = ANY($2::int[]) AND ${IN_COMMUNITY('u', '$1')}
      AND NOT EXISTS (
        SELECT 1 FROM librishelf.books m
        WHERE m.user_id = $1 AND ${SAME_BOOK('sb', 'm')}
      )
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
