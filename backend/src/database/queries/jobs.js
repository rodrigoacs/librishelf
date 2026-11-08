// Fila de jobs e limite diário da caixa de e-mail.
// Parte de database/queries.js, que reexporta todos os grupos.

// Fila de jobs no Postgres. Cada worker pega um job por vez com
// FOR UPDATE SKIP LOCKED (dois workers nunca pegam o mesmo) e marca o lock;
// o job roda fora da transação. Lock mais velho que $3 segundos é de um
// worker que morreu no meio: o job volta a ficar disponível.
export const JOB_QUERIES = {
  ENQUEUE: `
    INSERT INTO librishelf.jobs (type, payload, run_at, dedupe_key, max_attempts)
    VALUES ($1, $2, COALESCE($3, now()), $4, $5)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `,

  CLAIM: `
    UPDATE librishelf.jobs j
    SET locked_at = now(), locked_by = $1, attempts = j.attempts + 1
    WHERE j.id = (
      SELECT id FROM librishelf.jobs
      WHERE done_at IS NULL AND failed_at IS NULL AND run_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - make_interval(secs => $2::int))
        AND ($3::text[] IS NULL OR type = ANY($3))
      ORDER BY run_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING j.id, j.type, j.payload, j.attempts, j.max_attempts, j.run_at
  `,

  COMPLETE: `
    UPDATE librishelf.jobs
    SET done_at = now(), locked_at = NULL, locked_by = NULL, last_error = NULL
    WHERE id = $1 AND locked_by = $2
  `,

  // Tenta de novo em $3 segundos, ou desiste de vez ao chegar em max_attempts
  FAIL: `
    UPDATE librishelf.jobs
    SET locked_at = NULL, locked_by = NULL, last_error = $3,
        failed_at = CASE WHEN attempts >= max_attempts OR $4::boolean THEN now() END,
        run_at = CASE WHEN attempts >= max_attempts OR $4::boolean THEN run_at ELSE now() + make_interval(secs => $5::int) END
    WHERE id = $1 AND locked_by = $2
    RETURNING failed_at IS NOT NULL AS gave_up
  `,

  // Jobs terminados há mais de N dias (os falhados ficam para a administração ver)
  CLEANUP: `
    DELETE FROM librishelf.jobs
    WHERE done_at IS NOT NULL AND done_at < now() - make_interval(days => $1)
  `,

  // Pro vencido: o acesso já acabou em ends_at (a checagem é pelo horário);
  // aqui só o status passa a dizer isso.
  EXPIRE_ENTITLEMENTS: `
    UPDATE librishelf.entitlements
    SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= now()
    RETURNING id, user_id, kind
  `,

  // Vaga de fundador presa num checkout que não foi pago a tempo volta para a oferta
  RELEASE_RESERVATIONS: `
    WITH released AS (
      UPDATE librishelf.offer_reservations
      SET status = 'released', updated_at = now()
      WHERE status = 'pending' AND expires_at <= now()
      RETURNING offer_code, holds_slot
    ), counted AS (
      SELECT offer_code, count(*)::int AS n FROM released WHERE holds_slot GROUP BY offer_code
    )
    UPDATE librishelf.offers o
    SET slots_used = GREATEST(o.slots_used - c.n, 0), updated_at = now()
    FROM counted c
    WHERE o.code = c.offer_code
    RETURNING o.code, c.n AS released
  `,

  STATS: `
    SELECT type,
           count(*) FILTER (WHERE done_at IS NULL AND failed_at IS NULL)::int AS pending,
           count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS failed,
           max(done_at) AS last_done_at
    FROM librishelf.jobs
    GROUP BY type
    ORDER BY type
  `
}

// Limite de envio da caixa SMTP (librishelf.email_sends, janela de 24 h) e o
// adiamento de jobs que esperam vaga.
export const MAIL_QUEUE_QUERIES = {
  // Uma reserva de cada vez entre todos os processos: contar e gravar não se cruzam
  LOCK: `SELECT pg_advisory_xact_lock(hashtext('librishelf.email_sends'))`,

  COUNT_24H: `
    SELECT count(*)::int AS total FROM librishelf.email_sends
    WHERE sent_at > now() - interval '24 hours'
  `,

  INSERT: `
    INSERT INTO librishelf.email_sends (kind, user_id) VALUES ($1, $2)
    RETURNING id
  `,

  DELETE: `DELETE FROM librishelf.email_sends WHERE id = $1`,

  // Segundos até o envio mais antigo da janela sair dela (abre uma vaga)
  NEXT_SLOT_SECONDS: `
    SELECT COALESCE(ceil(EXTRACT(EPOCH FROM (min(sent_at) + interval '24 hours' - now()))), 0)::int AS seconds
    FROM librishelf.email_sends
    WHERE sent_at > now() - interval '24 hours'
  `,

  PURGE: `DELETE FROM librishelf.email_sends WHERE sent_at < now() - interval '2 days'`,

  // Job sem vaga agora: volta para a fila mais tarde sem gastar tentativa
  DEFER_JOB: `
    UPDATE librishelf.jobs
    SET locked_at = NULL, locked_by = NULL, attempts = GREATEST(attempts - 1, 0),
        run_at = now() + make_interval(secs => $3::int)
    WHERE id = $1 AND locked_by = $2
  `
}
