// Métricas da página pública (pacote 41): contagem por dono e por dia.
// Parte de database/queries.js, que reexporta todos os grupos.

export const PUBLIC_METRIC_QUERIES = {
  // $1 dono, $2 dia (AAAA-MM-DD no fuso do app), $3 evento
  INCREMENT: `
    INSERT INTO librishelf.public_page_daily (owner_id, day, event, count)
    VALUES ($1, $2::date, $3, 1)
    ON CONFLICT (owner_id, day, event) DO UPDATE SET count = librishelf.public_page_daily.count + 1
  `,

  // Visitas do dono a partir de $2 (inclusive): [{ day, count }]
  OWNER_VISITS: `
    SELECT to_char(day, 'YYYY-MM-DD') AS day, count
    FROM librishelf.public_page_daily
    WHERE owner_id = $1 AND event = 'visit' AND day >= $2::date
    ORDER BY day
  `,

  // Todas as páginas, por dia e evento, a partir de $1
  DAILY_TOTALS: `
    SELECT to_char(day, 'YYYY-MM-DD') AS day, event, sum(count)::int AS count
    FROM librishelf.public_page_daily
    WHERE day >= $1::date
    GROUP BY day, event
    ORDER BY day
  `,

  // Páginas mais visitadas no período (nome é público: /u/nome)
  TOP_PAGES: `
    SELECT u.name AS username,
           sum(p.count) FILTER (WHERE p.event = 'visit')::int AS visits,
           COALESCE(sum(p.count) FILTER (WHERE p.event = 'signup'), 0)::int AS signups
    FROM librishelf.public_page_daily p
    JOIN librishelf.users u ON u.id = p.owner_id
    WHERE p.day >= $1::date
    GROUP BY u.name
    HAVING sum(p.count) FILTER (WHERE p.event = 'visit') > 0
    ORDER BY visits DESC, u.name
    LIMIT $2
  `
}
