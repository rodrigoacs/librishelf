// Contas, sessões, tokens de e-mail e aceite dos termos.
// Parte de database/queries.js, que reexporta todos os grupos.

export const AUTH_QUERIES = {
  // Login: com "@" é e-mail, sem é nome de usuário (o nome não aceita "@").
  // Sem diferenciar maiúsculas; os índices únicos em lower() garantem uma conta só.
  FIND_USER_FOR_LOGIN: `
    SELECT id, name, password_hash, email, is_active
    FROM librishelf.users
    WHERE CASE WHEN strpos($1, '@') > 0 THEN lower(email) = lower($1) ELSE lower(name) = lower($1) END
  `,
  // Só por nome (sem e-mail), usado nas rotas públicas: /u/Demo e /u/demo são
  // a mesma biblioteca. Conta suspensa responde como inexistente.
  FIND_USER_BY_NAME: `
    SELECT id, name, is_public, show_in_community, show_activity, allow_indexing, is_active
    FROM librishelf.users
    WHERE lower(name) = lower($1) AND is_active IS NOT FALSE
  `,
  FIND_USER_BY_ID: `
    SELECT id, name, email, role, is_public, show_in_community, show_activity, allow_indexing, follow_emails, email_verified_at,
           avatar_version, avatar_visibility, avatar_hidden_at
    FROM librishelf.users
    WHERE id = $1
  `,
  // "Esqueci minha senha": e-mail sem diferenciar maiúsculas.
  FIND_USER_BY_EMAIL: `
    SELECT id, name, email, email_verified_at
    FROM librishelf.users
    WHERE lower(email) = lower($1) AND is_active IS NOT FALSE
  `,
  EMAIL_TAKEN: 'SELECT 1 FROM librishelf.users WHERE lower(email) = lower($1) AND id <> $2',
  NAME_TAKEN: 'SELECT 1 FROM librishelf.users WHERE lower(name) = lower($1) AND id <> $2',
  // E-mail novo começa sem confirmação.
  UPDATE_EMAIL: `
    UPDATE librishelf.users SET email = $2, email_verified_at = NULL, updated_at = now()
    WHERE id = $1
    RETURNING id, name, email, role, email_verified_at, is_public, show_in_community, show_activity, allow_indexing, follow_emails
  `,
  UPDATE_NAME: `
    UPDATE librishelf.users SET name = $2, updated_at = now()
    WHERE id = $1
    RETURNING id, name, email, role, email_verified_at, is_public, show_in_community, show_activity, allow_indexing, follow_emails
  `,
  MARK_EMAIL_VERIFIED: `
    UPDATE librishelf.users
    SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
    WHERE id = $1
    RETURNING email_verified_at
  `,
  // Usado pelo middleware de auth a cada requisição autenticada ($2 = jti).
  FIND_SESSION_BY_ID: `
    SELECT u.id, u.role, u.password_changed_at,
           EXISTS (SELECT 1 FROM librishelf.revoked_sessions s WHERE s.jti = $2) AS revoked
    FROM librishelf.users u
    WHERE u.id = $1 AND u.is_active IS NOT FALSE
  `,
  // "Sair": o token vale até exp; até lá o jti fica na lista de encerrados.
  REVOKE_SESSION: `
    INSERT INTO librishelf.revoked_sessions (jti, user_id, expires_at)
    VALUES ($1, $2, to_timestamp($3))
    ON CONFLICT (jti) DO NOTHING
  `,
  FIND_PASSWORD_HASH_BY_ID: `
    SELECT id, password_hash
    FROM librishelf.users
    WHERE id = $1
  `,
  // A conta e o aceite dos termos ($4 = versão) nascem no mesmo comando:
  // não existe conta sem aceite registrado
  CREATE_USER: `
    WITH created AS (
      INSERT INTO librishelf.users (name, password_hash, email)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, is_public, show_in_community, show_activity, allow_indexing, follow_emails, email_verified_at
    ), accepted AS (
      INSERT INTO librishelf.terms_acceptance (user_id, terms_version)
      SELECT id, $4 FROM created
    )
    SELECT * FROM created
  `,
  // $3 = instante da troca pelo relógio da API, o mesmo que assina o iat do
  // token (now() do banco pode estar adiantado e derrubar o token novo)
  UPDATE_PASSWORD: `
    UPDATE librishelf.users
    SET password_hash = $2, password_changed_at = $3, updated_at = now()
    WHERE id = $1
    RETURNING password_changed_at
  `,
  // Só altera o que vier preenchido (NULL mantém o valor atual).
  SET_PRIVACY: `
    UPDATE librishelf.users
    SET is_public = COALESCE($2, is_public),
        show_in_community = COALESCE($3, show_in_community),
        show_activity = COALESCE($4, show_activity),
        allow_indexing = COALESCE($5, allow_indexing),
        updated_at = now()
    WHERE id = $1
    RETURNING is_public, show_in_community, show_activity, allow_indexing
  `,
  MARK_LOGIN: 'UPDATE librishelf.users SET last_login_at = now(), last_seen_at = now() WHERE id = $1',
  MARK_SEEN: 'UPDATE librishelf.users SET last_seen_at = now() WHERE id = $1',
  // books.user_id tem ON DELETE CASCADE: livros e vínculos vão junto.
  DELETE_USER: 'DELETE FROM librishelf.users WHERE id = $1',
  LIST_BOOK_IDS_BY_USER: 'SELECT id FROM librishelf.books WHERE user_id = $1'
}

export const TOKEN_QUERIES = {
  DELETE_UNUSED: 'DELETE FROM librishelf.user_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
  INSERT: `
    INSERT INTO librishelf.user_tokens (user_id, purpose, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
  `,
  // Atômico: dois cliques no mesmo link não usam o link duas vezes.
  CONSUME: `
    UPDATE librishelf.user_tokens
    SET used_at = now()
    WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `,
  DELETE_STALE: `
    DELETE FROM librishelf.user_tokens
    WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'
  `,
  // Sessões encerradas cujo token já venceu (o JWT vencido é recusado sozinho)
  DELETE_EXPIRED_REVOCATIONS: 'DELETE FROM librishelf.revoked_sessions WHERE expires_at < now()'
}

// ---------------------------------------------------------------------------
// Termos de Uso e Política de Privacidade (pacote 35). O aceite no cadastro
// vai junto com a conta (AUTH_QUERIES.CREATE_USER).
// ---------------------------------------------------------------------------
export const TERMS_QUERIES = {
  // Aceitar de novo a mesma versão não muda a data do primeiro aceite
  ACCEPT: `
    INSERT INTO librishelf.terms_acceptance (user_id, terms_version)
    VALUES ($1, $2)
    ON CONFLICT (user_id, terms_version) DO NOTHING
  `,
  ACCEPTED_AT: `
    SELECT accepted_at
    FROM librishelf.terms_acceptance
    WHERE user_id = $1 AND terms_version = $2
  `
}
