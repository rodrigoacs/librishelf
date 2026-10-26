#!/usr/bin/env bash
# Librishelf — pacote 2 da área administrativa: uso, sistema, conta individual
# Base: fix/audit-2026-08 com o pacote 1 (pacote-admin.sh) JÁ COMMITADO.
# Rode na raiz do repositório:  bash pacote-admin-2.sh
#
# O que este script faz:
#   1. confere que os arquivos tocados estão limpos (sem alterações locais)
#   2. aplica o patch embutido (git apply; se falhar, tenta --3way)
#   3. confere com git hash-object -w que cada arquivo ficou idêntico ao testado
#   4. instala dependências só se algum package.json mudou (neste pacote: nenhum)
#   5. roda os testes unitários do backend e o build do frontend
#   6. PERGUNTA antes de rodar a migration 013 (opcional: testes de integração)
#   7. mostra a mensagem de commit sugerida — não commita nada
set -euo pipefail

BASE="pacote 1"
BRANCH_ESPERADA=fix/audit-2026-08
c_ok() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
c_err() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; }

[ -d .git ] && [ -d backend ] && [ -d frontend ] || { c_err "Rode na raiz do repositório librishelf."; exit 1; }

PATCH=$(mktemp -t librishelf-admin2.XXXXXX.patch)
trap 'rm -f "$PATCH"' EXIT
sed -n '/^__PATCH_BELOW__$/,$p' "$0" | tail -n +2 > "$PATCH"
# Alguns downloads tiram a quebra de linha final; o git apply precisa dela
[ -n "$(tail -c 1 "$PATCH")" ] && echo >> "$PATCH"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "$BRANCH_ESPERADA" ] || c_warn "Você está em '$BRANCH' (esperado: $BRANCH_ESPERADA). Continuando mesmo assim."
if [ ! -f backend/db/migrations/013_admin.sql ] || ! git ls-files --error-unmatch backend/db/migrations/013_admin.sql >/dev/null 2>&1; then
  c_err "O pacote 1 (013_admin) não está commitado nesta branch. Aplique e commite o pacote-admin.sh antes."
  exit 1
fi

# 1. arquivos tocados precisam estar limpos
mapfile -t FILES < <(git apply --numstat "$PATCH" | awk '{print $3}')
DIRTY=$(git status --porcelain -- "${FILES[@]}" || true)
if [ -n "$DIRTY" ]; then
  c_err "Estes arquivos têm alterações locais; commite ou guarde (git stash) antes:"
  echo "$DIRTY"
  exit 1
fi
c_ok "${#FILES[@]} arquivos tocados, todos limpos"

# 2. aplicar
if git apply --check "$PATCH" 2>/dev/null; then
  git apply "$PATCH"
  c_ok "Patch aplicado"
elif git apply --3way "$PATCH"; then
  c_warn "Aplicado com --3way (a branch andou desde $BASE)"
  CONFLITOS=$(git diff --name-only --diff-filter=U)
  if [ -n "$CONFLITOS" ]; then
    c_err "Conflitos para resolver à mão:"
    echo "$CONFLITOS"
    echo
    echo "Para desfazer tudo e voltar ao estado anterior:"
    echo "  git reset --merge   # ou: git checkout -- . && git clean -fd -- ${FILES[*]}"
    exit 1
  fi
else
  c_err "O patch não aplica nem com --3way."
  echo "Nada foi alterado (git apply é atômico). Para conferir: git status"
  exit 1
fi

# 3. conferir conteúdo (blob de cada arquivo = o que foi testado)
DIVERGE=0
while read -r path expected; do
  [ "$expected" = "0000000000000000000000000000000000000000" ] && continue
  actual=$(git hash-object -w -- "$path")
  if [ "$actual" != "$expected" ]; then c_warn "Difere do testado (a branch mudou este arquivo depois de $BASE): $path"; DIVERGE=1; fi
done < <(awk '/^diff --git /{p=$4; sub(/^b\//,"",p)} /^index /{split($2,a,"\\.\\."); print p, a[2]}' "$PATCH")
[ "$DIVERGE" = 0 ] && c_ok "Conteúdo idêntico ao testado (git hash-object -w)"

# 4. dependências
for dir in backend frontend; do
  if printf '%s\n' "${FILES[@]}" | grep -qx "$dir/package.json\|$dir/package-lock.json"; then
    echo "→ $dir: package.json mudou, rodando npm ci"; (cd "$dir" && npm ci)
  fi
done
[ -d backend/node_modules ] || (cd backend && npm ci)
[ -d frontend/node_modules ] || (cd frontend && npm ci)
c_ok "Dependências: nada novo neste pacote"

# 5. testes unitários e build
(cd backend && npm run test:unit) && c_ok "Testes unitários do backend"
(cd frontend && npm run build) && c_ok "Build do frontend"

# 6. migration (pergunta)
echo
echo "Este pacote traz a migration 014_admin_metrics (só ADICIONA: users.last_seen_at e a tabela usage_counters;"
echo "troca a regra de ações permitidas em admin_actions para aceitar 2 ações novas)."
read -r -p "Rodar agora 'npm run db:migrate' no backend (banco do src/.env)? [s/N] " RESP
if [[ "$RESP" =~ ^[sS]$ ]]; then
  (cd backend && npm run db:migrate) && c_ok "Migration aplicada"
  if [ -f backend/src/.env.test ]; then
    read -r -p "Rodar também a migration e os testes de integração (src/.env.test)? [s/N] " RESP2
    if [[ "$RESP2" =~ ^[sS]$ ]]; then
      (cd backend && npm run db:migrate:test && npm test) && c_ok "Testes de integração"
    fi
  fi
else
  c_warn "Migration não rodada. Depois: cd backend && npm run db:migrate (e db:migrate:test para os testes)"
fi

cat <<'MSG'

────────────────────────────────────────────────────────────
Mensagem de commit sugerida (o script não commita):

feat(admin): uso, sistema, conta individual e sinais de moderação

- Visão geral: funil (cadastro → e-mail → 1 livro → 10 livros), quem
  voltou depois da 1ª semana, atividade recente, ativas em 7/30 dias
  e cadastros parados (e-mail não confirmado há 7+ dias)
- Uso: contas por recurso e contadores diários sem identificar
  ninguém (livros, ISBN digitado x câmera, busca, capas, importação,
  exportação, retrospectiva)
- Sistema: versões, banco e migrations pendentes, disco e capas,
  SMTP com e-mail de teste, Open Library (chamadas, falhas, tempo),
  limites de requisição (IPs só em memória, 2 h) e erros 500 recentes
- Moderação: denunciantes frequentes, contas novas denunciadas e as
  mais denunciadas
- Contas: filtro de e-mail parado e gaveta por conta (totais,
  privacidade, histórico; reenviar confirmação, suspender, reativar)
- Último acesso (last_seen_at, no máximo 1x/hora)
- Migration 014_admin_metrics; seed com contadores de exemplo
- Política de privacidade: último acesso e contadores agregados
────────────────────────────────────────────────────────────
Opcional na VPS: APP_VERSION (ex.: o hash do commit) aparece em Sistema.
MSG
exit 0
__PATCH_BELOW__
diff --git a/README.md b/README.md
index ee59c6451955527d500ce2b18c1c98059573e304..33cac120578a0a57fc2378d2c38cec61d099be1d 100644
--- a/README.md
+++ b/README.md
@@ -16,7 +16,7 @@ Live at **[librishelf.com](https://librishelf.com)**.
 - **Your year in books** — a yearly recap (available all year; "so far" for the current one): books and pages read, month by month, goal, best rated, most-read authors and records (longest, fastest…), plus a 9:16 story image drawn in the browser to download or share.
 - **Public library (opt-in)** — share a read-only link (`/u/your-username`) to your shelf (with a link preview on WhatsApp and social networks: title, book count and a mosaic of your covers), with a profile: reading by year, top authors and tags, recently read and books you have in common. Libraries are private by default.
 - **Community (opt-in)** — see who else has a book, their average rating and what people who have it also have. Follow other readers (they approve each request) and get a feed of what they add and finish. Everything is off until the user turns it on.
-- **Admin area** (`/admin`, desktop) — for accounts with `role = 'admin'`, after re-entering the password (unlocked for 30 idle minutes): site numbers and weekly sign-ups, the queue of reported reviews (hide / keep), account search with suspend / reactivate (nothing is deleted; a suspended account can't sign in and its public pages disappear) and a log of every admin action.
+- **Admin area** (`/admin`, desktop) — for accounts with `role = 'admin'`, after re-entering the password (unlocked for 30 idle minutes): site numbers and weekly sign-ups, the queue of reported reviews (hide / keep), account search with suspend / reactivate (nothing is deleted; a suspended account can't sign in and its public pages disappear) a log of every admin action, usage (sign-up funnel, who uses each feature, daily counters such as camera scans and imports), moderation signals (frequent reporters, new accounts already reported), a per-account drawer (totals, privacy flags, history; resend confirmation) and a **System** tab: backend/frontend versions, database and pending migrations, disk and covers, SMTP status with a test email, Open Library calls and failure rate, rate-limit hits and the latest 500 errors. Optional: set `APP_VERSION` (e.g. the git commit) to show it there.
 - **Account control** — email confirmation, password recovery by email, change your password (signs out other sessions) and delete your account with all its data.
 - **Portuguese and English**, light and dark themes, six accent colors.
 
@@ -194,7 +194,7 @@ Then sign out and in again (or reload) and **Admin** shows in the menu. `npm run
 
 ## Privacy
 
-Libraries are private unless the owner turns on sharing; community and followers are separate opt-ins, both off by default. ISBN lookups go from the server to Open Library with only the ISBN. Session uses a single essential httpOnly cookie (admins get a second one, `admin_unlock`, while the admin area is unlocked); fonts are self-hosted and the app loads nothing from third parties. See the in-app privacy policy at `/privacy`.
+Libraries are private unless the owner turns on sharing; community and followers are separate opt-ins, both off by default. ISBN lookups go from the server to Open Library with only the ISBN. Session uses a single essential httpOnly cookie (admins get a second one, `admin_unlock`, while the admin area is unlocked); usage is counted as daily totals with no user or IP attached (IPs that hit a rate limit stay only in memory, for at most 2 hours); fonts are self-hosted and the app loads nothing from third parties. See the in-app privacy policy at `/privacy`.
 
 ---
 
diff --git a/backend/db/migrations/014_admin_metrics.sql b/backend/db/migrations/014_admin_metrics.sql
new file mode 100644
index 0000000000000000000000000000000000000000..b9c5873d4135ab9482957c9b86535e14602a0732
--- /dev/null
+++ b/backend/db/migrations/014_admin_metrics.sql
@@ -0,0 +1,16 @@
+-- 014 — área administrativa: último acesso, contadores de uso e novas ações
+-- Último acesso (não só login: a sessão dura 7 dias). Gravado no máximo 1x/hora.
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
+
+-- Contadores agregados por dia (sem usuário, sem IP): buscas no Open Library,
+-- leitura por câmera, importações, limites atingidos...
+CREATE TABLE IF NOT EXISTS librishelf.usage_counters (
+  day   date NOT NULL,
+  event text NOT NULL CHECK (char_length(event) <= 60),
+  count integer NOT NULL DEFAULT 0,
+  PRIMARY KEY (day, event)
+);
+
+ALTER TABLE librishelf.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
+ALTER TABLE librishelf.admin_actions ADD CONSTRAINT admin_actions_action_check
+  CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate', 'user.resend_verification', 'email.test'));
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index 84bd5c5959cd3183503745071dadcb60209e0642..635b0ec986a5785c174aa6de44d1f859dbac3ffb 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -1576,3 +1576,24 @@ CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON librishelf.admin_actions
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('013_admin')
 ON CONFLICT (version) DO NOTHING;
+
+-- 014 — área administrativa: último acesso, contadores de uso e novas ações
+-- Último acesso (não só login: a sessão dura 7 dias). Gravado no máximo 1x/hora.
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
+
+-- Contadores agregados por dia (sem usuário, sem IP): buscas no Open Library,
+-- leitura por câmera, importações, limites atingidos...
+CREATE TABLE IF NOT EXISTS librishelf.usage_counters (
+  day   date NOT NULL,
+  event text NOT NULL CHECK (char_length(event) <= 60),
+  count integer NOT NULL DEFAULT 0,
+  PRIMARY KEY (day, event)
+);
+
+ALTER TABLE librishelf.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
+ALTER TABLE librishelf.admin_actions ADD CONSTRAINT admin_actions_action_check
+  CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate', 'user.resend_verification', 'email.test'));
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('014_admin_metrics')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index eb50d471f38a7479ad1c9eab3ca28edfe39ab3d3..4f858ac44b936d871673d9b0c9a452e1eb39f022 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -235,7 +235,8 @@ export const AUTH_QUERIES = {
     WHERE id = $1
     RETURNING is_public, show_in_community, show_activity, allow_indexing
   `,
-  MARK_LOGIN: 'UPDATE librishelf.users SET last_login_at = now() WHERE id = $1',
+  MARK_LOGIN: 'UPDATE librishelf.users SET last_login_at = now(), last_seen_at = now() WHERE id = $1',
+  MARK_SEEN: 'UPDATE librishelf.users SET last_seen_at = now() WHERE id = $1',
   // books.user_id tem ON DELETE CASCADE: livros e vínculos vão junto.
   DELETE_USER: 'DELETE FROM librishelf.users WHERE id = $1',
   LIST_BOOK_IDS_BY_USER: 'SELECT id FROM librishelf.books WHERE user_id = $1'
@@ -1119,7 +1120,10 @@ export const ADMIN_QUERIES = {
     SELECT
       (SELECT count(*) FROM librishelf.users)::int AS users,
       (SELECT count(*) FROM librishelf.users WHERE email_verified_at IS NOT NULL)::int AS verified,
-      (SELECT count(*) FROM librishelf.users WHERE last_login_at > now() - interval '30 days')::int AS active30,
+      (SELECT count(*) FROM librishelf.users WHERE GREATEST(last_seen_at, last_login_at) > now() - interval '30 days')::int AS active30,
+      (SELECT count(*) FROM librishelf.users WHERE GREATEST(last_seen_at, last_login_at) > now() - interval '7 days')::int AS active7,
+      (SELECT count(*) FROM librishelf.users
+        WHERE email_verified_at IS NULL AND is_active IS NOT FALSE AND created_at < now() - interval '7 days')::int AS stale_signups,
       (SELECT count(*) FROM librishelf.users WHERE created_at > now() - interval '7 days')::int AS signups7,
       (SELECT count(*) FROM librishelf.users WHERE created_at > now() - interval '30 days')::int AS signups30,
       (SELECT count(*) FROM librishelf.users WHERE is_active = false)::int AS suspended,
@@ -1174,7 +1178,7 @@ export const ADMIN_QUERIES = {
   // Contas: $1 trecho do nome ou e-mail (padrão ILIKE já escapado), $2 'all' ou 'suspended'
   USERS: `
     SELECT u.id, u.name, u.email, u.role, (u.is_active IS NOT FALSE) AS active,
-           u.suspended_at, u.suspended_reason, u.created_at, u.last_login_at,
+           u.suspended_at, u.suspended_reason, u.created_at, GREATEST(u.last_seen_at, u.last_login_at) AS last_login_at,
            (u.email_verified_at IS NOT NULL) AS email_verified, u.is_public,
            (SELECT count(*) FROM librishelf.books b WHERE b.user_id = u.id)::int AS books,
            (SELECT count(*) FROM librishelf.reviews r WHERE r.user_id = u.id)::int AS reviews,
@@ -1184,10 +1188,11 @@ export const ADMIN_QUERIES = {
     FROM librishelf.users u
     WHERE ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)
       AND ($2 <> 'suspended' OR u.is_active = false)
+      AND ($2 <> 'unverified' OR (u.email_verified_at IS NULL AND u.is_active IS NOT FALSE AND u.created_at < now() - interval '7 days'))
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $3 OFFSET $4
   `,
-  USER_TARGET: 'SELECT id, name, role, (is_active IS NOT FALSE) AS active FROM librishelf.users WHERE id = $1',
+  USER_TARGET: 'SELECT id, name, role, (is_active IS NOT FALSE) AS active, email_verified_at, email_locale FROM librishelf.users WHERE id = $1',
   SUSPEND: `
     UPDATE librishelf.users
     SET is_active = false, suspended_at = now(), suspended_reason = $2, updated_at = now()
@@ -1200,6 +1205,152 @@ export const ADMIN_QUERIES = {
     WHERE id = $1 AND is_active = false
     RETURNING id
   `,
+  // Funil: cadastrou → confirmou → 1 livro → 10 livros; voltou depois de 7 dias
+  ENGAGEMENT: `
+    WITH shelf AS (SELECT user_id, count(*) AS n FROM librishelf.books GROUP BY user_id)
+    SELECT
+      count(*)::int AS users,
+      count(*) FILTER (WHERE u.email_verified_at IS NOT NULL)::int AS verified,
+      count(*) FILTER (WHERE shelf.n >= 1)::int AS with_book,
+      count(*) FILTER (WHERE shelf.n >= 10)::int AS with_10_books,
+      count(*) FILTER (WHERE u.created_at < now() - interval '7 days')::int AS older_than_week,
+      count(*) FILTER (WHERE u.created_at < now() - interval '7 days'
+        AND GREATEST(u.last_seen_at, u.last_login_at) > u.created_at + interval '7 days')::int AS returned,
+      (SELECT count(*) FROM librishelf.books WHERE created_at > now() - interval '7 days')::int AS books7,
+      (SELECT count(*) FROM librishelf.books WHERE created_at > now() - interval '30 days')::int AS books30,
+      (SELECT count(*) FROM librishelf.readings WHERE finished_on > current_date - 30)::int AS finished30,
+      (SELECT count(*) FROM librishelf.reviews WHERE created_at > now() - interval '30 days')::int AS reviews30
+    FROM librishelf.users u
+    LEFT JOIN shelf ON shelf.user_id = u.id
+  `,
+  // Quantas pessoas usam cada recurso (contas, não ações)
+  ADOPTION: `
+    SELECT
+      (SELECT count(*) FROM librishelf.users)::int AS users,
+      (SELECT count(DISTINCT user_id) FROM librishelf.lists)::int AS lists,
+      (SELECT count(DISTINCT user_id) FROM librishelf.reviews)::int AS reviews,
+      (SELECT count(DISTINCT user_id) FROM librishelf.reading_goals WHERE year = extract(year FROM now())::int)::int AS goals,
+      (SELECT count(DISTINCT user_id) FROM librishelf.books WHERE series IS NOT NULL)::int AS series,
+      (SELECT count(DISTINCT user_id) FROM librishelf.books WHERE notes IS NOT NULL AND btrim(notes) <> '')::int AS notes,
+      (SELECT count(DISTINCT user_id) FROM librishelf.books WHERE reading_status = 'reading')::int AS reading_now,
+      (SELECT count(DISTINCT b.user_id) FROM librishelf.books b
+        WHERE (SELECT count(*) FROM librishelf.readings r WHERE r.book_id = b.id AND r.finished_on IS NOT NULL) >= 2)::int AS rereads,
+      (SELECT count(*) FROM librishelf.users WHERE is_public)::int AS public_library,
+      (SELECT count(*) FROM librishelf.users WHERE is_public AND show_in_community)::int AS community,
+      (SELECT count(*) FROM librishelf.users WHERE show_activity)::int AS accepts_followers,
+      (SELECT count(DISTINCT follower_id) FROM librishelf.follows WHERE status = 'accepted')::int AS following,
+      (SELECT count(*) FROM librishelf.users WHERE follow_emails)::int AS follow_emails,
+      (SELECT count(DISTINCT blocker_id) FROM librishelf.blocks)::int AS blocks,
+      (SELECT count(*) FROM librishelf.users WHERE allow_indexing AND is_public)::int AS indexing
+  `,
+  // Contadores dos últimos $1 dias, por evento
+  COUNTERS: `
+    SELECT event, sum(count)::int AS total
+    FROM librishelf.usage_counters
+    WHERE day > current_date - $1::int
+    GROUP BY event
+  `,
+  // Série diária (com zeros) dos eventos que começam com $1, últimos $2 dias
+  COUNTER_SERIES: `
+    SELECT to_char(d, 'YYYY-MM-DD') AS day, e.event, COALESCE(c.count, 0)::int AS total
+    FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') AS d
+    CROSS JOIN unnest($1::text[]) AS e(event)
+    LEFT JOIN librishelf.usage_counters c ON c.day = d::date AND c.event = e.event
+    ORDER BY d, e.event
+  `,
+  OPENLIBRARY_BOOKS: `
+    SELECT
+      count(*) FILTER (WHERE ol_work_key IS NOT NULL)::int AS linked,
+      count(*) FILTER (WHERE ol_work_key IS NULL AND isbn13 IS NOT NULL)::int AS linkable,
+      count(*) FILTER (WHERE ol_work_key IS NULL AND isbn13 IS NULL)::int AS unlinked
+    FROM librishelf.books
+  `,
+  DB_INFO: `
+    SELECT current_setting('server_version') AS version,
+           pg_database_size(current_database())::bigint AS size,
+           (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections
+  `,
+  LAST_MIGRATION: 'SELECT version, applied_at FROM librishelf.schema_migrations ORDER BY version DESC LIMIT 1',
+  // Moderação: quem denuncia muito, e quanto do que denunciou foi mantido no ar
+  SERIAL_REPORTERS: `
+    SELECT u.id, u.name, (u.is_active IS NOT FALSE) AS active, u.created_at,
+           count(*)::int AS reports,
+           count(*) FILTER (WHERE r.hidden_at IS NOT NULL)::int AS upheld,
+           count(*) FILTER (WHERE r.hidden_at IS NULL AND r.reviewed_at IS NOT NULL AND rr.created_at <= r.reviewed_at)::int AS rejected,
+           count(*) FILTER (WHERE rr.created_at > now() - interval '7 days')::int AS last7
+    FROM librishelf.review_reports rr
+    JOIN librishelf.users u ON u.id = rr.reporter_id
+    JOIN librishelf.reviews r ON r.id = rr.review_id
+    GROUP BY u.id
+    HAVING count(*) >= 3
+    ORDER BY reports DESC, last7 DESC
+    LIMIT 15
+  `,
+  // Contas com até 30 dias que já recebem denúncias
+  NEW_REPORTED: `
+    SELECT u.id, u.name, (u.is_active IS NOT FALSE) AS active, u.created_at,
+           count(rr.id)::int AS reports, count(DISTINCT r.id)::int AS reviews_reported
+    FROM librishelf.users u
+    JOIN librishelf.reviews r ON r.user_id = u.id
+    JOIN librishelf.review_reports rr ON rr.review_id = r.id
+    WHERE u.created_at > now() - interval '30 days'
+    GROUP BY u.id
+    ORDER BY reports DESC
+    LIMIT 15
+  `,
+  MOST_REPORTED: `
+    SELECT u.id, u.name, (u.is_active IS NOT FALSE) AS active, u.created_at,
+           count(rr.id)::int AS reports, count(DISTINCT r.id)::int AS reviews_reported,
+           count(DISTINCT r.id) FILTER (WHERE r.hidden_at IS NOT NULL)::int AS hidden
+    FROM librishelf.users u
+    JOIN librishelf.reviews r ON r.user_id = u.id
+    JOIN librishelf.review_reports rr ON rr.review_id = r.id
+    GROUP BY u.id
+    ORDER BY reports DESC
+    LIMIT 10
+  `,
+  USER_DETAIL: `
+    SELECT u.id, u.name, u.email, u.role, (u.is_active IS NOT FALSE) AS active, u.suspended_at, u.suspended_reason,
+           u.created_at, u.last_login_at, GREATEST(u.last_seen_at, u.last_login_at) AS last_seen_at, u.email_verified_at,
+           u.is_public, u.show_in_community, u.show_activity, u.allow_indexing, u.follow_emails, u.email_locale,
+           (SELECT count(*) FROM librishelf.books WHERE user_id = u.id)::int AS books,
+           (SELECT count(*) FROM librishelf.books WHERE user_id = u.id AND read_date IS NOT NULL)::int AS read_books,
+           (SELECT max(created_at) FROM librishelf.books WHERE user_id = u.id) AS last_book_at,
+           (SELECT count(*) FROM librishelf.reviews WHERE user_id = u.id)::int AS reviews,
+           (SELECT count(*) FROM librishelf.reviews WHERE user_id = u.id AND hidden_at IS NOT NULL)::int AS hidden_reviews,
+           (SELECT count(*) FROM librishelf.lists WHERE user_id = u.id)::int AS lists,
+           (SELECT count(*) FROM librishelf.lists WHERE user_id = u.id AND is_public)::int AS public_lists,
+           (SELECT count(*) FROM librishelf.follows WHERE followee_id = u.id AND status = 'accepted')::int AS followers,
+           (SELECT count(*) FROM librishelf.follows WHERE follower_id = u.id AND status = 'accepted')::int AS following,
+           (SELECT count(*) FROM librishelf.blocks WHERE blocker_id = u.id)::int AS blocks_made,
+           (SELECT count(*) FROM librishelf.blocks WHERE blocked_id = u.id)::int AS blocked_by,
+           (SELECT count(*) FROM librishelf.review_reports rr JOIN librishelf.reviews r ON r.id = rr.review_id
+             WHERE r.user_id = u.id)::int AS reports_received,
+           (SELECT count(*) FROM librishelf.review_reports WHERE reporter_id = u.id)::int AS reports_made
+    FROM librishelf.users u
+    WHERE u.id = $1
+  `,
+  USER_REPORTED_REVIEWS: `
+    SELECT r.id, b.title, (r.hidden_at IS NOT NULL) AS hidden, r.hidden_reason,
+           count(rr.id)::int AS reports,
+           count(rr.id) FILTER (WHERE r.reviewed_at IS NULL OR rr.created_at > r.reviewed_at)::int AS open,
+           max(rr.created_at) AS last_report_at
+    FROM librishelf.reviews r
+    JOIN librishelf.books b ON b.id = r.book_id
+    JOIN librishelf.review_reports rr ON rr.review_id = r.id
+    WHERE r.user_id = $1
+    GROUP BY r.id, b.title
+    ORDER BY last_report_at DESC
+    LIMIT 20
+  `,
+  USER_ACTIONS: `
+    SELECT a.id, a.action, a.target_review_id, a.details, a.created_at, adm.name AS admin
+    FROM librishelf.admin_actions a
+    LEFT JOIN librishelf.users adm ON adm.id = a.admin_id
+    WHERE a.target_user_id = $1
+    ORDER BY a.created_at DESC, a.id DESC
+    LIMIT 30
+  `,
   LOG: `
     INSERT INTO librishelf.admin_actions (admin_id, action, target_user_id, target_review_id, details)
     VALUES ($1, $2, $3, $4, $5)
diff --git a/backend/src/middlewares/auth.js b/backend/src/middlewares/auth.js
index c4016bacc8b5180de6cd2c132714bbec8a497246..0160351d91f6e9f77c671aea9bfe5f7e2a15f536 100644
--- a/backend/src/middlewares/auth.js
+++ b/backend/src/middlewares/auth.js
@@ -5,6 +5,17 @@ import STATUS from '../utils/statusCodes.js'
 import * as authRepository from '../repositories/authRepository.js'
 
 const SECRET_KEY = process.env.SECRET_KEY
+// Último acesso: grava no máximo uma vez por hora por pessoa
+const SEEN_EVERY_MS = 60 * 60 * 1000
+const seenAt = new Map()
+
+function markSeen(userId) {
+  const now = Date.now()
+  if (now - (seenAt.get(userId) || 0) < SEEN_EVERY_MS) return
+  seenAt.set(userId, now)
+  if (seenAt.size > 10_000) seenAt.clear()
+  authRepository.markSeen(userId).catch(() => seenAt.delete(userId))
+}
 
 function extractToken(req) {
   const cookieToken = req.cookies?.[AUTH_COOKIE_NAME]
@@ -45,6 +56,7 @@ export async function resolveSession(req) {
     if (decoded.iat < changedAtSeconds) return { error: 'Sua sessão foi encerrada. Entre de novo.', code: 'SESSION_REVOKED' }
   }
 
+  markSeen(decoded.id)
   // O papel vem do banco a cada requisição: rebaixar alguém vale na hora.
   return { user: { ...decoded, role: session.role || 'user' } }
 }
diff --git a/backend/src/middlewares/errorHandler.js b/backend/src/middlewares/errorHandler.js
index 6988a811b05728704c1124cd901af5409d6ebd01..f6cbbe437ed07d8ac1da2ffefa7154a80589e49a 100644
--- a/backend/src/middlewares/errorHandler.js
+++ b/backend/src/middlewares/errorHandler.js
@@ -1,6 +1,7 @@
 import logger from '../utils/logger.js'
 import STATUS from '../utils/statusCodes.js'
 import { errorBody } from '../utils/httpError.js'
+import { serverError } from '../utils/metrics.js'
 
 const GENERIC_MESSAGE = 'Erro interno do servidor.'
 
@@ -21,6 +22,7 @@ export default (err, req, res, next) => {
     logger.warn(err.message, { statusCode, method: req.method, path: req.path })
   } else {
     logger.error(err.message || 'Erro não tratado', { statusCode, method: req.method, path: req.path, stack: err.stack })
+    serverError({ method: req.method, path: req.originalUrl?.split('?')[0], context: 'errorHandler', message: err.message })
   }
 
   res.status(statusCode).json({
diff --git a/backend/src/middlewares/rateLimiter.js b/backend/src/middlewares/rateLimiter.js
index 098a695cc069528974099371d6512491025ab69c..2fa68df453e7e2160bb1c4f7883d2f6d454e96ef 100644
--- a/backend/src/middlewares/rateLimiter.js
+++ b/backend/src/middlewares/rateLimiter.js
@@ -1,6 +1,7 @@
 import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
 import STATUS from '../utils/statusCodes.js'
 import { errorBody } from '../utils/httpError.js'
+import { rateLimited } from '../utils/metrics.js'
 
 function buildLimiter({ windowMs, max, message, code, perUser = false }) {
   return rateLimit({
@@ -15,6 +16,7 @@ function buildLimiter({ windowMs, max, message, code, perUser = false }) {
       ? (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip))
       : (req) => ipKeyGenerator(req.ip),
     handler: (req, res) => {
+      rateLimited(code, req.ip)
       res.status(STATUS.TOO_MANY_REQUESTS).json(errorBody(message, code))
     }
   })
diff --git a/backend/src/repositories/authRepository.js b/backend/src/repositories/authRepository.js
index 63ee7825b7611e1bfe508e4cb3ebf745d516a921..bb32f74e02628bad76760cbf8beb611c77e7ea7a 100644
--- a/backend/src/repositories/authRepository.js
+++ b/backend/src/repositories/authRepository.js
@@ -22,6 +22,10 @@ async function markLogin(id) {
   await db.query(q.MARK_LOGIN, [id])
 }
 
+async function markSeen(id) {
+  await db.query(q.MARK_SEEN, [id])
+}
+
 async function getSessionById(id) {
   const result = await db.query(q.FIND_SESSION_BY_ID, [id])
   return result.rows[0] || null
@@ -107,6 +111,7 @@ export {
   getUserByUsername,
   getUserByName,
   markLogin,
+  markSeen,
   getUserById,
   getUserByEmail,
   markEmailVerified,
diff --git a/backend/src/routes/admin.js b/backend/src/routes/admin.js
index e357d7795322921304fc6117bd690819d54496b7..67d518fd024919391c502853b1875052c89d9999 100644
--- a/backend/src/routes/admin.js
+++ b/backend/src/routes/admin.js
@@ -1,7 +1,7 @@
 import express from 'express'
 import { authenticateToken } from '../middlewares/auth.js'
 import { requireAdmin, requireUnlocked, isUnlocked, setUnlockCookie, clearUnlockCookie, ADMIN_UNLOCK_MINUTES } from '../middlewares/admin.js'
-import { sensitiveLimiter } from '../middlewares/rateLimiter.js'
+import { sensitiveLimiter, mailLimiter } from '../middlewares/rateLimiter.js'
 import { validateNumericId } from '../middlewares/validateId.js'
 import { verifyCurrentPassword } from '../services/authService.js'
 import * as adminService from '../services/adminService.js'
@@ -63,6 +63,13 @@ router.post('/users/:id/suspend', sensitiveLimiter, validateNumericId(), handle(
   req => adminService.suspend(req.user.id, Number(req.params.id), req.body ?? {})))
 router.post('/users/:id/reactivate', sensitiveLimiter, validateNumericId(), handle('Erro ao reativar conta',
   req => adminService.reactivate(req.user.id, Number(req.params.id), req.body ?? {})))
+router.get('/users/:id', validateNumericId(), handle('Erro ao abrir conta', req => adminService.user(Number(req.params.id))))
+router.post('/users/:id/resend-verification', validateNumericId(), handle('Erro ao reenviar confirmação',
+  req => adminService.resendUserVerification(req.user.id, Number(req.params.id))))
+router.get('/usage', handle('Erro ao carregar uso', () => adminService.usage()))
+router.get('/system', handle('Erro ao carregar o sistema', () => adminService.system()))
+router.post('/email/test', mailLimiter, handle('Erro ao enviar e-mail de teste', req => adminService.sendTestEmail(req.user.id)))
+router.get('/moderation/insights', handle('Erro ao carregar sinais de moderação', () => adminService.moderationInsights()))
 router.get('/actions', handle('Erro ao carregar o registro', req => adminService.actions({ page: req.query.page, limit: req.query.limit })))
 
 export default router
diff --git a/backend/src/routes/auth.js b/backend/src/routes/auth.js
index 25c3125944460b389d1bb011cfe8a8883173b75c..1318cb3b2396df736aa0aad9704cb6876598063e 100644
--- a/backend/src/routes/auth.js
+++ b/backend/src/routes/auth.js
@@ -7,6 +7,7 @@ import { loginLimiter, registerLimiter, sensitiveLimiter, mailLimiter, tokenLimi
 import { authenticateToken } from '../middlewares/auth.js'
 import { AUTH_COOKIE_NAME, authCookieOptions } from '../config/cookieOptions.js'
 import { clearUnlockCookie } from '../middlewares/admin.js'
+import { track } from '../utils/metrics.js'
 
 const router = express.Router()
 
@@ -147,7 +148,7 @@ router.patch('/me/username', authenticateToken, sensitiveLimiter, async (req, re
 })
 
 // Exportar todos os dados: ?format=json (padrão) ou csv (só os livros).
-router.get('/me/export', authenticateToken, sensitiveLimiter, async (req, res) => {
+router.get('/me/export', authenticateToken, sensitiveLimiter, track(req => (req.query.format === 'csv' ? 'export.csv' : 'export.json')), async (req, res) => {
   try {
     const stamp = new Date().toISOString().slice(0, 10)
     if (req.query.format === 'csv') {
diff --git a/backend/src/routes/dashboard.js b/backend/src/routes/dashboard.js
index b32d37993e913a8460ee8698497f6dd97a8cfb72..789ab499ae30a6fb44be71de04d82aee96f3eeb8 100644
--- a/backend/src/routes/dashboard.js
+++ b/backend/src/routes/dashboard.js
@@ -4,6 +4,7 @@ import * as yearService from '../services/yearService.js'
 import { authenticateToken } from '../middlewares/auth.js'
 import STATUS from '../utils/statusCodes.js'
 import sendError from '../utils/sendError.js'
+import { track } from '../utils/metrics.js'
 
 const router = express.Router()
 
@@ -19,7 +20,7 @@ router.get('/stats', async (req, res) => {
 })
 
 // "Seu ano em livros" (retrospectiva): GET /dashboard/year/2026
-router.get('/year/:year', async (req, res) => {
+router.get('/year/:year', track('year.view'), async (req, res) => {
   try {
     res.status(STATUS.OK).json(await yearService.yearInBooks(req.user.id, req.params.year))
   } catch (error) {
diff --git a/backend/src/routes/isbn.js b/backend/src/routes/isbn.js
index 3047dff7e7d15333178b99721bf482232febaf38..047d250ef19a1c413ad60beae42759f841a34eb7 100644
--- a/backend/src/routes/isbn.js
+++ b/backend/src/routes/isbn.js
@@ -5,6 +5,7 @@ import * as openLibrary from '../services/openLibraryService.js'
 import STATUS from '../utils/statusCodes.js'
 import { errorBody } from '../utils/httpError.js'
 import sendError from '../utils/sendError.js'
+import { track } from '../utils/metrics.js'
 
 const router = express.Router()
 
@@ -26,7 +27,7 @@ router.get('/cover/:coverId', coverProxyLimiter, async (req, res) => {
 })
 
 // Busca por título/autor: GET /isbn/search?q=dom+casmurro&lang=pt
-router.get('/search', bookSearchLimiter, async (req, res) => {
+router.get('/search', bookSearchLimiter, track('search.title'), async (req, res) => {
   try {
     const result = await openLibrary.searchBooks(req.query.q, req.query.lang)
     res.set('Cache-Control', 'private, max-age=3600')
@@ -36,7 +37,8 @@ router.get('/search', bookSearchLimiter, async (req, res) => {
   }
 })
 
-router.get('/:isbn', isbnLimiter, async (req, res) => {
+// ?via=scan quando o ISBN veio da câmera (só para contar o uso do leitor)
+router.get('/:isbn', isbnLimiter, track(req => (req.query.via === 'scan' ? 'isbn.scan' : 'isbn.typed')), async (req, res) => {
   try {
     const book = await openLibrary.lookupIsbn(req.params.isbn)
     if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Nenhum livro encontrado para este ISBN.', 'ISBN_NOT_FOUND'))
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 17e270c509c5d131d2f563972743c924fdd62e61..b14407394a11686a4ec4245bfda7e1b0f7e2786c 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -18,6 +18,7 @@ import { saveBookCover, isValidImage } from '../utils/imageProcessor.js'
 import { uploadLimiter, publicLimiter } from '../middlewares/rateLimiter.js'
 import sendError from '../utils/sendError.js'
 import logger from '../utils/logger.js'
+import { track } from '../utils/metrics.js'
 
 const MAX_UPLOAD_MB = 10
 
@@ -155,7 +156,7 @@ router.get('/series', async (req, res) => {
 })
 
 // Importar livros de um CSV (campo "file"): Goodreads ou o CSV exportado do Librishelf.
-router.post('/import', uploadLimiter, handleUpload(csvUpload.single('file')), async (req, res) => {
+router.post('/import', uploadLimiter, handleUpload(csvUpload.single('file')), track('import.csv'), async (req, res) => {
   try {
     const summary = await dataService.importCsv(req.user.id, req.file?.buffer)
     res.status(STATUS.OK).json(summary)
@@ -185,7 +186,7 @@ router.get('/:id', validateNumericId(), async (req, res) => {
   }
 })
 
-router.post('/', uploadLimiter, handleUpload(upload.single('coverImage')), async (req, res) => {
+router.post('/', uploadLimiter, handleUpload(upload.single('coverImage')), track(req => (req.file ? 'cover.upload' : null)), track('book.add'), async (req, res) => {
   try {
     // Autores chegam como campo repetido (authors=A&authors=B) ou um só valor.
     const bookData = {
@@ -252,7 +253,7 @@ router.put('/:id', validateNumericId(), async (req, res) => {
   }
 })
 
-router.post('/:id/cover', validateNumericId(), uploadLimiter, handleUpload(upload.single('coverImage')), async (req, res) => {
+router.post('/:id/cover', validateNumericId(), uploadLimiter, handleUpload(upload.single('coverImage')), track('cover.upload'), async (req, res) => {
   try {
     const { id } = req.params
     const userId = req.user.id
diff --git a/backend/src/scripts/seed.js b/backend/src/scripts/seed.js
index ed2485c603a3d680f747a56cd5f94d22731ab650..77a7921cd8da42cf7cc52148c2868b6224123577 100644
--- a/backend/src/scripts/seed.js
+++ b/backend/src/scripts/seed.js
@@ -313,7 +313,7 @@ function buildUsers(count) {
 async function resetDatabase() {
   logger.warn('Apagando todos os dados do librishelf', { db: process.env.DB_NAME })
   await db.query(`
-    TRUNCATE librishelf.follows, librishelf.books_authors_link, librishelf.books_tags_link,
+    TRUNCATE librishelf.usage_counters, librishelf.follows, librishelf.books_authors_link, librishelf.books_tags_link,
              librishelf.books, librishelf.authors, librishelf.publishers, librishelf.tags,
              librishelf.users RESTART IDENTITY CASCADE
   `)
@@ -788,6 +788,28 @@ async function insertAdminData() {
     if (count >= 3) await db.query("UPDATE librishelf.reviews SET hidden_at = now(), hidden_reason = 'reports' WHERE id = $1", [review.id])
   }
 
+  // Último acesso: um pouco depois do último login
+  await db.query("UPDATE librishelf.users SET last_seen_at = last_login_at + (random() * interval '5 days') WHERE last_login_at IS NOT NULL")
+  await db.query("UPDATE librishelf.users SET last_seen_at = LEAST(last_seen_at, now())")
+
+  // Contadores de uso dos últimos 30 dias (a área administrativa mostra 7 e 30)
+  const daily = { 'book.add': [2, 25], 'isbn.typed': [1, 12], 'isbn.scan': [0, 6], 'search.title': [2, 30], 'cover.upload': [0, 4], 'import.csv': [0, 1],
+    'export.json': [0, 1], 'export.csv': [0, 1], 'year.view': [0, 5], 'openlibrary.ok': [10, 80], 'openlibrary.error': [0, 3], 'openlibrary.timeout': [0, 1],
+    'email.sent': [0, 6], 'ratelimit.RATE_LIMIT_LOGIN': [0, 2], 'error.500': [0, 1] }
+  const rows = []
+  for (let day = 0; day < 30; day++) {
+    const date = new Date(NOW - day * DAY).toISOString().slice(0, 10)
+    for (const [event, [min, max]] of Object.entries(daily)) {
+      const n = int(min, max)
+      if (n > 0) rows.push([date, event, n])
+    }
+  }
+  await db.query(`
+    INSERT INTO librishelf.usage_counters (day, event, count)
+    SELECT * FROM unnest($1::date[], $2::text[], $3::int[])
+    ON CONFLICT (day, event) DO UPDATE SET count = EXCLUDED.count
+  `, [rows.map(r => r[0]), rows.map(r => r[1]), rows.map(r => r[2])])
+
   await db.query(`
     UPDATE librishelf.users SET is_active = false, suspended_at = now() - interval '3 days',
            suspended_reason = 'Exemplo do seed: spam em resenhas.'
diff --git a/backend/src/services/adminService.js b/backend/src/services/adminService.js
index 90e9a867f9f654e769f9fb1090e292fc360230a3..b8def0d9535dee49e856563d0dbfc3545c7e8cc7 100644
--- a/backend/src/services/adminService.js
+++ b/backend/src/services/adminService.js
@@ -1,7 +1,14 @@
+import fs from 'node:fs/promises'
+import os from 'node:os'
+import path from 'node:path'
 import { db } from '../database/connection.js'
 import { ADMIN_QUERIES as q } from '../database/queries.js'
+import { pendingMigrations } from '../database/migrate.js'
+import UPLOAD_DIR from '../config/uploadDir.js'
 import * as reviewService from './reviewService.js'
-import { verifyCurrentPassword } from './authService.js'
+import { verifyCurrentPassword, resendVerification } from './authService.js'
+import { sendMail, mailConfig } from './mailService.js'
+import * as metrics from '../utils/metrics.js'
 import { resolvePagination } from '../utils/pagination.js'
 import STATUS from '../utils/statusCodes.js'
 import { httpError } from '../utils/httpError.js'
@@ -17,7 +24,7 @@ import logger from '../utils/logger.js'
  * devolve tudo como estava; nada é apagado.
  */
 const QUEUE_STATUSES = ['open', 'hidden', 'all']
-const USER_STATUSES = ['all', 'suspended']
+const USER_STATUSES = ['all', 'suspended', 'unverified']
 const MAX_REASON = 500
 const MAX_QUERY = 100
 
@@ -33,12 +40,16 @@ export async function logUnlock(adminId) {
 // ------------------------------------------------------------------ números
 
 export async function stats() {
-  const [{ rows: [totals] }, { rows: weeks }] = await Promise.all([db.query(q.STATS), db.query(q.SIGNUPS_BY_WEEK)])
+  const [{ rows: [totals] }, { rows: weeks }, { rows: [eng] }] = await Promise.all([
+    db.query(q.STATS), db.query(q.SIGNUPS_BY_WEEK), db.query(q.ENGAGEMENT)
+  ])
   return {
     users: {
       total: totals.users,
       verified: totals.verified,
+      active7: totals.active7,
       active30: totals.active30,
+      staleSignups: totals.stale_signups,
       signups7: totals.signups7,
       signups30: totals.signups30,
       suspended: totals.suspended
@@ -46,7 +57,208 @@ export async function stats() {
     community: { publicLibraries: totals.public_libraries, members: totals.community },
     content: { books: totals.books, reviews: totals.reviews, hiddenReviews: totals.hidden_reviews, lists: totals.lists },
     moderation: { openReports: totals.open_reports },
-    signupsByWeek: weeks.map(row => ({ week: row.week, total: row.total }))
+    signupsByWeek: weeks.map(row => ({ week: row.week, total: row.total })),
+    engagement: {
+      funnel: { signedUp: eng.users, verified: eng.verified, withBook: eng.with_book, with10Books: eng.with_10_books },
+      returned: eng.returned,
+      olderThanWeek: eng.older_than_week,
+      books7: eng.books7,
+      books30: eng.books30,
+      finished30: eng.finished30,
+      reviews30: eng.reviews30
+    }
+  }
+}
+
+// ------------------------------------------------------------------ uso dos recursos
+
+// Eventos contados no servidor (utils/metrics.js) que aparecem em "Uso"
+const USAGE_EVENTS = ['book.add', 'isbn.typed', 'isbn.scan', 'search.title', 'cover.upload', 'import.csv', 'export.json', 'export.csv', 'year.view']
+
+async function counters(days) {
+  const { rows } = await db.query(q.COUNTERS, [days])
+  return Object.fromEntries(rows.map(row => [row.event, row.total]))
+}
+
+export async function usage() {
+  await metrics.flushMetrics()
+  const [{ rows: [adoption] }, last7, last30] = await Promise.all([db.query(q.ADOPTION), counters(7), counters(30)])
+  return {
+    adoption: {
+      users: adoption.users,
+      lists: adoption.lists,
+      reviews: adoption.reviews,
+      goals: adoption.goals,
+      series: adoption.series,
+      notes: adoption.notes,
+      readingNow: adoption.reading_now,
+      rereads: adoption.rereads,
+      publicLibrary: adoption.public_library,
+      community: adoption.community,
+      acceptsFollowers: adoption.accepts_followers,
+      following: adoption.following,
+      followEmails: adoption.follow_emails,
+      blocks: adoption.blocks,
+      indexing: adoption.indexing
+    },
+    events: USAGE_EVENTS.map(event => ({ event, last7: last7[event] || 0, last30: last30[event] || 0 }))
+  }
+}
+
+// ------------------------------------------------------------------ sistema
+
+let uploadCache = { at: 0, value: null }
+const UPLOAD_CACHE_MS = 5 * 60 * 1000
+
+async function uploadStats() {
+  if (uploadCache.value && Date.now() - uploadCache.at < UPLOAD_CACHE_MS) return uploadCache.value
+  let files = 0
+  let bytes = 0
+  try {
+    const names = await fs.readdir(UPLOAD_DIR)
+    for (let i = 0; i < names.length; i += 200) {
+      const stats = await Promise.all(names.slice(i, i + 200).map(name => fs.stat(path.join(UPLOAD_DIR, name)).catch(() => null)))
+      for (const stat of stats) if (stat?.isFile()) { files++; bytes += stat.size }
+    }
+  } catch {
+    uploadCache = { at: Date.now(), value: { files: null, bytes: null } }
+    return uploadCache.value
+  }
+  uploadCache = { at: Date.now(), value: { files, bytes } }
+  return uploadCache.value
+}
+
+async function diskStats() {
+  try {
+    const stat = await fs.statfs(UPLOAD_DIR)
+    return { total: stat.blocks * stat.bsize, free: stat.bavail * stat.bsize }
+  } catch {
+    return { total: null, free: null }
+  }
+}
+
+async function database() {
+  const started = performance.now()
+  try {
+    const { rows: [info] } = await db.query(q.DB_INFO)
+    const latencyMs = Math.round(performance.now() - started)
+    const [{ rows: [last] }, pending] = await Promise.all([db.query(q.LAST_MIGRATION), pendingMigrations()])
+    return {
+      ok: true,
+      latencyMs,
+      version: info.version,
+      size: Number(info.size),
+      connections: info.connections,
+      pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount },
+      lastMigration: last ? { version: last.version, appliedAt: last.applied_at } : null,
+      pendingMigrations: pending
+    }
+  } catch (err) {
+    return { ok: false, error: err.message }
+  }
+}
+
+const OL_EVENTS = ['openlibrary.ok', 'openlibrary.error', 'openlibrary.timeout']
+
+export async function system() {
+  await metrics.flushMetrics()
+  const memory = process.memoryUsage()
+  const [dbInfo, uploads, disk, last7, today, { rows: series }, { rows: [olBooks] }] = await Promise.all([
+    database(), uploadStats(), diskStats(), counters(7), counters(1),
+    db.query(q.COUNTER_SERIES, [OL_EVENTS, 14]), db.query(q.OPENLIBRARY_BOOKS)
+  ])
+  const byPrefix = (source, prefix) => Object.entries(source)
+    .filter(([event]) => event.startsWith(prefix))
+    .map(([event, total]) => ({ code: event.slice(prefix.length), total }))
+    .sort((a, b) => b.total - a.total)
+
+  const olDays = new Map()
+  for (const row of series) {
+    const day = olDays.get(row.day) || { day: row.day, ok: 0, error: 0, timeout: 0 }
+    day[row.event.split('.')[1]] = row.total
+    olDays.set(row.day, day)
+  }
+  const ol7 = { ok: last7['openlibrary.ok'] || 0, error: last7['openlibrary.error'] || 0, timeout: last7['openlibrary.timeout'] || 0 }
+  const olTotal = ol7.ok + ol7.error + ol7.timeout
+
+  return {
+    service: {
+      startedAt: metrics.processStartedAt().toISOString(),
+      uptimeSeconds: Math.round(process.uptime()),
+      version: process.env.APP_VERSION?.trim() || null,
+      node: process.version,
+      environment: process.env.NODE_ENV || 'development',
+      memory: { rss: memory.rss, heapUsed: memory.heapUsed },
+      load: os.loadavg().map(n => Math.round(n * 100) / 100),
+      cpus: os.cpus().length
+    },
+    database: dbInfo,
+    storage: { uploads, disk },
+    config: {
+      appUrl: process.env.APP_URL?.trim() || null,
+      openLibraryContact: Boolean(process.env.OPENLIBRARY_CONTACT?.trim()),
+      cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
+      trustProxy: process.env.TRUST_PROXY ?? null
+    },
+    email: {
+      ...mailConfig(),
+      sent7: last7['email.sent'] || 0,
+      failed7: last7['email.failed'] || 0,
+      lastSuccessAt: metrics.lastSuccess('email'),
+      lastFailure: metrics.lastFailure('email')
+    },
+    openLibrary: {
+      last7: ol7,
+      errorRate: olTotal ? Math.round(((ol7.error + ol7.timeout) / olTotal) * 1000) / 10 : null,
+      latency: metrics.timingStats('openlibrary'),
+      lastFailure: metrics.lastFailure('openlibrary'),
+      daily: [...olDays.values()],
+      books: { linked: olBooks.linked, linkable: olBooks.linkable, unlinked: olBooks.unlinked }
+    },
+    rateLimits: {
+      today: byPrefix(today, 'ratelimit.'),
+      last7: byPrefix(last7, 'ratelimit.'),
+      topIps: metrics.topRateLimitedIps()
+    },
+    errors: {
+      today: today['error.500'] || 0,
+      last7: last7['error.500'] || 0,
+      recent: metrics.recentErrors()
+    }
+  }
+}
+
+/** POST /admin/email/test — manda um e-mail para o próprio admin. */
+export async function sendTestEmail(adminId) {
+  const { rows: [admin] } = await db.query('SELECT email FROM librishelf.users WHERE id = $1', [adminId])
+  const config = mailConfig()
+  try {
+    await sendMail({
+      to: admin.email,
+      subject: 'Librishelf — e-mail de teste',
+      text: `Este é um e-mail de teste enviado pela área administrativa em ${new Date().toISOString()}.\nSe chegou, o envio está funcionando.`,
+      html: `<p>Este é um e-mail de teste enviado pela área administrativa em ${new Date().toISOString()}.</p><p>Se chegou, o envio está funcionando.</p>`
+    })
+  } catch (err) {
+    await log(adminId, 'email.test', { details: { ok: false } })
+    throw httpError(`O servidor de e-mail recusou: ${err.message}`.slice(0, 300), 502, 'EMAIL_TEST_FAILED', { message: String(err.message).slice(0, 200) })
+  }
+  await log(adminId, 'email.test', { details: { ok: true } })
+  return { sent: config.configured, to: admin.email, smtp: config.configured }
+}
+
+// ------------------------------------------------------------------ moderação: sinais
+
+const toPerson = row => ({ id: row.id, username: row.name, active: row.active, createdAt: row.created_at })
+
+export async function moderationInsights() {
+  const [{ rows: serial }, { rows: fresh }, { rows: most }] = await Promise.all([
+    db.query(q.SERIAL_REPORTERS), db.query(q.NEW_REPORTED), db.query(q.MOST_REPORTED)
+  ])
+  return {
+    serialReporters: serial.map(row => ({ ...toPerson(row), reports: row.reports, upheld: row.upheld, rejected: row.rejected, last7: row.last7 })),
+    newAccountsReported: fresh.map(row => ({ ...toPerson(row), reports: row.reports, reviewsReported: row.reviews_reported })),
+    mostReported: most.map(row => ({ ...toPerson(row), reports: row.reports, reviewsReported: row.reviews_reported, hidden: row.hidden }))
   }
 }
 
@@ -158,6 +370,69 @@ export async function reactivate(adminId, id, { password } = {}) {
   return { suspended: false }
 }
 
+/** GET /admin/users/:id — tudo de uma conta (menos senha, livros e anotações). */
+export async function user(id) {
+  const [{ rows: [row] }, { rows: reviews }, { rows: history }] = await Promise.all([
+    db.query(q.USER_DETAIL, [id]), db.query(q.USER_REPORTED_REVIEWS, [id]), db.query(q.USER_ACTIONS, [id])
+  ])
+  if (!row) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
+  return {
+    id: row.id,
+    username: row.name,
+    email: row.email,
+    isAdmin: row.role === 'admin',
+    active: row.active,
+    suspendedAt: row.suspended_at,
+    suspendedReason: row.suspended_reason,
+    createdAt: row.created_at,
+    lastLoginAt: row.last_login_at,
+    lastSeenAt: row.last_seen_at,
+    emailVerifiedAt: row.email_verified_at,
+    emailLocale: row.email_locale,
+    privacy: {
+      isPublic: row.is_public,
+      showInCommunity: row.show_in_community,
+      showActivity: row.show_activity,
+      allowIndexing: row.allow_indexing,
+      followEmails: row.follow_emails
+    },
+    totals: {
+      books: row.books,
+      readBooks: row.read_books,
+      lastBookAt: row.last_book_at,
+      reviews: row.reviews,
+      hiddenReviews: row.hidden_reviews,
+      lists: row.lists,
+      publicLists: row.public_lists,
+      followers: row.followers,
+      following: row.following,
+      blocksMade: row.blocks_made,
+      blockedBy: row.blocked_by,
+      reportsReceived: row.reports_received,
+      reportsMade: row.reports_made
+    },
+    reportedReviews: reviews.map(item => ({
+      id: item.id, book: item.title, hidden: item.hidden, hiddenReason: item.hidden_reason,
+      reports: item.reports, open: item.open, lastReportAt: item.last_report_at
+    })),
+    history: history.map(item => ({
+      id: item.id, action: item.action, admin: item.admin, targetReviewId: item.target_review_id,
+      details: item.details, createdAt: item.created_at
+    }))
+  }
+}
+
+/** POST /admin/users/:id/resend-verification — cadastros parados. */
+export async function resendUserVerification(adminId, id) {
+  const { rows: [target] } = await db.query(q.USER_TARGET, [id])
+  if (!target) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
+  if (!target.active) throw httpError('Esta conta está suspensa.', STATUS.CONFLICT, 'ACCOUNT_ALREADY_SUSPENDED')
+  if (target.email_verified_at) throw httpError('Esta conta já confirmou o e-mail.', STATUS.CONFLICT, 'EMAIL_ALREADY_VERIFIED')
+  await resendVerification(id, target.email_locale)
+  await log(adminId, 'user.resend_verification', { userId: id })
+  return { sent: true }
+}
+
 // ------------------------------------------------------------------ registro
 
 export async function actions({ page, limit } = {}) {
diff --git a/backend/src/services/mailService.js b/backend/src/services/mailService.js
index 1576fa0f5c196eb393335e4c75fbc535fe8500ba..71f2e2f86b5f9a450b992d705ab5187c3db666eb 100644
--- a/backend/src/services/mailService.js
+++ b/backend/src/services/mailService.js
@@ -1,5 +1,6 @@
 import nodemailer from 'nodemailer'
 import logger from '../utils/logger.js'
+import { count, failure, succeeded } from '../utils/metrics.js'
 
 /**
  * Envio de e-mail por SMTP (nodemailer).
@@ -64,10 +65,30 @@ export async function sendMail({ to, subject, text, html, unsubscribeUrl }) {
     return
   }
 
-  const info = await getTransport().sendMail({ from: sender(), to, subject, text, html, headers, list })
+  let info
+  try {
+    info = await getTransport().sendMail({ from: sender(), to, subject, text, html, headers, list })
+  } catch (err) {
+    count('email.failed')
+    failure('email', err.message)
+    throw err
+  }
+  count('email.sent')
+  succeeded('email')
   logger.info('E-mail enviado', { to, subject, messageId: info.messageId })
 }
 
+/** Para a área administrativa: o que está configurado (sem senha nem usuário). */
+export function mailConfig() {
+  return {
+    configured: smtpConfigured(),
+    host: smtpConfigured() ? process.env.SMTP_HOST.trim() : null,
+    port: smtpConfigured() ? Number(process.env.SMTP_PORT) || 587 : null,
+    from: sender(),
+    adminEmail: Boolean(process.env.ADMIN_EMAIL?.trim())
+  }
+}
+
 /** Checa a conexão com o servidor SMTP (usado no boot, só para avisar). */
 export async function verifySmtp() {
   if (!smtpConfigured() || process.env.NODE_ENV === 'test') return
diff --git a/backend/src/services/openLibraryService.js b/backend/src/services/openLibraryService.js
index c1a7f774f9920566a51c572ea16cffdc2cbea70f..fc405a98aa86448b9b6da0913ab6d27a2e008509 100644
--- a/backend/src/services/openLibraryService.js
+++ b/backend/src/services/openLibraryService.js
@@ -2,6 +2,7 @@ import logger from '../utils/logger.js'
 import STATUS from '../utils/statusCodes.js'
 import { normalizeIsbn13 } from '../utils/isbn.js'
 import { httpError } from '../utils/httpError.js'
+import { count, timing, failure } from '../utils/metrics.js'
 
 /**
  * Busca de livros no Open Library (por ISBN e por título/autor), feita sempre
@@ -99,20 +100,37 @@ function cacheSet(cache, key, value, ttl, max) {
   cache.set(key, { value, expiresAt: Date.now() + ttl })
 }
 
+// Para a área administrativa: chamadas, falhas e tempo de resposta
+function record(startedAt, outcome, message) {
+  if (outcome === 'ok') timing('openlibrary', Date.now() - startedAt)
+  count(`openlibrary.${outcome}`)
+  if (outcome !== 'ok') failure('openlibrary', message)
+}
+
 async function getJson(path, timeoutMs = TIMEOUT_MS) {
   let response
+  let startedAt = Date.now()
   try {
-    response = await throttled(() => fetchImpl(`${API_BASE}${path}`, {
-      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
-      redirect: 'follow',
-      signal: AbortSignal.timeout(timeoutMs)
-    }))
+    response = await throttled(() => {
+      // o tempo conta só a requisição, não a espera na fila
+      startedAt = Date.now()
+      return fetchImpl(`${API_BASE}${path}`, {
+        headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
+        redirect: 'follow',
+        signal: AbortSignal.timeout(timeoutMs)
+      })
+    })
   } catch (err) {
+    record(startedAt, err?.name === 'TimeoutError' ? 'timeout' : 'error', err?.message)
     throw unavailable(err)
   }
 
-  if (response.status === 404) return null
-  if (!response.ok) throw unavailable(new Error(`HTTP ${response.status} em ${path}`))
+  if (response.status === 404) { record(startedAt, 'ok'); return null }
+  if (!response.ok) {
+    record(startedAt, 'error', `HTTP ${response.status}`)
+    throw unavailable(new Error(`HTTP ${response.status} em ${path}`))
+  }
+  record(startedAt, 'ok')
 
   try {
     return await response.json()
@@ -278,6 +296,7 @@ export async function fetchCover(coverId, size = 'L') {
   if (cached !== undefined) return cached
 
   let response
+  const startedAt = Date.now()
   try {
     response = await fetchImpl(`${COVERS_BASE}/b/id/${id}-${suffix}.jpg?default=false`, {
       headers: { 'User-Agent': userAgent() },
@@ -285,11 +304,16 @@ export async function fetchCover(coverId, size = 'L') {
       signal: AbortSignal.timeout(TIMEOUT_MS)
     })
   } catch (err) {
+    record(startedAt, err?.name === 'TimeoutError' ? 'timeout' : 'error', err?.message)
     throw unavailable(err)
   }
 
-  if (response.status === 404) return null
-  if (!response.ok) throw unavailable(new Error(`HTTP ${response.status} na capa ${id}`))
+  if (response.status === 404) { record(startedAt, 'ok'); return null }
+  if (!response.ok) {
+    record(startedAt, 'error', `HTTP ${response.status}`)
+    throw unavailable(new Error(`HTTP ${response.status} na capa ${id}`))
+  }
+  record(startedAt, 'ok')
 
   const declared = Number(response.headers.get('content-length'))
   if (declared > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502, 'COVER_TOO_LARGE')
diff --git a/backend/src/tests/integration/admin.test.js b/backend/src/tests/integration/admin.test.js
index fd727602acc1e6646f9044b9e8e571e81506577e..da2877e7979ce038e07ab60e55a3ff44274a9545 100644
--- a/backend/src/tests/integration/admin.test.js
+++ b/backend/src/tests/integration/admin.test.js
@@ -4,6 +4,8 @@ import { db } from '../../database/connection.js'
 import { confirmEmail } from '../helpers/confirmEmail.js'
 import { tokenFrom } from '../helpers/authToken.js'
 import { clearDatabase, closeDatabase } from '../../utils/db.js'
+import { testOutbox } from '../../services/mailService.js'
+import * as metrics from '../../utils/metrics.js'
 
 const PASSWORD = 'senha12345'
 const tokens = {}
@@ -25,6 +27,9 @@ const ids = {}
 
 beforeAll(async () => {
   await clearDatabase()
+  // Contadores e erros de outras suítes não entram aqui
+  await db.query('TRUNCATE librishelf.usage_counters')
+  metrics.resetMetrics()
   await signUp('chefe')
   await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'chefe'")
   await signUp('ana', { isPublic: true, showInCommunity: true, showActivity: true })
@@ -202,13 +207,90 @@ describe('contas', () => {
   })
 })
 
+describe('engajamento, cadastros parados e conta individual', () => {
+  test('funil e último acesso', async () => {
+    const res = await request(app).get('/admin/stats').set(asAdmin())
+    expect(res.body.engagement.funnel).toEqual({ signedUp: 5, verified: 5, withBook: 1, with10Books: 0 })
+    expect(res.body.engagement.books7).toBe(1)
+    expect(res.body.users.active7).toBe(5)
+    const { rows } = await db.query("SELECT last_seen_at FROM librishelf.users WHERE name = 'bia'")
+    expect(rows[0].last_seen_at).not.toBeNull()
+  })
+
+  test('cadastro parado: aparece no filtro e dá para reenviar a confirmação', async () => {
+    await db.query("UPDATE librishelf.users SET email_verified_at = NULL, created_at = now() - interval '10 days' WHERE name = 'caio'")
+    expect((await request(app).get('/admin/stats').set(asAdmin())).body.users.staleSignups).toBe(1)
+    const list = await request(app).get('/admin/users?status=unverified').set(asAdmin())
+    expect(list.body.users.map(u => u.username)).toEqual(['caio'])
+
+    testOutbox().length = 0
+    const caio = await userId('caio')
+    const res = await request(app).post(`/admin/users/${caio}/resend-verification`).set(asAdmin())
+    expect(res.status).toBe(200)
+    expect(testOutbox().map(m => m.to)).toEqual(['caio@example.com'])
+    const again = await request(app).post(`/admin/users/${ids.ana}/resend-verification`).set(asAdmin())
+    expect(again.body.code).toBe('EMAIL_ALREADY_VERIFIED')
+    await db.query("UPDATE librishelf.users SET email_verified_at = now() WHERE name = 'caio'")
+  })
+
+  test('conta individual: totais, resenhas denunciadas e histórico', async () => {
+    const res = await request(app).get(`/admin/users/${ids.ana}`).set(asAdmin())
+    expect(res.status).toBe(200)
+    expect(res.body).toMatchObject({ username: 'ana', email: 'ana@example.com', active: true, privacy: { isPublic: true, showInCommunity: true } })
+    expect(res.body.totals).toMatchObject({ books: 1, reviews: 1, reportsReceived: 2, reportsMade: 0 })
+    expect(res.body.reportedReviews).toEqual([expect.objectContaining({ id: ids.review, book: 'Fantastic Mr. Fox', reports: 2, open: 0 })])
+    expect(res.body.history.map(h => h.action)).toEqual(['user.reactivate', 'user.suspend', 'review.show', 'review.hide'])
+    expect(res.body).not.toHaveProperty('password_hash')
+    expect((await request(app).get('/admin/users/99999').set(asAdmin())).status).toBe(404)
+  })
+})
+
+describe('uso, sistema e sinais de moderação', () => {
+  test('uso dos recursos: contas por recurso e contadores do servidor', async () => {
+    const res = await request(app).get('/admin/usage').set(asAdmin())
+    expect(res.status).toBe(200)
+    expect(res.body.adoption).toMatchObject({ users: 5, reviews: 1, publicLibrary: 4, community: 1, lists: 0 })
+    expect(res.body.events.find(e => e.event === 'book.add').last7).toBe(1)
+  })
+
+  test('sistema: banco, migrations, e-mail, limites e erros 500', async () => {
+    metrics.serverError({ method: 'GET', path: '/library/12345', context: 'teste', message: 'falha simulada' })
+    metrics.rateLimited('RATE_LIMIT_LOGIN', '203.0.113.9')
+    const res = await request(app).get('/admin/system').set(asAdmin())
+    expect(res.status).toBe(200)
+    expect(res.body.database).toMatchObject({ ok: true, pendingMigrations: [] })
+    expect(res.body.database.lastMigration.version).toMatch(/^\d{3}_/)
+    expect(res.body.email).toMatchObject({ configured: false })
+    expect(res.body.errors.recent[0]).toMatchObject({ path: '/library/:id', message: 'falha simulada' })
+    expect(res.body.errors.today).toBeGreaterThanOrEqual(1)
+    expect(res.body.rateLimits.topIps[0]).toMatchObject({ ip: '203.0.113.9', total: 1 })
+    expect(res.body.rateLimits.today).toEqual([{ code: 'RATE_LIMIT_LOGIN', total: 1 }])
+    expect(res.body.openLibrary.books).toEqual({ linked: 0, linkable: 1, unlinked: 0 })
+  })
+
+  test('e-mail de teste vai para o próprio admin', async () => {
+    testOutbox().length = 0
+    const res = await request(app).post('/admin/email/test').set(asAdmin())
+    expect(res.status).toBe(200)
+    expect(testOutbox()[0]).toMatchObject({ to: 'chefe@example.com', subject: 'Librishelf — e-mail de teste' })
+  })
+
+  test('sinais: contas novas denunciadas e as mais denunciadas', async () => {
+    const res = await request(app).get('/admin/moderation/insights').set(asAdmin())
+    expect(res.status).toBe(200)
+    expect(res.body.serialReporters).toEqual([])
+    expect(res.body.newAccountsReported).toEqual([expect.objectContaining({ username: 'ana', reports: 2, reviewsReported: 1 })])
+    expect(res.body.mostReported[0]).toMatchObject({ username: 'ana', reports: 2, hidden: 0 })
+  })
+})
+
 describe('registro', () => {
   test('lista o que foi feito, do mais novo ao mais antigo', async () => {
     const res = await request(app).get('/admin/actions').set(asAdmin())
     expect(res.status).toBe(200)
-    expect(res.body.actions.map(a => a.action)).toEqual(['user.reactivate', 'user.suspend', 'review.show', 'review.hide', 'admin.unlock'])
-    expect(res.body.actions[1]).toMatchObject({ admin: 'chefe', targetUser: 'ana', details: { reason: 'Spam repetido' } })
-    expect(res.body.actions[3]).toMatchObject({ action: 'review.hide', targetUser: 'ana', targetReviewId: ids.review, book: 'Fantastic Mr. Fox' })
+    expect(res.body.actions.map(a => a.action)).toEqual(['email.test', 'user.resend_verification', 'user.reactivate', 'user.suspend', 'review.show', 'review.hide', 'admin.unlock'])
+    expect(res.body.actions[3]).toMatchObject({ admin: 'chefe', targetUser: 'ana', details: { reason: 'Spam repetido' } })
+    expect(res.body.actions[5]).toMatchObject({ action: 'review.hide', targetUser: 'ana', targetReviewId: ids.review, book: 'Fantastic Mr. Fox' })
   })
 
   test('conta excluída: o registro deixa de apontar para ela e não guarda nada dela', async () => {
diff --git a/backend/src/tests/unit/metrics.test.js b/backend/src/tests/unit/metrics.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..bf613ecd208046d7ea3043a59a8c948b1a4b7106
--- /dev/null
+++ b/backend/src/tests/unit/metrics.test.js
@@ -0,0 +1,49 @@
+import { EventEmitter } from 'node:events'
+import * as metrics from '../../utils/metrics.js'
+
+beforeEach(() => metrics.resetMetrics())
+
+test('tempo médio e p95', () => {
+  for (let ms = 1; ms <= 100; ms++) metrics.timing('x', ms)
+  expect(metrics.timingStats('x')).toEqual({ samples: 100, avgMs: 51, p95Ms: 96 })
+  expect(metrics.timingStats('nada')).toEqual({ samples: 0, avgMs: null, p95Ms: null })
+})
+
+test('erro 500 guarda rota sem ids e corta a mensagem', () => {
+  metrics.serverError({ method: 'GET', path: '/library/123/review', context: 'c', message: 'x'.repeat(500) })
+  const [error] = metrics.recentErrors()
+  expect(error.path).toBe('/library/:id/review')
+  expect(error.message).toHaveLength(300)
+})
+
+test('só os 50 erros mais recentes', () => {
+  for (let i = 0; i < 60; i++) metrics.serverError({ message: `e${i}` })
+  expect(metrics.recentErrors()).toHaveLength(50)
+  expect(metrics.recentErrors()[0].message).toBe('e59')
+})
+
+test('IPs que bateram no limite, somados por código', () => {
+  metrics.rateLimited('RATE_LIMIT_LOGIN', '1.1.1.1')
+  metrics.rateLimited('RATE_LIMIT_LOGIN', '1.1.1.1')
+  metrics.rateLimited('RATE_LIMIT', '1.1.1.1')
+  metrics.rateLimited('RATE_LIMIT', '2.2.2.2')
+  expect(metrics.topRateLimitedIps()).toEqual([
+    { ip: '1.1.1.1', total: 3, codes: { RATE_LIMIT_LOGIN: 2, RATE_LIMIT: 1 } },
+    { ip: '2.2.2.2', total: 1, codes: { RATE_LIMIT: 1 } }
+  ])
+})
+
+test('track conta só respostas de sucesso e aceita evento calculado', () => {
+  const run = (middleware, req, status) => {
+    const res = new EventEmitter()
+    res.statusCode = status
+    middleware(req, res, () => {})
+    res.emit('finish')
+  }
+  const byVia = metrics.track(req => (req.query.via === 'scan' ? 'isbn.scan' : 'isbn.typed'))
+  run(byVia, { query: { via: 'scan' } }, 200)
+  run(byVia, { query: {} }, 200)
+  run(byVia, { query: {} }, 404)
+  run(metrics.track(() => null), { query: {} }, 200)
+  expect(metrics.pendingCounts()).toEqual({ 'isbn.scan': 1, 'isbn.typed': 1 })
+})
diff --git a/backend/src/utils/metrics.js b/backend/src/utils/metrics.js
new file mode 100644
index 0000000000000000000000000000000000000000..25e156c8de79c0443bbefd1c7ffcf19a76a5481b
--- /dev/null
+++ b/backend/src/utils/metrics.js
@@ -0,0 +1,164 @@
+import { db } from '../database/connection.js'
+import logger from './logger.js'
+
+/**
+ * Métricas para a área administrativa, sem dado pessoal persistido:
+ *
+ *   count(event)        contador do dia (usage_counters), gravado a cada minuto
+ *   timing(name, ms)    últimas durações (memória), para média e p95
+ *   serverError(...)    últimos 50 erros 500 (memória: somem ao reiniciar)
+ *   rateLimited(...)    429 por código (contador) e IPs da última hora (memória)
+ *
+ * O IP fica só em memória e só pela hora corrente e a anterior, como diz a
+ * política de privacidade ("usado por pouco tempo, para proteger o serviço").
+ */
+const FLUSH_MS = 60_000
+const MAX_TIMINGS = 200
+const MAX_ERRORS = 50
+const HOUR_MS = 60 * 60 * 1000
+
+const pending = new Map() // "AAAA-MM-DD|evento" → n
+const timings = new Map() // nome → [ms...]
+const errors = []
+const lastErrors = new Map() // nome → { at, message }
+let ipWindows = [] // [{ hour, ips: Map }]
+const startedAt = new Date()
+
+const today = () => new Date().toISOString().slice(0, 10)
+
+export function count(event, n = 1) {
+  const key = `${today()}|${event.slice(0, 60)}`
+  pending.set(key, (pending.get(key) || 0) + n)
+}
+
+export async function flushMetrics() {
+  if (pending.size === 0) return
+  const entries = [...pending]
+  pending.clear()
+  try {
+    await db.query(`
+      INSERT INTO librishelf.usage_counters (day, event, count)
+      SELECT split_part(k, '|', 1)::date, split_part(k, '|', 2), n
+      FROM unnest($1::text[], $2::int[]) AS t(k, n)
+      ON CONFLICT (day, event) DO UPDATE SET count = librishelf.usage_counters.count + EXCLUDED.count
+    `, [entries.map(([k]) => k), entries.map(([, n]) => n)])
+  } catch (err) {
+    // Sem tabela (migration pendente) ou banco fora: devolve para a próxima vez
+    for (const [k, n] of entries) pending.set(k, (pending.get(k) || 0) + n)
+    logger.warn('Contadores de uso não foram gravados', { message: err.message })
+  }
+}
+
+if (process.env.NODE_ENV !== 'test') setInterval(flushMetrics, FLUSH_MS).unref()
+
+export function timing(name, ms) {
+  const list = timings.get(name) || []
+  list.push(Math.round(ms))
+  if (list.length > MAX_TIMINGS) list.shift()
+  timings.set(name, list)
+}
+
+export function timingStats(name) {
+  const list = [...(timings.get(name) || [])].sort((a, b) => a - b)
+  if (list.length === 0) return { samples: 0, avgMs: null, p95Ms: null }
+  return {
+    samples: list.length,
+    avgMs: Math.round(list.reduce((sum, ms) => sum + ms, 0) / list.length),
+    p95Ms: list[Math.min(list.length - 1, Math.floor(list.length * 0.95))]
+  }
+}
+
+export function failure(name, message) {
+  lastErrors.set(name, { at: new Date().toISOString(), message: String(message).slice(0, 200) })
+}
+
+export function lastFailure(name) {
+  return lastErrors.get(name) || null
+}
+
+const lastOks = new Map()
+export function succeeded(name) {
+  lastOks.set(name, new Date().toISOString())
+}
+
+export function lastSuccess(name) {
+  return lastOks.get(name) || null
+}
+
+/** Erro 500: rota, contexto e mensagem (cortada). Sem corpo, usuário ou IP. */
+export function serverError({ method, path, context, message }) {
+  errors.unshift({
+    at: new Date().toISOString(),
+    method: method || '',
+    path: String(path || '').replace(/\d{2,}/g, ':id').slice(0, 120),
+    context: context ? String(context).slice(0, 120) : '',
+    message: String(message || '').slice(0, 300)
+  })
+  if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS
+  count('error.500')
+}
+
+export function recentErrors() {
+  return errors.slice()
+}
+
+export function rateLimited(code, ip) {
+  count(`ratelimit.${code}`)
+  const hour = Math.floor(Date.now() / HOUR_MS)
+  ipWindows = ipWindows.filter(w => w.hour >= hour - 1)
+  let current = ipWindows.find(w => w.hour === hour)
+  if (!current) {
+    current = { hour, ips: new Map() }
+    ipWindows.push(current)
+  }
+  const entry = current.ips.get(ip) || { total: 0, codes: {} }
+  entry.total++
+  entry.codes[code] = (entry.codes[code] || 0) + 1
+  current.ips.set(ip, entry)
+}
+
+/** IPs que mais bateram no limite na hora corrente e na anterior. */
+export function topRateLimitedIps(limit = 10) {
+  const hour = Math.floor(Date.now() / HOUR_MS)
+  const merged = new Map()
+  for (const window of ipWindows.filter(w => w.hour >= hour - 1)) {
+    for (const [ip, entry] of window.ips) {
+      const acc = merged.get(ip) || { ip, total: 0, codes: {} }
+      acc.total += entry.total
+      for (const [code, n] of Object.entries(entry.codes)) acc.codes[code] = (acc.codes[code] || 0) + n
+      merged.set(ip, acc)
+    }
+  }
+  return [...merged.values()].sort((a, b) => b.total - a.total).slice(0, limit)
+}
+
+export function processStartedAt() {
+  return startedAt
+}
+
+/** Só para testes: contadores ainda não gravados, por evento. */
+export function pendingCounts() {
+  return Object.fromEntries([...pending].map(([key, n]) => [key.split('|')[1], n]))
+}
+
+/** Só para testes. */
+export function resetMetrics() {
+  pending.clear()
+  timings.clear()
+  errors.length = 0
+  lastErrors.clear()
+  lastOks.clear()
+  ipWindows = []
+}
+
+/** Middleware: conta o evento quando a resposta sai com sucesso (< 400). */
+export function track(event) {
+  return (req, res, next) => {
+    res.on('finish', () => {
+      if (res.statusCode >= 400) return
+      const name = typeof event === 'function' ? event(req) : event
+      if (name) count(name)
+    })
+    next()
+  }
+}
diff --git a/backend/src/utils/sendError.js b/backend/src/utils/sendError.js
index c8e4d66a6d7cc160848175ba860f341094e8c0eb..2b68e5888cb9129d977f9d9d1425b03be20a7cd7 100644
--- a/backend/src/utils/sendError.js
+++ b/backend/src/utils/sendError.js
@@ -1,6 +1,7 @@
 import STATUS from './statusCodes.js'
 import logger from './logger.js'
 import { errorBody } from './httpError.js'
+import { serverError } from './metrics.js'
 
 const GENERIC_MESSAGE = 'Erro interno do servidor.'
 
@@ -11,6 +12,7 @@ function sendError(res, error, context) {
 
   if (!isControlled) {
     logger.error(context || 'Erro não tratado', { message: error.message, stack: error.stack })
+    serverError({ method: res.req?.method, path: res.req?.originalUrl?.split('?')[0], context, message: error.message })
   }
 
   return res.status(status).json(isControlled
diff --git a/frontend/src/components/admin/AdminAccounts.vue b/frontend/src/components/admin/AdminAccounts.vue
index 89a1fd3ed11d0bc9a38cfa4f58ecf3e55529fc91..dd457c91fa3888497eac0b52a109f972b4643ae7 100644
--- a/frontend/src/components/admin/AdminAccounts.vue
+++ b/frontend/src/components/admin/AdminAccounts.vue
@@ -74,15 +74,12 @@
           >
             <td>
               <div class="user-cell">
-                <span class="username">
-                  <a
-                    v-if="user.isPublic && user.active"
-                    :href="`/u/${encodeURIComponent(user.username)}`"
-                    target="_blank"
-                    rel="noopener"
-                  >{{ user.username }}</a>
-                  <template v-else>{{ user.username }}</template>
-                </span>
+                <button
+                  type="button"
+                  class="username"
+                  :aria-label="t('admin.accounts.openWho', { name: user.username })"
+                  @click="emit('open-user', user.id)"
+                >{{ user.username }}</button>
                 <span
                   v-if="user.isAdmin"
                   class="tag admin"
@@ -111,24 +108,13 @@
               :class="{ warn: user.reportsReceived > 0 }"
             >{{ formatNumber(user.reportsReceived, locale) }}</td>
             <td class="actions">
-              <template v-if="!user.isAdmin">
-                <AppButton
-                  v-if="user.active"
-                  :label="t('admin.accounts.suspend')"
-                  :aria-label="t('admin.accounts.suspendWho', { name: user.username })"
-                  icon="pi pi-ban"
-                  class="btn-text btn-sm btn-danger"
-                  @click="openDialog('suspend', user)"
-                />
-                <AppButton
-                  v-else
-                  :label="t('admin.accounts.reactivate')"
-                  :aria-label="t('admin.accounts.reactivateWho', { name: user.username })"
-                  icon="pi pi-replay"
-                  class="btn-text btn-sm"
-                  @click="openDialog('reactivate', user)"
-                />
-              </template>
+              <AppButton
+                :label="t('admin.accounts.open')"
+                :aria-label="t('admin.accounts.openWho', { name: user.username })"
+                icon="pi pi-angle-right"
+                class="btn-text btn-sm btn-secondary"
+                @click="emit('open-user', user.id)"
+              />
             </td>
           </tr>
         </tbody>
@@ -170,94 +156,39 @@
       />
     </nav>
 
-    <AppDialog
-      v-model:visible="dialog.visible"
-      size="sm"
-      :header="dialog.mode === 'suspend' ? t('admin.accounts.suspendTitle', { name: dialog.user?.username }) : t('admin.accounts.reactivateTitle', { name: dialog.user?.username })"
-      :closable="!dialog.busy"
-    >
-      <form
-        class="stack"
-        novalidate
-        @submit.prevent="confirmDialog"
-      >
-        <p class="desc">{{ dialog.mode === 'suspend' ? t('admin.accounts.suspendDesc') : t('admin.accounts.reactivateDesc') }}</p>
-        <TextField
-          v-if="dialog.mode === 'suspend'"
-          id="admin-suspend-reason"
-          ref="reasonField"
-          v-model="dialog.reason"
-          :label="t('admin.accounts.reason')"
-          :hint="t('admin.accounts.reasonHint')"
-          :error="dialog.reasonError"
-          maxlength="500"
-          multiline
-          rows="3"
-          required
-        />
-        <PasswordField
-          id="admin-confirm-password"
-          ref="passwordField"
-          v-model="dialog.password"
-          :label="t('admin.accounts.password')"
-          autocomplete="current-password"
-          :error="dialog.passwordError"
-          required
-        />
-        <div class="dialog-actions">
-          <AppButton
-            :label="t('common.cancel')"
-            class="btn-text btn-secondary"
-            :disabled="dialog.busy"
-            @click="dialog.visible = false"
-          />
-          <AppButton
-            type="submit"
-            :label="dialog.mode === 'suspend' ? t('admin.accounts.suspend') : t('admin.accounts.reactivate')"
-            :icon="dialog.mode === 'suspend' ? 'pi pi-ban' : 'pi pi-replay'"
-            :class="dialog.mode === 'suspend' ? 'btn-danger' : ''"
-            :loading="dialog.busy"
-          />
-        </div>
-      </form>
-    </AppDialog>
   </div>
 </template>
 
 <script setup>
-import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
+import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
 import { useI18n } from 'vue-i18n'
 import AppButton from '../ui/AppButton.vue'
-import AppDialog from '../ui/AppDialog.vue'
-import TextField from '../form/TextField.vue'
-import PasswordField from '../form/PasswordField.vue'
 import api from '../../services/api.js'
-import { useToast } from '../../services/toast.js'
-import { LockedError, useAdminCall, formatDate, formatShortDate, formatDateTime, formatNumber } from './adminCall.js'
+import { LockedError, useAdminCall, formatShortDate, formatDateTime, formatNumber, formatDate } from './adminCall.js'
 
 const props = defineProps({
-  initialQuery: { type: String, default: '' }
+  initialStatus: { type: String, default: 'all' },
+  // Muda quando uma conta é alterada na gaveta: recarrega a lista
+  version: { type: Number, default: 0 }
 })
+const emit = defineEmits(['open-user'])
 
 const { t, locale } = useI18n()
-const toast = useToast()
 const call = useAdminCall()
 const LIMIT = 25
 
-const query = ref(props.initialQuery)
-const status = ref('all')
+const query = ref('')
+const status = ref(props.initialStatus)
 const page = ref(1)
 const total = ref(0)
 const users = ref([])
 const loading = ref(true)
 const failed = ref(false)
-const reasonField = ref(null)
-const passwordField = ref(null)
-const dialog = reactive({ visible: false, mode: 'suspend', user: null, reason: '', password: '', reasonError: '', passwordError: '', busy: false })
 
 const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))
 const filters = computed(() => [
   { value: 'all', label: t('admin.accounts.filters.all') },
+  { value: 'unverified', label: t('admin.accounts.filters.unverified') },
   { value: 'suspended', label: t('admin.accounts.filters.suspended') }
 ])
 
@@ -283,7 +214,8 @@ watch(query, () => {
   clearTimeout(debounce)
   debounce = setTimeout(() => { page.value = 1; load() }, 300)
 })
-watch(() => props.initialQuery, value => { query.value = value })
+watch(() => props.initialStatus, value => { status.value = value; page.value = 1; load() })
+watch(() => props.version, load)
 onBeforeUnmount(() => clearTimeout(debounce))
 
 function setStatus(value) {
@@ -298,55 +230,6 @@ function goTo(target) {
   load()
 }
 
-async function openDialog(mode, user) {
-  Object.assign(dialog, { visible: true, mode, user, reason: '', password: '', reasonError: '', passwordError: '', busy: false })
-  await nextTick()
-  ;(mode === 'suspend' ? reasonField : passwordField).value?.focus()
-}
-
-async function confirmDialog() {
-  dialog.reasonError = ''
-  dialog.passwordError = ''
-  const reason = dialog.reason.trim()
-  if (dialog.mode === 'suspend' && reason.length < 3) {
-    dialog.reasonError = t('admin.accounts.reasonRequired')
-    reasonField.value?.focus()
-    return
-  }
-  if (!dialog.password) {
-    dialog.passwordError = t('errors.CURRENT_PASSWORD_REQUIRED')
-    passwordField.value?.focus()
-    return
-  }
-  dialog.busy = true
-  try {
-    if (dialog.mode === 'suspend') {
-      await call(() => api.adminSuspendUser(dialog.user.id, dialog.password, reason))
-    } else {
-      await call(() => api.adminReactivateUser(dialog.user.id, dialog.password))
-    }
-    toast.add({
-      severity: 'success',
-      summary: t(dialog.mode === 'suspend' ? 'admin.accounts.suspendedDone' : 'admin.accounts.reactivatedDone', { name: dialog.user.username }),
-      life: 3000
-    })
-    dialog.visible = false
-    load()
-  } catch (error) {
-    if (error instanceof LockedError) {
-      dialog.visible = false
-    } else if (error.code === 'CURRENT_PASSWORD_WRONG' || error.code === 'CURRENT_PASSWORD_REQUIRED') {
-      dialog.passwordError = error.message
-      dialog.password = ''
-      passwordField.value?.focus()
-    } else {
-      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
-    }
-  } finally {
-    dialog.busy = false
-  }
-}
-
 onMounted(load)
 </script>
 
@@ -508,16 +391,32 @@ td.warn {
 }
 
 .username {
+  font: inherit;
   font-weight: 600;
-}
-
-.username a {
   color: var(--text-primary);
+  background: none;
+  border: none;
+  padding: 0;
+  cursor: pointer;
   text-decoration: underline;
   text-decoration-color: var(--border-hover);
   text-underline-offset: 2px;
 }
 
+.username:hover {
+  text-decoration-color: currentColor;
+}
+
+.username:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  border-radius: 4px;
+}
+
+tbody tr {
+  cursor: default;
+}
+
 .tag {
   font-size: var(--fs-xs);
   font-weight: 600;
@@ -568,22 +467,4 @@ td.warn {
   font-size: var(--fs-sm);
 }
 
-.stack {
-  display: flex;
-  flex-direction: column;
-  gap: 1rem;
-}
-
-.desc {
-  margin: 0;
-  color: var(--text-secondary);
-  font-size: var(--fs-sm);
-}
-
-.dialog-actions {
-  display: flex;
-  justify-content: flex-end;
-  gap: 0.5rem;
-  margin-top: 0.5rem;
-}
 </style>
diff --git a/frontend/src/components/admin/AdminLog.vue b/frontend/src/components/admin/AdminLog.vue
index c986bec8f1408e3f99260a3c8f07404ac1df4d61..fa72d97a99d4a3eb215af2be4502906620235e0b 100644
--- a/frontend/src/components/admin/AdminLog.vue
+++ b/frontend/src/components/admin/AdminLog.vue
@@ -94,7 +94,9 @@ const ICONS = {
   'review.hide': 'pi pi-eye-slash',
   'review.show': 'pi pi-eye',
   'user.suspend': 'pi pi-ban',
-  'user.reactivate': 'pi pi-replay'
+  'user.reactivate': 'pi pi-replay',
+  'user.resend_verification': 'pi pi-envelope',
+  'email.test': 'pi pi-send'
 }
 
 const actions = ref([])
diff --git a/frontend/src/components/admin/AdminModeration.vue b/frontend/src/components/admin/AdminModeration.vue
index a7d85f5d42cf096fddcc85e903d58ecf623e1f02..e7325644ba2225c680b83fb441f693e49895c7ae 100644
--- a/frontend/src/components/admin/AdminModeration.vue
+++ b/frontend/src/components/admin/AdminModeration.vue
@@ -17,6 +17,51 @@
       >{{ option.label }}</button>
     </div>
 
+    <details
+      v-if="insights"
+      class="insights"
+    >
+      <summary>
+        <i
+          class="pi pi-chart-bar"
+          aria-hidden="true"
+        ></i>
+        {{ t('admin.moderation.insights.title') }}
+        <span class="muted">{{ t('admin.moderation.insights.summary', { serial: insights.serialReporters.length, fresh: insights.newAccountsReported.length }) }}</span>
+      </summary>
+      <div class="insight-grid">
+        <section
+          v-for="group in insightGroups"
+          :key="group.key"
+          :aria-labelledby="`ins-${group.key}`"
+        >
+          <h2 :id="`ins-${group.key}`">{{ t(`admin.moderation.insights.${group.key}`) }}</h2>
+          <p class="hint">{{ t(`admin.moderation.insights.${group.key}Hint`) }}</p>
+          <p
+            v-if="!group.rows.length"
+            class="muted"
+          >{{ t('admin.moderation.insights.none') }}</p>
+          <ul v-else>
+            <li
+              v-for="row in group.rows"
+              :key="row.id"
+            >
+              <button
+                type="button"
+                class="person"
+                @click="emit('open-user', row.id)"
+              >@{{ row.username }}</button>
+              <span
+                v-if="!row.active"
+                class="state-tag hidden"
+              >{{ t('admin.accounts.suspendedTag') }}</span>
+              <span class="muted">{{ group.describe(row) }}</span>
+            </li>
+          </ul>
+        </section>
+      </div>
+    </details>
+
     <div class="layout">
       <section
         class="queue"
@@ -115,7 +160,7 @@
               :label="t('admin.moderation.viewAuthor', { name: detail.author.username })"
               icon="pi pi-user"
               class="btn-text btn-sm"
-              @click="emit('open-user', detail.author.username)"
+              @click="emit('open-user', detail.author.id)"
             />
           </div>
           <p
@@ -200,6 +245,25 @@ const detail = ref(null)
 const detailLoading = ref(false)
 const busy = ref('')
 
+const insights = ref(null)
+
+const insightGroups = computed(() => [
+  { key: 'serialReporters', rows: insights.value.serialReporters,
+    describe: row => t('admin.moderation.insights.serialDetail', { n: row.reports, upheld: row.upheld, rejected: row.rejected, week: row.last7 }) },
+  { key: 'newAccountsReported', rows: insights.value.newAccountsReported,
+    describe: row => t('admin.moderation.insights.freshDetail', { n: row.reports, reviews: row.reviewsReported, date: formatDateTime(row.createdAt, locale.value) }) },
+  { key: 'mostReported', rows: insights.value.mostReported,
+    describe: row => t('admin.moderation.insights.mostDetail', { n: row.reports, reviews: row.reviewsReported, hidden: row.hidden }) }
+])
+
+async function loadInsights() {
+  try {
+    insights.value = await call(() => api.adminModerationInsights())
+  } catch {
+    // os sinais são um extra: a fila funciona sem eles
+  }
+}
+
 const filters = computed(() => [
   { value: 'open', label: t('admin.moderation.filters.open') },
   { value: 'hidden', label: t('admin.moderation.filters.hidden') },
@@ -259,6 +323,7 @@ async function act(hide) {
     detail.value = await call(() => api.adminModerateReview(selectedId.value, hide))
     toast.add({ severity: 'success', summary: hide ? t('moderation.hiddenDone') : t('moderation.keptDone'), life: 3000 })
     emit('changed')
+    loadInsights()
     // Mantém a resenha aberta; a fila reflete o novo estado
     const keep = selectedId.value
     await loadQueue()
@@ -270,7 +335,10 @@ async function act(hide) {
   }
 }
 
-onMounted(loadQueue)
+onMounted(() => {
+  loadQueue()
+  loadInsights()
+})
 </script>
 
 <style scoped>
@@ -560,6 +628,92 @@ onMounted(loadQueue)
   margin: 0;
 }
 
+.insights {
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  padding: 0.75rem 1rem;
+}
+
+.insights summary {
+  cursor: pointer;
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  font-weight: 600;
+  color: var(--text-primary);
+}
+
+.insights summary:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  border-radius: 6px;
+}
+
+.insights summary .muted {
+  font-weight: 400;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+}
+
+.insight-grid {
+  display: grid;
+  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
+  gap: 1.25rem;
+  margin-top: 1rem;
+}
+
+.insight-grid h2 {
+  margin: 0;
+  font-size: var(--fs-sm);
+  color: var(--text-primary);
+}
+
+.insight-grid .hint {
+  margin: 0.2rem 0 0.6rem;
+}
+
+.insight-grid ul {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.45rem;
+  font-size: var(--fs-sm);
+}
+
+.insight-grid li {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: baseline;
+  gap: 0.3rem 0.5rem;
+}
+
+.insight-grid .muted {
+  color: var(--text-secondary);
+  font-size: var(--fs-xs);
+  margin: 0;
+}
+
+.person {
+  font: inherit;
+  font-weight: 600;
+  color: var(--text-primary);
+  background: none;
+  border: none;
+  padding: 0;
+  cursor: pointer;
+  text-decoration: underline;
+  text-decoration-color: var(--border-hover);
+  text-underline-offset: 2px;
+}
+
+.person:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
 @media (max-width: 900px) {
   .layout {
     grid-template-columns: 1fr;
diff --git a/frontend/src/components/admin/AdminOverview.vue b/frontend/src/components/admin/AdminOverview.vue
index 35ea49568d8a3a65524eb0889ab4db45325578e4..709f765fadf4be2308850305af97550b20a5d4ac 100644
--- a/frontend/src/components/admin/AdminOverview.vue
+++ b/frontend/src/components/admin/AdminOverview.vue
@@ -32,7 +32,7 @@
           :type="card.tab ? 'button' : undefined"
           class="kpi-card"
           :class="[card.key, { clickable: card.tab, alert: card.alert }]"
-          @click="card.tab && emit('open-tab', card.tab)"
+          @click="card.tab && emit('open-tab', card.tab, card.tabOptions)"
         >
           <i
             v-if="card.tab"
@@ -54,6 +54,43 @@
         </component>
       </div>
 
+      <div class="two-cols">
+        <section
+          class="chart-card"
+          aria-labelledby="admin-funnel-title"
+        >
+          <h2 id="admin-funnel-title">{{ t('admin.overview.funnel') }}</h2>
+          <ol class="funnel">
+            <li
+              v-for="step in funnel"
+              :key="step.key"
+            >
+              <div class="funnel-row">
+                <span class="funnel-label">{{ step.label }}</span>
+                <span class="funnel-value">{{ formatNumber(step.value, locale) }} <small>{{ step.percent }}%</small></span>
+              </div>
+              <div
+                class="bar"
+                aria-hidden="true"
+              ><span :style="{ width: `${step.percent}%` }"></span></div>
+            </li>
+          </ol>
+          <p class="note">{{ t('admin.overview.returned', { n: stats.engagement.returned, total: stats.engagement.olderThanWeek, p: percent(stats.engagement.returned, stats.engagement.olderThanWeek) }) }}</p>
+        </section>
+        <section
+          class="chart-card"
+          aria-labelledby="admin-activity-title"
+        >
+          <h2 id="admin-activity-title">{{ t('admin.overview.activity') }}</h2>
+          <dl class="activity">
+            <div><dt>{{ t('admin.overview.books7') }}</dt><dd>{{ formatNumber(stats.engagement.books7, locale) }}</dd></div>
+            <div><dt>{{ t('admin.overview.books30') }}</dt><dd>{{ formatNumber(stats.engagement.books30, locale) }}</dd></div>
+            <div><dt>{{ t('admin.overview.finished30') }}</dt><dd>{{ formatNumber(stats.engagement.finished30, locale) }}</dd></div>
+            <div><dt>{{ t('admin.overview.reviews30') }}</dt><dd>{{ formatNumber(stats.engagement.reviews30, locale) }}</dd></div>
+          </dl>
+        </section>
+      </div>
+
       <div class="chart-card">
         <h2>{{ t('admin.overview.signupsByWeek') }}</h2>
         <div class="chart-wrapper">
@@ -96,7 +133,7 @@ const cards = computed(() => {
     { key: 'users', icon: 'pi pi-users', label: t('admin.overview.users'), value: s.users.total,
       sub: t('admin.overview.verified', { n: percent(s.users.verified, s.users.total) }), tab: 'accounts' },
     { key: 'active', icon: 'pi pi-bolt', label: t('admin.overview.active30'), value: s.users.active30,
-      sub: t('admin.overview.ofAccounts', { n: percent(s.users.active30, s.users.total) }) },
+      sub: t('admin.overview.active7', { n: s.users.active7, p: percent(s.users.active30, s.users.total) }) },
     { key: 'signups', icon: 'pi pi-user-plus', label: t('admin.overview.signups7'), value: s.users.signups7,
       sub: t('admin.overview.signups30', { n: s.users.signups30 }) },
     { key: 'public', icon: 'pi pi-globe', label: t('admin.overview.publicLibraries'), value: s.community.publicLibraries,
@@ -105,11 +142,23 @@ const cards = computed(() => {
     { key: 'reviews', icon: 'pi pi-comment', label: t('admin.overview.reviews'), value: s.content.reviews,
       sub: t('admin.overview.hiddenReviews', { n: s.content.hiddenReviews }) },
     { key: 'lists', icon: 'pi pi-list', label: t('admin.overview.lists'), value: s.content.lists },
+    { key: 'stale', icon: 'pi pi-envelope', label: t('admin.overview.staleSignups'), value: s.users.staleSignups,
+      sub: t('admin.overview.staleHint'), tab: 'accounts', tabOptions: { status: 'unverified' }, alert: s.users.staleSignups > 0 },
     { key: 'reports', icon: 'pi pi-flag', label: t('admin.overview.openReports'), value: s.moderation.openReports,
       sub: t('admin.overview.suspended', { n: s.users.suspended }, s.users.suspended), tab: 'moderation', alert: s.moderation.openReports > 0 }
   ]
 })
 
+const funnel = computed(() => {
+  const f = stats.value.engagement.funnel
+  return [
+    { key: 'signedUp', label: t('admin.overview.funnelSteps.signedUp'), value: f.signedUp },
+    { key: 'verified', label: t('admin.overview.funnelSteps.verified'), value: f.verified },
+    { key: 'withBook', label: t('admin.overview.funnelSteps.withBook'), value: f.withBook },
+    { key: 'with10Books', label: t('admin.overview.funnelSteps.with10Books'), value: f.with10Books }
+  ].map(step => ({ ...step, percent: percent(step.value, f.signedUp) }))
+})
+
 const palette = computed(() => {
   themeVersion.value // redesenha quando o tema muda
   return {
@@ -255,6 +304,8 @@ onMounted(load)
 .kpi-card.books { --kpi-color: var(--green); --kpi-rgb: var(--green-rgb); }
 .kpi-card.reviews { --kpi-color: var(--blue); --kpi-rgb: var(--blue-rgb); }
 .kpi-card.lists { --kpi-color: var(--purple); --kpi-rgb: var(--purple-rgb); }
+.kpi-card.stale { --kpi-color: var(--text-secondary); --kpi-rgb: 128, 128, 128; }
+.kpi-card.stale.alert { --kpi-color: var(--yellow); --kpi-rgb: var(--yellow-rgb); }
 .kpi-card.reports { --kpi-color: var(--text-secondary); --kpi-rgb: 128, 128, 128; }
 .kpi-card.reports.alert { --kpi-color: var(--orange); --kpi-rgb: var(--orange-rgb); border-color: rgba(var(--orange-rgb), 0.45); }
 
@@ -275,6 +326,91 @@ onMounted(load)
   height: 260px;
 }
 
+.two-cols {
+  display: grid;
+  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
+  gap: 1rem;
+}
+
+.funnel {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+}
+
+.funnel-row {
+  display: flex;
+  justify-content: space-between;
+  gap: 0.5rem;
+  font-size: var(--fs-sm);
+  margin-bottom: 0.3rem;
+}
+
+.funnel-label {
+  color: var(--text-secondary);
+}
+
+.funnel-value {
+  color: var(--text-primary);
+  font-weight: 600;
+  font-variant-numeric: tabular-nums;
+}
+
+.funnel-value small {
+  color: var(--text-muted);
+  font-weight: 500;
+  margin-left: 0.25rem;
+}
+
+.bar {
+  height: 8px;
+  border-radius: 999px;
+  background: var(--bg-input);
+  overflow: hidden;
+}
+
+.bar span {
+  display: block;
+  height: 100%;
+  border-radius: inherit;
+  background: var(--main-color);
+}
+
+.note {
+  margin: 1rem 0 0;
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+}
+
+.activity {
+  margin: 0;
+  display: grid;
+  grid-template-columns: 1fr 1fr;
+  gap: 1rem;
+}
+
+.activity div {
+  display: flex;
+  flex-direction: column;
+  gap: 0.2rem;
+}
+
+.activity dt {
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+}
+
+.activity dd {
+  margin: 0;
+  color: var(--text-primary);
+  font-size: var(--fs-xl);
+  font-weight: 700;
+  font-variant-numeric: tabular-nums;
+}
+
 .empty {
   text-align: center;
   color: var(--text-secondary);
diff --git a/frontend/src/components/admin/AdminSystem.vue b/frontend/src/components/admin/AdminSystem.vue
new file mode 100644
index 0000000000000000000000000000000000000000..b20234168417b69adb00d179229d0952f60b35eb
--- /dev/null
+++ b/frontend/src/components/admin/AdminSystem.vue
@@ -0,0 +1,700 @@
+<template>
+  <div class="system">
+    <div class="toolbar">
+      <span
+        v-if="loadedAt"
+        class="muted"
+      >{{ t('admin.system.loadedAt', { time: formatDateTime(loadedAt, locale) }) }}</span>
+      <AppButton
+        :label="t('admin.system.refresh')"
+        icon="pi pi-refresh"
+        class="btn-outlined btn-secondary btn-sm"
+        :loading="loading"
+        @click="load"
+      />
+    </div>
+
+    <AppSkeleton
+      v-if="loading && !data"
+      height="480px"
+    />
+    <p
+      v-else-if="failed && !data"
+      class="empty"
+    >{{ t('common.loadError') }}</p>
+
+    <div
+      v-else-if="data"
+      class="grid"
+    >
+      <!-- Serviço -->
+      <section
+        class="card"
+        aria-labelledby="sys-service"
+      >
+        <h2 id="sys-service"><i
+            class="pi pi-server"
+            aria-hidden="true"
+          ></i> {{ t('admin.system.service.title') }}</h2>
+        <dl>
+          <div>
+            <dt>{{ t('admin.system.service.backend') }}</dt>
+            <dd>{{ t('admin.system.service.since', { date: formatDateTime(data.service.startedAt, locale), uptime: formatDuration(data.service.uptimeSeconds) }) }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.frontend') }}</dt>
+            <dd>{{ t('admin.system.service.built', { date: formatDateTime(buildTime, locale) }) }}</dd>
+          </div>
+          <div v-if="data.service.version">
+            <dt>{{ t('admin.system.service.version') }}</dt>
+            <dd class="mono">{{ data.service.version }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.runtime') }}</dt>
+            <dd>Node {{ data.service.node }} · {{ data.service.environment }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.memory') }}</dt>
+            <dd>{{ formatBytes(data.service.memory.rss, locale) }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.appUrl') }}</dt>
+            <dd class="mono">{{ data.config.appUrl || t('admin.system.notSet') }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.proxy') }}</dt>
+            <dd>{{ t('admin.system.service.proxyValue', { trust: data.config.trustProxy ?? t('admin.system.notSet'), secure: data.config.cookieSecure ? t('admin.system.yes') : t('admin.system.no') }) }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.olContact') }}</dt>
+            <dd>{{ data.config.openLibraryContact ? t('admin.system.yes') : t('admin.system.service.olContactMissing') }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.service.load') }}</dt>
+            <dd>{{ data.service.load.join(' · ') }} <span class="muted">({{ t('admin.system.service.cpus', { n: data.service.cpus }, data.service.cpus) }})</span></dd>
+          </div>
+        </dl>
+      </section>
+
+      <!-- Banco -->
+      <section
+        class="card"
+        aria-labelledby="sys-db"
+      >
+        <h2 id="sys-db"><i
+            class="pi pi-database"
+            aria-hidden="true"
+          ></i> {{ t('admin.system.db.title') }}</h2>
+        <p
+          class="status"
+          :class="data.database.ok ? 'ok' : 'bad'"
+        >
+          <i
+            :class="data.database.ok ? 'pi pi-check-circle' : 'pi pi-times-circle'"
+            aria-hidden="true"
+          ></i>
+          {{ data.database.ok ? t('admin.system.db.ok', { ms: data.database.latencyMs }) : t('admin.system.db.down', { error: data.database.error }) }}
+        </p>
+        <dl v-if="data.database.ok">
+          <div>
+            <dt>{{ t('admin.system.db.version') }}</dt>
+            <dd>PostgreSQL {{ data.database.version }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.db.size') }}</dt>
+            <dd>{{ formatBytes(data.database.size, locale) }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.db.connections') }}</dt>
+            <dd>{{ t('admin.system.db.pool', { total: data.database.pool.total, idle: data.database.pool.idle, waiting: data.database.pool.waiting, all: data.database.connections }) }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.db.migration') }}</dt>
+            <dd>
+              <span class="mono">{{ data.database.lastMigration?.version || '—' }}</span>
+              <span
+                v-if="data.database.lastMigration"
+                class="muted"
+              > · {{ formatDateTime(data.database.lastMigration.appliedAt, locale) }}</span>
+            </dd>
+          </div>
+        </dl>
+        <p
+          v-if="data.database.ok && data.database.pendingMigrations.length"
+          class="status bad"
+        >{{ t('admin.system.db.pending', { list: data.database.pendingMigrations.join(', ') }) }}</p>
+      </section>
+
+      <!-- Armazenamento -->
+      <section
+        class="card"
+        aria-labelledby="sys-storage"
+      >
+        <h2 id="sys-storage"><i
+            class="pi pi-images"
+            aria-hidden="true"
+          ></i> {{ t('admin.system.storage.title') }}</h2>
+        <dl>
+          <div>
+            <dt>{{ t('admin.system.storage.covers') }}</dt>
+            <dd>{{ data.storage.uploads.files === null ? '—' : t('admin.system.storage.files', { n: formatNumber(data.storage.uploads.files, locale), size: formatBytes(data.storage.uploads.bytes, locale) }) }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.storage.disk') }}</dt>
+            <dd>{{ data.storage.disk.total === null ? '—' : t('admin.system.storage.free', { free: formatBytes(data.storage.disk.free, locale), total: formatBytes(data.storage.disk.total, locale), p: diskFree }) }}</dd>
+          </div>
+        </dl>
+        <div
+          v-if="data.storage.disk.total"
+          class="meter"
+          :class="{ low: diskFree < 10 }"
+          role="img"
+          :aria-label="t('admin.system.storage.used', { p: 100 - diskFree })"
+        ><span :style="{ width: `${100 - diskFree}%` }"></span></div>
+        <p
+          v-if="data.storage.disk.total && diskFree < 10"
+          class="status bad"
+        >{{ t('admin.system.storage.lowDisk') }}</p>
+        <p class="hint">{{ t('admin.system.storage.hint') }}</p>
+      </section>
+
+      <!-- E-mail -->
+      <section
+        class="card"
+        aria-labelledby="sys-email"
+      >
+        <h2 id="sys-email"><i
+            class="pi pi-envelope"
+            aria-hidden="true"
+          ></i> {{ t('admin.system.email.title') }}</h2>
+        <p
+          class="status"
+          :class="data.email.configured ? 'ok' : 'warn'"
+        >
+          <i
+            :class="data.email.configured ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'"
+            aria-hidden="true"
+          ></i>
+          {{ data.email.configured ? t('admin.system.email.configured', { host: `${data.email.host}:${data.email.port}` }) : t('admin.system.email.notConfigured') }}
+        </p>
+        <dl>
+          <div>
+            <dt>{{ t('admin.system.email.from') }}</dt>
+            <dd>{{ data.email.from }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.email.reports') }}</dt>
+            <dd>{{ data.email.adminEmail ? t('admin.system.yes') : t('admin.system.email.noAdminEmail') }}</dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.email.week') }}</dt>
+            <dd>
+              {{ t('admin.system.email.sentFailed', { sent: data.email.sent7, failed: data.email.failed7 }) }}
+            </dd>
+          </div>
+          <div>
+            <dt>{{ t('admin.system.email.lastOk') }}</dt>
+            <dd>{{ data.email.lastSuccessAt ? formatDateTime(data.email.lastSuccessAt, locale) : t('admin.system.sinceBoot') }}</dd>
+          </div>
+          <div v-if="data.email.lastFailure">
+            <dt>{{ t('admin.system.email.lastFailure') }}</dt>
+            <dd class="bad-text">{{ formatDateTime(data.email.lastFailure.at, locale) }} — {{ data.email.lastFailure.message }}</dd>
+          </div>
+        </dl>
+        <AppButton
+          :label="t('admin.system.email.test')"
+          icon="pi pi-send"
+          class="btn-outlined btn-sm"
+          :loading="testing"
+          @click="testEmail"
+        />
+      </section>
+
+      <!-- Open Library -->
+      <section
+        class="card wide"
+        aria-labelledby="sys-ol"
+      >
+        <h2 id="sys-ol"><i
+            class="pi pi-book"
+            aria-hidden="true"
+          ></i> Open Library</h2>
+        <div class="ol-layout">
+          <dl>
+            <div>
+              <dt>{{ t('admin.system.ol.week') }}</dt>
+              <dd>{{ t('admin.system.ol.calls', { ok: data.openLibrary.last7.ok, error: data.openLibrary.last7.error, timeout: data.openLibrary.last7.timeout }) }}</dd>
+            </div>
+            <div>
+              <dt>{{ t('admin.system.ol.errorRate') }}</dt>
+              <dd :class="{ 'bad-text': data.openLibrary.errorRate >= 10 }">{{ data.openLibrary.errorRate === null ? '—' : `${data.openLibrary.errorRate}%` }}</dd>
+            </div>
+            <div>
+              <dt>{{ t('admin.system.ol.latency') }}</dt>
+              <dd>{{ data.openLibrary.latency.samples ? t('admin.system.ol.ms', { avg: data.openLibrary.latency.avgMs, p95: data.openLibrary.latency.p95Ms }) : t('admin.system.sinceBoot') }}</dd>
+            </div>
+            <div v-if="data.openLibrary.lastFailure">
+              <dt>{{ t('admin.system.ol.lastFailure') }}</dt>
+              <dd class="bad-text">{{ formatDateTime(data.openLibrary.lastFailure.at, locale) }} — {{ data.openLibrary.lastFailure.message }}</dd>
+            </div>
+            <div>
+              <dt>{{ t('admin.system.ol.books') }}</dt>
+              <dd>{{ t('admin.system.ol.booksDetail', { linked: formatNumber(data.openLibrary.books.linked, locale), linkable: formatNumber(data.openLibrary.books.linkable, locale), unlinked: formatNumber(data.openLibrary.books.unlinked, locale) }) }}</dd>
+            </div>
+          </dl>
+          <div class="chart-wrapper">
+            <ChartCanvas
+              type="bar"
+              :data="olChartData"
+              :options="olChartOptions"
+              :aria-label="olChartLabel"
+            />
+          </div>
+        </div>
+        <p
+          v-if="data.openLibrary.books.linkable"
+          class="hint"
+        >{{ t('admin.system.ol.enrichHint') }}</p>
+      </section>
+
+      <!-- Limites de requisição -->
+      <section
+        class="card"
+        aria-labelledby="sys-limits"
+      >
+        <h2 id="sys-limits"><i
+            class="pi pi-shield"
+            aria-hidden="true"
+          ></i> {{ t('admin.system.limits.title') }}</h2>
+        <p
+          v-if="!data.rateLimits.last7.length"
+          class="muted"
+        >{{ t('admin.system.limits.none') }}</p>
+        <table v-else>
+          <thead>
+            <tr>
+              <th scope="col">{{ t('admin.system.limits.code') }}</th>
+              <th
+                scope="col"
+                class="num"
+              >{{ t('admin.system.limits.today') }}</th>
+              <th
+                scope="col"
+                class="num"
+              >{{ t('admin.system.limits.week') }}</th>
+            </tr>
+          </thead>
+          <tbody>
+            <tr
+              v-for="row in data.rateLimits.last7"
+              :key="row.code"
+            >
+              <th scope="row">{{ limitName(row.code) }}</th>
+              <td class="num">{{ todayLimit(row.code) }}</td>
+              <td class="num">{{ row.total }}</td>
+            </tr>
+          </tbody>
+        </table>
+        <h3>{{ t('admin.system.limits.ips') }}</h3>
+        <p
+          v-if="!data.rateLimits.topIps.length"
+          class="muted"
+        >{{ t('admin.system.limits.noIps') }}</p>
+        <ul
+          v-else
+          class="ips"
+        >
+          <li
+            v-for="row in data.rateLimits.topIps"
+            :key="row.ip"
+          >
+            <span class="mono">{{ row.ip }}</span>
+            <span>{{ row.total }}×</span>
+            <span class="muted">{{ Object.keys(row.codes).map(limitName).join(', ') }}</span>
+          </li>
+        </ul>
+        <p class="hint">{{ t('admin.system.limits.hint') }}</p>
+      </section>
+
+      <!-- Erros 500 -->
+      <section
+        class="card wide"
+        aria-labelledby="sys-errors"
+      >
+        <h2 id="sys-errors"><i
+            class="pi pi-exclamation-triangle"
+            aria-hidden="true"
+          ></i> {{ t('admin.system.errors.title') }}</h2>
+        <p class="muted">{{ t('admin.system.errors.counts', { today: data.errors.today, week: data.errors.last7 }) }}</p>
+        <p
+          v-if="!data.errors.recent.length"
+          class="muted"
+        >{{ t('admin.system.errors.none') }}</p>
+        <div
+          v-else
+          class="table-scroll"
+        >
+          <table>
+            <thead>
+              <tr>
+                <th scope="col">{{ t('admin.system.errors.when') }}</th>
+                <th scope="col">{{ t('admin.system.errors.route') }}</th>
+                <th scope="col">{{ t('admin.system.errors.context') }}</th>
+                <th scope="col">{{ t('admin.system.errors.message') }}</th>
+              </tr>
+            </thead>
+            <tbody>
+              <tr
+                v-for="(row, index) in data.errors.recent"
+                :key="index"
+              >
+                <td class="nowrap">{{ formatDateTime(row.at, locale) }}</td>
+                <td class="mono nowrap">{{ row.method }} {{ row.path }}</td>
+                <td>{{ row.context }}</td>
+                <td class="message">{{ row.message }}</td>
+              </tr>
+            </tbody>
+          </table>
+        </div>
+        <p class="hint">{{ t('admin.system.errors.hint') }}</p>
+      </section>
+    </div>
+  </div>
+</template>
+
+<script setup>
+import { computed, onMounted, ref } from 'vue'
+import { useI18n } from 'vue-i18n'
+import AppButton from '../ui/AppButton.vue'
+import AppSkeleton from '../ui/AppSkeleton.vue'
+import ChartCanvas from '../ui/ChartCanvas.vue'
+import api from '../../services/api.js'
+import { useToast } from '../../services/toast.js'
+import { useTheme, cssVar } from '../../composables/useTheme.js'
+import { LockedError, useAdminCall, formatBytes, formatDateTime, formatDayMonth, formatDuration, formatNumber } from './adminCall.js'
+
+/* global __APP_BUILD_TIME__ */
+const buildTime = typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : null
+
+const { t, te, locale } = useI18n()
+const call = useAdminCall()
+const toast = useToast()
+const { themeVersion } = useTheme()
+
+const data = ref(null)
+const loading = ref(true)
+const failed = ref(false)
+const testing = ref(false)
+const loadedAt = ref(null)
+
+const diskFree = computed(() => {
+  const disk = data.value?.storage.disk
+  return disk?.total ? Math.round((disk.free / disk.total) * 100) : 0
+})
+
+function limitName(code) {
+  return te(`admin.system.limits.codes.${code}`) ? t(`admin.system.limits.codes.${code}`) : code
+}
+
+function todayLimit(code) {
+  return data.value.rateLimits.today.find(row => row.code === code)?.total || 0
+}
+
+const palette = computed(() => {
+  themeVersion.value
+  return {
+    ok: cssVar('--green') || '#3d7a20',
+    error: cssVar('--red') || '#c9283f',
+    timeout: cssVar('--orange') || '#b8481f',
+    text: cssVar('--text-secondary') || '#a1a1aa',
+    grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)'
+  }
+})
+
+const olChartData = computed(() => {
+  const days = data.value.openLibrary.daily
+  return {
+    labels: days.map(day => formatDayMonth(`${day.day}T12:00:00`, locale.value)),
+    datasets: ['ok', 'error', 'timeout'].map(key => ({
+      label: t(`admin.system.ol.series.${key}`),
+      data: days.map(day => day[key]),
+      backgroundColor: palette.value[key],
+      borderRadius: 3,
+      stack: 'calls'
+    }))
+  }
+})
+
+const olChartOptions = computed(() => ({
+  responsive: true,
+  maintainAspectRatio: false,
+  plugins: { legend: { position: 'bottom', labels: { color: palette.value.text, boxWidth: 12 } } },
+  scales: {
+    x: { stacked: true, grid: { display: false }, ticks: { color: palette.value.text } },
+    y: { stacked: true, beginAtZero: true, grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } }
+  }
+}))
+
+const olChartLabel = computed(() => t('admin.system.ol.chartLabel', {
+  list: data.value.openLibrary.daily.map(day => `${day.day}: ${day.ok}/${day.error}/${day.timeout}`).join('; ')
+}))
+
+async function load() {
+  loading.value = true
+  failed.value = false
+  try {
+    data.value = await call(() => api.adminSystem())
+    loadedAt.value = new Date().toISOString()
+  } catch (error) {
+    if (!(error instanceof LockedError)) {
+      failed.value = true
+      if (data.value) toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
+    }
+  } finally {
+    loading.value = false
+  }
+}
+
+async function testEmail() {
+  testing.value = true
+  try {
+    const result = await call(() => api.adminEmailTest())
+    toast.add(result.smtp
+      ? { severity: 'success', summary: t('admin.system.email.testSent', { to: result.to }), life: 5000 }
+      : { severity: 'warn', summary: t('admin.system.email.testLogged'), life: 6000 })
+    load()
+  } catch (error) {
+    if (!(error instanceof LockedError)) toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 8000 })
+  } finally {
+    testing.value = false
+  }
+}
+
+onMounted(load)
+</script>
+
+<style scoped>
+.system {
+  display: flex;
+  flex-direction: column;
+  gap: 1rem;
+}
+
+.toolbar {
+  display: flex;
+  justify-content: flex-end;
+  align-items: center;
+  gap: 0.75rem;
+}
+
+.grid {
+  display: grid;
+  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
+  gap: 1rem;
+  align-items: start;
+}
+
+.card {
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 16px;
+  padding: 1.25rem 1.5rem;
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+  min-width: 0;
+}
+
+.card.wide {
+  grid-column: 1 / -1;
+}
+
+h2 {
+  margin: 0;
+  font-size: var(--fs-lg);
+  color: var(--text-primary);
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+}
+
+h2 .pi {
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+}
+
+h3 {
+  margin: 0.5rem 0 0;
+  font-size: var(--fs-md);
+  color: var(--text-primary);
+}
+
+dl {
+  margin: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.55rem;
+}
+
+dl div {
+  display: grid;
+  grid-template-columns: minmax(120px, 40%) 1fr;
+  gap: 0.75rem;
+  font-size: var(--fs-sm);
+}
+
+dt {
+  color: var(--text-secondary);
+}
+
+dd {
+  margin: 0;
+  color: var(--text-primary);
+  overflow-wrap: anywhere;
+}
+
+.mono {
+  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
+  font-size: 0.92em;
+}
+
+.muted {
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+  margin: 0;
+}
+
+.hint {
+  margin: 0;
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+}
+
+.status {
+  margin: 0;
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  padding: 0.45rem 0.75rem;
+  border-radius: 8px;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  color: var(--text-primary);
+}
+
+.status.ok { background: rgba(var(--green-rgb), 0.14); }
+.status.ok .pi { color: var(--green); }
+.status.warn { background: rgba(var(--yellow-rgb), 0.18); }
+.status.warn .pi { color: var(--yellow); }
+.status.bad { background: rgba(var(--red-rgb), 0.14); }
+.status.bad .pi { color: var(--red); }
+
+.bad-text {
+  color: var(--red);
+}
+
+.meter {
+  height: 10px;
+  border-radius: 999px;
+  background: var(--bg-input);
+  overflow: hidden;
+}
+
+.meter span {
+  display: block;
+  height: 100%;
+  background: var(--main-color);
+}
+
+.meter.low span {
+  background: var(--red);
+}
+
+.ol-layout {
+  display: grid;
+  grid-template-columns: minmax(280px, 1fr) minmax(0, 1.4fr);
+  gap: 1.5rem;
+  align-items: center;
+}
+
+.chart-wrapper {
+  height: 220px;
+  min-width: 0;
+}
+
+table {
+  width: 100%;
+  border-collapse: collapse;
+  font-size: var(--fs-sm);
+}
+
+th,
+td {
+  text-align: left;
+  padding: 0.45rem 0.4rem;
+  border-bottom: 1px solid var(--border-color);
+  color: var(--text-primary);
+  font-weight: 400;
+  vertical-align: top;
+}
+
+thead th {
+  color: var(--text-secondary);
+  font-weight: 600;
+  font-size: var(--fs-xs);
+  text-transform: uppercase;
+  letter-spacing: 0.03em;
+}
+
+tbody tr:last-child th,
+tbody tr:last-child td {
+  border-bottom: none;
+}
+
+.num {
+  text-align: right;
+  font-variant-numeric: tabular-nums;
+}
+
+.nowrap {
+  white-space: nowrap;
+}
+
+.message {
+  color: var(--text-secondary);
+  overflow-wrap: anywhere;
+}
+
+.table-scroll {
+  position: relative;
+  overflow-x: auto;
+}
+
+.ips {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.35rem;
+  font-size: var(--fs-sm);
+}
+
+.ips li {
+  display: flex;
+  gap: 0.75rem;
+  flex-wrap: wrap;
+}
+
+.empty {
+  text-align: center;
+  color: var(--text-secondary);
+  padding: 2rem 1rem;
+}
+
+@media (max-width: 1000px) {
+  .ol-layout {
+    grid-template-columns: 1fr;
+  }
+}
+</style>
diff --git a/frontend/src/components/admin/AdminUsage.vue b/frontend/src/components/admin/AdminUsage.vue
new file mode 100644
index 0000000000000000000000000000000000000000..f6558cc90548ec290e2a1357e7f28a26f655d171
--- /dev/null
+++ b/frontend/src/components/admin/AdminUsage.vue
@@ -0,0 +1,236 @@
+<template>
+  <div class="usage">
+    <AppSkeleton
+      v-if="loading"
+      height="420px"
+    />
+    <p
+      v-else-if="failed"
+      class="empty"
+    >{{ t('common.loadError') }}</p>
+
+    <template v-else-if="data">
+      <section
+        class="card"
+        aria-labelledby="admin-adoption-title"
+      >
+        <h2 id="admin-adoption-title">{{ t('admin.usage.adoption') }}</h2>
+        <p class="hint">{{ t('admin.usage.adoptionHint', { n: data.adoption.users }) }}</p>
+        <table>
+          <thead>
+            <tr>
+              <th scope="col">{{ t('admin.usage.feature') }}</th>
+              <th
+                scope="col"
+                class="num"
+              >{{ t('admin.usage.accounts') }}</th>
+              <th scope="col"><span class="sr-only">{{ t('admin.usage.share') }}</span></th>
+            </tr>
+          </thead>
+          <tbody>
+            <tr
+              v-for="row in adoption"
+              :key="row.key"
+            >
+              <th scope="row">{{ t(`admin.usage.features.${row.key}`) }}</th>
+              <td class="num">{{ formatNumber(row.value, locale) }}</td>
+              <td class="share-cell">
+                <div class="share">
+                  <div
+                    class="bar"
+                    aria-hidden="true"
+                  ><span :style="{ width: `${row.percent}%` }"></span></div>
+                  <span class="pct">{{ row.percent }}%</span>
+                </div>
+              </td>
+            </tr>
+          </tbody>
+        </table>
+      </section>
+
+      <section
+        class="card"
+        aria-labelledby="admin-events-title"
+      >
+        <h2 id="admin-events-title">{{ t('admin.usage.events') }}</h2>
+        <p class="hint">{{ t('admin.usage.eventsHint') }}</p>
+        <table>
+          <thead>
+            <tr>
+              <th scope="col">{{ t('admin.usage.action') }}</th>
+              <th
+                scope="col"
+                class="num"
+              >{{ t('admin.usage.last7') }}</th>
+              <th
+                scope="col"
+                class="num"
+              >{{ t('admin.usage.last30') }}</th>
+            </tr>
+          </thead>
+          <tbody>
+            <tr
+              v-for="row in data.events"
+              :key="row.event"
+            >
+              <th scope="row">{{ t(`admin.usage.eventNames.${row.event.replace('.', '_')}`) }}</th>
+              <td class="num">{{ formatNumber(row.last7, locale) }}</td>
+              <td class="num">{{ formatNumber(row.last30, locale) }}</td>
+            </tr>
+          </tbody>
+        </table>
+        <p
+          v-if="scanShare !== null"
+          class="note"
+        >{{ t('admin.usage.scanShare', { p: scanShare }) }}</p>
+      </section>
+    </template>
+  </div>
+</template>
+
+<script setup>
+import { computed, onMounted, ref } from 'vue'
+import { useI18n } from 'vue-i18n'
+import AppSkeleton from '../ui/AppSkeleton.vue'
+import api from '../../services/api.js'
+import { LockedError, useAdminCall, formatNumber } from './adminCall.js'
+
+const { t, locale } = useI18n()
+const call = useAdminCall()
+const data = ref(null)
+const loading = ref(true)
+const failed = ref(false)
+
+// Na ordem em que aparecem; as do topo são as mais "fundamentais"
+const FEATURES = ['readingNow', 'rereads', 'goals', 'series', 'notes', 'reviews', 'lists', 'publicLibrary', 'community',
+  'acceptsFollowers', 'following', 'followEmails', 'indexing', 'blocks']
+
+const adoption = computed(() => {
+  const a = data.value.adoption
+  return FEATURES
+    .map(key => ({ key, value: a[key], percent: a.users ? Math.round((a[key] / a.users) * 100) : 0 }))
+    .sort((x, y) => y.value - x.value)
+})
+
+const scanShare = computed(() => {
+  const events = Object.fromEntries(data.value.events.map(e => [e.event, e.last30]))
+  const total = (events['isbn.scan'] || 0) + (events['isbn.typed'] || 0)
+  return total ? Math.round((events['isbn.scan'] / total) * 100) : null
+})
+
+onMounted(async () => {
+  try {
+    data.value = await call(() => api.adminUsage())
+  } catch (error) {
+    if (!(error instanceof LockedError)) failed.value = true
+  } finally {
+    loading.value = false
+  }
+})
+</script>
+
+<style scoped>
+.usage {
+  display: grid;
+  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
+  gap: 1rem;
+  align-items: start;
+}
+
+.card {
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 16px;
+  padding: 1.25rem 1.5rem;
+}
+
+h2 {
+  margin: 0;
+  font-size: var(--fs-lg);
+  color: var(--text-primary);
+}
+
+.hint,
+.note {
+  margin: 0.35rem 0 1rem;
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+}
+
+.note {
+  margin: 1rem 0 0;
+}
+
+table {
+  width: 100%;
+  border-collapse: collapse;
+  font-size: var(--fs-sm);
+}
+
+th,
+td {
+  text-align: left;
+  padding: 0.5rem 0.4rem;
+  border-bottom: 1px solid var(--border-color);
+  color: var(--text-primary);
+  font-weight: 400;
+}
+
+thead th {
+  color: var(--text-secondary);
+  font-weight: 600;
+  font-size: var(--fs-xs);
+  text-transform: uppercase;
+  letter-spacing: 0.03em;
+}
+
+tbody tr:last-child th,
+tbody tr:last-child td {
+  border-bottom: none;
+}
+
+.num {
+  text-align: right;
+  font-variant-numeric: tabular-nums;
+  white-space: nowrap;
+}
+
+.share-cell {
+  width: 40%;
+}
+
+.share {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+}
+
+.bar {
+  flex: 1;
+  height: 8px;
+  border-radius: 999px;
+  background: var(--bg-input);
+  overflow: hidden;
+}
+
+.bar span {
+  display: block;
+  height: 100%;
+  background: var(--main-color);
+  border-radius: inherit;
+}
+
+.pct {
+  width: 4.5ch;
+  flex-shrink: 0;
+  text-align: right;
+  color: var(--text-secondary);
+  font-variant-numeric: tabular-nums;
+}
+
+.empty {
+  text-align: center;
+  color: var(--text-secondary);
+  padding: 2rem 1rem;
+}
+</style>
diff --git a/frontend/src/components/admin/AdminUserDrawer.vue b/frontend/src/components/admin/AdminUserDrawer.vue
new file mode 100644
index 0000000000000000000000000000000000000000..bd0b7a12273cd17d5e444fd4d130aaaead31c043
--- /dev/null
+++ b/frontend/src/components/admin/AdminUserDrawer.vue
@@ -0,0 +1,491 @@
+<template>
+  <AppDialog
+    :visible="Boolean(userId)"
+    drawer
+    :header="user ? `@${user.username}` : t('admin.user.title')"
+    :panel-style="{ width: 'min(560px, 100vw)' }"
+    @update:visible="value => !value && emit('close')"
+  >
+    <div class="drawer-body">
+      <p
+        v-if="loading && !user"
+        class="muted"
+        role="status"
+      >{{ t('common.loading') }}</p>
+      <p
+        v-else-if="failed"
+        class="muted"
+      >{{ t('common.loadError') }}</p>
+
+      <template v-else-if="user">
+        <div class="tags">
+          <span
+            v-if="user.isAdmin"
+            class="tag admin"
+          >{{ t('admin.accounts.adminTag') }}</span>
+          <span
+            class="tag"
+            :class="user.active ? 'active' : 'suspended'"
+          >{{ user.active ? t('admin.user.active') : t('admin.accounts.suspendedTag') }}</span>
+          <span
+            v-if="!user.emailVerifiedAt"
+            class="tag pending"
+          >{{ t('admin.accounts.unverifiedTag') }}</span>
+          <a
+            v-if="user.privacy.isPublic && user.active"
+            class="public-link"
+            :href="`/u/${encodeURIComponent(user.username)}`"
+            target="_blank"
+            rel="noopener"
+          >{{ t('admin.user.openPublic') }} <i
+              class="pi pi-external-link"
+              aria-hidden="true"
+            ></i></a>
+        </div>
+
+        <p
+          v-if="!user.active"
+          class="suspension"
+        >{{ t('admin.accounts.suspendedOn', { date: formatDate(user.suspendedAt, locale) }) }}<template v-if="user.suspendedReason"> — {{ user.suspendedReason }}</template></p>
+
+        <section aria-labelledby="user-account">
+          <h3 id="user-account">{{ t('admin.user.account') }}</h3>
+          <dl>
+            <div><dt>{{ t('admin.accounts.cols.email') }}</dt><dd>{{ user.email }} <span class="muted">({{ user.emailLocale }})</span></dd></div>
+            <div><dt>{{ t('admin.user.created') }}</dt><dd>{{ formatDateTime(user.createdAt, locale) }}</dd></div>
+            <div><dt>{{ t('admin.user.verified') }}</dt><dd>{{ user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt, locale) : t('admin.user.notVerified') }}</dd></div>
+            <div><dt>{{ t('admin.user.lastLogin') }}</dt><dd>{{ user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('admin.accounts.never') }}</dd></div>
+            <div><dt>{{ t('admin.user.lastSeen') }}</dt><dd>{{ user.lastSeenAt ? formatDateTime(user.lastSeenAt, locale) : t('admin.accounts.never') }}</dd></div>
+          </dl>
+        </section>
+
+        <section aria-labelledby="user-privacy">
+          <h3 id="user-privacy">{{ t('admin.user.privacy') }}</h3>
+          <ul class="flags">
+            <li
+              v-for="(on, key) in user.privacy"
+              :key="key"
+              :class="{ on }"
+            >
+              <i
+                :class="on ? 'pi pi-check' : 'pi pi-minus'"
+                aria-hidden="true"
+              ></i>
+              {{ t(`admin.user.flags.${key}`) }}<span class="sr-only">: {{ on ? t('admin.system.yes') : t('admin.system.no') }}</span>
+            </li>
+          </ul>
+        </section>
+
+        <section aria-labelledby="user-totals">
+          <h3 id="user-totals">{{ t('admin.user.totals') }}</h3>
+          <dl class="totals">
+            <div><dt>{{ t('admin.user.t.books') }}</dt><dd>{{ user.totals.books }} <small>{{ t('admin.user.t.read', { n: user.totals.readBooks }) }}</small></dd></div>
+            <div><dt>{{ t('admin.user.t.reviews') }}</dt><dd>{{ user.totals.reviews }} <small v-if="user.totals.hiddenReviews">{{ t('admin.user.t.hidden', { n: user.totals.hiddenReviews }) }}</small></dd></div>
+            <div><dt>{{ t('admin.user.t.lists') }}</dt><dd>{{ user.totals.lists }} <small>{{ t('admin.user.t.public', { n: user.totals.publicLists }) }}</small></dd></div>
+            <div><dt>{{ t('admin.user.t.follow') }}</dt><dd>{{ user.totals.followers }} / {{ user.totals.following }}</dd></div>
+            <div><dt>{{ t('admin.user.t.blocks') }}</dt><dd>{{ user.totals.blocksMade }} / {{ user.totals.blockedBy }}</dd></div>
+            <div><dt>{{ t('admin.user.t.reports') }}</dt><dd :class="{ warn: user.totals.reportsReceived }">{{ user.totals.reportsReceived }} / {{ user.totals.reportsMade }}</dd></div>
+          </dl>
+          <p
+            v-if="user.totals.lastBookAt"
+            class="muted after"
+          >{{ t('admin.user.lastBook', { date: formatDate(user.totals.lastBookAt, locale) }) }}</p>
+        </section>
+
+        <section
+          v-if="user.reportedReviews.length"
+          aria-labelledby="user-reported"
+        >
+          <h3 id="user-reported">{{ t('admin.user.reportedReviews') }}</h3>
+          <ul class="list">
+            <li
+              v-for="review in user.reportedReviews"
+              :key="review.id"
+            >
+              <span class="strong">{{ review.book }}</span>
+              <span class="muted">{{ t('admin.user.reviewReports', { n: review.reports, open: review.open }) }}<template v-if="review.hidden"> · {{ t('admin.moderation.hidden') }}</template></span>
+            </li>
+          </ul>
+        </section>
+
+        <section
+          v-if="user.history.length"
+          aria-labelledby="user-history"
+        >
+          <h3 id="user-history">{{ t('admin.user.history') }}</h3>
+          <ul class="list">
+            <li
+              v-for="item in user.history"
+              :key="item.id"
+            >
+              <span class="strong">{{ t(`admin.log.actions.${item.action.replace('.', '_')}`) }}</span>
+              <span class="muted">{{ formatDateTime(item.createdAt, locale) }}<template v-if="item.admin"> · @{{ item.admin }}</template><template v-if="item.details?.reason"> — {{ item.details.reason }}</template></span>
+            </li>
+          </ul>
+        </section>
+
+        <div
+          v-if="!user.isAdmin"
+          class="actions"
+        >
+          <AppButton
+            v-if="user.active && !user.emailVerifiedAt"
+            :label="t('admin.user.resend')"
+            icon="pi pi-envelope"
+            class="btn-outlined btn-sm"
+            :loading="resending"
+            @click="resend"
+          />
+          <AppButton
+            v-if="user.active"
+            :label="t('admin.accounts.suspend')"
+            icon="pi pi-ban"
+            class="btn-danger btn-outlined btn-sm"
+            @click="openDialog('suspend')"
+          />
+          <AppButton
+            v-else
+            :label="t('admin.accounts.reactivate')"
+            icon="pi pi-replay"
+            class="btn-sm"
+            @click="openDialog('reactivate')"
+          />
+        </div>
+      </template>
+    </div>
+  </AppDialog>
+
+  <AppDialog
+    v-model:visible="dialog.visible"
+    size="sm"
+    :header="dialog.mode === 'suspend' ? t('admin.accounts.suspendTitle', { name: user?.username }) : t('admin.accounts.reactivateTitle', { name: user?.username })"
+    :closable="!dialog.busy"
+  >
+    <form
+      class="stack"
+      novalidate
+      @submit.prevent="confirmDialog"
+    >
+      <p class="desc">{{ dialog.mode === 'suspend' ? t('admin.accounts.suspendDesc') : t('admin.accounts.reactivateDesc') }}</p>
+      <TextField
+        v-if="dialog.mode === 'suspend'"
+        id="admin-suspend-reason"
+        ref="reasonField"
+        v-model="dialog.reason"
+        :label="t('admin.accounts.reason')"
+        :hint="t('admin.accounts.reasonHint')"
+        :error="dialog.reasonError"
+        maxlength="500"
+        multiline
+        rows="3"
+        required
+      />
+      <PasswordField
+        id="admin-confirm-password"
+        ref="passwordField"
+        v-model="dialog.password"
+        :label="t('admin.accounts.password')"
+        autocomplete="current-password"
+        :error="dialog.passwordError"
+        required
+      />
+      <div class="dialog-actions">
+        <AppButton
+          :label="t('common.cancel')"
+          class="btn-text btn-secondary"
+          :disabled="dialog.busy"
+          @click="dialog.visible = false"
+        />
+        <AppButton
+          type="submit"
+          :label="dialog.mode === 'suspend' ? t('admin.accounts.suspend') : t('admin.accounts.reactivate')"
+          :icon="dialog.mode === 'suspend' ? 'pi pi-ban' : 'pi pi-replay'"
+          :class="dialog.mode === 'suspend' ? 'btn-danger' : ''"
+          :loading="dialog.busy"
+        />
+      </div>
+    </form>
+  </AppDialog>
+</template>
+
+<script setup>
+import { nextTick, reactive, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import AppButton from '../ui/AppButton.vue'
+import AppDialog from '../ui/AppDialog.vue'
+import TextField from '../form/TextField.vue'
+import PasswordField from '../form/PasswordField.vue'
+import api from '../../services/api.js'
+import { useToast } from '../../services/toast.js'
+import { LockedError, useAdminCall, formatDate, formatDateTime } from './adminCall.js'
+
+/**
+ * Gaveta com tudo de uma conta (menos senha, livros e anotações) e as ações:
+ * reenviar confirmação, suspender, reativar.
+ */
+const props = defineProps({
+  userId: { type: Number, default: null }
+})
+const emit = defineEmits(['close', 'changed'])
+
+const { t, locale } = useI18n()
+const call = useAdminCall()
+const toast = useToast()
+
+const user = ref(null)
+const loading = ref(false)
+const failed = ref(false)
+const resending = ref(false)
+const reasonField = ref(null)
+const passwordField = ref(null)
+const dialog = reactive({ visible: false, mode: 'suspend', reason: '', password: '', reasonError: '', passwordError: '', busy: false })
+
+async function load() {
+  if (!props.userId) return
+  loading.value = true
+  failed.value = false
+  try {
+    user.value = await call(() => api.adminUser(props.userId))
+  } catch (error) {
+    if (error instanceof LockedError) emit('close')
+    else failed.value = true
+  } finally {
+    loading.value = false
+  }
+}
+
+watch(() => props.userId, id => {
+  user.value = null
+  if (id) load()
+})
+
+async function resend() {
+  resending.value = true
+  try {
+    await call(() => api.adminResendVerification(user.value.id))
+    toast.add({ severity: 'success', summary: t('admin.user.resent', { email: user.value.email }), life: 4000 })
+    await load()
+    emit('changed')
+  } catch (error) {
+    if (!(error instanceof LockedError)) toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
+  } finally {
+    resending.value = false
+  }
+}
+
+async function openDialog(mode) {
+  Object.assign(dialog, { visible: true, mode, reason: '', password: '', reasonError: '', passwordError: '', busy: false })
+  await nextTick()
+  ;(mode === 'suspend' ? reasonField : passwordField).value?.focus()
+}
+
+async function confirmDialog() {
+  dialog.reasonError = ''
+  dialog.passwordError = ''
+  const reason = dialog.reason.trim()
+  if (dialog.mode === 'suspend' && reason.length < 3) {
+    dialog.reasonError = t('admin.accounts.reasonRequired')
+    reasonField.value?.focus()
+    return
+  }
+  if (!dialog.password) {
+    dialog.passwordError = t('errors.CURRENT_PASSWORD_REQUIRED')
+    passwordField.value?.focus()
+    return
+  }
+  dialog.busy = true
+  const name = user.value.username
+  try {
+    if (dialog.mode === 'suspend') await call(() => api.adminSuspendUser(user.value.id, dialog.password, reason))
+    else await call(() => api.adminReactivateUser(user.value.id, dialog.password))
+    toast.add({ severity: 'success', summary: t(dialog.mode === 'suspend' ? 'admin.accounts.suspendedDone' : 'admin.accounts.reactivatedDone', { name }), life: 3000 })
+    dialog.visible = false
+    await load()
+    emit('changed')
+  } catch (error) {
+    if (error instanceof LockedError) {
+      dialog.visible = false
+    } else if (error.code === 'CURRENT_PASSWORD_WRONG' || error.code === 'CURRENT_PASSWORD_REQUIRED') {
+      dialog.passwordError = error.message
+      dialog.password = ''
+      passwordField.value?.focus()
+    } else {
+      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
+    }
+  } finally {
+    dialog.busy = false
+  }
+}
+</script>
+
+<style scoped>
+.drawer-body {
+  display: flex;
+  flex-direction: column;
+  gap: 1.25rem;
+  padding-bottom: 1rem;
+}
+
+.tags {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+  align-items: center;
+}
+
+.tag {
+  font-size: var(--fs-xs);
+  font-weight: 600;
+  border-radius: 999px;
+  padding: 0.1rem 0.55rem;
+  color: var(--text-primary);
+}
+
+.tag.admin { background: rgba(var(--main-color-rgb), 0.18); }
+.tag.active { background: rgba(var(--green-rgb), 0.16); }
+.tag.suspended { background: rgba(var(--red-rgb), 0.18); }
+.tag.pending { background: var(--bg-input); color: var(--text-secondary); }
+
+.public-link {
+  margin-left: auto;
+  font-size: var(--fs-sm);
+  color: var(--main-color);
+}
+
+.suspension {
+  margin: 0;
+  padding: 0.6rem 0.8rem;
+  border-radius: 8px;
+  background: rgba(var(--red-rgb), 0.1);
+  color: var(--text-primary);
+  font-size: var(--fs-sm);
+}
+
+h3 {
+  margin: 0 0 0.6rem;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+}
+
+dl {
+  margin: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.45rem;
+}
+
+dl div {
+  display: grid;
+  grid-template-columns: 40% 1fr;
+  gap: 0.75rem;
+  font-size: var(--fs-sm);
+}
+
+dt {
+  color: var(--text-secondary);
+}
+
+dd {
+  margin: 0;
+  color: var(--text-primary);
+  overflow-wrap: anywhere;
+}
+
+dd small {
+  color: var(--text-muted);
+  margin-left: 0.25rem;
+}
+
+dd.warn {
+  color: var(--orange);
+  font-weight: 600;
+}
+
+.flags {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: grid;
+  grid-template-columns: 1fr 1fr;
+  gap: 0.35rem 1rem;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+}
+
+.flags li.on {
+  color: var(--text-primary);
+}
+
+.flags .pi {
+  width: 1rem;
+  font-size: var(--fs-xs);
+}
+
+.flags li.on .pi {
+  color: var(--green);
+}
+
+.list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+  font-size: var(--fs-sm);
+}
+
+.list li {
+  display: flex;
+  flex-direction: column;
+  gap: 0.1rem;
+}
+
+.strong {
+  color: var(--text-primary);
+  font-weight: 600;
+}
+
+.muted {
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+  margin: 0;
+}
+
+.muted.after {
+  margin-top: 0.6rem;
+}
+
+.list .muted {
+  font-size: var(--fs-xs);
+}
+
+.actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+  padding-top: 1rem;
+  border-top: 1px solid var(--border-color);
+}
+
+.stack {
+  display: flex;
+  flex-direction: column;
+  gap: 1rem;
+}
+
+.desc {
+  margin: 0;
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+}
+
+.dialog-actions {
+  display: flex;
+  justify-content: flex-end;
+  gap: 0.5rem;
+  margin-top: 0.5rem;
+}
+</style>
diff --git a/frontend/src/components/admin/adminCall.js b/frontend/src/components/admin/adminCall.js
index 14743b41c5ee57e83d35f01dd0862c5be551d0dc..bc86a83e3cd8066da5fd2211cb4a4baeef427215 100644
--- a/frontend/src/components/admin/adminCall.js
+++ b/frontend/src/components/admin/adminCall.js
@@ -47,3 +47,21 @@ export function formatShortDate(value, locale) {
   const date = new Date(value)
   return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(tag(locale), { dateStyle: 'short' })
 }
+
+export function formatBytes(bytes, locale) {
+  if (bytes === null || bytes === undefined) return '—'
+  const units = ['B', 'KB', 'MB', 'GB', 'TB']
+  let value = Number(bytes)
+  let unit = 0
+  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
+  return `${value.toLocaleString(tag(locale), { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 })} ${units[unit]}`
+}
+
+/** 93784 → "1d 2h 3min" */
+export function formatDuration(seconds) {
+  const s = Math.max(0, Math.round(seconds))
+  const d = Math.floor(s / 86400)
+  const h = Math.floor((s % 86400) / 3600)
+  const m = Math.floor((s % 3600) / 60)
+  return [d && `${d}d`, (d || h) && `${h}h`, `${m}min`].filter(Boolean).join(' ')
+}
diff --git a/frontend/src/components/book/BookEditForm.vue b/frontend/src/components/book/BookEditForm.vue
index a3c36ae3746461d104d46fd1476069a75b345879..49588306074c4d725270ed83e60ec2065f98c2bd 100644
--- a/frontend/src/components/book/BookEditForm.vue
+++ b/frontend/src/components/book/BookEditForm.vue
@@ -458,14 +458,15 @@ function parseApiDate(value) {
 }
 
 // Preenche só os campos vazios: o que a pessoa já digitou tem prioridade.
-async function lookupIsbn() {
+// via = 'scan' quando veio da câmera (o servidor só conta, para saber se o leitor é usado)
+async function lookupIsbn(via) {
   const isbn = form.isbn.trim()
   if (!isbn || lookingUp.value) return
 
   lookingUp.value = true
   delete errors.isbn
   try {
-    const found = await api.lookupIsbn(isbn)
+    const found = await api.lookupIsbn(isbn, via === 'scan' ? 'scan' : undefined)
     if (!form.title.trim() && found.title) form.title = found.title
     if (form.authorNames.length === 0 && found.authors?.length) form.authorNames = [...found.authors]
     if (!form.publisher.trim() && found.publisher) form.publisher = found.publisher
@@ -516,7 +517,7 @@ watch(() => errors.isbn, value => {
 
 function onScanned(isbn) {
   form.isbn = isbn
-  lookupIsbn()
+  lookupIsbn('scan')
 }
 
 // Resultado da busca por título: mesma regra do ISBN (só campos vazios)
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 0e568c01b3cb1f1ec8ec5624a69f27bef294a683..7a48996681cfa32370c5301548a008c4a2a8d346 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -531,13 +531,14 @@
         "paragraphs": [
           "Account data: username, email and password. Your password is stored securely and nobody can read it, not even us.",
           "Content you add: your books and their details (title, authors, publisher, ISBN, series, tags, dates, ratings, reading status, reading history and progress, and goals), personal notes and the covers you upload. Personal notes are yours only: they never appear in your public library.",
-          "Access data: the IP address of your visits is used briefly, only to protect the service from abuse such as repeated login attempts. We also keep the date and time of your last sign-in, to know how many accounts are in use."
+          "Access data: the IP address of your visits is used briefly, only to protect the service from abuse such as repeated login attempts. We also keep the date and time of your last sign-in and last visit, to know how many accounts are in use."
         ]
       },
       {
         "title": "How we use it",
         "paragraphs": [
           "Only to run Librishelf: keep you signed in, store and show your library, and protect your account.",
+          "We also count, per day, how often some features are used (for example book searches, camera scans and imports), without recording who used them. This helps us know what to improve.",
           "We do not sell or share your data with anyone, and we use no advertising or tracking tools."
         ]
       },
@@ -570,7 +571,7 @@
       {
         "title": "Moderation and account suspension",
         "paragraphs": [
-          "The Librishelf team can hide reviews and suspend accounts that misuse the site, such as spam or offensive content. To do that, it sees each account’s username, email, sign-up and last sign-in dates and its totals of books, reviews and reports, never the password or personal notes.",
+          "The Librishelf team can hide reviews and suspend accounts that misuse the site, such as spam or offensive content. To do that, it sees each account’s username, email, sign-up and last visit dates and its totals of books, reviews and reports, never the password or personal notes.",
           "A suspended account can’t sign in, and what was public (library, profile, reviews and lists) stops showing to others. Nothing is deleted: if the suspension is lifted, everything comes back as it was.",
           "Every admin action is logged (what, when and the reason). If the account is deleted, the log no longer points to it."
         ]
@@ -1125,7 +1126,9 @@
     "ADMIN_TARGET": "Admin accounts can't be suspended here.",
     "ACCOUNT_SUSPENDED": "This account is suspended. Contact the Librishelf team.",
     "ACCOUNT_ALREADY_SUSPENDED": "This account is already suspended.",
-    "ACCOUNT_NOT_SUSPENDED": "This account isn't suspended."
+    "ACCOUNT_NOT_SUSPENDED": "This account isn't suspended.",
+    "EMAIL_ALREADY_VERIFIED": "This account has already confirmed its email.",
+    "EMAIL_TEST_FAILED": "The mail server refused to send: {message}"
   },
   "block": {
     "block": "Block {name}",
@@ -1370,7 +1373,9 @@
       "overview": "Overview",
       "moderation": "Moderation",
       "accounts": "Accounts",
-      "log": "Log"
+      "log": "Log",
+      "usage": "Usage",
+      "system": "System"
     },
     "overview": {
       "users": "Accounts",
@@ -1389,7 +1394,23 @@
       "suspended": "{n} suspended account | {n} suspended accounts",
       "signupsByWeek": "Sign-ups per week",
       "signupsLabel": "Sign-ups",
-      "chartLabel": "Sign-ups per week, last 12: {list}"
+      "chartLabel": "Sign-ups per week, last 12: {list}",
+      "active7": "{n} in 7 days · {p}% of accounts",
+      "staleSignups": "Stalled sign-ups",
+      "staleHint": "Email unconfirmed for over 7 days",
+      "funnel": "From sign-up to use",
+      "funnelSteps": {
+        "signedUp": "Signed up",
+        "verified": "Confirmed email",
+        "withBook": "Added 1 book",
+        "with10Books": "Have 10+ books"
+      },
+      "returned": "{n} of {total} accounts older than a week came back after their first 7 days ({p}%).",
+      "activity": "Recent activity",
+      "books7": "Books added (7 days)",
+      "books30": "Books added (30 days)",
+      "finished30": "Readings finished (30 days)",
+      "reviews30": "New reviews (30 days)"
     },
     "moderation": {
       "filter": "Show",
@@ -1412,7 +1433,21 @@
       "totalCount": "{n} reviewed report | {n} reviewed reports",
       "viewAuthor": "See {name}'s account",
       "authorSuspended": "The author's account is suspended: the review isn't shown to anyone meanwhile.",
-      "reviewedBefore": "before the last review"
+      "reviewedBefore": "before the last review",
+      "insights": {
+        "title": "Moderation signals",
+        "summary": "{serial} frequent reporters · {fresh} new accounts reported",
+        "serialReporters": "Report a lot",
+        "serialReportersHint": "3 reports or more. Many kept visible may mean the button is being abused.",
+        "newAccountsReported": "New accounts already reported",
+        "newAccountsReportedHint": "Created in the last 30 days.",
+        "mostReported": "Most reported",
+        "mostReportedHint": "All accounts, by reports received.",
+        "none": "Nobody here.",
+        "serialDetail": "{n} reports · {upheld} hidden · {rejected} kept · {week} this week",
+        "freshDetail": "{n} reports on {reviews} reviews · account from {date}",
+        "mostDetail": "{n} reports on {reviews} reviews · {hidden} hidden"
+      }
     },
     "accounts": {
       "search": "Search accounts",
@@ -1420,7 +1455,8 @@
       "filter": "Show",
       "filters": {
         "all": "All",
-        "suspended": "Suspended"
+        "suspended": "Suspended",
+        "unverified": "Stalled email"
       },
       "total": "{n} account | {n} accounts",
       "cols": {
@@ -1430,7 +1466,8 @@
         "books": "Books",
         "reviews": "Reviews",
         "reports": "Reports",
-        "actions": "Actions"
+        "actions": "Actions",
+        "email": "Email"
       },
       "adminTag": "admin",
       "suspendedTag": "suspended",
@@ -1450,7 +1487,9 @@
       "reasonRequired": "Explain the reason (at least 3 characters).",
       "password": "Your password, to confirm",
       "suspendedDone": "{name}’s account was suspended.",
-      "reactivatedDone": "{name}’s account was reactivated."
+      "reactivatedDone": "{name}’s account was reactivated.",
+      "open": "Open",
+      "openWho": "Open {name}'s account"
     },
     "log": {
       "intro": "Everything done in this area, newest first.",
@@ -1466,11 +1505,200 @@
         "review_hide": "Hid review",
         "review_show": "Kept/restored review",
         "user_suspend": "Suspended account",
-        "user_reactivate": "Reactivated account"
+        "user_reactivate": "Reactivated account",
+        "user_resend_verification": "Resent confirmation",
+        "email_test": "Sent test email"
       },
       "review": "review #{id}",
       "deleted": "deleted account",
       "empty": "Nothing logged yet."
+    },
+    "usage": {
+      "adoption": "Who uses each feature",
+      "adoptionHint": "Accounts using it, out of {n}.",
+      "feature": "Feature",
+      "accounts": "Accounts",
+      "share": "Share of accounts",
+      "features": {
+        "readingNow": "Reading something now",
+        "rereads": "Logged rereads",
+        "goals": "Yearly goal",
+        "series": "Series",
+        "notes": "Personal notes",
+        "reviews": "Reviews",
+        "lists": "Lists",
+        "publicLibrary": "Public library",
+        "community": "Community",
+        "acceptsFollowers": "Accepts followers",
+        "following": "Follows someone",
+        "followEmails": "Email notices",
+        "indexing": "Shows in search engines",
+        "blocks": "Blocked someone"
+      },
+      "events": "Actions counted on the server",
+      "eventsHint": "Daily totals, without identifying anyone. Counting starts with this version.",
+      "action": "Action",
+      "last7": "7 days",
+      "last30": "30 days",
+      "eventNames": {
+        "book_add": "Books added",
+        "isbn_typed": "Typed ISBN lookup",
+        "isbn_scan": "Camera ISBN lookup",
+        "search_title": "Title search",
+        "cover_upload": "Covers uploaded",
+        "import_csv": "CSV imports",
+        "export_json": "JSON exports",
+        "export_csv": "CSV exports",
+        "year_view": "\"Your year in books\" opened"
+      },
+      "scanShare": "{p}% of ISBN lookups in the last 30 days came from the camera."
+    },
+    "system": {
+      "loadedAt": "Updated {time}",
+      "refresh": "Refresh",
+      "yes": "yes",
+      "no": "no",
+      "notSet": "not set",
+      "sinceBoot": "Nothing since the server started",
+      "service": {
+        "title": "Service",
+        "backend": "Backend",
+        "since": "up since {date} ({uptime})",
+        "frontend": "Frontend",
+        "built": "built {date}",
+        "version": "Version",
+        "runtime": "Runtime",
+        "memory": "Backend memory",
+        "load": "Load (1/5/15 min)",
+        "cpus": "{n} CPU | {n} CPUs",
+        "appUrl": "APP_URL",
+        "proxy": "Proxy and cookie",
+        "proxyValue": "TRUST_PROXY = {trust} · Secure cookie: {secure}",
+        "olContact": "Open Library contact",
+        "olContactMissing": "not set (slower queue)"
+      },
+      "db": {
+        "title": "Database",
+        "ok": "Responding in {ms} ms",
+        "down": "No response: {error}",
+        "version": "Version",
+        "size": "Size",
+        "connections": "Connections",
+        "pool": "pool: {total} open, {idle} idle, {waiting} waiting · {all} in the database",
+        "migration": "Last migration",
+        "pending": "Pending migrations: {list}"
+      },
+      "storage": {
+        "title": "Storage",
+        "covers": "Uploaded covers",
+        "files": "{n} files · {size}",
+        "disk": "Disk (where covers live)",
+        "free": "{free} free of {total} ({p}%)",
+        "used": "{p}% of the disk in use",
+        "lowDisk": "Less than 10% of the disk is free.",
+        "hint": "Cover size is recalculated every 5 minutes."
+      },
+      "email": {
+        "title": "Email",
+        "configured": "SMTP configured ({host})",
+        "notConfigured": "SMTP not configured: emails only go to the log",
+        "from": "Sender",
+        "reports": "Reports by email (ADMIN_EMAIL)",
+        "noAdminEmail": "not set",
+        "week": "Last 7 days",
+        "sentFailed": "{sent} sent · {failed} failed",
+        "lastOk": "Last sent",
+        "lastFailure": "Last failure",
+        "test": "Send test email",
+        "testSent": "Test email sent to {to}.",
+        "testLogged": "SMTP not configured: the test email only went to the server log."
+      },
+      "ol": {
+        "week": "Last 7 days",
+        "calls": "{ok} ok · {error} errors · {timeout} timed out",
+        "errorRate": "Failure rate",
+        "latency": "Response time",
+        "ms": "avg {avg} ms · p95 {p95} ms",
+        "lastFailure": "Last failure",
+        "books": "Books linked to Open Library",
+        "booksDetail": "{linked} linked · {linkable} with ISBN, not linked yet · {unlinked} without ISBN",
+        "enrichHint": "To link books that have an ISBN, run enrich:isbn (see the README).",
+        "series": {
+          "ok": "OK",
+          "error": "Error",
+          "timeout": "Timed out"
+        },
+        "chartLabel": "Open Library calls per day (ok/error/timeout): {list}"
+      },
+      "limits": {
+        "title": "Rate limits",
+        "none": "Nobody hit a limit in the last 7 days.",
+        "code": "Limit",
+        "today": "Today",
+        "week": "7 days",
+        "ips": "IPs in the last 2 hours",
+        "noIps": "No IP hit a limit in the last 2 hours.",
+        "hint": "IPs stay only in server memory, for at most 2 hours, and vanish on restart.",
+        "codes": {
+          "RATE_LIMIT": "General",
+          "RATE_LIMIT_LOGIN": "Sign-in",
+          "RATE_LIMIT_REGISTER": "Sign-up",
+          "RATE_LIMIT_ATTEMPTS": "Password and links",
+          "RATE_LIMIT_UPLOAD": "Cover uploads",
+          "RATE_LIMIT_SEARCH": "Title search",
+          "RATE_LIMIT_ISBN": "ISBN lookup",
+          "RATE_LIMIT_REPORTS": "Reports",
+          "RATE_LIMIT_ACTIONS": "Follow and actions",
+          "RATE_LIMIT_EMAIL": "Email requests"
+        }
+      },
+      "errors": {
+        "title": "Recent 500 errors",
+        "counts": "{today} today · {week} in the last 7 days",
+        "none": "No errors since the server started.",
+        "when": "When",
+        "route": "Route",
+        "context": "Context",
+        "message": "Message",
+        "hint": "Kept in memory (the latest 50) and cleared on restart; full details are in the log."
+      }
+    },
+    "user": {
+      "title": "Account",
+      "active": "active",
+      "openPublic": "View public library",
+      "account": "Account",
+      "created": "Joined",
+      "verified": "Email confirmed",
+      "notVerified": "not yet",
+      "lastLogin": "Last sign-in",
+      "lastSeen": "Last seen",
+      "privacy": "Privacy",
+      "flags": {
+        "isPublic": "Public library",
+        "showInCommunity": "In the community",
+        "showActivity": "Accepts followers",
+        "allowIndexing": "Shows in search engines",
+        "followEmails": "Email notices"
+      },
+      "totals": "Numbers",
+      "t": {
+        "books": "Books",
+        "read": "{n} read",
+        "reviews": "Reviews",
+        "hidden": "{n} hidden",
+        "lists": "Lists",
+        "public": "{n} public",
+        "follow": "Followers / following",
+        "blocks": "Blocked / blocked by",
+        "reports": "Reports received / made"
+      },
+      "lastBook": "Last book added on {date}.",
+      "reportedReviews": "Reported reviews",
+      "reviewReports": "{n} reports · {open} open",
+      "history": "Admin history",
+      "resend": "Resend confirmation",
+      "resent": "Confirmation resent to {email}."
     }
   }
 }
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index f2640632a74c46b3db4edc5cc032a0860d971e97..1d024a5058e41d64a574248ab361f8fbe991a727 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -531,13 +531,14 @@
         "paragraphs": [
           "Dados da conta: nome de usuário, e-mail e senha. A senha é guardada de forma protegida e ninguém consegue lê-la, nem nós.",
           "Conteúdo que você cadastra: seus livros e as informações deles (título, autores, editora, ISBN, série, tags, datas, notas, status de leitura, histórico de leituras e progresso, e metas), anotações pessoais e as capas que você enviar. As anotações pessoais são só suas: nunca aparecem na biblioteca pública.",
-          "Dados de acesso: o endereço IP das suas visitas é usado por pouco tempo, só para proteger o serviço contra abuso, como tentativas repetidas de login. Também guardamos a data e a hora do seu último login, para sabermos quantas contas estão em uso."
+          "Dados de acesso: o endereço IP das suas visitas é usado por pouco tempo, só para proteger o serviço contra abuso, como tentativas repetidas de login. Também guardamos a data e a hora do seu último login e do seu último acesso, para sabermos quantas contas estão em uso."
         ]
       },
       {
         "title": "Para que usamos",
         "paragraphs": [
           "Só para o Librishelf funcionar: manter você conectado, guardar e mostrar sua biblioteca e proteger sua conta.",
+          "Também contamos, por dia, quantas vezes alguns recursos são usados (por exemplo, buscas de livros, leituras pela câmera e importações), sem guardar quem usou. Isso nos ajuda a saber o que melhorar.",
           "Não vendemos nem compartilhamos seus dados com ninguém, e não usamos publicidade nem ferramentas de rastreamento."
         ]
       },
@@ -570,7 +571,7 @@
       {
         "title": "Moderação e suspensão de contas",
         "paragraphs": [
-          "A administração do Librishelf pode ocultar resenhas e suspender contas que desrespeitem o uso esperado do site, como spam ou conteúdo ofensivo. Para isso, ela vê o nome de usuário, o e-mail, as datas de cadastro e de último login e os totais de livros, resenhas e denúncias de cada conta, nunca a senha nem as anotações pessoais.",
+          "A administração do Librishelf pode ocultar resenhas e suspender contas que desrespeitem o uso esperado do site, como spam ou conteúdo ofensivo. Para isso, ela vê o nome de usuário, o e-mail, as datas de cadastro e de último acesso e os totais de livros, resenhas e denúncias de cada conta, nunca a senha nem as anotações pessoais.",
           "Uma conta suspensa não consegue entrar, e o que era público (biblioteca, perfil, resenhas e listas) deixa de aparecer para os outros. Nada é apagado: se a suspensão for desfeita, tudo volta como estava.",
           "Cada ação da administração fica registrada (o quê, quando e o motivo). Se a conta for excluída, o registro deixa de apontar para ela."
         ]
@@ -1125,7 +1126,9 @@
     "ADMIN_TARGET": "Contas de administração não podem ser suspensas por aqui.",
     "ACCOUNT_SUSPENDED": "Esta conta está suspensa. Fale com a administração do Librishelf.",
     "ACCOUNT_ALREADY_SUSPENDED": "Esta conta já está suspensa.",
-    "ACCOUNT_NOT_SUSPENDED": "Esta conta não está suspensa."
+    "ACCOUNT_NOT_SUSPENDED": "Esta conta não está suspensa.",
+    "EMAIL_ALREADY_VERIFIED": "Esta conta já confirmou o e-mail.",
+    "EMAIL_TEST_FAILED": "O servidor de e-mail recusou o envio: {message}"
   },
   "block": {
     "block": "Bloquear {name}",
@@ -1370,7 +1373,9 @@
       "overview": "Visão geral",
       "moderation": "Moderação",
       "accounts": "Contas",
-      "log": "Registro"
+      "log": "Registro",
+      "usage": "Uso",
+      "system": "Sistema"
     },
     "overview": {
       "users": "Contas",
@@ -1389,7 +1394,23 @@
       "suspended": "{n} conta suspensa | {n} contas suspensas",
       "signupsByWeek": "Cadastros por semana",
       "signupsLabel": "Cadastros",
-      "chartLabel": "Cadastros por semana, das últimas 12: {list}"
+      "chartLabel": "Cadastros por semana, das últimas 12: {list}",
+      "active7": "{n} em 7 dias · {p}% das contas",
+      "staleSignups": "Cadastros parados",
+      "staleHint": "E-mail não confirmado há mais de 7 dias",
+      "funnel": "Do cadastro ao uso",
+      "funnelSteps": {
+        "signedUp": "Cadastraram",
+        "verified": "Confirmaram o e-mail",
+        "withBook": "Adicionaram 1 livro",
+        "with10Books": "Têm 10 livros ou mais"
+      },
+      "returned": "{n} de {total} contas com mais de uma semana voltaram depois dos primeiros 7 dias ({p}%).",
+      "activity": "Atividade recente",
+      "books7": "Livros adicionados (7 dias)",
+      "books30": "Livros adicionados (30 dias)",
+      "finished30": "Leituras terminadas (30 dias)",
+      "reviews30": "Resenhas novas (30 dias)"
     },
     "moderation": {
       "filter": "Mostrar",
@@ -1412,7 +1433,21 @@
       "totalCount": "{n} denúncia revisada | {n} denúncias revisadas",
       "viewAuthor": "Ver a conta de {name}",
       "authorSuspended": "A conta de quem escreveu está suspensa: a resenha não aparece para ninguém enquanto isso.",
-      "reviewedBefore": "antes da última revisão"
+      "reviewedBefore": "antes da última revisão",
+      "insights": {
+        "title": "Sinais de moderação",
+        "summary": "{serial} denunciantes frequentes · {fresh} contas novas denunciadas",
+        "serialReporters": "Denunciam muito",
+        "serialReportersHint": "3 denúncias ou mais. Muitas mantidas no ar podem indicar abuso do botão.",
+        "newAccountsReported": "Contas novas já denunciadas",
+        "newAccountsReportedHint": "Criadas nos últimos 30 dias.",
+        "mostReported": "Mais denunciadas",
+        "mostReportedHint": "Todas as contas, pelo total de denúncias recebidas.",
+        "none": "Ninguém por aqui.",
+        "serialDetail": "{n} denúncias · {upheld} ocultas · {rejected} mantidas · {week} nesta semana",
+        "freshDetail": "{n} denúncias em {reviews} resenhas · conta de {date}",
+        "mostDetail": "{n} denúncias em {reviews} resenhas · {hidden} ocultas"
+      }
     },
     "accounts": {
       "search": "Buscar contas",
@@ -1420,7 +1455,8 @@
       "filter": "Mostrar",
       "filters": {
         "all": "Todas",
-        "suspended": "Suspensas"
+        "suspended": "Suspensas",
+        "unverified": "E-mail parado"
       },
       "total": "{n} conta | {n} contas",
       "cols": {
@@ -1430,7 +1466,8 @@
         "books": "Livros",
         "reviews": "Resenhas",
         "reports": "Denúncias",
-        "actions": "Ações"
+        "actions": "Ações",
+        "email": "E-mail"
       },
       "adminTag": "admin",
       "suspendedTag": "suspensa",
@@ -1450,7 +1487,9 @@
       "reasonRequired": "Explique o motivo (pelo menos 3 caracteres).",
       "password": "Sua senha, para confirmar",
       "suspendedDone": "Conta de {name} suspensa.",
-      "reactivatedDone": "Conta de {name} reativada."
+      "reactivatedDone": "Conta de {name} reativada.",
+      "open": "Abrir",
+      "openWho": "Abrir a conta de {name}"
     },
     "log": {
       "intro": "Tudo o que foi feito nesta área, do mais recente para o mais antigo.",
@@ -1466,11 +1505,200 @@
         "review_hide": "Ocultou resenha",
         "review_show": "Manteve/reexibiu resenha",
         "user_suspend": "Suspendeu conta",
-        "user_reactivate": "Reativou conta"
+        "user_reactivate": "Reativou conta",
+        "user_resend_verification": "Reenviou confirmação",
+        "email_test": "Enviou e-mail de teste"
       },
       "review": "resenha #{id}",
       "deleted": "conta excluída",
       "empty": "Nada registrado ainda."
+    },
+    "usage": {
+      "adoption": "Quem usa cada recurso",
+      "adoptionHint": "Contas que usam, de {n} no total.",
+      "feature": "Recurso",
+      "accounts": "Contas",
+      "share": "Parcela das contas",
+      "features": {
+        "readingNow": "Lendo algo agora",
+        "rereads": "Releituras registradas",
+        "goals": "Meta do ano",
+        "series": "Séries",
+        "notes": "Anotações pessoais",
+        "reviews": "Resenhas",
+        "lists": "Listas",
+        "publicLibrary": "Biblioteca pública",
+        "community": "Comunidade",
+        "acceptsFollowers": "Aceita seguidores",
+        "following": "Segue alguém",
+        "followEmails": "Avisos por e-mail",
+        "indexing": "Aparece em buscadores",
+        "blocks": "Bloqueou alguém"
+      },
+      "events": "Ações contadas no servidor",
+      "eventsHint": "Totais por dia, sem identificar ninguém. A contagem começa com esta versão.",
+      "action": "Ação",
+      "last7": "7 dias",
+      "last30": "30 dias",
+      "eventNames": {
+        "book_add": "Livros adicionados",
+        "isbn_typed": "Busca por ISBN digitado",
+        "isbn_scan": "Busca por ISBN pela câmera",
+        "search_title": "Busca por título",
+        "cover_upload": "Capas enviadas",
+        "import_csv": "Importações de CSV",
+        "export_json": "Exportações em JSON",
+        "export_csv": "Exportações em CSV",
+        "year_view": "\"Seu ano em livros\" aberto"
+      },
+      "scanShare": "{p}% das buscas por ISBN nos últimos 30 dias vieram da câmera."
+    },
+    "system": {
+      "loadedAt": "Atualizado em {time}",
+      "refresh": "Atualizar",
+      "yes": "sim",
+      "no": "não",
+      "notSet": "não definido",
+      "sinceBoot": "Nada desde que o servidor iniciou",
+      "service": {
+        "title": "Serviço",
+        "backend": "Backend",
+        "since": "no ar desde {date} ({uptime})",
+        "frontend": "Frontend",
+        "built": "build de {date}",
+        "version": "Versão",
+        "runtime": "Execução",
+        "memory": "Memória do backend",
+        "load": "Carga (1/5/15 min)",
+        "cpus": "{n} CPU | {n} CPUs",
+        "appUrl": "APP_URL",
+        "proxy": "Proxy e cookie",
+        "proxyValue": "TRUST_PROXY = {trust} · cookie Secure: {secure}",
+        "olContact": "Contato no Open Library",
+        "olContactMissing": "não definido (fila mais lenta)"
+      },
+      "db": {
+        "title": "Banco de dados",
+        "ok": "Respondendo em {ms} ms",
+        "down": "Sem resposta: {error}",
+        "version": "Versão",
+        "size": "Tamanho",
+        "connections": "Conexões",
+        "pool": "pool: {total} abertas, {idle} livres, {waiting} esperando · {all} no banco",
+        "migration": "Última migration",
+        "pending": "Migrations pendentes: {list}"
+      },
+      "storage": {
+        "title": "Armazenamento",
+        "covers": "Capas enviadas",
+        "files": "{n} arquivos · {size}",
+        "disk": "Disco (onde ficam as capas)",
+        "free": "{free} livres de {total} ({p}%)",
+        "used": "{p}% do disco em uso",
+        "lowDisk": "Menos de 10% do disco livre.",
+        "hint": "O tamanho das capas é recalculado a cada 5 minutos."
+      },
+      "email": {
+        "title": "E-mail",
+        "configured": "SMTP configurado ({host})",
+        "notConfigured": "SMTP não configurado: os e-mails só aparecem no log",
+        "from": "Remetente",
+        "reports": "Denúncias por e-mail (ADMIN_EMAIL)",
+        "noAdminEmail": "não definido",
+        "week": "Últimos 7 dias",
+        "sentFailed": "{sent} enviados · {failed} falharam",
+        "lastOk": "Último envio",
+        "lastFailure": "Última falha",
+        "test": "Enviar e-mail de teste",
+        "testSent": "E-mail de teste enviado para {to}.",
+        "testLogged": "SMTP não configurado: o e-mail de teste foi só para o log do servidor."
+      },
+      "ol": {
+        "week": "Últimos 7 dias",
+        "calls": "{ok} ok · {error} erros · {timeout} sem resposta",
+        "errorRate": "Taxa de falha",
+        "latency": "Tempo de resposta",
+        "ms": "média {avg} ms · p95 {p95} ms",
+        "lastFailure": "Última falha",
+        "books": "Livros ligados ao Open Library",
+        "booksDetail": "{linked} ligados · {linkable} com ISBN, ainda sem ligação · {unlinked} sem ISBN",
+        "enrichHint": "Para ligar os livros que têm ISBN, rode o enrich:isbn (veja o README).",
+        "series": {
+          "ok": "OK",
+          "error": "Erro",
+          "timeout": "Sem resposta"
+        },
+        "chartLabel": "Chamadas ao Open Library por dia (ok/erro/sem resposta): {list}"
+      },
+      "limits": {
+        "title": "Limites de requisição",
+        "none": "Ninguém bateu em limite nos últimos 7 dias.",
+        "code": "Limite",
+        "today": "Hoje",
+        "week": "7 dias",
+        "ips": "IPs nas últimas 2 horas",
+        "noIps": "Nenhum IP bateu em limite nas últimas 2 horas.",
+        "hint": "Os IPs ficam só na memória do servidor, por no máximo 2 horas, e somem ao reiniciar.",
+        "codes": {
+          "RATE_LIMIT": "Geral",
+          "RATE_LIMIT_LOGIN": "Login",
+          "RATE_LIMIT_REGISTER": "Cadastro",
+          "RATE_LIMIT_ATTEMPTS": "Senha e links",
+          "RATE_LIMIT_UPLOAD": "Envio de capas",
+          "RATE_LIMIT_SEARCH": "Busca por título",
+          "RATE_LIMIT_ISBN": "Busca por ISBN",
+          "RATE_LIMIT_REPORTS": "Denúncias",
+          "RATE_LIMIT_ACTIONS": "Seguir e ações",
+          "RATE_LIMIT_EMAIL": "Pedidos de e-mail"
+        }
+      },
+      "errors": {
+        "title": "Erros 500 recentes",
+        "counts": "{today} hoje · {week} nos últimos 7 dias",
+        "none": "Nenhum erro desde que o servidor iniciou.",
+        "when": "Quando",
+        "route": "Rota",
+        "context": "Contexto",
+        "message": "Mensagem",
+        "hint": "A lista fica na memória (os 50 mais recentes) e zera quando o servidor reinicia; os detalhes completos estão no log."
+      }
+    },
+    "user": {
+      "title": "Conta",
+      "active": "ativa",
+      "openPublic": "Ver biblioteca pública",
+      "account": "Conta",
+      "created": "Cadastro",
+      "verified": "E-mail confirmado",
+      "notVerified": "ainda não",
+      "lastLogin": "Último login",
+      "lastSeen": "Último acesso",
+      "privacy": "Privacidade",
+      "flags": {
+        "isPublic": "Biblioteca pública",
+        "showInCommunity": "Na comunidade",
+        "showActivity": "Aceita seguidores",
+        "allowIndexing": "Aparece em buscadores",
+        "followEmails": "Avisos por e-mail"
+      },
+      "totals": "Números",
+      "t": {
+        "books": "Livros",
+        "read": "{n} lidos",
+        "reviews": "Resenhas",
+        "hidden": "{n} ocultas",
+        "lists": "Listas",
+        "public": "{n} públicas",
+        "follow": "Seguidores / seguindo",
+        "blocks": "Bloqueou / bloqueada por",
+        "reports": "Denúncias recebidas / feitas"
+      },
+      "lastBook": "Último livro adicionado em {date}.",
+      "reportedReviews": "Resenhas denunciadas",
+      "reviewReports": "{n} denúncias · {open} abertas",
+      "history": "Histórico na administração",
+      "resend": "Reenviar confirmação",
+      "resent": "Confirmação reenviada para {email}."
     }
   }
 }
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 79496ff037f06b2d5b83d2922a506021f5239e5c..fe9c29217c278b8a9ef0f1ad8be0b9f71af12ef8 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -265,8 +265,8 @@ export default {
   },
 
   // --- ISBN (Open Library, sempre via servidor) ---
-  lookupIsbn(isbn) {
-    return client.get(`/isbn/${enc(isbn)}`)
+  lookupIsbn(isbn, via) {
+    return client.get(`/isbn/${enc(isbn)}${toQuery({ via })}`)
   },
 
   /** size 'M' = miniatura (lista da busca por título). */
@@ -433,6 +433,30 @@ export default {
     return client.post(`/admin/users/${id}/reactivate`, { password })
   },
 
+  adminUser(id) {
+    return client.get(`/admin/users/${id}`)
+  },
+
+  adminResendVerification(id) {
+    return client.post(`/admin/users/${id}/resend-verification`, {})
+  },
+
+  adminUsage() {
+    return client.get('/admin/usage')
+  },
+
+  adminSystem() {
+    return client.get('/admin/system')
+  },
+
+  adminEmailTest() {
+    return client.post('/admin/email/test', {})
+  },
+
+  adminModerationInsights() {
+    return client.get('/admin/moderation/insights')
+  },
+
   adminActions(params = {}) {
     return client.get(`/admin/actions${toQuery(params)}`)
   }
diff --git a/frontend/src/views/Admin.vue b/frontend/src/views/Admin.vue
index e8488b887c69bcf0323f11e8c5f4b8f2c82ff5b5..74e92e0018c2ae96040ba0fbaf17849a0ad54339 100644
--- a/frontend/src/views/Admin.vue
+++ b/frontend/src/views/Admin.vue
@@ -105,6 +105,7 @@
           @open-tab="selectTab"
           @loaded="stats => openReports = stats.moderation.openReports"
         />
+        <AdminUsage v-else-if="activeTab === 'usage'" />
         <AdminModeration
           v-else-if="activeTab === 'moderation'"
           @open-user="openUser"
@@ -112,10 +113,19 @@
         />
         <AdminAccounts
           v-else-if="activeTab === 'accounts'"
-          :initial-query="accountQuery"
+          :initial-status="accountStatus"
+          :version="accountsVersion"
+          @open-user="openUser"
         />
+        <AdminSystem v-else-if="activeTab === 'system'" />
         <AdminLog v-else-if="activeTab === 'log'" />
       </section>
+
+      <AdminUserDrawer
+        :user-id="drawerUserId"
+        @close="drawerUserId = null"
+        @changed="onUserChanged"
+      />
     </template>
   </div>
 </template>
@@ -130,6 +140,9 @@ import AdminOverview from '../components/admin/AdminOverview.vue'
 import AdminModeration from '../components/admin/AdminModeration.vue'
 import AdminAccounts from '../components/admin/AdminAccounts.vue'
 import AdminLog from '../components/admin/AdminLog.vue'
+import AdminUsage from '../components/admin/AdminUsage.vue'
+import AdminSystem from '../components/admin/AdminSystem.vue'
+import AdminUserDrawer from '../components/admin/AdminUserDrawer.vue'
 import api from '../services/api.js'
 import { useToast } from '../services/toast.js'
 import { ADMIN_CALL, LockedError } from '../components/admin/adminCall.js'
@@ -144,7 +157,7 @@ const route = useRoute()
 const router = useRouter()
 const toast = useToast()
 
-const TAB_KEYS = ['overview', 'moderation', 'accounts', 'log']
+const TAB_KEYS = ['overview', 'usage', 'moderation', 'accounts', 'system', 'log']
 const state = ref('loading') // loading | locked | unlocked
 const minutes = ref(30)
 const password = ref('')
@@ -153,13 +166,17 @@ const unlocking = ref(false)
 const locking = ref(false)
 const passwordField = ref(null)
 const openReports = ref(0)
-const accountQuery = ref('')
+const accountStatus = ref(['all', 'suspended', 'unverified'].includes(route.query.status) ? route.query.status : 'all')
+const accountsVersion = ref(0)
+const drawerUserId = ref(null)
 const activeTab = ref(TAB_KEYS.includes(route.query.tab) ? route.query.tab : 'overview')
 
 const tabs = computed(() => [
   { key: 'overview', label: t('admin.tabs.overview'), icon: 'pi pi-chart-line' },
+  { key: 'usage', label: t('admin.tabs.usage'), icon: 'pi pi-th-large' },
   { key: 'moderation', label: t('admin.tabs.moderation'), icon: 'pi pi-flag', count: openReports.value },
   { key: 'accounts', label: t('admin.tabs.accounts'), icon: 'pi pi-users' },
+  { key: 'system', label: t('admin.tabs.system'), icon: 'pi pi-server' },
   { key: 'log', label: t('admin.tabs.log'), icon: 'pi pi-history' }
 ])
 
@@ -183,9 +200,11 @@ provide(ADMIN_CALL, async (fn) => {
   }
 })
 
-function selectTab(key) {
+// options.status: abre Contas já filtrada (ex.: cadastros parados)
+function selectTab(key, options = {}) {
+  if (key === 'accounts' && options.status) accountStatus.value = options.status
   activeTab.value = key
-  router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } })
+  router.replace({ query: { tab: key === 'overview' ? undefined : key } })
 }
 
 function moveTab(step) {
@@ -194,9 +213,13 @@ function moveTab(step) {
   document.getElementById(`admin-tab-${next}`)?.focus()
 }
 
-function openUser(username) {
-  accountQuery.value = username
-  selectTab('accounts')
+function openUser(id) {
+  drawerUserId.value = id
+}
+
+function onUserChanged() {
+  accountsVersion.value++
+  refreshCount()
 }
 
 async function refreshCount() {
diff --git a/frontend/vite.config.js b/frontend/vite.config.js
index 2b35f3085c4e29b7268cbe56c12634cf1e8c5824..a3a7575a77512e8b1324ddb4aacde0fd657be774 100644
--- a/frontend/vite.config.js
+++ b/frontend/vite.config.js
@@ -11,6 +11,10 @@ export default defineConfig(({ mode }) => {
 
   return {
     plugins: [vue(), preloadIconFont(), serviceWorker()],
+    // Hora do build: a área administrativa mostra qual versão do frontend está no ar
+    define: {
+      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
+    },
     resolve: {
       alias: {
         '@': fileURLToPath(new URL('./src', import.meta.url))