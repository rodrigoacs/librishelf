// Painel, metas, ano em livros e estatísticas do Pro.
// Parte de database/queries.js, que reexporta todos os grupos.

import { AUTHORS_OF } from './fragments.js'

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

export const GOAL_QUERIES = {
  UPSERT: `
    INSERT INTO librishelf.reading_goals (user_id, year, target)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, year) DO UPDATE SET target = EXCLUDED.target, updated_at = now()
    RETURNING year, target
  `,
  DELETE: 'DELETE FROM librishelf.reading_goals WHERE user_id = $1 AND year = $2'
}

// Retrospectiva do ano ($1 usuário, $2 ano): leituras concluídas no ano
// (releitura conta de novo), com a nota daquela leitura ou a do livro.
const IN_YEAR = (col) => `${col} >= make_date($2::int, 1, 1) AND ${col} < make_date($2::int + 1, 1, 1)`

export const YEAR_QUERIES = {
  FINISHED: `
    SELECT r.id, r.book_id, r.started_on, r.finished_on,
           COALESCE(r.rating, b.rating) AS rating,
           b.title, ${AUTHORS_OF('b.id')} AS authors, b.page_count, b.cover_version,
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

// ---------------------------------------------------------------------------
// Estatísticas avançadas (Pro, pacote 27). Base de tudo: as leituras
// concluídas da pessoa ($1). Releitura conta de novo, como no Painel.
// Datas saem como texto (AAAA-MM-DD) para não passar pelo fuso do Node.
// ---------------------------------------------------------------------------
const PRO_STATS_FINISHED = `
    SELECT r.id, r.book_id, r.started_on, r.finished_on,
           COALESCE(r.rating, b.rating) AS rating, b.page_count, b.publisher_id
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE b.user_id = $1 AND r.finished_on IS NOT NULL`

const PRO_STATS_IN_RANGE = `${PRO_STATS_FINISHED} AND r.finished_on >= $2::date AND r.finished_on <= $3::date`

const PRO_STATS_JOINS = {
  author: 'JOIN librishelf.books_authors_link bal ON bal.book_id = f.book_id JOIN librishelf.authors a ON a.id = bal.author_id',
  publisher: 'JOIN librishelf.publishers p ON p.id = f.publisher_id',
  category: 'JOIN librishelf.books_tags_link btl ON btl.book_id = f.book_id JOIN librishelf.tags t ON t.id = btl.tag_id'
}

const PRO_STATS_TOP = (join, name) => `COALESCE((
    SELECT json_agg(x ORDER BY x.count DESC, x.name)
    FROM (SELECT ${name} AS name, count(*)::int AS count FROM f ${join} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3) x
  ), '[]'::json)`

// Leituras por nome (autor ou editora) e ano, para "ao longo dos anos"
const PRO_STATS_OVER_YEARS = (join, name) => `
    WITH f AS (${PRO_STATS_FINISHED}),
    named AS (
      SELECT ${name} AS name, extract(year FROM f.finished_on)::int AS year
      FROM f ${join}
    ),
    top AS (
      SELECT name, count(*)::int AS total FROM named GROUP BY name ORDER BY total DESC, name LIMIT $2
    ),
    firsts AS (SELECT name, min(year) AS year FROM named GROUP BY name)
    SELECT
      (SELECT min(year) FROM named) AS first_year,
      (SELECT max(year) FROM named) AS last_year,
      COALESCE((
        SELECT json_agg(json_build_object('name', t.name, 'total', t.total, 'years', (
          SELECT json_object_agg(n.year, n.c) FROM (
            SELECT year, count(*)::int AS c FROM named WHERE named.name = t.name GROUP BY year
          ) n
        )) ORDER BY t.total DESC, t.name)
        FROM top t
      ), '[]'::json) AS series,
      COALESCE((SELECT json_object_agg(y.year, y.c) FROM (SELECT year, count(*)::int AS c FROM firsts GROUP BY year) y), '{}'::json) AS discovered,
      COALESCE((SELECT json_object_agg(y.year, y.c) FROM (SELECT year, count(DISTINCT name)::int AS c FROM named GROUP BY year) y), '{}'::json) AS distinct_names
  `

const PRO_STATS_LENGTH = `CASE
    WHEN f.page_count < 150 THEN 'short'
    WHEN f.page_count < 300 THEN 'medium'
    WHEN f.page_count < 500 THEN 'long'
    ELSE 'epic' END`

export const PRO_STATS_QUERIES = {
  // Resumo de um período ($2 a $3, inclusive)
  PERIOD: `
    WITH f AS (${PRO_STATS_IN_RANGE})
    SELECT
      (SELECT count(*)::int FROM f) AS readings,
      (SELECT count(DISTINCT book_id)::int FROM f) AS books,
      (SELECT COALESCE(sum(page_count), 0)::int FROM f) AS pages,
      (SELECT round(avg(rating)::numeric, 2)::float FROM f) AS avg_rating,
      (SELECT round(avg(finished_on - started_on + 1)::numeric, 1)::float FROM f WHERE started_on IS NOT NULL) AS avg_days,
      (SELECT count(*)::int FROM f WHERE EXISTS (
        SELECT 1 FROM librishelf.readings e
        WHERE e.book_id = f.book_id AND e.finished_on IS NOT NULL
          AND (e.finished_on < f.finished_on OR (e.finished_on = f.finished_on AND e.id < f.id))
      )) AS rereads,
      ${PRO_STATS_TOP(PRO_STATS_JOINS.author, 'a.name')} AS top_authors,
      ${PRO_STATS_TOP(PRO_STATS_JOINS.publisher, 'p.name')} AS top_publishers,
      ${PRO_STATS_TOP(PRO_STATS_JOINS.category, 't.name')} AS top_categories
  `,

  // Leituras concluídas no ano $2, com a duração (o mesmo dia conta 1)
  PACE_FINISHED: `
    SELECT r.id, r.book_id, b.title, b.page_count,
           r.started_on::text AS started_on, r.finished_on::text AS finished_on,
           extract(month FROM r.finished_on)::int AS month,
           CASE WHEN r.started_on IS NULL THEN NULL ELSE (r.finished_on - r.started_on + 1) END AS days
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE b.user_id = $1 AND r.finished_on >= make_date($2::int, 1, 1) AND r.finished_on < make_date($2::int + 1, 1, 1)
    ORDER BY r.finished_on, r.id
  `,

  // Leituras em andamento, com o progresso salvo
  PACE_CURRENT: `
    SELECT r.book_id, b.title, b.page_count, r.current_page, r.progress_percent,
           r.started_on::text AS started_on, (CURRENT_DATE - r.started_on + 1) AS days,
           CURRENT_DATE::text AS today
    FROM librishelf.readings r
    JOIN librishelf.books b ON b.id = r.book_id
    WHERE b.user_id = $1 AND r.finished_on IS NULL AND r.started_on IS NOT NULL AND r.started_on <= CURRENT_DATE
    ORDER BY r.started_on, r.id
  `,

  OVER_YEARS: {
    authors: PRO_STATS_OVER_YEARS(PRO_STATS_JOINS.author, 'a.name'),
    publishers: PRO_STATS_OVER_YEARS(PRO_STATS_JOINS.publisher, 'p.name')
  },

  // Gráfico personalizado: métrica × agrupamento, só a partir das listas abaixo
  // (nada do pedido entra no SQL além dos parâmetros $1 a $3).
  CHART_METRICS: {
    readings: 'count(*)::int',
    pages: 'COALESCE(sum(f.page_count), 0)::int',
    rating: 'round(avg(f.rating)::numeric, 2)::float',
    days: 'round(avg(f.finished_on - f.started_on + 1)::numeric, 1)::float'
  },
  CHART_GROUPS: {
    month: { key: "to_char(f.finished_on, 'YYYY-MM')" },
    year: { key: 'extract(year FROM f.finished_on)::int::text' },
    weekday: { key: 'extract(isodow FROM f.finished_on)::int::text' },
    author: { key: 'a.name', join: PRO_STATS_JOINS.author },
    publisher: { key: 'p.name', join: PRO_STATS_JOINS.publisher },
    category: { key: 't.name', join: PRO_STATS_JOINS.category },
    rating: { key: 'f.rating::text', where: 'f.rating IS NOT NULL' },
    length: { key: PRO_STATS_LENGTH, where: 'f.page_count IS NOT NULL' }
  },
  CHART(metric, group) {
    const m = this.CHART_METRICS[metric]
    const g = this.CHART_GROUPS[group]
    const where = [g.where, metric === 'days' ? 'f.started_on IS NOT NULL' : null].filter(Boolean)
    return `
      WITH f AS (${PRO_STATS_IN_RANGE})
      SELECT ${g.key} AS key, ${m} AS value
      FROM f ${g.join || ''}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY 1
    `
  }
}
