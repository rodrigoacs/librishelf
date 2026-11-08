// Admin: contas, moderação, cobranças e erros.
// Parte de database/queries.js, que reexporta todos os grupos.

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

// Administração da monetização: conceder/revogar Pro, pagamentos e reembolso,
// ofertas, webhooks e fila de jobs.
export const ADMIN_BILLING_QUERIES = {
  USER_LOCK: `SELECT id FROM librishelf.users WHERE id = $1 FOR UPDATE`,

  // $3 nulo = vitalício
  GRANT: `
    INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at, granted_by, note)
    VALUES ($1, $2, 'grant', 'active', now(),
            CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(days => $3::int) END,
            $4, $5)
    RETURNING id, kind, starts_at, ends_at
  `,

  ENTITLEMENT_LOCK: `
    SELECT id, user_id, kind, source, status, auto_renew, external_id, ends_at
    FROM librishelf.entitlements WHERE id = $1
    FOR UPDATE
  `,

  REVOKE: `
    UPDATE librishelf.entitlements
    SET status = 'canceled', auto_renew = false, canceled_at = COALESCE(canceled_at, now()), updated_at = now()
    WHERE id = $1 AND status = 'active'
    RETURNING id
  `,

  REFUND_ENTITLEMENT: `
    UPDATE librishelf.entitlements
    SET status = 'refunded', auto_renew = false, canceled_at = COALESCE(canceled_at, now()), updated_at = now()
    WHERE id = $1 AND status <> 'refunded'
    RETURNING id
  `,

  USER_ENTITLEMENTS: `
    SELECT e.id, e.kind, e.source, e.status, e.starts_at, e.ends_at, e.auto_renew, e.canceled_at,
           e.note, e.created_at, g.name AS granted_by,
           (e.status = 'active' AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())) AS current
    FROM librishelf.entitlements e
    LEFT JOIN librishelf.users g ON g.id = e.granted_by
    WHERE e.user_id = $1
    ORDER BY e.created_at DESC, e.id DESC
  `,

  USER_PAYMENTS: `
    SELECT id, offer_code, method, amount_cents, currency, status, paid_at, refunded_at, problem, created_at
    FROM librishelf.payments
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `,

  USER_TRIAL: `SELECT pro_trial_used_at FROM librishelf.users WHERE id = $1`,

  // $1: all | problem (aprovado sem Pro, ainda sem reembolso) | refunded
  PAYMENTS: `
    SELECT p.id, p.user_id, u.name AS username, p.offer_code, p.external_id, p.method, p.amount_cents,
           p.currency, p.status, p.problem, p.paid_at, p.refunded_at, rb.name AS refunded_by,
           p.entitlement_id, p.created_at, count(*) OVER ()::int AS total
    FROM librishelf.payments p
    LEFT JOIN librishelf.users u ON u.id = p.user_id
    LEFT JOIN librishelf.users rb ON rb.id = p.refunded_by
    WHERE $1::text = 'all'
       OR ($1::text = 'problem' AND p.problem IS NOT NULL AND p.refunded_at IS NULL)
       OR ($1::text = 'refunded' AND p.refunded_at IS NOT NULL)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $2 OFFSET $3
  `,

  PAYMENT_LOCK: `
    SELECT id, user_id, offer_code, external_id, amount_cents, status, entitlement_id, refunded_at, problem
    FROM librishelf.payments WHERE id = $1
    FOR UPDATE
  `,

  MARK_REFUNDED: `
    UPDATE librishelf.payments SET refunded_at = now(), refunded_by = $2, updated_at = now()
    WHERE id = $1
    RETURNING refunded_at
  `,

  OFFERS: `
    SELECT o.code, o.price_cents, o.currency, o.duration, o.auto_renew, o.slots_total, o.slots_used,
           o.starts_at, o.ends_at, o.active, o.updated_at,
           (SELECT count(*) FROM librishelf.offer_reservations r
             WHERE r.offer_code = o.code AND r.status = 'pending' AND r.holds_slot)::int AS held_slots
    FROM librishelf.offers o
    ORDER BY array_position(ARRAY['monthly', 'annual', 'founder_annual', 'founder_lifetime', 'vanguarda'], o.code)
  `,

  OFFER_LOCK: `
    SELECT code, price_cents, slots_total, slots_used, starts_at, ends_at, active
    FROM librishelf.offers WHERE code = $1
    FOR UPDATE
  `,

  OFFER_UPDATE: `
    UPDATE librishelf.offers
    SET active = $2, starts_at = $3, ends_at = $4, slots_total = $5, updated_at = now()
    WHERE code = $1
  `,

  // Pro ativo agora, por tipo (só o que vale de verdade)
  ACTIVE_PRO: `
    SELECT kind, count(DISTINCT user_id)::int AS total
    FROM librishelf.entitlements
    WHERE status = 'active' AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
    GROUP BY kind
  `,

  REVENUE_30: `
    SELECT COALESCE(sum(amount_cents) FILTER (WHERE refunded_at IS NULL AND status = 'approved'), 0)::int AS received,
           COALESCE(sum(amount_cents) FILTER (WHERE refunded_at IS NOT NULL), 0)::int AS refunded,
           count(*) FILTER (WHERE status = 'approved' AND refunded_at IS NULL)::int AS payments
    FROM librishelf.payments
    WHERE paid_at > now() - interval '30 days'
  `,

  // $1: error (falhou e não foi processado) | pending | all
  WEBHOOKS: `
    SELECT id, provider, topic, resource_id, received_at, processed_at, attempts, error,
           count(*) OVER ()::int AS total
    FROM librishelf.webhook_events
    WHERE $1::text = 'all'
       OR ($1::text = 'error' AND error IS NOT NULL AND processed_at IS NULL)
       OR ($1::text = 'pending' AND processed_at IS NULL)
    ORDER BY received_at DESC, id DESC
    LIMIT $2 OFFSET $3
  `,

  WEBHOOK: `SELECT id, topic, resource_id FROM librishelf.webhook_events WHERE id = $1`,

  FAILED_JOBS: `
    SELECT id, type, attempts, max_attempts, last_error, failed_at, created_at
    FROM librishelf.jobs
    WHERE failed_at IS NOT NULL
    ORDER BY failed_at DESC, id DESC
    LIMIT 20
  `
}

// ---------------------------------------------------------------------------
// Erros (pacote 37): uma linha por assinatura, ocorrências somadas
// ---------------------------------------------------------------------------
export const ERROR_REPORT_QUERIES = {
  // Voltar a acontecer depois de resolvido reabre
  UPSERT: `
    INSERT INTO librishelf.error_reports (source, signature, message, location, detail)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (signature) DO UPDATE
    SET occurrences = librishelf.error_reports.occurrences + 1,
        last_seen_at = now(),
        message = EXCLUDED.message,
        detail = EXCLUDED.detail,
        resolved_at = NULL
  `,

  // $1: open | resolved | all; $2: origem ou null
  LIST: `
    SELECT id, source, message, location, detail, occurrences, first_seen_at, last_seen_at, resolved_at,
           count(*) OVER ()::int AS total
    FROM librishelf.error_reports
    WHERE ($1::text = 'all' OR ($1::text = 'open' AND resolved_at IS NULL) OR ($1::text = 'resolved' AND resolved_at IS NOT NULL))
      AND ($2::text IS NULL OR source = $2::text)
    ORDER BY last_seen_at DESC, id DESC
    LIMIT $3 OFFSET $4
  `,

  OPEN_COUNT: `SELECT count(*)::int AS open FROM librishelf.error_reports WHERE resolved_at IS NULL`,

  RESOLVE: `
    UPDATE librishelf.error_reports SET resolved_at = now()
    WHERE id = $1 AND resolved_at IS NULL
    RETURNING id, source, message, location
  `,

  // Resumo por e-mail: abertos que aconteceram depois do último resumo
  LAST_DIGEST: `SELECT max(notified_at) AS at FROM librishelf.error_reports`,
  PENDING_DIGEST: `
    SELECT id, source, message, location, occurrences, first_seen_at, last_seen_at, (notified_at IS NULL) AS is_new
    FROM librishelf.error_reports
    WHERE resolved_at IS NULL AND (notified_at IS NULL OR last_seen_at > notified_at)
    ORDER BY (notified_at IS NULL) DESC, last_seen_at DESC
  `,
  MARK_NOTIFIED: `UPDATE librishelf.error_reports SET notified_at = now() WHERE id = ANY($1::bigint[])`,

  CLEANUP: `DELETE FROM librishelf.error_reports WHERE last_seen_at < now() - make_interval(days => $1)`
}
