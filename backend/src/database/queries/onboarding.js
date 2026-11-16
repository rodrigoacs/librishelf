// Onboarding (pacote 42): estado dos primeiros passos de cada conta.
// Parte de database/queries.js, que reexporta todos os grupos.

export const ONBOARDING_QUERIES = {
  GET: `
    SELECT onboarding_status AS status, onboarding_step AS step, onboarding_start AS start, is_public
    FROM librishelf.users
    WHERE id = $1
  `,

  // Campo nulo = não muda; start só muda quando $5 = true (pode voltar a nulo)
  UPDATE: `
    UPDATE librishelf.users
    SET onboarding_status = COALESCE($2, onboarding_status),
        onboarding_step = COALESCE($3, onboarding_step),
        onboarding_start = CASE WHEN $5 THEN $4 ELSE onboarding_start END
    WHERE id = $1
  `
}
