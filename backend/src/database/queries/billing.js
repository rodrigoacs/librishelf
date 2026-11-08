// Pro e Mercado Pago: direitos, checkout, webhooks, assinatura, e-mails e desistência.
// Parte de database/queries.js, que reexporta todos os grupos.

// "Tem Pro" = entitlement 'active', já começado e com ends_at nulo (vitalício)
// ou no futuro. O fim vale na hora: não depende do job de expiração, que só
// troca o status para 'expired' depois.
export const ENTITLEMENT_QUERIES = {
  HAS_PRO: `
    SELECT EXISTS (
      SELECT 1 FROM librishelf.entitlements
      WHERE user_id = $1 AND status = 'active' AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
    ) AS pro
  `,

  // O que aparece como plano atual: vitalício primeiro, depois o que vai mais longe
  CURRENT: `
    SELECT id, kind, source, starts_at, ends_at, auto_renew, canceled_at
    FROM librishelf.entitlements
    WHERE user_id = $1 AND status = 'active' AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at > now())
    ORDER BY (ends_at IS NULL) DESC, ends_at DESC, id DESC
    LIMIT 1
  `,

  // Quando o último Pro acabou (para "seu Pro acabou em …"); nulo se nunca teve
  // ou se tem um ativo agora. Reembolsado e revogado também contam como fim.
  LAST_ENDED: `
    SELECT max(CASE WHEN status IN ('canceled', 'refunded')
                    THEN LEAST(COALESCE(ends_at, 'infinity'::timestamptz), updated_at)
                    ELSE ends_at END) AS ended_at
    FROM librishelf.entitlements
    WHERE user_id = $1
      AND (status IN ('canceled', 'refunded') OR ends_at <= now())
  `,

  TRIAL: `
    SELECT u.pro_trial_used_at,
           EXISTS (SELECT 1 FROM librishelf.entitlements e WHERE e.user_id = u.id AND e.kind = 'trial') AS has_trial
    FROM librishelf.users u
    WHERE u.id = $1
  `,

  BADGES: `
    SELECT badge, granted_at FROM librishelf.user_badges
    WHERE user_id = $1
    ORDER BY granted_at, badge
  `
}

// Vanguarda e teste grátis. A vaga da Vanguarda é contada em offers
// ('vanguarda', 100 vagas) com a linha da oferta travada (FOR UPDATE): duas
// contas chegando juntas à vaga 100 nunca passam ambas.
export const PRO_GRANT_QUERIES = {
  // Registro efetivo: e-mail confirmado e pelo menos N livros
  ELIGIBILITY: `
    SELECT u.email_verified_at IS NOT NULL AS verified,
           (SELECT count(*)::int FROM librishelf.books b WHERE b.user_id = u.id) AS books,
           EXISTS (
             SELECT 1 FROM librishelf.entitlements e
             WHERE e.user_id = u.id AND e.kind = 'vanguarda'
           ) AS has_vanguarda
    FROM librishelf.users u
    WHERE u.id = $1 AND u.is_active IS NOT false
  `,

  OFFER: `
    SELECT active, slots_total, slots_used, starts_at, ends_at,
           (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AS in_window
    FROM librishelf.offers
    WHERE code = $1
  `,

  OFFER_LOCK: `
    SELECT active, slots_total, slots_used,
           (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AS in_window
    FROM librishelf.offers
    WHERE code = $1
    FOR UPDATE
  `,

  TAKE_SLOT: `
    UPDATE librishelf.offers
    SET slots_used = slots_used + 1, updated_at = now()
    WHERE code = $1
    RETURNING slots_used
  `,

  INSERT_VANGUARDA: `
    INSERT INTO librishelf.entitlements (user_id, kind, source, status, ends_at, note)
    VALUES ($1, 'vanguarda', 'grant', 'active', NULL, $2)
    ON CONFLICT (user_id) WHERE kind = 'vanguarda' DO NOTHING
    RETURNING id
  `,

  INSERT_BADGE: `
    INSERT INTO librishelf.user_badges (user_id, badge)
    VALUES ($1, $2)
    ON CONFLICT (user_id, badge) DO NOTHING
  `,

  TRIAL_LOCK_USER: `
    SELECT u.pro_trial_used_at, u.email_verified_at,
           EXISTS (SELECT 1 FROM librishelf.entitlements e WHERE e.user_id = u.id AND e.kind = 'trial') AS has_trial
    FROM librishelf.users u
    WHERE u.id = $1
    FOR UPDATE
  `,

  MARK_TRIAL_USED: `
    UPDATE librishelf.users SET pro_trial_used_at = now(), updated_at = now() WHERE id = $1
  `,

  INSERT_TRIAL: `
    INSERT INTO librishelf.entitlements (user_id, kind, source, status, ends_at)
    VALUES ($1, 'trial', 'trial', 'active', now() + make_interval(days => $2))
    RETURNING id, ends_at
  `
}

// Checkout avulso (anual, fundador anual, fundador vitalício) e o
// processamento dos pagamentos confirmados pelo Mercado Pago.
export const CHECKOUT_QUERIES = {
  OFFERS_PUBLIC: `
    SELECT code, price_cents, currency, duration, auto_renew, slots_total, slots_used, starts_at, ends_at,
           active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
             AND (slots_total IS NULL OR slots_used < slots_total) AS available
    FROM librishelf.offers
    WHERE code <> 'vanguarda'
    ORDER BY price_cents
  `,

  OFFER_LOCK: `
    SELECT code, price_cents, duration, slots_total, slots_used,
           active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AS open
    FROM librishelf.offers
    WHERE code = $1
    FOR UPDATE
  `,

  BUYER: `
    SELECT id, email, email_verified_at FROM librishelf.users WHERE id = $1 AND is_active IS NOT false
  `,

  // Entitlements que pesam numa compra nova: vitalício (nada a comprar) e o
  // fim do último período pago (o novo começa depois dele)
  ACTIVE_PAID: `
    SELECT bool_or(ends_at IS NULL AND kind <> 'trial') AS lifetime,
           max(ends_at) FILTER (WHERE kind IN ('monthly', 'annual', 'founder_annual')) AS paid_until,
           bool_or(kind = 'founder_annual' AND ends_at > now()) AS founder_annual
    FROM librishelf.entitlements
    WHERE user_id = $1 AND status = 'active' AND (ends_at IS NULL OR ends_at > now())
  `,

  // Reserva aberta da mesma pessoa e oferta (clicou de novo em "assinar")
  OPEN_RESERVATION: `
    SELECT id, holds_slot, preference_id FROM librishelf.offer_reservations
    WHERE user_id = $1 AND offer_code = $2 AND status = 'pending'
    FOR UPDATE
  `,

  RELEASE_ONE: `
    UPDATE librishelf.offer_reservations SET status = 'released', updated_at = now() WHERE id = $1
  `,

  INSERT_RESERVATION: `
    INSERT INTO librishelf.offer_reservations (user_id, offer_code, reference, expires_at, holds_slot, amount_cents)
    VALUES ($1, $2, $3, now() + make_interval(mins => $4::int), $5, $6)
    RETURNING id, reference, expires_at
  `,

  SLOT_TAKE: `
    UPDATE librishelf.offers SET slots_used = slots_used + 1, updated_at = now() WHERE code = $1
  `,

  SLOT_GIVE_BACK: `
    UPDATE librishelf.offers SET slots_used = GREATEST(slots_used - 1, 0), updated_at = now() WHERE code = $1
  `,

  SET_CHECKOUT: `
    UPDATE librishelf.offer_reservations SET checkout_url = $2, preference_id = $3, updated_at = now() WHERE id = $1
  `,

  // Checkout que não chegou ao Mercado Pago: devolve a vaga na hora
  ABORT_RESERVATION: `
    WITH r AS (
      UPDATE librishelf.offer_reservations SET status = 'released', updated_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING offer_code, holds_slot
    )
    UPDATE librishelf.offers o SET slots_used = GREATEST(o.slots_used - 1, 0), updated_at = now()
    FROM r WHERE o.code = r.offer_code AND r.holds_slot
  `,

  RESERVATION_OF_USER: `
    SELECT r.id, r.offer_code, r.status, r.expires_at, r.checkout_url, r.reference,
           p.status AS payment_status, p.method AS payment_method, p.entitlement_id, p.problem
    FROM librishelf.offer_reservations r
    LEFT JOIN LATERAL (
      SELECT status, method, entitlement_id, problem FROM librishelf.payments
      WHERE reservation_id = r.id ORDER BY (status = 'approved') DESC, updated_at DESC LIMIT 1
    ) p ON true
    WHERE r.reference = $1 AND r.user_id = $2
  `,

  RESERVATION_LOCK: `
    SELECT r.id, r.user_id, r.offer_code, r.status, r.holds_slot, r.amount_cents, r.reference, r.preference_id, o.duration, o.slots_total, o.slots_used
    FROM librishelf.offer_reservations r
    JOIN librishelf.offers o ON o.code = r.offer_code
    WHERE r.reference = $1
    FOR UPDATE OF r
  `,

  PAYMENT_LOCK: `
    SELECT id, status, entitlement_id FROM librishelf.payments
    WHERE provider = 'mercadopago' AND external_id = $1
    FOR UPDATE
  `,

  INSERT_PAYMENT: `
    INSERT INTO librishelf.payments (user_id, offer_code, provider, external_id, method, amount_cents, currency, status, reservation_id, paid_at, raw)
    VALUES ($1, $2, 'mercadopago', $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (provider, external_id) DO NOTHING
    RETURNING id, status, entitlement_id
  `,

  UPDATE_PAYMENT: `
    UPDATE librishelf.payments
    SET status = $2, method = $3, amount_cents = $4, paid_at = COALESCE(paid_at, $5), raw = $6,
        refunded_at = CASE WHEN $2 IN ('refunded', 'charged_back') THEN COALESCE(refunded_at, now()) ELSE refunded_at END,
        updated_at = now()
    WHERE id = $1
    RETURNING id, status, entitlement_id
  `,

  SET_PAYMENT_ENTITLEMENT: `
    UPDATE librishelf.payments SET entitlement_id = $2, problem = NULL, updated_at = now() WHERE id = $1
  `,

  SET_PAYMENT_PROBLEM: `
    UPDATE librishelf.payments SET problem = $2, updated_at = now() WHERE id = $1
  `,

  CONFIRM_RESERVATION: `
    UPDATE librishelf.offer_reservations SET status = 'confirmed', updated_at = now() WHERE id = $1
  `,

  OFFER_SLOT_LOCK: `
    SELECT slots_total, slots_used FROM librishelf.offers WHERE code = $1 FOR UPDATE
  `,

  // Período novo: vitalício sem fim; anual começa depois do último período
  // pago ainda ativo (renovar antes de vencer não perde dias)
  INSERT_ENTITLEMENT: `
    INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at, external_id)
    VALUES ($1, $2, 'mercadopago', $3, $4, $5)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING
    RETURNING id, starts_at, ends_at
  `,

  REFUND_ENTITLEMENT: `
    UPDATE librishelf.entitlements SET status = 'refunded', updated_at = now()
    WHERE id = $1 AND status IN ('active', 'expired')
  `
}

export const WEBHOOK_QUERIES = {
  INSERT: `
    INSERT INTO librishelf.webhook_events (provider, event_id, topic, resource_id, payload)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id
  `,

  START: `
    UPDATE librishelf.webhook_events SET attempts = attempts + 1
    WHERE id = $1
    RETURNING id, provider, topic, resource_id, processed_at, attempts
  `,

  FINISH: `
    UPDATE librishelf.webhook_events SET processed_at = now(), error = NULL WHERE id = $1
  `,

  SET_ERROR: `
    UPDATE librishelf.webhook_events SET error = $2 WHERE id = $1
  `,

  // Tópico que o Librishelf não usa: processado, com a nota do motivo
  IGNORE: `
    UPDATE librishelf.webhook_events SET processed_at = now(), error = $2 WHERE id = $1
  `,

  RESET: `
    UPDATE librishelf.webhook_events SET processed_at = NULL, error = NULL WHERE id = $1
  `
}

// Assinatura mensal (preapproval do Mercado Pago). Um entitlement por
// assinatura (external_id = id do preapproval), estendido a cada cobrança
// aprovada; cada cobrança é um pagamento em payments.
export const SUBSCRIPTION_QUERIES = {
  ACTIVE_MONTHLY: `
    SELECT id, external_id, ends_at, auto_renew FROM librishelf.entitlements
    WHERE user_id = $1 AND kind = 'monthly' AND source = 'mercadopago' AND status = 'active'
      AND auto_renew AND (ends_at IS NULL OR ends_at > now())
    ORDER BY ends_at DESC NULLS FIRST
    LIMIT 1
  `,

  // Reserva do mensal pelo id do preapproval (cobranças sem external_reference)
  RESERVATION_BY_PREAPPROVAL: `
    SELECT r.id, r.user_id, r.offer_code, r.status, r.holds_slot, r.amount_cents, r.reference, r.preference_id,
           o.duration, o.slots_total, o.slots_used
    FROM librishelf.offer_reservations r
    JOIN librishelf.offers o ON o.code = r.offer_code
    WHERE r.offer_code = 'monthly' AND r.preference_id = $1
    FOR UPDATE OF r
  `,

  SET_PREAPPROVAL: `
    UPDATE librishelf.offer_reservations SET preference_id = COALESCE(preference_id, $2), updated_at = now() WHERE id = $1
  `,

  ENTITLEMENT_LOCK: `
    SELECT id, status, ends_at, auto_renew FROM librishelf.entitlements
    WHERE source = 'mercadopago' AND external_id = $1 AND kind = 'monthly'
    FOR UPDATE
  `,

  INSERT_MONTHLY: `
    INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at, external_id, auto_renew)
    VALUES ($1, 'monthly', 'mercadopago', $2, $3, $4, true)
    RETURNING id
  `,

  // Cobrança aprovada: mais um mês. Vencido por atraso da cobrança volta a valer.
  EXTEND_MONTHLY: `
    UPDATE librishelf.entitlements
    SET ends_at = $2, status = 'active', updated_at = now()
    WHERE id = $1 AND status IN ('active', 'expired')
    RETURNING id
  `,

  // Cancelou (botão em Conta, ou o Mercado Pago depois de 3 cobranças
  // recusadas): o Pro vale até o fim do período pago. A folga de dias para a
  // próxima cobrança sai só no primeiro cancelamento.
  CANCEL_MONTHLY: `
    UPDATE librishelf.entitlements
    SET ends_at = CASE WHEN auto_renew AND ends_at IS NOT NULL
                       THEN GREATEST(ends_at - make_interval(days => $2::int), starts_at + interval '1 second')
                       ELSE ends_at END,
        auto_renew = false,
        canceled_at = COALESCE(canceled_at, now()),
        updated_at = now()
    WHERE source = 'mercadopago' AND external_id = $1 AND kind = 'monthly'
    RETURNING id, user_id, ends_at
  `,

  // first_charge: no mensal, só a primeira cobrança da assinatura dá direito
  // à desistência (o prazo conta dela)
  HISTORY: `
    SELECT p.id, p.offer_code, p.method, p.amount_cents, p.currency, p.status, p.paid_at, p.refunded_at, p.created_at,
           p.provider, p.external_id,
           (p.offer_code <> 'monthly' OR NOT EXISTS (
             SELECT 1 FROM librishelf.payments f
             WHERE f.entitlement_id = p.entitlement_id AND f.id <> p.id AND f.status = 'approved'
               AND COALESCE(f.paid_at, f.created_at) < COALESCE(p.paid_at, p.created_at)
           )) AS first_charge
    FROM librishelf.payments p
    WHERE p.user_id = $1
    ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
    LIMIT 100
  `,

  // Reconciliação diária
  RECONCILE_OPEN_PAYMENTS: `
    SELECT external_id FROM librishelf.payments
    WHERE provider = 'mercadopago' AND status IN ('pending', 'authorized', 'in_process', 'in_mediation')
      AND created_at > now() - interval '30 days'
    ORDER BY created_at
    LIMIT 500
  `,

  // Checkout avulso dos últimos dias que nunca recebeu pagamento aprovado
  RECONCILE_RESERVATIONS: `
    SELECT r.reference FROM librishelf.offer_reservations r
    WHERE r.offer_code <> 'monthly' AND r.status IN ('pending', 'released')
      AND r.created_at > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM librishelf.payments p WHERE p.reservation_id = r.id AND p.status = 'approved')
    ORDER BY r.created_at
    LIMIT 500
  `,

  // Assinaturas: as que ainda renovam e as que começaram há pouco
  RECONCILE_PREAPPROVALS: `
    SELECT DISTINCT preapproval_id FROM (
      SELECT external_id AS preapproval_id FROM librishelf.entitlements
      WHERE kind = 'monthly' AND source = 'mercadopago' AND auto_renew AND status IN ('active', 'expired')
      UNION
      SELECT preference_id FROM librishelf.offer_reservations
      WHERE offer_code = 'monthly' AND preference_id IS NOT NULL AND created_at > now() - interval '3 days'
    ) s
    WHERE preapproval_id IS NOT NULL
    LIMIT 1000
  `,

  // Webhooks que ficaram sem processar (worker parado, tópico novo…)
  RECONCILE_WEBHOOKS: `
    SELECT id FROM librishelf.webhook_events
    WHERE processed_at IS NULL AND received_at < now() - interval '10 minutes'
      AND received_at > now() - interval '30 days' AND attempts < 20
    ORDER BY received_at
    LIMIT 500
  `
}

// E-mails de cobrança: o que o job precisa para montar o e-mail na hora de
// enviar, e a varredura de vencimentos.
export const BILLING_EMAIL_QUERIES = {
  ENTITLEMENT: `
    SELECT e.id, e.user_id, e.kind, e.source, e.status, e.ends_at, e.auto_renew,
           u.name, u.email, u.email_locale, u.email_verified_at,
           o.price_cents AS offer_cents,
           -- Outro Pro que vai além deste (renovou, vitalício, mensal)
           EXISTS (
             SELECT 1 FROM librishelf.entitlements x
             WHERE x.user_id = e.user_id AND x.id <> e.id AND x.status = 'active'
               AND (x.ends_at IS NULL OR x.ends_at > e.ends_at)
           ) AS covered,
           EXISTS (
             SELECT 1 FROM librishelf.entitlements x
             WHERE x.user_id = e.user_id AND x.status = 'active' AND x.starts_at <= now()
               AND (x.ends_at IS NULL OR x.ends_at > now())
           ) AS pro_now
    FROM librishelf.entitlements e
    JOIN librishelf.users u ON u.id = e.user_id
    LEFT JOIN librishelf.offers o ON o.code = e.kind
    WHERE e.id = $1
  `,

  PAYMENT: `
    SELECT p.id, p.user_id, p.offer_code, p.method, p.amount_cents, p.currency, p.status, p.refunded_at,
           r.status AS reservation_status,
           e.ends_at, e.status AS entitlement_status,
           EXISTS (
             SELECT 1 FROM librishelf.payments p2
             WHERE p2.reservation_id = p.reservation_id AND p2.id <> p.id
               AND p2.status = 'approved' AND p2.created_at >= p.created_at
           ) AS approved_after,
           (SELECT max(x.ends_at) FROM librishelf.entitlements x
             WHERE x.user_id = p.user_id AND x.status = 'active' AND x.ends_at > now()) AS pro_until,
           u.name, u.email, u.email_locale, u.email_verified_at
    FROM librishelf.payments p
    JOIN librishelf.users u ON u.id = p.user_id
    LEFT JOIN librishelf.offer_reservations r ON r.id = p.reservation_id
    LEFT JOIN librishelf.entitlements e ON e.id = p.entitlement_id
    WHERE p.id = $1
  `,

  // Anual e fundador anual comprados, sem renovação automática, vencendo nos próximos $1 dias
  RENEWAL_DUE: `
    SELECT e.id FROM librishelf.entitlements e
    JOIN librishelf.users u ON u.id = e.user_id
    WHERE e.status = 'active' AND e.kind IN ('annual', 'founder_annual') AND e.source = 'mercadopago'
      AND NOT e.auto_renew
      AND e.ends_at > now() AND e.ends_at <= now() + make_interval(days => $1)
      AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM librishelf.entitlements x
        WHERE x.user_id = e.user_id AND x.id <> e.id AND x.status = 'active'
          AND (x.ends_at IS NULL OR x.ends_at > e.ends_at)
      )
  `,

  TRIAL_ENDING_DUE: `
    SELECT e.id FROM librishelf.entitlements e
    JOIN librishelf.users u ON u.id = e.user_id
    WHERE e.kind = 'trial' AND e.status = 'active'
      AND e.ends_at > now() AND e.ends_at <= now() + make_interval(days => $1)
      AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM librishelf.entitlements x
        WHERE x.user_id = e.user_id AND x.id <> e.id AND x.status = 'active'
          AND (x.ends_at IS NULL OR x.ends_at > e.ends_at)
      )
  `,

  // Teste que acabou nas últimas $1 horas, sem outro Pro agora
  TRIAL_ENDED_DUE: `
    SELECT e.id FROM librishelf.entitlements e
    JOIN librishelf.users u ON u.id = e.user_id
    WHERE e.kind = 'trial' AND e.status IN ('active', 'expired')
      AND e.ends_at <= now() AND e.ends_at > now() - make_interval(hours => $1)
      AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM librishelf.entitlements x
        WHERE x.user_id = e.user_id AND x.status = 'active' AND x.starts_at <= now()
          AND (x.ends_at IS NULL OR x.ends_at > now())
      )
  `
}

// ---------------------------------------------------------------------------
// Desistência da compra pelo próprio comprador (pacote 36b)
// ---------------------------------------------------------------------------
export const WITHDRAWAL_QUERIES = {
  PAYMENT_LOCK: `
    SELECT p.id, p.user_id, p.offer_code, p.method, p.amount_cents, p.status, p.paid_at, p.refunded_at,
           p.provider, p.external_id, p.entitlement_id,
           (p.offer_code <> 'monthly' OR NOT EXISTS (
             SELECT 1 FROM librishelf.payments f
             WHERE f.entitlement_id = p.entitlement_id AND f.id <> p.id AND f.status = 'approved'
               AND COALESCE(f.paid_at, f.created_at) < COALESCE(p.paid_at, p.created_at)
           )) AS first_charge
    FROM librishelf.payments p
    WHERE p.id = $1 AND p.user_id = $2
    FOR UPDATE OF p
  `
}
