#!/usr/bin/env bash
# Pacote 12 — compartilhar
#   prévia das bibliotecas públicas no WhatsApp/redes (Open Graph + mosaico
#   das capas) e aviso por e-mail de seguidores (migration 010)
#
# Rode na raiz do repositório, na branch fix/audit-2026-08, com o 3eaba84 como
# último commit. Deixe este script FORA do repositório:
#   bash ~/Downloads/pacote-12-compartilhar.sh
#
# O que faz: aplica o patch (git apply; se falhar, git apply --3way), grava os
# blobs para o 3way dos próximos pacotes, roda testes unitários e build,
# pergunta se roda a migration 010 no banco local e mostra a mensagem de
# commit. Não commita nem faz push.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "✗ Rode dentro do repositório do Librishelf."; exit 1; }
cd "$ROOT"
[ -d frontend ] && [ -d backend ] || { echo "✗ Não parece ser o repositório do Librishelf."; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "fix/audit-2026-08" ] || echo "⚠ Branch atual: $BRANCH (esperado fix/audit-2026-08). Continuando."
git merge-base --is-ancestor 3eaba84 HEAD 2>/dev/null || echo "⚠ O commit 3eaba84 (pacote 11) não está no histórico. O 3way pode resolver; continuando."

if git ls-files --error-unmatch backend/db/migrations/010_follow_emails.sql >/dev/null 2>&1; then
  echo "✗ A migration 010 já está commitada — parece que o pacote 12 já entrou."; exit 1
fi

FILES=(
  README.md
  backend/db/migrations/010_follow_emails.sql
  backend/db/schema.sql
  backend/src/.env.example
  backend/src/app.js
  backend/src/database/queries.js
  backend/src/repositories/libraryRepository.js
  backend/src/routes/auth.js
  backend/src/routes/email.js
  backend/src/routes/library.js
  backend/src/routes/meta.js
  backend/src/scripts/previewEmails.js
  backend/src/server.js
  backend/src/services/authService.js
  backend/src/services/dataService.js
  backend/src/services/emailTemplates.js
  backend/src/services/followEmailService.js
  backend/src/services/libraryService.js
  backend/src/services/mailService.js
  backend/src/services/metaService.js
  backend/src/services/socialService.js
  backend/src/tests/integration/followEmails.test.js
  backend/src/tests/integration/linkPreview.test.js
  backend/src/tests/integration/searchIndexing.test.js
  backend/src/tests/unit/linkPreview.test.js
  backend/src/utils/unsubscribeToken.js
  frontend/index.html
  frontend/public/robots.txt
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/router/index.js
  frontend/src/services/api.js
  frontend/src/views/Settings.vue
  frontend/src/views/Unsubscribe.vue
)

DIRTY=$(git status --porcelain -- "${FILES[@]}")
if [ -n "$DIRTY" ]; then
  echo "✗ Estes arquivos têm mudanças não commitadas; commite ou descarte antes:"
  echo "$DIRTY"
  exit 1
fi

PATCH_FILE=$(mktemp)
trap 'rm -f "$PATCH_FILE"' EXIT
cat > "$PATCH_FILE" <<'__LIBRISHELF_PATCH__'
diff --git a/README.md b/README.md
index 8c2acc5116410df6aaba7dee01cf6a5d9863edd7..03d17fd74561e4e06b753a60430cf7d1f64e2b97 100644
--- a/README.md
+++ b/README.md
@@ -11,7 +11,7 @@ Live at **[librishelf.com](https://librishelf.com)**.
 - **Reading log** — want to read, reading and read; every reading is kept, so rereads count again (with their own dates and an optional rating), and books in progress track the current page or percentage.
 - **Search and filters** — search by title or ISBN; filter by author, publisher, tag, reading status and year; sort by any field.
 - **Dashboard** — totals, reading rate, books read per year, top authors and tags.
-- **Public library (opt-in)** — share a read-only link (`/u/your-username`) to your shelf, with a profile: reading by year, top authors and tags, recently read and books you have in common. Libraries are private by default.
+- **Public library (opt-in)** — share a read-only link (`/u/your-username`) to your shelf (with a link preview on WhatsApp and social networks: title, book count and a mosaic of your covers), with a profile: reading by year, top authors and tags, recently read and books you have in common. Libraries are private by default.
 - **Community (opt-in)** — see who else has a book, their average rating and what people who have it also have. Follow other readers (they approve each request) and get a feed of what they add and finish. Everything is off until the user turns it on.
 - **Account control** — email confirmation, password recovery by email, change your password (signs out other sessions) and delete your account with all its data.
 - **Portuguese and English**, light and dark themes, six accent colors.
@@ -142,7 +142,7 @@ server {
 
 ### Email (password recovery and sign-up confirmation)
 
-The API sends two kinds of email over SMTP: the password reset link (valid for 1 hour) and the sign-up confirmation link (valid for 3 days). Until a user confirms their email, public library, community and following stay locked; accounts that existed before this version count as confirmed.
+The API sends email over SMTP: the password reset link (valid for 1 hour), the sign-up confirmation link (valid for 3 days) and, for users who turn it on in Account, follower notifications (someone asked to follow you / accepted your request) — at most one every `FOLLOW_EMAIL_INTERVAL_HOURS` (default 6), with one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058). Until a user confirms their email, public library, community and following stay locked; accounts that existed before this version count as confirmed.
 
 Set in `backend/src/.env`:
 
@@ -154,6 +154,7 @@ SMTP_SECURE=false
 SMTP_USER=...
 SMTP_PASS=...
 MAIL_FROM="Librishelf <noreply@librishelf.com>"
+# FOLLOW_EMAIL_INTERVAL_HOURS=6         # optional
 ```
 
 To send as `@librishelf.com` without landing in spam, add the SPF and DKIM records your SMTP provider gives you to the domain's DNS (and ideally a DMARC record). Without `SMTP_HOST` nothing is sent: the email content, links included, goes to the server log — handy for local development.
diff --git a/backend/db/migrations/010_follow_emails.sql b/backend/db/migrations/010_follow_emails.sql
new file mode 100644
index 0000000000000000000000000000000000000000..66e8d61d7d2187c15e4561baab537fedcdac1802
--- /dev/null
+++ b/backend/db/migrations/010_follow_emails.sql
@@ -0,0 +1,31 @@
+-- 010 — aviso por e-mail de seguidores
+-- Idempotente: pode rodar mais de uma vez.
+--
+-- Opt-in na Conta: e-mail quando alguém pede para seguir e quando aceitam
+-- o seu pedido. No máximo um e-mail a cada N horas por pessoa (padrão 6);
+-- o que acontece no intervalo vai junto no próximo (fila abaixo).
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS follow_emails boolean NOT NULL DEFAULT false;
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS follow_email_sent_at timestamptz;
+-- Idioma dos avisos (o do app quando a pessoa ligou a opção)
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS email_locale text NOT NULL DEFAULT 'pt';
+
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_constraint
+    WHERE conname = 'users_email_locale_check' AND conrelid = 'librishelf.users'::regclass
+  ) THEN
+    ALTER TABLE librishelf.users
+      ADD CONSTRAINT users_email_locale_check CHECK (email_locale IN ('pt', 'en'));
+  END IF;
+END $$;
+
+-- Avisos esperando o próximo e-mail. Saem da fila quando o e-mail vai, ou
+-- quando deixam de valer (pedido cancelado/recusado, bloqueio, opção desligada).
+CREATE TABLE IF NOT EXISTS librishelf.follow_email_queue (
+  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  kind       text NOT NULL CHECK (kind IN ('request', 'accepted')),
+  actor_id   integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  created_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (user_id, kind, actor_id)
+);
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index e6ea0c917c3eb6658a53a64da751638232fe4ffd..6d31931d2d3f6cb10fc3cba7822880fbe78ce675 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -1436,3 +1436,40 @@ SELECT id, started_at::date, NULL, created_at, now()
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('009_readings_and_progress')
 ON CONFLICT (version) DO NOTHING;
+
+-- ===========================================================================
+-- 010 — aviso por e-mail de seguidores
+-- ===========================================================================
+--
+-- Opt-in na Conta: e-mail quando alguém pede para seguir e quando aceitam
+-- o seu pedido. No máximo um e-mail a cada N horas por pessoa (padrão 6);
+-- o que acontece no intervalo vai junto no próximo (fila abaixo).
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS follow_emails boolean NOT NULL DEFAULT false;
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS follow_email_sent_at timestamptz;
+-- Idioma dos avisos (o do app quando a pessoa ligou a opção)
+ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS email_locale text NOT NULL DEFAULT 'pt';
+
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_constraint
+    WHERE conname = 'users_email_locale_check' AND conrelid = 'librishelf.users'::regclass
+  ) THEN
+    ALTER TABLE librishelf.users
+      ADD CONSTRAINT users_email_locale_check CHECK (email_locale IN ('pt', 'en'));
+  END IF;
+END $$;
+
+-- Avisos esperando o próximo e-mail. Saem da fila quando o e-mail vai, ou
+-- quando deixam de valer (pedido cancelado/recusado, bloqueio, opção desligada).
+CREATE TABLE IF NOT EXISTS librishelf.follow_email_queue (
+  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  kind       text NOT NULL CHECK (kind IN ('request', 'accepted')),
+  actor_id   integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  created_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (user_id, kind, actor_id)
+);
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('010_follow_emails')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/.env.example b/backend/src/.env.example
index acf4e9891eed11ffb92cd518b65ee1c64fc49461..76e5b2845922cc6da9d015c34ef5bce52ed0e543 100644
--- a/backend/src/.env.example
+++ b/backend/src/.env.example
@@ -44,3 +44,6 @@ SMTP_SECURE=false
 SMTP_USER=
 SMTP_PASS=
 MAIL_FROM="Librishelf <noreply@librishelf.com>"
+# Avisos de seguidores (opt-in na Conta): no máximo um e-mail a cada N horas
+# por pessoa; o que acontecer no meio-tempo vai junto. Opcional (padrão 6).
+# FOLLOW_EMAIL_INTERVAL_HOURS=6
diff --git a/backend/src/app.js b/backend/src/app.js
index 5ca4725ed92c490ab9c85d08b2440aeed2f51254..a23003faa1cd9687c5d55f6fd2cd061fa11eebe8 100644
--- a/backend/src/app.js
+++ b/backend/src/app.js
@@ -13,6 +13,7 @@ import communityRoutes from './routes/community.js'
 import socialRoutes from './routes/social.js'
 import uploadsRoutes from './routes/uploads.js'
 import metaRoutes from './routes/meta.js'
+import emailRoutes from './routes/email.js'
 import errorHandler from './middlewares/errorHandler.js'
 import corsOptions from './config/corsOptions.js'
 import trustProxy from './config/trustProxy.js'
@@ -39,6 +40,7 @@ app.use('/isbn', isbnRoutes)
 app.use('/community', communityRoutes)
 app.use('/social', socialRoutes)
 app.use('/meta', metaRoutes)
+app.use('/email', emailRoutes)
 app.get('/ping', (req, res) => { res.json({ message: 'pong' }) })
 
 app.use(errorHandler)
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index 95416bb1d2f862a99acc6982ed1c15d73d28ab12..99edb84dcdd65d44b8d9659a5543794d30d1f932 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -172,7 +172,7 @@ export const AUTH_QUERIES = {
     WHERE name = $1
   `,
   FIND_USER_BY_ID: `
-    SELECT id, name, email, is_public, show_in_community, show_activity, allow_indexing, email_verified_at
+    SELECT id, name, email, is_public, show_in_community, show_activity, allow_indexing, follow_emails, email_verified_at
     FROM librishelf.users
     WHERE id = $1
   `,
@@ -188,12 +188,12 @@ export const AUTH_QUERIES = {
   UPDATE_EMAIL: `
     UPDATE librishelf.users SET email = $2, email_verified_at = NULL, updated_at = now()
     WHERE id = $1
-    RETURNING id, name, email, email_verified_at, is_public, show_in_community, show_activity, allow_indexing
+    RETURNING id, name, email, email_verified_at, is_public, show_in_community, show_activity, allow_indexing, follow_emails
   `,
   UPDATE_NAME: `
     UPDATE librishelf.users SET name = $2, updated_at = now()
     WHERE id = $1
-    RETURNING id, name, email, email_verified_at, is_public, show_in_community, show_activity, allow_indexing
+    RETURNING id, name, email, email_verified_at, is_public, show_in_community, show_activity, allow_indexing, follow_emails
   `,
   MARK_EMAIL_VERIFIED: `
     UPDATE librishelf.users
@@ -215,7 +215,7 @@ export const AUTH_QUERIES = {
   CREATE_USER: `
     INSERT INTO librishelf.users (name, password_hash, email)
     VALUES ($1, $2, $3)
-    RETURNING id, name, email, is_public, show_in_community, show_activity, allow_indexing, email_verified_at
+    RETURNING id, name, email, is_public, show_in_community, show_activity, allow_indexing, follow_emails, email_verified_at
   `,
   UPDATE_PASSWORD: `
     UPDATE librishelf.users
@@ -554,7 +554,7 @@ export const COMMUNITY_QUERIES = {
 export const DATA_QUERIES = {
   EXPORT_USER: `
     SELECT name, email, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
-           is_public, show_in_community, show_activity, allow_indexing,
+           is_public, show_in_community, show_activity, allow_indexing, follow_emails,
            email_verified_at IS NOT NULL AS email_verified
     FROM librishelf.users WHERE id = $1
   `,
@@ -761,3 +761,88 @@ export const TOKEN_QUERIES = {
     WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'
   `
 }
+
+// Prévia das bibliotecas públicas (Open Graph, metaService)
+export const META_QUERIES = {
+  LIBRARY_STATS: `
+    SELECT count(*)::int AS total,
+           count(*) FILTER (WHERE read_date IS NOT NULL)::int AS read,
+           extract(epoch FROM max(coalesce(last_modified, created_at)))::bigint AS changed
+    FROM librishelf.books WHERE user_id = $1
+  `,
+  // Candidatas a aparecer no mosaico: melhor avaliadas e lidas por último
+  COVER_CANDIDATES: `
+    SELECT id FROM librishelf.books
+    WHERE user_id = $1
+    ORDER BY rating DESC NULLS LAST, read_date DESC NULLS LAST, id DESC
+    LIMIT $2
+  `,
+  // Capa nova muda a versão da imagem da prévia
+  TOUCH_BOOK: 'UPDATE librishelf.books SET last_modified = now() WHERE id = $1'
+}
+
+// Aviso por e-mail de seguidores (migration 010)
+export const FOLLOW_EMAIL_QUERIES = {
+  // Só entra na fila quem quer o aviso e tem e-mail confirmado
+  ENQUEUE: `
+    INSERT INTO librishelf.follow_email_queue (user_id, kind, actor_id)
+    SELECT u.id, $2, $3 FROM librishelf.users u
+    WHERE u.id = $1 AND u.follow_emails AND u.email_verified_at IS NOT NULL AND u.is_active IS NOT FALSE
+    ON CONFLICT (user_id, kind, actor_id) DO NOTHING
+    RETURNING user_id
+  `,
+  DEQUEUE: 'DELETE FROM librishelf.follow_email_queue WHERE user_id = $1 AND kind = $2 AND actor_id = $3',
+  // Bloqueio: some tudo entre os dois, nos dois sentidos
+  DEQUEUE_PAIR: `
+    DELETE FROM librishelf.follow_email_queue
+    WHERE (user_id = $1 AND actor_id = $2) OR (user_id = $2 AND actor_id = $1)
+  `,
+  CLEAR_USER: 'DELETE FROM librishelf.follow_email_queue WHERE user_id = $1',
+  // Quem tem aviso na fila e já pode receber (último e-mail há mais de $1 segundos)
+  DUE_USERS: `
+    SELECT DISTINCT q.user_id
+    FROM librishelf.follow_email_queue q
+    JOIN librishelf.users u ON u.id = q.user_id
+    WHERE u.follow_emails
+      AND (u.follow_email_sent_at IS NULL OR u.follow_email_sent_at <= now() - make_interval(secs => $1))
+    LIMIT 200
+  `,
+  // Reserva o envio (vale com mais de um processo): só um consegue
+  CLAIM: `
+    WITH prev AS (SELECT follow_email_sent_at FROM librishelf.users WHERE id = $1)
+    UPDATE librishelf.users u
+    SET follow_email_sent_at = now()
+    WHERE u.id = $1 AND u.follow_emails AND u.email_verified_at IS NOT NULL AND u.is_active IS NOT FALSE
+      AND (u.follow_email_sent_at IS NULL OR u.follow_email_sent_at <= now() - make_interval(secs => $2))
+      AND EXISTS (SELECT 1 FROM librishelf.follow_email_queue q WHERE q.user_id = u.id)
+    RETURNING u.id, u.name, u.email, u.email_locale, (SELECT follow_email_sent_at FROM prev) AS previous_sent_at, now() AS claimed_at
+  `,
+  RELEASE: 'UPDATE librishelf.users SET follow_email_sent_at = $2 WHERE id = $1',
+  // Avisos que ainda valem: pedido ainda pendente / seguir ainda aceito, sem bloqueio
+  PENDING_ITEMS: `
+    SELECT q.kind, q.actor_id, a.name AS actor, q.created_at
+    FROM librishelf.follow_email_queue q
+    JOIN librishelf.users a ON a.id = q.actor_id
+    WHERE q.user_id = $1
+      AND a.is_active IS NOT FALSE
+      AND (
+        (q.kind = 'request' AND EXISTS (SELECT 1 FROM librishelf.follows f
+          WHERE f.follower_id = q.actor_id AND f.followee_id = q.user_id AND f.status = 'pending'))
+        OR
+        (q.kind = 'accepted' AND EXISTS (SELECT 1 FROM librishelf.follows f
+          WHERE f.follower_id = q.user_id AND f.followee_id = q.actor_id AND f.status = 'accepted'))
+      )
+      AND NOT EXISTS (SELECT 1 FROM librishelf.blocks b
+        WHERE (b.blocker_id = q.user_id AND b.blocked_id = q.actor_id) OR (b.blocker_id = q.actor_id AND b.blocked_id = q.user_id))
+    ORDER BY q.created_at
+  `,
+  DELETE_UPTO: 'DELETE FROM librishelf.follow_email_queue WHERE user_id = $1 AND created_at <= $2',
+  SET_PREFS: `
+    UPDATE librishelf.users
+    SET follow_emails = COALESCE($2, follow_emails),
+        email_locale = COALESCE($3, email_locale),
+        updated_at = now()
+    WHERE id = $1
+    RETURNING follow_emails, email_locale
+  `
+}
diff --git a/backend/src/repositories/libraryRepository.js b/backend/src/repositories/libraryRepository.js
index f63d3d8a5e8511bdbfcc54f7f023765edc2d66b4..89b42cdc235dfe718215ec29a8837ad4c95c2638 100644
--- a/backend/src/repositories/libraryRepository.js
+++ b/backend/src/repositories/libraryRepository.js
@@ -1,5 +1,5 @@
 import { db } from "../database/connection.js"
-import { LIBRARY_QUERIES as q } from "../database/queries.js"
+import { LIBRARY_QUERIES as q, META_QUERIES } from "../database/queries.js"
 import { resolvePagination } from "../utils/pagination.js"
 import STATUS from "../utils/statusCodes.js"
 import { parseNameList } from "../utils/nameList.js"
@@ -282,6 +282,10 @@ async function batchDelete(ids) {
   return result.rowCount
 }
 
+async function touchBook(bookId) {
+  await db.query(META_QUERIES.TOUCH_BOOK, [bookId])
+}
+
 async function pruneUserNames(userId) {
   await db.query(q.PRUNE_USER_NAMES, [userId])
 }
@@ -305,5 +309,6 @@ export {
   batchAddTag,
   batchRemoveTag,
   batchDelete,
-  pruneUserNames
+  pruneUserNames,
+  touchBook
 }
\ No newline at end of file
diff --git a/backend/src/routes/auth.js b/backend/src/routes/auth.js
index f729481216009b9b9fbb20d72a4aaaccb5dfa38b..00e8a0b9179bb4bc0570e6b3eb1e19c9a2518afd 100644
--- a/backend/src/routes/auth.js
+++ b/backend/src/routes/auth.js
@@ -171,6 +171,15 @@ router.patch('/me/visibility', authenticateToken, async (req, res) => {
   }
 })
 
+// Avisos por e-mail: { followEmails?: boolean, locale?: 'pt' | 'en' }
+router.patch('/me/notifications', authenticateToken, async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await authService.setNotifications(req.user.id, req.body ?? {}))
+  } catch (error) {
+    sendError(res, error, 'Erro ao alterar avisos por e-mail')
+  }
+})
+
 router.delete('/me', authenticateToken, sensitiveLimiter, async (req, res) => {
   try {
     const { password } = req.body ?? {}
diff --git a/backend/src/routes/email.js b/backend/src/routes/email.js
new file mode 100644
index 0000000000000000000000000000000000000000..3188702db621a79d162e46801e4b99d1981d7b16
--- /dev/null
+++ b/backend/src/routes/email.js
@@ -0,0 +1,51 @@
+import express from 'express'
+import { tokenLimiter } from '../middlewares/rateLimiter.js'
+import { readUnsubscribeToken } from '../utils/unsubscribeToken.js'
+import * as followEmailService from '../services/followEmailService.js'
+import STATUS from '../utils/statusCodes.js'
+import { errorBody } from '../utils/httpError.js'
+import sendError from '../utils/sendError.js'
+
+const router = express.Router()
+
+/**
+ * Descadastro dos avisos por e-mail, sem login (o token identifica a pessoa).
+ *
+ * POST /email/unsubscribe?token=… — é a URL do cabeçalho List-Unsubscribe: o
+ * Gmail/Apple Mail fazem um POST nela com "List-Unsubscribe=One-Click" no
+ * corpo (RFC 8058). Também é o que a página /unsubscribe do app chama.
+ * Responde 200 sem redirecionar. GET não descadastra (antivírus e prévias de
+ * link abrem URLs sozinhos): quem abre o link pelo navegador cai na página do app.
+ */
+function userFromToken(req) {
+  return readUnsubscribeToken(String(req.query.token ?? req.body?.token ?? ''))
+}
+
+function invalidToken(res) {
+  return res.status(STATUS.BAD_REQUEST).json(errorBody('Link de descadastro inválido.', 'UNSUBSCRIBE_TOKEN_INVALID'))
+}
+
+router.post('/unsubscribe', tokenLimiter, async (req, res) => {
+  try {
+    const userId = userFromToken(req)
+    if (!userId) return invalidToken(res)
+    await followEmailService.setPreferences(userId, { followEmails: false })
+    res.status(STATUS.OK).json({ followEmails: false })
+  } catch (error) {
+    sendError(res, error, 'Erro ao descadastrar dos avisos')
+  }
+})
+
+// "Desfazer" na página do app, logo depois de descadastrar
+router.post('/resubscribe', tokenLimiter, async (req, res) => {
+  try {
+    const userId = userFromToken(req)
+    if (!userId) return invalidToken(res)
+    await followEmailService.setPreferences(userId, { followEmails: true })
+    res.status(STATUS.OK).json({ followEmails: true })
+  } catch (error) {
+    sendError(res, error, 'Erro ao reativar os avisos')
+  }
+})
+
+export default router
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 200801a54619eacee3480d48dad407f23c278d46..b301739650875739c41196a4c10a703029a12263 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -251,6 +251,8 @@ router.post('/:id/cover', validateNumericId(), uploadLimiter, handleUpload(uploa
     await libraryService.checkBookOwnership(id, userId)
 
     await saveBookCover(req.file.buffer, id)
+    // Capa nova: a prévia da biblioteca pública (mosaico) ganha versão nova
+    await libraryService.touchBook(id)
 
     logger.info('Capa processada (jpg + avif)', { bookId: id, userId })
 
diff --git a/backend/src/routes/meta.js b/backend/src/routes/meta.js
index 3d094670c9303c77c51e21f5fa7b4c91f6fed26a..a7f56bfadaad588dcc1eddb5872e3e2f7143b84d 100644
--- a/backend/src/routes/meta.js
+++ b/backend/src/routes/meta.js
@@ -1,14 +1,15 @@
 import express from 'express'
-import { metaLimiter } from '../middlewares/rateLimiter.js'
+import { metaLimiter, publicLimiter } from '../middlewares/rateLimiter.js'
 import * as metaService from '../services/metaService.js'
 import logger from '../utils/logger.js'
 
 const router = express.Router()
 
 /**
- * GET /meta/u/:username → trecho HTML para o <head> de /u/<usuário>.
- * Quem chama é o nginx do frontend (SSI, location interna /__meta/). Em erro
- * responde 500 e o nginx usa o trecho padrão (noindex).
+ * GET /meta/u/:username → trecho HTML para o <head> de /u/<usuário> (robots
+ * e Open Graph). Quem chama é o nginx do frontend (SSI, location interna
+ * /__meta/). Em erro responde 500 e o nginx usa o trecho padrão (noindex +
+ * tags genéricas).
  */
 router.get('/u/:username', metaLimiter, async (req, res) => {
   try {
@@ -21,4 +22,22 @@ router.get('/u/:username', metaLimiter, async (req, res) => {
   }
 })
 
+/**
+ * GET /meta/u/:username/image.jpg → mosaico das capas (og:image, 1200×630).
+ * Público (quem busca é o WhatsApp, Facebook…). A URL leva ?v= com a versão
+ * da estante, então dá para guardar em cache por bastante tempo.
+ */
+router.get('/u/:username/image.jpg', publicLimiter, async (req, res) => {
+  try {
+    const image = await metaService.libraryImage(req.params.username)
+    if (!image) return res.status(404).type('text').send('Not found')
+    res.set('Cache-Control', 'public, max-age=86400')
+    res.set('ETag', `"${image.version}"`)
+    res.type('jpeg').send(image.buffer)
+  } catch (error) {
+    logger.error('Erro ao montar a imagem da prévia', { error: error.message })
+    res.status(500).type('text').send('')
+  }
+})
+
 export default router
diff --git a/backend/src/scripts/previewEmails.js b/backend/src/scripts/previewEmails.js
index a62522d61843a9b5062f377060dd5821551de113..a5e905843f74149f8f196fbb052fe12139da5cdf 100644
--- a/backend/src/scripts/previewEmails.js
+++ b/backend/src/scripts/previewEmails.js
@@ -7,7 +7,7 @@
 import fs from 'node:fs'
 import os from 'node:os'
 import path from 'node:path'
-import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail } from '../services/emailTemplates.js'
+import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail, followDigestEmail } from '../services/emailTemplates.js'
 
 const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'librishelf-emails'))
 fs.mkdirSync(outDir, { recursive: true })
@@ -20,7 +20,10 @@ const emails = {
   'verificar-en': verifyEmailEmail({ name: 'Rodrigo', link: `${base}/verify-email?token=${token}`, locale: 'en' }),
   'senha-pt': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'pt' }),
   'senha-en': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'en' }),
-  'email-trocado-pt': emailChangedEmail({ name: 'Rodrigo', link: `${base}/forgot-password`, locale: 'pt', newEmail: 'ro•••@gmail.com' })
+  'email-trocado-pt': emailChangedEmail({ name: 'Rodrigo', link: `${base}/forgot-password`, locale: 'pt', newEmail: 'ro•••@gmail.com' }),
+  'seguidores-1-pt': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=requests`, locale: 'pt', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'request', actor: 'jesteves' }] }),
+  'seguidores-varios-pt': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=requests`, locale: 'pt', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'request', actor: 'jesteves' }, { kind: 'request', actor: 'marina.lê' }, { kind: 'accepted', actor: 'caio_r' }] }),
+  'seguidores-aceito-en': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=following`, locale: 'en', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'accepted', actor: 'jesteves' }] })
 }
 
 for (const [file, mail] of Object.entries(emails)) {
diff --git a/backend/src/server.js b/backend/src/server.js
index f6c42447f38ee85b6066623254772799105b9568..5a276cfec3f670b62a353e21807b6c227b66db68 100644
--- a/backend/src/server.js
+++ b/backend/src/server.js
@@ -3,6 +3,7 @@ import logger from './utils/logger.js'
 import { db } from './database/connection.js'
 import { pendingMigrations } from './database/migrate.js'
 import { verifySmtp } from './services/mailService.js'
+import { startSweeper as startFollowEmails, stopSweeper as stopFollowEmails } from './services/followEmailService.js'
 import { deleteStale as deleteStaleTokens } from './repositories/tokenRepository.js'
 
 const PORT = process.env.PORT || 3050
@@ -69,6 +70,9 @@ setInterval(() => {
     .catch(err => logger.warn('Falha ao limpar links de e-mail antigos', { message: err.message }))
 }, TOKEN_CLEANUP_MS).unref()
 
+// Avisos por e-mail de seguidores que esperavam o intervalo mínimo
+startFollowEmails()
+
 // `docker stop` manda SIGTERM: para de aceitar conexões, termina as requisições
 // em andamento e fecha o pool antes de sair, em vez de esperar o SIGKILL.
 let shuttingDown = false
@@ -78,6 +82,7 @@ function shutdown(signal) {
   shuttingDown = true
 
   logger.info('Encerrando', { signal })
+  stopFollowEmails()
 
   const forceExit = setTimeout(() => {
     logger.error('Encerramento demorou demais; saindo à força')
diff --git a/backend/src/services/authService.js b/backend/src/services/authService.js
index ba7f612103e9c78f5a2dc26fec1beeafbab76fcb..a04fca9f98e7b20133b73cc63587b538f8f8d9a3 100644
--- a/backend/src/services/authService.js
+++ b/backend/src/services/authService.js
@@ -9,6 +9,7 @@ import crypto from 'node:crypto'
 import * as tokenRepository from '../repositories/tokenRepository.js'
 import { sendMail } from './mailService.js'
 import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail } from './emailTemplates.js'
+import * as followEmailService from './followEmailService.js'
 import { httpError } from '../utils/httpError.js'
 import { isReservedUsername } from '../utils/reservedNames.js'
 
@@ -65,6 +66,7 @@ function toProfile(user) {
     showInCommunity: Boolean(user.show_in_community),
     showActivity: Boolean(user.show_activity),
     allowIndexing: Boolean(user.allow_indexing),
+    followEmails: Boolean(user.follow_emails),
     emailVerified: Boolean(user.email_verified_at)
   }
 }
@@ -318,6 +320,34 @@ async function setPrivacy(userId, body = {}) {
   }
 }
 
+/**
+ * Avisos por e-mail (opt-in): followEmails liga/desliga os avisos de
+ * seguidores; locale é o idioma dos e-mails (o do app quando ligou).
+ * Ligar exige e-mail confirmado.
+ */
+async function setNotifications(userId, body = {}) {
+  const { followEmails, locale } = body
+  if (followEmails === undefined && locale === undefined) {
+    throw httpError('Nada para alterar.', STATUS.BAD_REQUEST, 'NOTHING_TO_UPDATE')
+  }
+  if (followEmails !== undefined && typeof followEmails !== 'boolean') {
+    throw httpError("Campo 'followEmails' precisa ser true ou false.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'followEmails' })
+  }
+  if (locale !== undefined && !['pt', 'en'].includes(locale)) {
+    throw httpError("Campo 'locale' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'locale' })
+  }
+  if (followEmails === true) {
+    const user = await authRepository.getUserById(userId)
+    if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
+    if (!user.email_verified_at) {
+      throw httpError('Confirme seu e-mail para receber avisos.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_NOTIFY')
+    }
+  }
+  const result = await followEmailService.setPreferences(userId, { followEmails, locale })
+  if (!result) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
+  return result
+}
+
 /** ro•••@gmail.com: o aviso ao e-mail antigo não entrega o endereço novo inteiro. */
 function maskEmail(email) {
   const [local, domain] = String(email).split('@')
@@ -433,6 +463,7 @@ export {
   changeEmail,
   changeUsername,
   setPrivacy,
+  setNotifications,
   deleteAccount,
   USERNAME_PATTERN
 }
diff --git a/backend/src/services/dataService.js b/backend/src/services/dataService.js
index 47cbdcfa373bd30f507a9352a4b49bdaf10e358d..066299bc4e8c29540b08aa0a492faa030a36a7fa 100644
--- a/backend/src/services/dataService.js
+++ b/backend/src/services/dataService.js
@@ -53,7 +53,8 @@ export async function exportJson(userId) {
       isPublic: user.is_public,
       showInCommunity: user.show_in_community,
       showActivity: user.show_activity,
-      allowIndexing: user.allow_indexing
+      allowIndexing: user.allow_indexing,
+      followEmails: user.follow_emails
     },
     readingGoals: goals,
     books: books.map(book => ({
diff --git a/backend/src/services/emailTemplates.js b/backend/src/services/emailTemplates.js
index c20f3161351f960b56960e7848590b6d5d36bc96..639d0f2cdefbf657e599590374374ffc89a92670 100644
--- a/backend/src/services/emailTemplates.js
+++ b/backend/src/services/emailTemplates.js
@@ -65,6 +65,22 @@ const TEXTS = {
       note: 'Redefinir a senha derruba todas as sessões abertas.',
       ignore: 'Se foi você quem trocou, pode ignorar este aviso.'
     },
+    follow: {
+      subject: ({ items }) => followSubjectPt(items),
+      preheader: ({ items }) => items.map(item => followLinePt(item)).join(' · '),
+      title: 'Novidades dos seus leitores',
+      greeting: name => `Olá, ${name}!`,
+      body: ({ items }) => (items.some(item => item.kind === 'request')
+        ? 'Pedidos para seguir precisam da sua aprovação. Você decide quem acompanha suas leituras.'
+        : 'Agora você acompanha as leituras dessas pessoas na comunidade.'),
+      line: item => followLinePt(item),
+      button: ({ items }) => (items.some(item => item.kind === 'request') ? 'Ver pedidos' : 'Abrir a comunidade'),
+      note: ({ hours }) => `Você recebe no máximo um destes avisos a cada ${hours} horas; o que acontecer nesse meio-tempo vem junto no próximo.`,
+      unsubscribe: 'Não quer mais estes avisos?',
+      unsubscribeLink: 'Descadastrar com um clique',
+      manage: 'Você também pode mudar isso na Conta, em Avisos por e-mail.',
+      footer: 'Você recebeu este e-mail porque ativou os avisos de seguidores no Librishelf. Este é um endereço automático: respostas não são lidas.'
+    },
     fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
     tagline: 'Sua biblioteca pessoal, organizada.',
     footer: 'Você recebeu este e-mail porque ele está cadastrado no Librishelf. Este é um endereço automático: respostas não são lidas.'
@@ -100,12 +116,54 @@ const TEXTS = {
       note: 'Resetting your password signs out every open session.',
       ignore: 'If you made this change, you can ignore this notice.'
     },
+    follow: {
+      subject: ({ items }) => followSubjectEn(items),
+      preheader: ({ items }) => items.map(item => followLineEn(item)).join(' · '),
+      title: 'News from your readers',
+      greeting: name => `Hi, ${name}!`,
+      body: ({ items }) => (items.some(item => item.kind === 'request')
+        ? 'Follow requests need your approval. You decide who keeps up with your reading.'
+        : "You now follow these readers' activity in the community."),
+      line: item => followLineEn(item),
+      button: ({ items }) => (items.some(item => item.kind === 'request') ? 'See requests' : 'Open the community'),
+      note: ({ hours }) => `You get at most one of these emails every ${hours} hours; anything that happens in between comes in the next one.`,
+      unsubscribe: "Don't want these emails anymore?",
+      unsubscribeLink: 'Unsubscribe in one click',
+      manage: 'You can also change this in Account, under Email notifications.',
+      footer: "You're receiving this email because you turned on follower notifications on Librishelf. This is an automated address: replies are not read."
+    },
     fallback: "If the button doesn't work, copy and paste this address into your browser:",
     tagline: 'Your personal library, organized.',
     footer: "You're receiving this email because it is registered on Librishelf. This is an automated address: replies are not read."
   }
 }
 
+function followLinePt({ kind, actor }) {
+  return kind === 'request' ? `${actor} pediu para seguir você` : `${actor} aceitou seu pedido para seguir`
+}
+
+function followLineEn({ kind, actor }) {
+  return kind === 'request' ? `${actor} asked to follow you` : `${actor} accepted your follow request`
+}
+
+function followSubjectPt(items) {
+  const requests = items.filter(item => item.kind === 'request')
+  const accepted = items.filter(item => item.kind === 'accepted')
+  if (items.length === 1) return `${followLinePt(items[0])} no Librishelf`
+  if (accepted.length === 0) return `${requests.length} pedidos para seguir você no Librishelf`
+  if (requests.length === 0) return `${accepted.length} pedidos seus foram aceitos no Librishelf`
+  return 'Novidades dos seus leitores no Librishelf'
+}
+
+function followSubjectEn(items) {
+  const requests = items.filter(item => item.kind === 'request')
+  const accepted = items.filter(item => item.kind === 'accepted')
+  if (items.length === 1) return `${followLineEn(items[0])} on Librishelf`
+  if (accepted.length === 0) return `${requests.length} people asked to follow you on Librishelf`
+  if (requests.length === 0) return `${accepted.length} of your follow requests were accepted on Librishelf`
+  return 'News from your readers on Librishelf'
+}
+
 export function normalizeLocale(locale) {
   return String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'pt'
 }
@@ -119,7 +177,7 @@ function logoUrl() {
   return process.env.MAIL_LOGO_URL?.trim() || 'https://librishelf.com/bookshelf.png'
 }
 
-function layout({ locale, lang, t, name, link }) {
+function layout({ locale, lang, t, name, link, items = [], unsubscribe = null }) {
   const url = escapeHtml(link)
   const home = escapeHtml(siteUrl())
   const homeLabel = escapeHtml(siteUrl().replace(/^https?:\/\//, ''))
@@ -161,8 +219,12 @@ function layout({ locale, lang, t, name, link }) {
             <td class="px" bgcolor="${BRAND.card}" style="background:${BRAND.card};padding:40px 48px 12px;font-family:${SANS};color:${BRAND.ink}">
               <h1 class="title" style="margin:0 0 20px;font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:normal;color:${BRAND.ink}">${escapeHtml(t.title)}</h1>
               <p style="margin:0 0 12px;font-size:16px;line-height:1.6;font-weight:bold">${escapeHtml(t.greeting(name))}</p>
-              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.body)}</p>
-
+              <p style="margin:0 0 ${items.length ? 16 : 28}px;font-size:16px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.body)}</p>
+${items.length ? `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px">${items.map(line => `
+                <tr><td style="padding:10px 14px;border-left:3px solid ${BRAND.button};background:${BRAND.tint};font-size:15px;line-height:1.5;color:${BRAND.ink}">${escapeHtml(line)}</td></tr>
+                <tr><td style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>`).join('')}
+              </table>
+` : ''}
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                 <td align="center" bgcolor="${BRAND.button}" style="background:${BRAND.button};border-radius:10px">
                   <a href="${url}" target="_blank" style="display:block;padding:15px 28px;font-family:${SANS};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(t.button)}</a>
@@ -181,7 +243,9 @@ function layout({ locale, lang, t, name, link }) {
                   <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all"><a href="${url}" target="_blank" style="color:${BRAND.link};text-decoration:underline">${url}</a></p>
                 </td>
               </tr></table>
-              <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.ignore)}</p>
+              ${unsubscribe
+                ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.unsubscribe)} <a href="${escapeHtml(unsubscribe)}" target="_blank" style="color:${BRAND.link};text-decoration:underline">${escapeHtml(t.unsubscribeLink)}</a>. ${escapeHtml(t.manage)}</p>`
+                : `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.ignore)}</p>`}
             </td>
           </tr>
 
@@ -189,7 +253,7 @@ function layout({ locale, lang, t, name, link }) {
           <tr>
             <td align="center" style="padding:24px 24px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.soft}">
               <a href="${home}" target="_blank" style="font-family:${SERIF};font-size:15px;color:${BRAND.ink};text-decoration:none">Librishelf</a><span style="color:#a1a1aa">&nbsp;&middot;&nbsp;</span><a href="${home}" target="_blank" style="color:${BRAND.soft};text-decoration:underline">${homeLabel}</a>
-              <p style="margin:10px auto 0;max-width:420px">${escapeHtml(lang.footer)}</p>
+              <p style="margin:10px auto 0;max-width:420px">${escapeHtml(t.footer || lang.footer)}</p>
             </td>
           </tr>
 
@@ -201,11 +265,20 @@ function layout({ locale, lang, t, name, link }) {
 </html>`
 }
 
-function build(kind, { name, link, locale, ...extra }) {
+function build(kind, { name, link, locale, unsubscribe = null, ...extra }) {
   const code = normalizeLocale(locale)
   const lang = TEXTS[code]
   const base = lang[kind]
-  const t = { ...base, body: typeof base.body === 'function' ? base.body(extra) : base.body }
+  const resolve = value => (typeof value === 'function' ? value(extra) : value)
+  const t = {
+    ...base,
+    subject: resolve(base.subject),
+    preheader: resolve(base.preheader),
+    body: resolve(base.body),
+    button: resolve(base.button),
+    note: resolve(base.note)
+  }
+  const items = base.line ? (extra.items || []).map(item => base.line(item)) : []
 
   const text = [
     t.title,
@@ -213,22 +286,28 @@ function build(kind, { name, link, locale, ...extra }) {
     t.greeting(name),
     '',
     t.body,
+    ...(items.length ? ['', ...items.map(line => `• ${line}`)] : []),
     '',
     `${t.button}:`,
     link,
     '',
     t.note,
     '',
-    t.ignore,
+    unsubscribe ? `${t.unsubscribe} ${t.unsubscribeLink}: ${unsubscribe}` : t.ignore,
     '',
     '— Librishelf',
     siteUrl()
   ].join('\n')
 
-  return { subject: t.subject, text, html: layout({ locale: code, lang, t, name, link }) }
+  return { subject: t.subject, text, html: layout({ locale: code, lang, t, name, link, items, unsubscribe }) }
 }
 
 export const resetPasswordEmail = params => build('reset', params)
 export const verifyEmailEmail = params => build('verify', params)
 /** Aviso ao endereço antigo: { name, link, locale, newEmail } (newEmail já mascarado). */
-export const emailChangedEmail = params => build('changed', params)
\ No newline at end of file
+export const emailChangedEmail = params => build('changed', params)
+/**
+ * Avisos de seguidores juntos num e-mail só:
+ * { name, link, locale, items: [{ kind: 'request'|'accepted', actor }], hours, unsubscribe }
+ */
+export const followDigestEmail = params => build('follow', params)
\ No newline at end of file
diff --git a/backend/src/services/followEmailService.js b/backend/src/services/followEmailService.js
new file mode 100644
index 0000000000000000000000000000000000000000..c54cc8593681fbba2daf3c328b4666c3fa80f183
--- /dev/null
+++ b/backend/src/services/followEmailService.js
@@ -0,0 +1,145 @@
+import { db } from '../database/connection.js'
+import { FOLLOW_EMAIL_QUERIES as q } from '../database/queries.js'
+import { sendMail } from './mailService.js'
+import { followDigestEmail } from './emailTemplates.js'
+import { createUnsubscribeToken } from '../utils/unsubscribeToken.js'
+import logger from '../utils/logger.js'
+
+/**
+ * Aviso por e-mail de seguidores (opt-in na Conta): alguém pediu para seguir
+ * você / aceitou o seu pedido.
+ *
+ * Cada aviso entra numa fila (follow_email_queue). Quem não recebeu nenhum
+ * nas últimas N horas (FOLLOW_EMAIL_INTERVAL_HOURS, padrão 6) recebe na hora;
+ * senão os avisos esperam e vão juntos quando o intervalo acaba (a fila é
+ * conferida a cada poucos minutos). Aviso que deixou de valer (pedido
+ * cancelado ou recusado, bloqueio) não é enviado.
+ */
+
+const DEFAULT_INTERVAL_HOURS = 6
+const SWEEP_MS = 5 * 60 * 1000
+
+let sweepTimer = null
+
+export function intervalHours() {
+  const hours = Number(process.env.FOLLOW_EMAIL_INTERVAL_HOURS)
+  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_INTERVAL_HOURS
+}
+
+const intervalSeconds = () => Math.round(intervalHours() * 3600)
+
+function siteUrl() {
+  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
+}
+
+export function unsubscribeUrls(userId) {
+  const token = encodeURIComponent(createUnsubscribeToken(userId))
+  return {
+    // Página do app (link no corpo do e-mail)
+    page: `${siteUrl()}/unsubscribe?token=${token}`,
+    // Endpoint do descadastro de um clique (cabeçalho List-Unsubscribe)
+    oneClick: `${siteUrl()}/api/email/unsubscribe?token=${token}`
+  }
+}
+
+/** Põe o aviso na fila (se a pessoa quer) e tenta mandar na hora. */
+export async function notify(userId, kind, actorId) {
+  try {
+    const { rows } = await db.query(q.ENQUEUE, [userId, kind, actorId])
+    if (rows.length) await deliver(userId)
+  } catch (err) {
+    // Aviso é extra: nunca derruba o seguir/aceitar
+    logger.error('Aviso de seguidor não entrou na fila', { userId, kind, message: err.message })
+  }
+}
+
+/** O aviso deixou de valer (pedido cancelado ou recusado). */
+export async function withdraw(userId, kind, actorId) {
+  await db.query(q.DEQUEUE, [userId, kind, actorId]).catch(err => {
+    logger.warn('Aviso de seguidor não saiu da fila', { userId, kind, message: err.message })
+  })
+}
+
+/** Bloqueio: some qualquer aviso entre os dois. */
+export async function withdrawPair(userA, userB) {
+  await db.query(q.DEQUEUE_PAIR, [userA, userB]).catch(err => {
+    logger.warn('Avisos do bloqueio não saíram da fila', { message: err.message })
+  })
+}
+
+export async function clearQueue(userId) {
+  await db.query(q.CLEAR_USER, [userId])
+}
+
+/**
+ * Manda o e-mail de quem tem aviso na fila e já pode receber. Devolve true se
+ * mandou. Seguro com chamadas em paralelo: só uma consegue "reservar" o envio.
+ */
+export async function deliver(userId) {
+  const { rows: [user] } = await db.query(q.CLAIM, [userId, intervalSeconds()])
+  if (!user) return false
+
+  // Hora do banco (não a do Node): o que entrar na fila depois disso fica para o próximo
+  const startedAt = user.claimed_at
+  const { rows: items } = await db.query(q.PENDING_ITEMS, [userId])
+  if (items.length === 0) {
+    // Tudo deixou de valer: limpa e devolve a "vez" (não conta como e-mail enviado)
+    await db.query(q.DELETE_UPTO, [userId, startedAt])
+    await db.query(q.RELEASE, [userId, user.previous_sent_at])
+    return false
+  }
+
+  const hasRequest = items.some(item => item.kind === 'request')
+  const urls = unsubscribeUrls(userId)
+  const mail = followDigestEmail({
+    name: user.name,
+    locale: user.email_locale,
+    link: `${siteUrl()}/community?tab=${hasRequest ? 'requests' : 'following'}`,
+    items: items.map(item => ({ kind: item.kind, actor: item.actor })),
+    hours: intervalHours(),
+    unsubscribe: urls.page
+  })
+
+  try {
+    await sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html, unsubscribeUrl: urls.oneClick })
+  } catch (err) {
+    // Falhou: os avisos ficam na fila e a próxima varredura tenta de novo
+    await db.query(q.RELEASE, [userId, user.previous_sent_at])
+    logger.error('Aviso de seguidor não foi enviado', { userId, message: err.message })
+    return false
+  }
+
+  await db.query(q.DELETE_UPTO, [userId, startedAt])
+  logger.info('Aviso de seguidor enviado', { userId, items: items.length })
+  return true
+}
+
+/** Varredura: manda para quem tem aviso esperando e já passou do intervalo. */
+export async function deliverDue() {
+  const { rows } = await db.query(q.DUE_USERS, [intervalSeconds()])
+  let sent = 0
+  for (const { user_id: userId } of rows) {
+    if (await deliver(userId)) sent++
+  }
+  return sent
+}
+
+export function startSweeper() {
+  if (sweepTimer || process.env.NODE_ENV === 'test') return
+  sweepTimer = setInterval(() => {
+    deliverDue().catch(err => logger.error('Varredura dos avisos por e-mail falhou', { message: err.message }))
+  }, SWEEP_MS)
+  sweepTimer.unref()
+}
+
+export function stopSweeper() {
+  clearInterval(sweepTimer)
+  sweepTimer = null
+}
+
+/** Opção na Conta → { followEmails, locale } */
+export async function setPreferences(userId, { followEmails, locale }) {
+  const { rows } = await db.query(q.SET_PREFS, [userId, followEmails ?? null, locale ?? null])
+  if (followEmails === false) await clearQueue(userId)
+  return rows[0] ? { followEmails: rows[0].follow_emails, locale: rows[0].email_locale } : null
+}
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index 258eaa3931000cc38d5c6ba7d68677bbbdd57109..e43453f1bdc2cedc3cf36033c73aa7d61ef01a5d 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -291,6 +291,10 @@ async function setReadingStatus(bookId, userId, rawStatus, rawDate) {
   return readingService.setStatus(bookId, userId, rawStatus, rawDate)
 }
 
+async function touchBook(bookId) {
+  await libraryRepository.touchBook(bookId)
+}
+
 async function getSeries(userId) {
   return await libraryRepository.getSeriesByUser(userId)
 }
@@ -361,6 +365,7 @@ export {
   markBookAsUnread,
   setReadingStatus,
   getSeries,
+  touchBook,
   batchUpdate,
   setRating,
   getPublicLibraryByUsername,
diff --git a/backend/src/services/mailService.js b/backend/src/services/mailService.js
index 9d0ee74f62c82a05cc8a449ae1bd76c2b2052a6e..1576fa0f5c196eb393335e4c75fbc535fe8500ba 100644
--- a/backend/src/services/mailService.js
+++ b/backend/src/services/mailService.js
@@ -43,10 +43,19 @@ export function testOutbox() {
   return outbox
 }
 
-/** Envia (ou registra no log, sem SMTP). Lança erro se o servidor SMTP recusar. */
-export async function sendMail({ to, subject, text, html }) {
+/**
+ * Envia (ou registra no log, sem SMTP). Lança erro se o servidor SMTP recusar.
+ * `unsubscribeUrl` (avisos): cabeçalhos List-Unsubscribe e
+ * List-Unsubscribe-Post para o descadastro de um clique do Gmail, Yahoo,
+ * Apple Mail… (RFC 8058). O provedor faz um POST nessa URL.
+ *   https://www.rfc-editor.org/rfc/rfc8058
+ */
+export async function sendMail({ to, subject, text, html, unsubscribeUrl }) {
+  const headers = unsubscribeUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
+  const list = unsubscribeUrl ? { unsubscribe: unsubscribeUrl } : undefined
+
   if (process.env.NODE_ENV === 'test') {
-    outbox.push({ to, subject, text, html })
+    outbox.push({ to, subject, text, html, headers, list })
     return
   }
 
@@ -55,7 +64,7 @@ export async function sendMail({ to, subject, text, html }) {
     return
   }
 
-  const info = await getTransport().sendMail({ from: sender(), to, subject, text, html })
+  const info = await getTransport().sendMail({ from: sender(), to, subject, text, html, headers, list })
   logger.info('E-mail enviado', { to, subject, messageId: info.messageId })
 }
 
diff --git a/backend/src/services/metaService.js b/backend/src/services/metaService.js
index 00dcf99f8fcf76139f6d70bb6e49e942524aa932..e29252255a0af4889d9885b296fdbbea11909b63 100644
--- a/backend/src/services/metaService.js
+++ b/backend/src/services/metaService.js
@@ -1,23 +1,240 @@
+import fs from 'node:fs/promises'
+import path from 'node:path'
+import sharp from 'sharp'
 import * as authRepository from '../repositories/authRepository.js'
+import { db } from '../database/connection.js'
+import { META_QUERIES as q } from '../database/queries.js'
+import UPLOAD_DIR from '../config/uploadDir.js'
 
 /**
  * Trecho de <head> que o nginx do frontend injeta (SSI) no index.html de
- * /u/<usuário>. O SPA sozinho não serve: o Google pode nem executar o
- * JavaScript de uma página que chega com noindex, então a decisão de aparecer
- * em buscadores precisa estar no HTML que sai do servidor.
+ * /u/<usuário>. O SPA sozinho não serve:
+ *   - o Google pode nem executar o JavaScript de uma página que chega com
+ *     noindex, então a decisão de aparecer em buscadores precisa estar no
+ *     HTML que sai do servidor;
+ *   - o WhatsApp (e Facebook, Telegram, Slack…) só lê as tags Open Graph do
+ *     HTML, sem rodar JavaScript.
  *
- * Regra: só sai "index" para biblioteca pública, de conta ativa, cujo dono
- * ligou "aparecer em buscadores". Privada e inexistente dão a mesma resposta
- * (não revela quem existe).
+ * Biblioteca pública de conta ativa: robots (index só com "aparecer em
+ * buscadores"), título/descrição com o número de livros e um mosaico das
+ * capas como imagem. Privada e inexistente dão a mesma resposta genérica (não
+ * revela quem existe).
+ *   https://ogp.me/
  */
 export const ROBOTS_NOINDEX = '<meta name="robots" content="noindex, nofollow">'
 export const ROBOTS_INDEX = '<meta name="robots" content="index, follow">'
 
 const USERNAME = /^[A-Za-z0-9._-]{1,40}$/
 
-export async function libraryHead(username) {
-  if (typeof username !== 'string' || !USERNAME.test(username)) return ROBOTS_NOINDEX
+// Mosaico: 1200×630 (1,91:1, o formato das prévias) e JPEG enxuto — o
+// WhatsApp comprime a imagem e prefere arquivos pequenos (bem abaixo de 300 KB).
+export const IMAGE_WIDTH = 1200
+export const IMAGE_HEIGHT = 630
+const MAX_COVERS = 10
+const COVER_CANDIDATES = 40
+const IMAGE_CACHE_MAX = 50
+
+const imageCache = new Map()
+
+const escapeAttr = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
+
+function siteUrl() {
+  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
+}
+
+const meta = (property, content) => `<meta property="${property}" content="${escapeAttr(content)}">`
+const metaName = (name, content) => `<meta name="${name}" content="${escapeAttr(content)}">`
+
+/**
+ * Tags genéricas do site — as mesmas do index.html (mantenha os dois iguais).
+ * Vão para /u/<nome> de biblioteca privada ou inexistente.
+ */
+export function defaultTags() {
+  const site = siteUrl()
+  return [
+    meta('og:type', 'website'),
+    meta('og:site_name', 'Librishelf'),
+    meta('og:title', 'Librishelf'),
+    meta('og:description', 'Sua biblioteca pessoal, em todo lugar.'),
+    meta('og:url', `${site}/`),
+    meta('og:image', `${site}/bookshelf.png`),
+    meta('og:image:alt', 'Ícone de estante de livros do Librishelf'),
+    meta('og:locale', 'pt_BR'),
+    meta('og:locale:alternate', 'en_US'),
+    metaName('twitter:card', 'summary')
+  ].join('')
+}
+
+async function findPublicLibrary(username) {
+  if (typeof username !== 'string' || !USERNAME.test(username)) return null
   const user = await authRepository.getUserByName(username)
-  const indexable = Boolean(user && user.is_public && user.allow_indexing && user.is_active !== false)
-  return indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX
+  if (!user || !user.is_public || user.is_active === false) return null
+  return user
+}
+
+async function libraryStats(userId) {
+  const { rows } = await db.query(q.LIBRARY_STATS, [userId])
+  return rows[0]
+}
+
+/** Até `limit` capas que existem no disco (as mais bem avaliadas e lidas por último primeiro). */
+async function coverFiles(userId, limit = MAX_COVERS) {
+  const { rows } = await db.query(q.COVER_CANDIDATES, [userId, COVER_CANDIDATES])
+  const files = []
+  for (const { id } of rows) {
+    const file = path.join(UPLOAD_DIR, `${id}.jpg`)
+    try {
+      await fs.access(file)
+      files.push(file)
+    } catch {
+      // Livro sem capa enviada: a capa desenhada só existe no navegador
+    }
+    if (files.length >= limit) break
+  }
+  return files
+}
+
+// Muda quando a estante muda: as prévias ficam em cache (no WhatsApp também),
+// então a URL da imagem leva a versão.
+const versionOf = stats => `${Number(stats.changed || 0).toString(36)}${Number(stats.total || 0).toString(36)}`
+
+function describe(name, stats) {
+  const total = Number(stats.total || 0)
+  const read = Number(stats.read || 0)
+  if (total === 0) return `Veja a biblioteca de ${name} no Librishelf.`
+  const books = total === 1 ? '1 livro na estante' : `${total} livros na estante`
+  const reads = read === 0 ? '' : read === 1 ? ' · 1 lido' : ` · ${read} lidos`
+  return `${books}${reads}. Veja a biblioteca de ${name} no Librishelf.`
+}
+
+/** Trecho do <head> de /u/<username>: robots + Open Graph. */
+export async function libraryHead(username) {
+  const user = await findPublicLibrary(username)
+  if (!user) return ROBOTS_NOINDEX + defaultTags()
+
+  const site = siteUrl()
+  const [stats, covers] = await Promise.all([libraryStats(user.id), coverFiles(user.id, 1)])
+  const title = `Biblioteca de ${user.name} · Librishelf`
+  const url = `${site}/u/${encodeURIComponent(user.name)}`
+
+  const tags = [
+    user.allow_indexing ? ROBOTS_INDEX : ROBOTS_NOINDEX,
+    meta('og:type', 'profile'),
+    meta('og:site_name', 'Librishelf'),
+    meta('og:title', title),
+    meta('og:description', describe(user.name, stats)),
+    meta('og:url', url),
+    meta('og:locale', 'pt_BR'),
+    meta('profile:username', user.name)
+  ]
+
+  if (covers.length > 0) {
+    const image = `${site}/api/meta/u/${encodeURIComponent(user.name)}/image.jpg?v=${versionOf(stats)}`
+    tags.push(
+      meta('og:image', image),
+      meta('og:image:type', 'image/jpeg'),
+      meta('og:image:width', String(IMAGE_WIDTH)),
+      meta('og:image:height', String(IMAGE_HEIGHT)),
+      meta('og:image:alt', `Capas de livros da biblioteca de ${user.name}`),
+      metaName('twitter:card', 'summary_large_image')
+    )
+  } else {
+    tags.push(
+      meta('og:image', `${site}/bookshelf.png`),
+      meta('og:image:alt', 'Ícone de estante de livros do Librishelf'),
+      metaName('twitter:card', 'summary')
+    )
+  }
+
+  return tags.join('')
+}
+
+// ------------------------------------------------------------------ imagem
+
+/** Posições das capas: uma fileira (até 5) ou duas (6 a 10), centralizadas. */
+export function layoutCovers(count) {
+  const padX = 64
+  const gap = 28
+  const shelf = 12
+  const rows = count > 5 ? 2 : 1
+  const perRow = Math.ceil(count / rows)
+  const maxHeight = rows === 1 ? 430 : 236
+  let width = Math.floor((IMAGE_WIDTH - padX * 2 - gap * (perRow - 1)) / perRow)
+  width = Math.min(width, Math.floor(maxHeight / 1.5))
+  const height = Math.round(width * 1.5)
+  const blockHeight = rows * height + (rows - 1) * (gap + shelf) + shelf
+  const top = Math.round((IMAGE_HEIGHT - blockHeight) / 2)
+
+  const slots = []
+  const rowsOut = []
+  for (let row = 0; row < rows; row++) {
+    const inRow = Math.min(perRow, count - row * perRow)
+    const rowWidth = inRow * width + (inRow - 1) * gap
+    const left = Math.round((IMAGE_WIDTH - rowWidth) / 2)
+    const y = top + row * (height + gap + shelf)
+    rowsOut.push({ left, top: y, width: rowWidth })
+    for (let col = 0; col < inRow; col++) slots.push({ left: left + col * (width + gap), top: y, width, height })
+  }
+  return { slots, rows: rowsOut, width, height }
+}
+
+function backgroundSvg({ rows, height }) {
+  // Uma prateleira sob cada fileira
+  const bars = rows.map(row => {
+    const x = row.left - 36
+    const w = row.width + 72
+    const y = row.top + height
+    return `<rect x="${x}" y="${y}" width="${w}" height="12" rx="3" fill="#3f3f46"/>` +
+      `<rect x="${x}" y="${y + 12}" width="${w}" height="6" rx="2" fill="#000" opacity="0.35"/>`
+  })
+  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}">` +
+    '<defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#27272a"/><stop offset="1" stop-color="#121214"/></radialGradient></defs>' +
+    `<rect width="100%" height="100%" fill="url(#g)"/>${bars.join('')}</svg>`)
+}
+
+async function buildMosaic(files) {
+  const layout = layoutCovers(files.length)
+  const covers = await Promise.all(files.map(async (file, i) => {
+    const slot = layout.slots[i]
+    const input = await sharp(file).resize(slot.width, slot.height, { fit: 'cover' }).jpeg().toBuffer()
+    return { input, left: slot.left, top: slot.top }
+  }))
+  // Sombra leve atrás de cada capa
+  const shadows = layout.slots.map(slot => ({
+    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${slot.width + 24}" height="${slot.height + 24}"><rect x="12" y="16" width="${slot.width}" height="${slot.height}" rx="4" fill="#000" opacity="0.45"/></svg>`),
+    left: slot.left - 12,
+    top: slot.top - 12
+  }))
+
+  return sharp(backgroundSvg(layout))
+    .composite([...shadows, ...covers])
+    .jpeg({ quality: 80, mozjpeg: true })
+    .toBuffer()
+}
+
+/**
+ * Mosaico das capas de uma biblioteca pública → { buffer, version } ou null
+ * (privada, inexistente ou sem nenhuma capa).
+ */
+export async function libraryImage(username) {
+  const user = await findPublicLibrary(username)
+  if (!user) return null
+  const stats = await libraryStats(user.id)
+  const version = versionOf(stats)
+  const key = `${user.id}:${version}`
+  const cached = imageCache.get(key)
+  if (cached) return { buffer: cached, version }
+
+  const files = await coverFiles(user.id)
+  if (files.length === 0) return null
+  const buffer = await buildMosaic(files)
+
+  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value)
+  imageCache.set(key, buffer)
+  return { buffer, version }
+}
+
+/** Só para testes. */
+export function clearImageCache() {
+  imageCache.clear()
 }
diff --git a/backend/src/services/socialService.js b/backend/src/services/socialService.js
index 3658cb5fb889d6cd7fb2709536a41245c8af9595..bf531df357b7fb341712c9e447e715798c3c8e3e 100644
--- a/backend/src/services/socialService.js
+++ b/backend/src/services/socialService.js
@@ -2,6 +2,7 @@ import * as socialRepository from '../repositories/socialRepository.js'
 import * as authRepository from '../repositories/authRepository.js'
 import STATUS from '../utils/statusCodes.js'
 import { httpError } from '../utils/httpError.js'
+import * as followEmails from './followEmailService.js'
 
 const FEED_PAGE_SIZE = 30
 
@@ -32,6 +33,8 @@ export async function requestFollow(viewerId, username) {
   }
 
   const status = await socialRepository.requestFollow(viewerId, target.id)
+  // Aviso por e-mail (se a pessoa quer); não espera o envio
+  if (status === 'pending') void followEmails.notify(target.id, 'request', viewerId)
   return { username: target.name, status }
 }
 
@@ -39,6 +42,8 @@ export async function requestFollow(viewerId, username) {
 export async function unfollow(viewerId, username) {
   const target = await findUser(username)
   await socialRepository.deleteFollow(viewerId, target.id, ['pending', 'accepted'])
+  await followEmails.withdraw(target.id, 'request', viewerId)
+  await followEmails.withdraw(viewerId, 'accepted', target.id)
   return { username: target.name, status: null }
 }
 
@@ -46,6 +51,8 @@ export async function acceptRequest(viewerId, username) {
   const follower = await findUser(username)
   const accepted = await socialRepository.acceptFollow(follower.id, viewerId)
   if (!accepted) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND, 'REQUEST_NOT_FOUND')
+  await followEmails.withdraw(viewerId, 'request', follower.id)
+  void followEmails.notify(follower.id, 'accepted', viewerId)
   return { username: follower.name, status: 'accepted' }
 }
 
@@ -53,12 +60,14 @@ export async function rejectRequest(viewerId, username) {
   const follower = await findUser(username)
   const removed = await socialRepository.deleteFollow(follower.id, viewerId, ['pending'])
   if (!removed) throw httpError('Pedido não encontrado.', STATUS.NOT_FOUND, 'REQUEST_NOT_FOUND')
+  await followEmails.withdraw(viewerId, 'request', follower.id)
 }
 
 export async function removeFollower(viewerId, username) {
   const follower = await findUser(username)
   const removed = await socialRepository.deleteFollow(follower.id, viewerId, ['accepted'])
   if (!removed) throw httpError('Seguidor não encontrado.', STATUS.NOT_FOUND, 'FOLLOWER_NOT_FOUND')
+  await followEmails.withdraw(follower.id, 'accepted', viewerId)
 }
 
 /**
@@ -70,6 +79,7 @@ export async function blockUser(viewerId, username) {
   const target = await findUser(username)
   if (target.id === viewerId) throw httpError('Você não pode bloquear a si mesmo.', STATUS.BAD_REQUEST, 'BLOCK_SELF')
   await socialRepository.block(viewerId, target.id)
+  await followEmails.withdrawPair(viewerId, target.id)
   return { username: target.name, blocked: true }
 }
 
diff --git a/backend/src/tests/integration/followEmails.test.js b/backend/src/tests/integration/followEmails.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..4cda53d1c71f0234e0d8a23389cb7b1744c033dc
--- /dev/null
+++ b/backend/src/tests/integration/followEmails.test.js
@@ -0,0 +1,161 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { db } from '../../database/connection.js'
+import { testOutbox } from '../../services/mailService.js'
+import { deliverDue } from '../../services/followEmailService.js'
+import { createUnsubscribeToken } from '../../utils/unsubscribeToken.js'
+import { confirmEmail } from '../helpers/confirmEmail.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+const tokens = {}
+const ids = {}
+const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
+const prefs = (user, body) => request(app).patch('/auth/me/notifications').set(auth(user)).send(body)
+const follow = (who, whom) => request(app).post(`/social/follow/${whom}`).set(auth(who))
+
+async function signUp(name, { verified = true } = {}) {
+  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
+  if (verified) await confirmEmail(name)
+  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
+  const { rows } = await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])
+  ids[name] = rows[0].id
+  // Aceita seguidores
+  if (verified) await request(app).patch('/auth/me/visibility').set(auth(name)).send({ showActivity: true })
+}
+
+const mailsTo = name => testOutbox().filter(mail => mail.to === `${name}@example.com`)
+
+// O envio não segura a resposta da API: espera um pouco
+async function waitFor(check, ms = 1500) {
+  const until = Date.now() + ms
+  while (Date.now() < until) {
+    if (check()) return true
+    await new Promise(resolve => setTimeout(resolve, 20))
+  }
+  return check()
+}
+
+const queueOf = async name => (await db.query('SELECT kind, actor_id FROM librishelf.follow_email_queue WHERE user_id = $1', [ids[name]])).rows
+// Simula que o último e-mail foi há mais tempo que o intervalo
+const pastInterval = name => db.query("UPDATE librishelf.users SET follow_email_sent_at = now() - interval '7 hours' WHERE id = $1", [ids[name]])
+
+beforeAll(async () => {
+  await clearDatabase()
+  for (const name of ['ana', 'bia', 'caio', 'davi']) await signUp(name)
+  await signUp('eva', { verified: false })
+  testOutbox().length = 0
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+describe('Opção na Conta', () => {
+  it('começa desligada; valida tipo, idioma e e-mail confirmado', async () => {
+    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(false)
+    expect((await prefs('ana', {})).statusCode).toBe(400)
+    expect((await prefs('ana', { followEmails: 'sim' })).statusCode).toBe(400)
+    expect((await prefs('ana', { locale: 'fr' })).statusCode).toBe(400)
+    const unverified = await prefs('eva', { followEmails: true })
+    expect(unverified.statusCode).toBe(403)
+    expect(unverified.body.code).toBe('EMAIL_NOT_VERIFIED_NOTIFY')
+
+    const res = await prefs('ana', { followEmails: true, locale: 'en' })
+    expect(res.body).toEqual({ followEmails: true, locale: 'en' })
+    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(true)
+    await prefs('ana', { locale: 'pt' })
+  })
+})
+
+describe('Pedido para seguir', () => {
+  it('primeiro aviso sai na hora, com descadastro de um clique', async () => {
+    await follow('bia', 'ana')
+    expect(await waitFor(() => mailsTo('ana').length === 1)).toBe(true)
+    const [mail] = mailsTo('ana')
+    expect(mail.subject).toBe('bia pediu para seguir você no Librishelf')
+    expect(mail.text).toContain('/community?tab=requests')
+    expect(mail.headers).toEqual({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
+    expect(mail.list.unsubscribe).toMatch(/\/api\/email\/unsubscribe\?token=\d+\.[A-Za-z0-9_-]{32}$/)
+    expect(mail.text).toMatch(/\/unsubscribe\?token=/)
+    expect(await queueOf('ana')).toEqual([])
+  })
+
+  it('dentro do intervalo os avisos esperam e vão juntos', async () => {
+    await follow('caio', 'ana')
+    await follow('davi', 'ana')
+    await new Promise(resolve => setTimeout(resolve, 150))
+    expect(mailsTo('ana')).toHaveLength(1)
+    expect(await queueOf('ana')).toHaveLength(2)
+
+    // Ainda dentro das 6 h: a varredura não manda
+    expect(await deliverDue()).toBe(0)
+
+    // Davi desiste antes do e-mail: o aviso dele some
+    await request(app).delete('/social/follow/ana').set(auth('davi'))
+    await pastInterval('ana')
+    expect(await deliverDue()).toBe(1)
+    const last = mailsTo('ana').at(-1)
+    expect(last.subject).toBe('caio pediu para seguir você no Librishelf')
+    expect(last.text).not.toContain('davi')
+    expect(await queueOf('ana')).toEqual([])
+  })
+
+  it('quem não ligou a opção não recebe nada', async () => {
+    await follow('ana', 'bia')
+    await new Promise(resolve => setTimeout(resolve, 150))
+    expect(mailsTo('bia')).toHaveLength(0)
+    expect(await queueOf('bia')).toEqual([])
+  })
+})
+
+describe('Pedido aceito', () => {
+  it('quem pediu recebe "aceitou seu pedido" (em inglês, se escolheu)', async () => {
+    await prefs('caio', { followEmails: true, locale: 'en' })
+    await request(app).post('/social/requests/caio/accept').set(auth('ana'))
+    expect(await waitFor(() => mailsTo('caio').length === 1)).toBe(true)
+    expect(mailsTo('caio')[0].subject).toBe('ana accepted your follow request on Librishelf')
+    expect(mailsTo('caio')[0].text).toContain('/community?tab=following')
+  })
+
+  it('pedido e aceite juntos no mesmo e-mail; bloqueio tira o aviso', async () => {
+    await prefs('bia', { followEmails: true })
+    await db.query('UPDATE librishelf.users SET follow_email_sent_at = now() WHERE id = $1', [ids.bia])
+    await request(app).post('/social/requests/ana/accept').set(auth('bia')) // bia aceita ana: aviso para ana
+    await follow('davi', 'bia') // pedido para bia (fica na fila)
+    await follow('caio', 'bia') // outro pedido para bia
+    await request(app).post('/social/blocks/caio').set(auth('bia')) // bloqueio: aviso do caio some
+    await pastInterval('bia')
+    await deliverDue()
+    const mail = mailsTo('bia').at(-1)
+    expect(mail.subject).toBe('davi pediu para seguir você no Librishelf')
+    expect(mail.text).not.toContain('caio')
+  })
+})
+
+describe('Descadastro', () => {
+  it('POST com o token desliga e limpa a fila; desfazer liga de novo', async () => {
+    const token = createUnsubscribeToken(ids.ana)
+    await db.query("INSERT INTO librishelf.follow_email_queue (user_id, kind, actor_id) VALUES ($1, 'request', $2)", [ids.ana, ids.davi])
+
+    // Como o Gmail faz: POST com o corpo do RFC 8058, sem login
+    const res = await request(app).post(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
+      .type('form').send('List-Unsubscribe=One-Click')
+    expect(res.statusCode).toBe(200)
+    expect(res.body).toEqual({ followEmails: false })
+    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(false)
+    expect(await queueOf('ana')).toEqual([])
+
+    expect((await request(app).post(`/email/resubscribe?token=${encodeURIComponent(token)}`)).body).toEqual({ followEmails: true })
+  })
+
+  it('token inválido ou de outra pessoa → 400; GET não descadastra', async () => {
+    const bad = await request(app).post('/email/unsubscribe?token=1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
+    expect(bad.statusCode).toBe(400)
+    expect(bad.body.code).toBe('UNSUBSCRIBE_TOKEN_INVALID')
+    const forged = createUnsubscribeToken(ids.bia).replace(/^\d+/, String(ids.ana))
+    expect((await request(app).post(`/email/unsubscribe?token=${forged}`)).statusCode).toBe(400)
+    expect((await request(app).get(`/email/unsubscribe?token=${createUnsubscribeToken(ids.ana)}`)).statusCode).toBe(404)
+    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(true)
+  })
+})
diff --git a/backend/src/tests/integration/linkPreview.test.js b/backend/src/tests/integration/linkPreview.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..c395d4318853e47fb8915e741608f1a1891ce3f7
--- /dev/null
+++ b/backend/src/tests/integration/linkPreview.test.js
@@ -0,0 +1,110 @@
+import fs from 'node:fs'
+import os from 'node:os'
+import path from 'node:path'
+import request from 'supertest'
+import sharp from 'sharp'
+import { confirmEmail } from '../helpers/confirmEmail.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+// Pasta de capas só deste teste: as capas de outros testes (ou do seu banco
+// local, se o .env.test não define UPLOAD_DIR) não entram no mosaico, e as
+// suas não são tocadas. O app é importado depois de trocar a variável.
+const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'librishelf-preview-'))
+process.env.UPLOAD_DIR = uploadDir
+const { default: app } = await import('../../app.js')
+
+const tokens = {}
+const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
+const head = name => request(app).get(`/meta/u/${name}`).then(res => res.text)
+const tag = (html, property) => html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`))?.[1]
+
+async function signUp(name) {
+  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
+  await confirmEmail(name)
+  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
+}
+
+async function addBook(user, title, readDate) {
+  const res = await request(app).post('/library').set(auth(user)).field({ title, authors: 'Autor', ...(readDate ? { readDate } : {}) })
+  return res.body.bookId
+}
+
+async function uploadCover(user, bookId, color) {
+  const image = await sharp({ create: { width: 300, height: 450, channels: 3, background: color } }).jpeg().toBuffer()
+  const res = await request(app).post(`/library/${bookId}/cover`).set(auth(user)).attach('coverImage', image, { filename: 'capa.jpg', contentType: 'image/jpeg' })
+  expect(res.statusCode).toBe(200)
+}
+
+beforeAll(async () => {
+  await clearDatabase()
+  await signUp('lu')
+  await signUp('oculta')
+})
+
+afterAll(async () => {
+  await closeDatabase()
+  fs.rmSync(uploadDir, { recursive: true, force: true })
+})
+
+describe('Prévia das bibliotecas públicas (Open Graph)', () => {
+  it('privada ou inexistente: tags genéricas e noindex', async () => {
+    for (const name of ['oculta', 'ninguem']) {
+      const html = await head(name)
+      expect(tag(html, 'robots')).toBe('noindex, nofollow')
+      expect(tag(html, 'og:title')).toBe('Librishelf')
+      expect(tag(html, 'og:type')).toBe('website')
+      expect(html).not.toContain('profile:username')
+    }
+    expect((await request(app).get('/meta/u/oculta/image.jpg')).statusCode).toBe(404)
+  })
+
+  it('pública sem capas: título e números, imagem padrão', async () => {
+    await request(app).patch('/auth/me/visibility').set(auth('lu')).send({ isPublic: true })
+    let html = await head('lu')
+    expect(tag(html, 'og:title')).toBe('Biblioteca de lu · Librishelf')
+    expect(tag(html, 'og:description')).toBe('Veja a biblioteca de lu no Librishelf.')
+    expect(tag(html, 'og:url')).toMatch(/\/u\/lu$/)
+
+    await addBook('lu', 'Um', '2024-01-01')
+    await addBook('lu', 'Dois')
+    html = await head('lu')
+    expect(tag(html, 'og:description')).toBe('2 livros na estante · 1 lido. Veja a biblioteca de lu no Librishelf.')
+    expect(tag(html, 'og:image')).toMatch(/\/bookshelf\.png$/)
+    expect(tag(html, 'twitter:card')).toBe('summary')
+    expect((await request(app).get('/meta/u/lu/image.jpg')).statusCode).toBe(404)
+  })
+
+  it('com capas: mosaico 1200×630 leve, versão muda com capa nova', async () => {
+    const ids = []
+    for (const color of ['#7a2e2e', '#1e3a5f', '#2f5d3a']) {
+      const id = await addBook('lu', `Livro ${color}`)
+      await uploadCover('lu', id, color)
+      ids.push(id)
+    }
+    const html = await head('lu')
+    const image = tag(html, 'og:image')
+    expect(image).toMatch(/\/api\/meta\/u\/lu\/image\.jpg\?v=[0-9a-z]+$/)
+    expect(tag(html, 'og:image:width')).toBe('1200')
+    expect(tag(html, 'og:image:height')).toBe('630')
+    expect(tag(html, 'twitter:card')).toBe('summary_large_image')
+
+    const res = await request(app).get('/meta/u/lu/image.jpg')
+    expect(res.statusCode).toBe(200)
+    expect(res.headers['content-type']).toMatch(/image\/jpeg/)
+    expect(res.headers['cache-control']).toMatch(/max-age/)
+    expect(res.body.length).toBeLessThan(300 * 1024)
+    const meta = await sharp(res.body).metadata()
+    expect([meta.width, meta.height]).toEqual([1200, 630])
+
+    // Capa nova (last_modified muda) → URL nova
+    await new Promise(resolve => setTimeout(resolve, 1100))
+    await uploadCover('lu', ids[0], '#5b2b6e')
+    expect(tag(await head('lu'), 'og:image')).not.toBe(image)
+  })
+
+  it('robots acompanha a opção "aparecer em buscadores"', async () => {
+    await request(app).patch('/auth/me/visibility').set(auth('lu')).send({ allowIndexing: true })
+    expect(tag(await head('lu'), 'robots')).toBe('index, follow')
+  })
+})
diff --git a/backend/src/tests/integration/searchIndexing.test.js b/backend/src/tests/integration/searchIndexing.test.js
index b545d40e55b6982fbe46454dc684fe218efb6462..3cccba214aca17abf6309e70c4144053294b0943 100644
--- a/backend/src/tests/integration/searchIndexing.test.js
+++ b/backend/src/tests/integration/searchIndexing.test.js
@@ -9,6 +9,8 @@ const tokens = {}
 const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
 const visibility = (user, body) => request(app).patch('/auth/me/visibility').set(auth(user)).send(body)
 const head = name => request(app).get(`/meta/u/${encodeURIComponent(name)}`)
+// O trecho começa pela tag robots; depois vêm as tags Open Graph
+const robotsOf = res => res.text.match(/^<meta name="robots"[^>]*>/)?.[0]
 
 async function signUp(name, confirm = true) {
   await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
@@ -37,25 +39,25 @@ describe('Aparecer em buscadores', () => {
       const res = await head(name)
       expect(res.statusCode).toBe(200)
       expect(res.headers['content-type']).toMatch(/text\/html/)
-      expect(res.text).toBe(ROBOTS_NOINDEX)
+      expect(robotsOf(res)).toBe(ROBOTS_NOINDEX)
     }
     await visibility('nina', { isPublic: true })
-    expect((await head('nina')).text).toBe(ROBOTS_NOINDEX)
+    expect(robotsOf(await head('nina'))).toBe(ROBOTS_NOINDEX)
   })
 
   it('ligar a opção libera o index só enquanto a biblioteca for pública', async () => {
     const res = await visibility('nina', { allowIndexing: true })
     expect(res.statusCode).toBe(200)
     expect(res.body).toMatchObject({ isPublic: true, allowIndexing: true })
-    expect((await head('nina')).text).toBe(ROBOTS_INDEX)
+    expect(robotsOf(await head('nina'))).toBe(ROBOTS_INDEX)
 
     const profile = await request(app).get('/library/public/u/nina/profile')
     expect(profile.body.indexable).toBe(true)
 
     await visibility('nina', { isPublic: false })
-    expect((await head('nina')).text).toBe(ROBOTS_NOINDEX)
+    expect(robotsOf(await head('nina'))).toBe(ROBOTS_NOINDEX)
     await visibility('nina', { isPublic: true, allowIndexing: false })
-    expect((await head('nina')).text).toBe(ROBOTS_NOINDEX)
+    expect(robotsOf(await head('nina'))).toBe(ROBOTS_NOINDEX)
   })
 
   it('valida o tipo e exige e-mail confirmado para ligar', async () => {
@@ -66,6 +68,6 @@ describe('Aparecer em buscadores', () => {
   })
 
   it('nome com caracteres fora do padrão não consulta nada', async () => {
-    expect((await head('a"b<c')).text).toBe(ROBOTS_NOINDEX)
+    expect(robotsOf(await head('a"b<c'))).toBe(ROBOTS_NOINDEX)
   })
 })
diff --git a/backend/src/tests/unit/linkPreview.test.js b/backend/src/tests/unit/linkPreview.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..517618b499e56816603456111873211144a1104e
--- /dev/null
+++ b/backend/src/tests/unit/linkPreview.test.js
@@ -0,0 +1,57 @@
+import { layoutCovers, IMAGE_WIDTH, IMAGE_HEIGHT } from '../../services/metaService.js'
+import { createUnsubscribeToken, readUnsubscribeToken } from '../../utils/unsubscribeToken.js'
+import { followDigestEmail, verifyEmailEmail } from '../../services/emailTemplates.js'
+
+describe('layoutCovers (mosaico da prévia)', () => {
+  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('%i capa(s) cabem na imagem, sem sobrepor', count => {
+    const { slots } = layoutCovers(count)
+    expect(slots).toHaveLength(count)
+    for (const slot of slots) {
+      expect(slot.left).toBeGreaterThanOrEqual(0)
+      expect(slot.top).toBeGreaterThanOrEqual(0)
+      expect(slot.left + slot.width).toBeLessThanOrEqual(IMAGE_WIDTH)
+      expect(slot.top + slot.height).toBeLessThanOrEqual(IMAGE_HEIGHT)
+      expect(slot.height / slot.width).toBeCloseTo(1.5, 1)
+    }
+    const sorted = [...slots].sort((a, b) => a.top - b.top || a.left - b.left)
+    for (let i = 1; i < sorted.length; i++) {
+      if (sorted[i].top === sorted[i - 1].top) expect(sorted[i].left).toBeGreaterThanOrEqual(sorted[i - 1].left + sorted[i - 1].width)
+    }
+  })
+})
+
+describe('token de descadastro', () => {
+  it('ida e volta; adulterado não vale', () => {
+    const token = createUnsubscribeToken(42)
+    expect(readUnsubscribeToken(token)).toBe(42)
+    expect(readUnsubscribeToken(token.replace(/^42/, '43'))).toBeNull()
+    expect(readUnsubscribeToken(`${token}x`)).toBeNull()
+    expect(readUnsubscribeToken('')).toBeNull()
+    expect(readUnsubscribeToken(undefined)).toBeNull()
+  })
+})
+
+describe('e-mail de avisos de seguidores', () => {
+  const base = { name: 'Ana', link: 'https://librishelf.com/community', hours: 6, unsubscribe: 'https://librishelf.com/unsubscribe?token=1.x' }
+
+  it('assunto conforme os avisos (pt/en)', () => {
+    expect(followDigestEmail({ ...base, items: [{ kind: 'request', actor: 'bia' }] }).subject).toBe('bia pediu para seguir você no Librishelf')
+    expect(followDigestEmail({ ...base, items: [{ kind: 'request', actor: 'bia' }, { kind: 'request', actor: 'caio' }] }).subject).toBe('2 pedidos para seguir você no Librishelf')
+    expect(followDigestEmail({ ...base, items: [{ kind: 'accepted', actor: 'bia' }, { kind: 'request', actor: 'caio' }] }).subject).toBe('Novidades dos seus leitores no Librishelf')
+    expect(followDigestEmail({ ...base, locale: 'en', items: [{ kind: 'accepted', actor: 'bia' }, { kind: 'accepted', actor: 'caio' }] }).subject).toBe('2 of your follow requests were accepted on Librishelf')
+  })
+
+  it('HTML lista os avisos, escapa nomes e traz o descadastro', () => {
+    const { html, text } = followDigestEmail({ ...base, items: [{ kind: 'request', actor: '<b>x</b>' }] })
+    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; pediu para seguir você')
+    expect(html).toContain('Descadastrar com um clique')
+    expect(html).toContain('ativou os avisos de seguidores')
+    expect(text).toContain('Descadastrar com um clique: https://librishelf.com/unsubscribe?token=1.x')
+  })
+
+  it('os e-mails antigos continuam iguais (sem lista nem descadastro)', () => {
+    const { html } = verifyEmailEmail({ name: 'Ana', link: 'https://x', locale: 'pt' })
+    expect(html).not.toContain('Descadastrar')
+    expect(html).toContain('Se você não criou uma conta')
+  })
+})
diff --git a/backend/src/utils/unsubscribeToken.js b/backend/src/utils/unsubscribeToken.js
new file mode 100644
index 0000000000000000000000000000000000000000..8760787941fb4027a286f77f064427acdf9522fe
--- /dev/null
+++ b/backend/src/utils/unsubscribeToken.js
@@ -0,0 +1,33 @@
+import crypto from 'node:crypto'
+
+/**
+ * Token de descadastro dos avisos por e-mail: "<id>.<assinatura>", HMAC do
+ * id + finalidade com a SECRET_KEY. Não expira e não precisa de tabela; não
+ * dá para forjar sem a chave (RFC 8058 pede um identificador difícil de forjar).
+ *   https://www.rfc-editor.org/rfc/rfc8058
+ */
+const PURPOSE = 'unsubscribe:follow-emails'
+
+function signature(userId) {
+  return crypto
+    .createHmac('sha256', process.env.SECRET_KEY || '')
+    .update(`${PURPOSE}:${userId}`)
+    .digest('base64url')
+    .slice(0, 32)
+}
+
+export function createUnsubscribeToken(userId) {
+  return `${userId}.${signature(userId)}`
+}
+
+/** → id do usuário, ou null se o token não confere. */
+export function readUnsubscribeToken(token) {
+  if (typeof token !== 'string' || token.length > 64) return null
+  const match = token.match(/^(\d{1,10})\.([A-Za-z0-9_-]{32})$/)
+  if (!match) return null
+  const userId = Number(match[1])
+  const expected = Buffer.from(signature(userId))
+  const given = Buffer.from(match[2])
+  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
+  return userId
+}
diff --git a/frontend/index.html b/frontend/index.html
index 7ce97278b5029b99652cfcb2c9fd4fc85ac5e094..4d2ca6f56a21f5bd2d2b0d7a25c60c43d77db44b 100644
--- a/frontend/index.html
+++ b/frontend/index.html
@@ -3,8 +3,6 @@
   <head>
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
-    <!-- Em /u/<usuário> o nginx troca o bloco abaixo (SSI) pelas tags da biblioteca; nas outras páginas são só comentários. -->
-    <!--# include virtual="/__meta/u/$lib_user" set="meta_head" wait="yes" --><!--# if expr="$meta_head" --><!--# echo var="meta_head" encoding="none" --><!--# else --><!--# echo var="meta_fallback" encoding="none" default="" --><!--# endif -->
     <title>Librishelf</title>
     <meta name="description" content="Librishelf — organize sua biblioteca pessoal: cadastre livros, acompanhe o que já leu e encontre qualquer obra da sua coleção." />
     <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)" />
@@ -16,6 +14,15 @@
     <!-- Instalar como app no celular (ícone na tela inicial, abre sem a barra do navegador) -->
     <link rel="manifest" href="/manifest.webmanifest" />
 
+    <!--
+      Prévia (WhatsApp, redes) e robots. Em /u/<usuário> o nginx processa os
+      comandos SSI desta parte: pede ao backend as tags daquela biblioteca, que
+      entram no lugar das genéricas abaixo; se o backend falhar, ficam as
+      genéricas com noindex. Nas outras páginas os comandos SSI são só
+      comentários e valem as tags genéricas (iguais a defaultTags() no
+      metaService do backend).
+    -->
+    <!--# include virtual="/__meta/u/$lib_user" set="meta_head" wait="yes" --><!--# if expr="$meta_head" --><!--# echo var="meta_head" encoding="none" --><!--# else --><!--# echo var="meta_fallback" encoding="none" default="" -->
     <meta property="og:type" content="website" />
     <meta property="og:site_name" content="Librishelf" />
     <meta property="og:title" content="Librishelf" />
@@ -26,6 +33,7 @@
     <meta property="og:locale" content="pt_BR" />
     <meta property="og:locale:alternate" content="en_US" />
     <meta name="twitter:card" content="summary" />
+    <!--# endif -->
 
     <script>
       // Aplica tema, cor de destaque e idioma antes do CSS e do Vue carregarem
diff --git a/frontend/public/robots.txt b/frontend/public/robots.txt
index 4aaedbda8fc13ce22f97640ece5979561dafc303..e71a8f32d640b4011397f43bb2ca76d01c242251 100644
--- a/frontend/public/robots.txt
+++ b/frontend/public/robots.txt
@@ -6,4 +6,5 @@ User-agent: *
 Disallow: /api/
 Disallow: /reset-password
 Disallow: /verify-email
+Disallow: /unsubscribe
 Allow: /
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 4c3c97df8042a7659f4fa9873fa66c8e8f2ab38b..83c8f4a5ad584006325f1d2510093725155b6438 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -406,6 +406,15 @@
       "on": "Your library may now appear in search engines.",
       "off": "Your library will no longer appear in search engines."
     },
+    "notifications": {
+      "title": "Email notifications",
+      "desc": "Get an email when someone asks to follow you and when your request is accepted.",
+      "verifyFirst": "Confirm your email to receive notifications.",
+      "follow": "Follow requests and accepted requests",
+      "followHelp": "Sent to {email}. At most one email every {hours} hours — anything in between comes together. Every email has an unsubscribe link.",
+      "on": "You'll receive email notifications.",
+      "off": "Email notifications turned off."
+    },
     "password": {
       "title": "Change password",
       "desc": "Your other open sessions will be signed out.",
@@ -482,6 +491,7 @@
       "label": "On this page",
       "privacy": "Privacy",
       "account": "Account",
+      "notifications": "Notifications",
       "password": "Password",
       "data": "Data",
       "delete": "Delete"
@@ -701,6 +711,18 @@
     "clearMessage": "This book has {n} recorded readings. Changing the status deletes all of them.",
     "clearConfirm": "Delete and change"
   },
+  "unsubscribe": {
+    "loading": "Unsubscribing…",
+    "doneTitle": "Done, you're unsubscribed",
+    "doneText": "You won't get follower notifications by email anymore. Requests still show up in the Community.",
+    "undo": "Undo",
+    "settings": "Open notifications in Account",
+    "undoneTitle": "Notifications back on",
+    "undoneText": "You'll get follower notifications by email again.",
+    "home": "Go to Librishelf",
+    "failedTitle": "Couldn't unsubscribe",
+    "failedText": "This unsubscribe link isn't valid. You can turn notifications off in Account."
+  },
   "community": {
     "book_title": "Community",
     "load_error": "Couldn't load the community.",
@@ -917,7 +939,8 @@
     "verifyEmail": "Confirm email",
     "publicLibrary": "{name}'s library",
     "privacy": "Privacy",
-    "notFound": "Page not found"
+    "notFound": "Page not found",
+    "unsubscribe": "Unsubscribe"
   },
   "password": {
     "show": "Show password",
@@ -1034,7 +1057,9 @@
     "NOT_READING": "This book isn't being read.",
     "PROGRESS_INVALID": "Invalid progress.",
     "PROGRESS_PAGE_OVER": "The current page is past the book's total pages ({max}).",
-    "PAGE_COUNT_INVALID": "Pages must be from 1 to {max}."
+    "PAGE_COUNT_INVALID": "Pages must be from 1 to {max}.",
+    "UNSUBSCRIBE_TOKEN_INVALID": "This unsubscribe link isn't valid.",
+    "EMAIL_NOT_VERIFIED_NOTIFY": "Confirm your email to receive notifications."
   },
   "block": {
     "block": "Block {name}",
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 6eb4dc444f00a4279266ad839deff389c29e55a6..5e2745018cf769bfe476de00047a5fe0e47402d8 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -406,6 +406,15 @@
       "on": "Sua biblioteca pode aparecer em buscadores.",
       "off": "Sua biblioteca não vai mais aparecer em buscadores."
     },
+    "notifications": {
+      "title": "Avisos por e-mail",
+      "desc": "Receba um e-mail quando alguém pedir para seguir você e quando aceitarem o seu pedido.",
+      "verifyFirst": "Confirme seu e-mail para receber avisos.",
+      "follow": "Pedidos para seguir e pedidos aceitos",
+      "followHelp": "Vai para {email}. No máximo um e-mail a cada {hours} horas — o que acontecer nesse meio-tempo vem junto. Todo e-mail tem um link para descadastrar.",
+      "on": "Você vai receber avisos por e-mail.",
+      "off": "Avisos por e-mail desligados."
+    },
     "password": {
       "title": "Alterar senha",
       "desc": "As outras sessões abertas serão encerradas.",
@@ -482,6 +491,7 @@
       "label": "Nesta página",
       "privacy": "Privacidade",
       "account": "Conta",
+      "notifications": "Avisos",
       "password": "Senha",
       "data": "Dados",
       "delete": "Excluir"
@@ -701,6 +711,18 @@
     "clearMessage": "Este livro tem {n} leituras registradas. Mudar o status apaga todas elas.",
     "clearConfirm": "Apagar e mudar"
   },
+  "unsubscribe": {
+    "loading": "Descadastrando…",
+    "doneTitle": "Pronto, você foi descadastrado",
+    "doneText": "Você não vai mais receber avisos de seguidores por e-mail. Os pedidos continuam aparecendo na Comunidade.",
+    "undo": "Desfazer",
+    "settings": "Abrir avisos na Conta",
+    "undoneTitle": "Avisos ligados de novo",
+    "undoneText": "Você volta a receber os avisos de seguidores por e-mail.",
+    "home": "Ir para o Librishelf",
+    "failedTitle": "Não deu para descadastrar",
+    "failedText": "Este link de descadastro não é válido. Você pode desligar os avisos na Conta."
+  },
   "community": {
     "book_title": "Comunidade",
     "load_error": "Não foi possível carregar a comunidade.",
@@ -917,7 +939,8 @@
     "verifyEmail": "Confirmar e-mail",
     "publicLibrary": "Biblioteca de {name}",
     "privacy": "Privacidade",
-    "notFound": "Página não encontrada"
+    "notFound": "Página não encontrada",
+    "unsubscribe": "Descadastrar avisos"
   },
   "password": {
     "show": "Mostrar senha",
@@ -1034,7 +1057,9 @@
     "NOT_READING": "Este livro não está em leitura.",
     "PROGRESS_INVALID": "Progresso inválido.",
     "PROGRESS_PAGE_OVER": "A página atual passa do total de páginas do livro ({max}).",
-    "PAGE_COUNT_INVALID": "O número de páginas precisa ser de 1 a {max}."
+    "PAGE_COUNT_INVALID": "O número de páginas precisa ser de 1 a {max}.",
+    "UNSUBSCRIBE_TOKEN_INVALID": "Este link de descadastro não é válido.",
+    "EMAIL_NOT_VERIFIED_NOTIFY": "Confirme seu e-mail para receber avisos."
   },
   "block": {
     "block": "Bloquear {name}",
diff --git a/frontend/src/router/index.js b/frontend/src/router/index.js
index b186ceaaeffe8539d6c108e8c7c87f9342372a1d..c3222b0c273a3bc55438fca750f1ee4ed4f9813e 100644
--- a/frontend/src/router/index.js
+++ b/frontend/src/router/index.js
@@ -34,6 +34,7 @@ const router = createRouter({
     { path: '/forgot-password', name: 'forgot-password', component: () => import('../views/ForgotPassword.vue'), meta: { standalone: true, title: 'forgotPassword' } },
     { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPassword.vue'), meta: { standalone: true, title: 'resetPassword' } },
     { path: '/verify-email', name: 'verify-email', component: () => import('../views/VerifyEmail.vue'), meta: { standalone: true, title: 'verifyEmail' } },
+    { path: '/unsubscribe', name: 'unsubscribe', component: () => import('../views/Unsubscribe.vue'), meta: { standalone: true, title: 'unsubscribe', noindex: true } },
 
     { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true, title: 'publicLibrary', noindex: 'server' } },
     { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { public: true, title: 'privacy' } },
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 81ad1e2ac06834e9b7465eeb56ab3f64adde5403..76fedf0819951fb0c65583f11fa090d628671d77 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -61,6 +61,20 @@ export default {
     return client.put('/auth/password', { currentPassword, newPassword })
   },
 
+  /** Avisos por e-mail: { followEmails?, locale? } */
+  setNotifications(prefs) {
+    return client.patch('/auth/me/notifications', prefs)
+  },
+
+  /** Descadastro pelo link do e-mail (sem login). */
+  unsubscribe(token) {
+    return client.post(`/email/unsubscribe?token=${enc(token)}`, {})
+  },
+
+  resubscribe(token) {
+    return client.post(`/email/resubscribe?token=${enc(token)}`, {})
+  },
+
   /** Qualquer combinação de { isPublic, showInCommunity, showActivity }. */
   changeEmail(email, password, locale) {
     return client.patch('/auth/me/email', { email, password, locale })
diff --git a/frontend/src/views/Settings.vue b/frontend/src/views/Settings.vue
index cca8ac2125e5769f99c8319329a4c5eb95323749..8bf8722e5098a19ac5aee13a4ce92736b623cfe0 100644
--- a/frontend/src/views/Settings.vue
+++ b/frontend/src/views/Settings.vue
@@ -215,6 +215,44 @@
           </dl>
         </section>
 
+        <!-- Avisos por e-mail (opt-in) -->
+        <section
+          class="settings-card"
+          aria-labelledby="settings-notifications-title"
+          id="settings-notifications"
+          tabindex="-1"
+        >
+          <h2 id="settings-notifications-title">{{ t('settings.notifications.title') }}</h2>
+          <p class="card-desc">{{ t('settings.notifications.desc') }}</p>
+          <p
+            v-if="!emailVerified"
+            class="verify-note"
+          >
+            <i
+              class="pi pi-envelope"
+              aria-hidden="true"
+            ></i>
+            {{ t('settings.notifications.verifyFirst') }}
+          </p>
+
+          <div class="toggle-block">
+            <div class="toggle-row">
+              <AppSwitch
+                inputId="settings-follow-emails"
+                :modelValue="followEmails"
+                :disabled="savingNotifications || (!emailVerified && !followEmails)"
+                aria-describedby="settings-follow-emails-help"
+                @update:modelValue="saveFollowEmails"
+              />
+              <label for="settings-follow-emails">{{ t('settings.notifications.follow') }}</label>
+            </div>
+            <small
+              id="settings-follow-emails-help"
+              class="toggle-help"
+            >{{ t('settings.notifications.followHelp', { hours: 6, email: user?.email || '' }) }}</small>
+          </div>
+        </section>
+
         <!-- Senha -->
         <section
           class="settings-card"
@@ -504,6 +542,7 @@ const { t, locale } = useI18n()
 const indexItems = computed(() => [
   { id: 'settings-privacy', label: t('settings.index.privacy') },
   { id: 'settings-account', label: t('settings.index.account') },
+  { id: 'settings-notifications', label: t('settings.index.notifications') },
   { id: 'settings-password', label: t('settings.index.password') },
   { id: 'settings-data', label: t('settings.index.data') },
   { id: 'settings-delete', label: t('settings.index.delete') }
@@ -526,6 +565,22 @@ const emailVerified = computed(() => user.value?.emailVerified !== false)
 const showInCommunity = computed(() => Boolean(user.value?.showInCommunity))
 const showActivity = computed(() => Boolean(user.value?.showActivity))
 const allowIndexing = computed(() => Boolean(user.value?.allowIndexing))
+const followEmails = computed(() => Boolean(user.value?.followEmails))
+const savingNotifications = ref(false)
+
+// Avisos por e-mail: vão no idioma atual do app
+async function saveFollowEmails(value) {
+  savingNotifications.value = true
+  try {
+    const result = await api.setNotifications({ followEmails: value, locale: locale.value === 'en' ? 'en' : 'pt' })
+    updateUser({ followEmails: result.followEmails })
+    toast.add({ severity: 'success', summary: t('common.success'), detail: result.followEmails ? t('settings.notifications.on') : t('settings.notifications.off'), life: 3000 })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    savingNotifications.value = false
+  }
+}
 const publicUrl = computed(() => `${window.location.origin}/u/${encodeURIComponent(user.value?.name || '')}`)
 
 const savingVisibility = ref(false)
diff --git a/frontend/src/views/Unsubscribe.vue b/frontend/src/views/Unsubscribe.vue
new file mode 100644
index 0000000000000000000000000000000000000000..dcf54be3d040bcd051aad73312faedccb627f742
--- /dev/null
+++ b/frontend/src/views/Unsubscribe.vue
@@ -0,0 +1,114 @@
+<template>
+  <AuthLayout
+    title="Librishelf"
+    :subtitle="t('login.header')"
+  >
+    <div
+      class="header"
+      role="status"
+    >
+      <h1>{{ heading }}</h1>
+      <p class="subtitle">{{ message }}</p>
+    </div>
+
+    <div
+      v-if="state !== 'loading'"
+      class="auth-form"
+    >
+      <template v-if="state === 'done'">
+        <AppButton
+          :label="t('unsubscribe.undo')"
+          icon="pi pi-undo"
+          class="btn-outlined btn-secondary w-full"
+          :loading="busy"
+          @click="undo"
+        />
+        <AppButton
+          :label="t('unsubscribe.settings')"
+          class="btn-text w-full"
+          @click="router.replace({ name: 'settings', hash: '#settings-notifications' })"
+        />
+      </template>
+      <template v-else-if="state === 'undone'">
+        <AppButton
+          :label="t('unsubscribe.home')"
+          class="btn-primary w-full btn-lg"
+          @click="router.replace({ name: 'home' })"
+        />
+      </template>
+      <AppButton
+        v-else
+        :label="t('unsubscribe.settings')"
+        class="btn-primary w-full"
+        @click="router.replace({ name: 'settings', hash: '#settings-notifications' })"
+      />
+    </div>
+  </AuthLayout>
+</template>
+
+<script setup>
+import { ref, computed, onMounted } from 'vue'
+import { useRoute, useRouter } from 'vue-router'
+import { useI18n } from 'vue-i18n'
+import AppButton from '../components/ui/AppButton.vue'
+import AuthLayout from '../components/AuthLayout.vue'
+import api from '../services/api.js'
+import { updateUser } from '../services/session.js'
+
+/**
+ * Link "Descadastrar com um clique" do e-mail de avisos: descadastra ao abrir
+ * (sem login; o token identifica a conta) e oferece desfazer. Os provedores
+ * de e-mail usam o mesmo endpoint pelo cabeçalho List-Unsubscribe.
+ */
+const { t } = useI18n()
+const route = useRoute()
+const router = useRouter()
+
+const state = ref('loading') // loading | done | undone | failed
+const errorMessage = ref('')
+const busy = ref(false)
+let token = ''
+
+const heading = computed(() => ({
+  loading: t('unsubscribe.loading'),
+  done: t('unsubscribe.doneTitle'),
+  undone: t('unsubscribe.undoneTitle'),
+  failed: t('unsubscribe.failedTitle')
+}[state.value]))
+
+const message = computed(() => {
+  if (state.value === 'done') return t('unsubscribe.doneText')
+  if (state.value === 'undone') return t('unsubscribe.undoneText')
+  if (state.value === 'failed') return errorMessage.value || t('unsubscribe.failedText')
+  return ''
+})
+
+async function undo() {
+  busy.value = true
+  try {
+    await api.resubscribe(token)
+    updateUser({ followEmails: true })
+    state.value = 'undone'
+  } catch (error) {
+    errorMessage.value = error.message
+    state.value = 'failed'
+  } finally {
+    busy.value = false
+  }
+}
+
+onMounted(async () => {
+  token = String(route.query.token || '')
+  // Tira o token da barra de endereço/histórico.
+  router.replace({ query: {} })
+
+  try {
+    await api.unsubscribe(token)
+    updateUser({ followEmails: false })
+    state.value = 'done'
+  } catch (error) {
+    errorMessage.value = error.status === 400 ? t('unsubscribe.failedText') : error.message
+    state.value = 'failed'
+  }
+})
+</script>
__LIBRISHELF_PATCH__

undo_hint() {
  echo "  Para desfazer tudo deste pacote:"
  echo "    git checkout HEAD -- $(git ls-files -- "${FILES[@]}" | tr '\n' ' ')"
  NEW=$(for f in "${FILES[@]}"; do git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || printf '%s ' "$f"; done)
  [ -n "$NEW" ] && echo "    rm -f $NEW"
  return 0
}

if git apply --check "$PATCH_FILE" 2>/dev/null; then
  git apply "$PATCH_FILE"
  echo "✓ Patch aplicado."
elif git apply --3way "$PATCH_FILE"; then
  # --3way deixa as mudanças no índice; tira de lá para você revisar e commitar
  git reset -q -- "${FILES[@]}"
  echo "✓ Patch aplicado com 3-way (algum arquivo estava reformatado)."
else
  CONFLICTS=$(git diff --name-only --diff-filter=U)
  git reset -q -- "${FILES[@]}" 2>/dev/null || true
  echo
  if [ -n "$CONFLICTS" ]; then
    echo "✗ O patch entrou, mas com conflito (marcadores <<<<<<< / >>>>>>>) em:"
    echo "$CONFLICTS" | sed 's/^/    /'
    echo "  Resolva esses trechos e rode de novo só a verificação:"
    echo "    (cd backend && npm run test:unit) && (cd frontend && npm run build)"
  else
    echo "✗ O patch não entrou (nada foi alterado)."
  fi
  undo_hint
  exit 1
fi

# Guarda as versões exatas deste pacote no banco de objetos do git: se o
# editor reformatar os arquivos antes do commit, o --3way do próximo pacote
# ainda encontra a base certa.
git hash-object -w -- "${FILES[@]}" >/dev/null 2>&1 || true

# Nenhum package.json mudou neste pacote; só instala se ainda não houver node_modules.
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund)
[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund)

echo "→ Testes unitários do backend…"
(cd backend && npm run test:unit --silent)

echo "→ Build do frontend…"
(cd frontend && npm run build)

echo
echo "Migration nova: 010_follow_emails (só acrescenta; nada é apagado)"
echo "  - users.follow_emails (desligado), follow_email_sent_at, email_locale"
echo "  - tabela follow_email_queue (avisos esperando o intervalo)"
if [ -f backend/src/.env.local ]; then
  read -r -p "Rodar agora no banco LOCAL (npm run db:migrate:local)? [s/N] " ANSWER || ANSWER=n
  if [[ "$ANSWER" =~ ^[sS] ]]; then
    (cd backend && npm run db:migrate:local)
  else
    echo "  Depois, quando quiser:  (cd backend && npm run db:migrate:local)"
  fi
else
  echo "  Banco local:  (cd backend && npm run db:migrate:local)"
fi
echo "  Reinicie o backend (npm run server:local) depois de aplicar: arquivos novos."
echo "  Testes de integração:  (cd backend && npm run db:migrate:test && npm test)"
echo "  Ver os e-mails novos:  (cd backend && npm run email:preview)"
echo "  Produção (no deploy):  docker compose exec <container do backend> npm run db:migrate:docker"

echo
echo "✓ Tudo certo. Mensagem de commit sugerida:"
echo "────────────────────────────────────────────"
cat <<'__MSG__'
feat: prévia no WhatsApp e aviso por e-mail de seguidores (pacote 12)

- Prévia de /u/<usuário> (WhatsApp, Facebook, Telegram…): o nginx injeta
  por SSI as tags Open Graph que o backend monta (GET /meta/u/:usuario):
  "Biblioteca de X", número de livros e lidos, e um mosaico 1200×630 das
  capas gerado com sharp (GET /meta/u/:usuario/image.jpg, com versão na
  URL). Privada ou inexistente: tags genéricas. O index.html leva as tags
  genéricas no bloco SSI (sem duplicar), e o noindex continua igual
- Aviso por e-mail (opt-in na Conta, migration 010): quando alguém pede
  para seguir e quando aceitam o seu pedido; no máximo um e-mail a cada
  6 h por pessoa (FOLLOW_EMAIL_INTERVAL_HOURS), com o que aconteceu no
  meio-tempo junto; pedido cancelado/recusado e bloqueio tiram o aviso
- Descadastro de um clique: List-Unsubscribe + List-Unsubscribe-Post
  (RFC 8058) e link no e-mail para /unsubscribe (com "Desfazer"), por token
  assinado, sem login
- Capa nova atualiza last_modified (a prévia ganha versão nova)
- Testes: prévia (tags e imagem), avisos (fila, intervalo, descadastro)
__MSG__
echo "────────────────────────────────────────────"
echo "Revise com git status / git diff e commite quando quiser."