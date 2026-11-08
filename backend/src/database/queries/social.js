// Seguir leitores e os avisos por e-mail de seguidores.
// Parte de database/queries.js, que reexporta todos os grupos.

import { AUTHORS_OF, AVATAR_FOR } from './fragments.js'

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
    SELECT 'following' AS kind, u.name AS username, f.status, f.created_at, u.is_public, ${AVATAR_FOR('u', '$1')} AS avatar_version
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.followee_id
    WHERE f.follower_id = $1 AND u.is_active IS NOT FALSE
    UNION ALL
    SELECT CASE WHEN f.status = 'pending' THEN 'request' ELSE 'follower' END, u.name, f.status, f.created_at, u.is_public, ${AVATAR_FOR('u', '$1')}
    FROM librishelf.follows f JOIN librishelf.users u ON u.id = f.follower_id
    WHERE f.followee_id = $1 AND u.is_active IS NOT FALSE
    ORDER BY created_at DESC
  `,
  // Feed: leituras concluídas e livros adicionados por quem $1 segue (pedido
  // aceito) e que mantém "mostrar minha atividade" ligado.
  // $4 = incluir resenhas e listas (o app no celular pede; o resto recebe só
  // "adicionou" e "leu", como antes). Resenha: a que não foi ocultada pela
  // moderação, de quem a pessoa segue (público e "só seguidores" valem aqui,
  // porque o seguir foi aceito). Lista: só as públicas e com algum livro.
  FEED: `
    WITH followed AS (
      SELECT f.followee_id
      FROM librishelf.follows f
      JOIN librishelf.users u ON u.id = f.followee_id
      WHERE f.follower_id = $1 AND f.status = 'accepted' AND u.show_activity AND u.is_active IS NOT FALSE
    ),
    events AS (
      -- day: a data da leitura como foi escolhida (sem fuso); at só ordena
      SELECT 'read' AS type, (r.finished_on::timestamp AT TIME ZONE 'UTC') AS at, to_char(r.finished_on, 'YYYY-MM-DD') AS day,
             b.id AS book_id, b.user_id, b.title, b.rating, b.cover_version,
             (row_number() OVER (PARTITION BY r.book_id ORDER BY r.finished_on, r.id) > 1) AS reread,
             NULL::integer AS item_id
      FROM librishelf.readings r
      JOIN librishelf.books b ON b.id = r.book_id
      WHERE b.user_id IN (SELECT followee_id FROM followed) AND r.finished_on IS NOT NULL
      UNION ALL
      SELECT 'added', b.created_at, NULL, b.id, b.user_id, b.title, b.rating, b.cover_version, false, NULL
      FROM librishelf.books b
      WHERE b.user_id IN (SELECT followee_id FROM followed)
      UNION ALL
      SELECT 'review', rv.created_at, NULL, b.id, b.user_id, b.title, b.rating, b.cover_version, false, rv.id
      FROM librishelf.reviews rv
      JOIN librishelf.books b ON b.id = rv.book_id
      WHERE $4 AND rv.user_id IN (SELECT followee_id FROM followed) AND rv.hidden_at IS NULL
      UNION ALL
      SELECT 'list', l.created_at, NULL, NULL, l.user_id, l.title, NULL, NULL, false, l.id
      FROM librishelf.lists l
      WHERE $4 AND l.is_public AND l.user_id IN (SELECT followee_id FROM followed)
        AND EXISTS (SELECT 1 FROM librishelf.list_items li WHERE li.list_id = l.id)
    )
    SELECT e.type, e.at, e.day, e.book_id, e.title, e.rating, e.cover_version, e.reread, u.name AS username, u.is_public,
           ${AVATAR_FOR('u', '$1')} AS avatar_version,
           CASE WHEN e.book_id IS NOT NULL THEN ${AUTHORS_OF('e.book_id')} END AS authors,
           CASE WHEN e.type = 'review' THEN rv.id END AS review_id,
           CASE WHEN e.type = 'review' THEN left(rv.body, 280) END AS review_body,
           CASE WHEN e.type = 'review' THEN char_length(rv.body) > 280 END AS review_cut,
           CASE WHEN e.type = 'review' THEN rv.has_spoiler END AS review_spoiler,
           CASE WHEN e.type = 'list' THEN e.item_id END AS list_id,
           CASE WHEN e.type = 'list' THEN l.ranked END AS list_ranked,
           CASE WHEN e.type = 'list' THEN (SELECT count(*)::int FROM librishelf.list_items li WHERE li.list_id = e.item_id) END AS list_count,
           CASE WHEN e.type = 'list' THEN (
             SELECT json_agg(json_build_object('bookId', x.id, 'title', x.title, 'coverVersion', x.cover_version, 'position', x.position) ORDER BY x.position)
             FROM (
               SELECT b.id, b.title, b.cover_version, li.position
               FROM librishelf.list_items li JOIN librishelf.books b ON b.id = li.book_id
               WHERE li.list_id = e.item_id ORDER BY li.position LIMIT 5
             ) x
           ) END AS list_books
    FROM events e
    JOIN librishelf.users u ON u.id = e.user_id
    LEFT JOIN librishelf.reviews rv ON e.type = 'review' AND rv.id = e.item_id
    LEFT JOIN librishelf.lists l ON e.type = 'list' AND l.id = e.item_id
    ORDER BY e.at DESC, e.book_id DESC NULLS LAST, e.type, e.item_id
    LIMIT $2 OFFSET $3
  `
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
