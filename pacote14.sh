#!/usr/bin/env bash
# Pacote 14 — resenhas públicas
#   resenha por livro (até 5000 caracteres), aviso de spoiler, visibilidade
#   (todos / só seguidores), curtidas, denúncia com moderação por e-mail
#   (ADMIN_EMAIL) e ocultação automática com 3 denúncias (migration 011)
#
# Rode na raiz do repositório, na branch fix/audit-2026-08, com o 73e07cf como
# último commit. Deixe este script FORA do repositório:
#   bash ~/Downloads/pacote-14-resenhas.sh
#
# O que faz: aplica o patch (git apply; se falhar, git apply --3way), grava os
# blobs para o 3way dos próximos pacotes, roda testes unitários e build,
# pergunta se roda a migration 011 no banco local e mostra a mensagem de
# commit. Não commita nem faz push.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "✗ Rode dentro do repositório do Librishelf."; exit 1; }
cd "$ROOT"
[ -d frontend ] && [ -d backend ] || { echo "✗ Não parece ser o repositório do Librishelf."; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "fix/audit-2026-08" ] || echo "⚠ Branch atual: $BRANCH (esperado fix/audit-2026-08). Continuando."
git merge-base --is-ancestor 73e07cf HEAD 2>/dev/null || echo "⚠ O commit 73e07cf (pacote 13) não está no histórico. O 3way pode resolver; continuando."

if git ls-files --error-unmatch backend/db/migrations/011_reviews.sql >/dev/null 2>&1; then
  echo "✗ A migration 011 já está commitada — parece que o pacote 14 já entrou."; exit 1
fi

FILES=(
  .gitignore
  README.md
  backend/db/migrations/011_reviews.sql
  backend/db/schema.sql
  backend/src/.env.example
  backend/src/.env.test.example
  backend/src/app.js
  backend/src/database/queries.js
  backend/src/middlewares/rateLimiter.js
  backend/src/routes/library.js
  backend/src/routes/moderation.js
  backend/src/routes/reviews.js
  backend/src/scripts/previewEmails.js
  backend/src/scripts/seed.js
  backend/src/services/communityService.js
  backend/src/services/dataService.js
  backend/src/services/emailTemplates.js
  backend/src/services/reviewService.js
  backend/src/tests/integration/account-data.test.js
  backend/src/tests/integration/reviews.test.js
  backend/src/tests/unit/signedToken.test.js
  backend/src/utils/signedToken.js
  frontend/public/robots.txt
  frontend/src/components/BookDialog.vue
  frontend/src/components/StarRating.vue
  frontend/src/components/book/BookCommunity.vue
  frontend/src/components/book/BookView.vue
  frontend/src/components/review/ReportDialog.vue
  frontend/src/components/review/ReviewCard.vue
  frontend/src/components/review/ReviewEditor.vue
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/router/index.js
  frontend/src/services/api.js
  frontend/src/views/Moderation.vue
  frontend/src/views/PublicLibrary.vue
  frontend/sw/sw.js
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
diff --git a/.gitignore b/.gitignore
index b361fb5fe381b1e8eb0d1c37f563afc8c257cd21..81628ca352ccfedf8dcc431ed6b5e470fada5a44 100644
--- a/.gitignore
+++ b/.gitignore
@@ -35,6 +35,7 @@ coverage
 # Capas enviadas pelos usuários (volume do Docker e pasta local dos testes)
 uploads/
 backend/uploads/
+uploads-test/
 
 # Scripts de entrega dos pacotes: rodam a partir de fora do repositório
 /pacote-*.sh
diff --git a/README.md b/README.md
index 03d17fd74561e4e06b753a60430cf7d1f64e2b97..1b751dfcda92dea59802db821458ce38a5f0a05b 100644
--- a/README.md
+++ b/README.md
@@ -142,7 +142,7 @@ server {
 
 ### Email (password recovery and sign-up confirmation)
 
-The API sends email over SMTP: the password reset link (valid for 1 hour), the sign-up confirmation link (valid for 3 days) and, for users who turn it on in Account, follower notifications (someone asked to follow you / accepted your request) — at most one every `FOLLOW_EMAIL_INTERVAL_HOURS` (default 6), with one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058). Until a user confirms their email, public library, community and following stay locked; accounts that existed before this version count as confirmed.
+The API sends email over SMTP: the password reset link (valid for 1 hour), the sign-up confirmation link (valid for 3 days) and, for users who turn it on in Account, follower notifications (someone asked to follow you / accepted your request) — at most one every `FOLLOW_EMAIL_INTERVAL_HOURS` (default 6), with one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058). When a reader reports a review, `ADMIN_EMAIL` gets the review text and a signed link to `/moderation` to hide it or keep it visible; after 3 reports from different readers it is hidden automatically until reviewed. Until a user confirms their email, public library, community and following stay locked; accounts that existed before this version count as confirmed.
 
 Set in `backend/src/.env`:
 
@@ -155,6 +155,7 @@ SMTP_USER=...
 SMTP_PASS=...
 MAIL_FROM="Librishelf <noreply@librishelf.com>"
 # FOLLOW_EMAIL_INTERVAL_HOURS=6         # optional
+ADMIN_EMAIL=you@example.com             # receives review reports (link to hide/keep); without it reports only go to the log
 ```
 
 To send as `@librishelf.com` without landing in spam, add the SPF and DKIM records your SMTP provider gives you to the domain's DNS (and ideally a DMARC record). Without `SMTP_HOST` nothing is sent: the email content, links included, goes to the server log — handy for local development.
diff --git a/backend/db/migrations/011_reviews.sql b/backend/db/migrations/011_reviews.sql
new file mode 100644
index 0000000000000000000000000000000000000000..26467ddc7cfe7fab80e5e3917dad0ff0a5c87c0e
--- /dev/null
+++ b/backend/db/migrations/011_reviews.sql
@@ -0,0 +1,41 @@
+-- 011 — resenhas públicas
+-- Idempotente: pode rodar mais de uma vez.
+--
+-- Uma resenha por livro da estante (as anotações continuam privadas, em
+-- books.notes). Quem vê: "public" (quem vê a biblioteca pública; na
+-- comunidade do livro, só se o autor participa da comunidade) ou
+-- "followers" (só seguidores aprovados). Bloqueio esconde nos dois sentidos.
+-- Moderação: denúncias vão por e-mail para quem administra; com 3 denúncias
+-- de pessoas diferentes a resenha some até alguém revisar (hidden_at).
+CREATE TABLE IF NOT EXISTS librishelf.reviews (
+  id          serial PRIMARY KEY,
+  book_id     integer NOT NULL UNIQUE REFERENCES librishelf.books(id) ON DELETE CASCADE,
+  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
+  has_spoiler boolean NOT NULL DEFAULT false,
+  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers')),
+  hidden_at   timestamptz,
+  hidden_reason text,
+  reviewed_at timestamptz,
+  created_at  timestamptz NOT NULL DEFAULT now(),
+  updated_at  timestamptz NOT NULL DEFAULT now()
+);
+
+CREATE INDEX IF NOT EXISTS idx_reviews_user ON librishelf.reviews (user_id, updated_at DESC);
+
+CREATE TABLE IF NOT EXISTS librishelf.review_likes (
+  review_id  integer NOT NULL REFERENCES librishelf.reviews(id) ON DELETE CASCADE,
+  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  created_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (review_id, user_id)
+);
+
+CREATE TABLE IF NOT EXISTS librishelf.review_reports (
+  id          serial PRIMARY KEY,
+  review_id   integer NOT NULL REFERENCES librishelf.reviews(id) ON DELETE CASCADE,
+  reporter_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  reason      text NOT NULL CHECK (reason IN ('spoiler', 'offensive', 'spam', 'other')),
+  note        text CHECK (note IS NULL OR char_length(note) <= 500),
+  created_at  timestamptz NOT NULL DEFAULT now(),
+  UNIQUE (review_id, reporter_id)
+);
diff --git a/backend/db/schema.sql b/backend/db/schema.sql
index 6d31931d2d3f6cb10fc3cba7822880fbe78ce675..df1ee37d0408c562ce76847db631f304944e6178 100644
--- a/backend/db/schema.sql
+++ b/backend/db/schema.sql
@@ -1473,3 +1473,50 @@ CREATE TABLE IF NOT EXISTS librishelf.follow_email_queue (
 INSERT INTO librishelf.schema_migrations (version)
 VALUES ('010_follow_emails')
 ON CONFLICT (version) DO NOTHING;
+
+-- ===========================================================================
+-- 011 — resenhas públicas
+-- ===========================================================================
+--
+-- Uma resenha por livro da estante (as anotações continuam privadas, em
+-- books.notes). Quem vê: "public" (quem vê a biblioteca pública; na
+-- comunidade do livro, só se o autor participa da comunidade) ou
+-- "followers" (só seguidores aprovados). Bloqueio esconde nos dois sentidos.
+-- Moderação: denúncias vão por e-mail para quem administra; com 3 denúncias
+-- de pessoas diferentes a resenha some até alguém revisar (hidden_at).
+CREATE TABLE IF NOT EXISTS librishelf.reviews (
+  id          serial PRIMARY KEY,
+  book_id     integer NOT NULL UNIQUE REFERENCES librishelf.books(id) ON DELETE CASCADE,
+  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
+  has_spoiler boolean NOT NULL DEFAULT false,
+  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers')),
+  hidden_at   timestamptz,
+  hidden_reason text,
+  reviewed_at timestamptz,
+  created_at  timestamptz NOT NULL DEFAULT now(),
+  updated_at  timestamptz NOT NULL DEFAULT now()
+);
+
+CREATE INDEX IF NOT EXISTS idx_reviews_user ON librishelf.reviews (user_id, updated_at DESC);
+
+CREATE TABLE IF NOT EXISTS librishelf.review_likes (
+  review_id  integer NOT NULL REFERENCES librishelf.reviews(id) ON DELETE CASCADE,
+  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  created_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (review_id, user_id)
+);
+
+CREATE TABLE IF NOT EXISTS librishelf.review_reports (
+  id          serial PRIMARY KEY,
+  review_id   integer NOT NULL REFERENCES librishelf.reviews(id) ON DELETE CASCADE,
+  reporter_id integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
+  reason      text NOT NULL CHECK (reason IN ('spoiler', 'offensive', 'spam', 'other')),
+  note        text CHECK (note IS NULL OR char_length(note) <= 500),
+  created_at  timestamptz NOT NULL DEFAULT now(),
+  UNIQUE (review_id, reporter_id)
+);
+
+INSERT INTO librishelf.schema_migrations (version)
+VALUES ('011_reviews')
+ON CONFLICT (version) DO NOTHING;
diff --git a/backend/src/.env.example b/backend/src/.env.example
index 76e5b2845922cc6da9d015c34ef5bce52ed0e543..929bb0b04ccedb6614ffbb1318f798d22b3a2db5 100644
--- a/backend/src/.env.example
+++ b/backend/src/.env.example
@@ -47,3 +47,7 @@ MAIL_FROM="Librishelf <noreply@librishelf.com>"
 # Avisos de seguidores (opt-in na Conta): no máximo um e-mail a cada N horas
 # por pessoa; o que acontecer no meio-tempo vai junto. Opcional (padrão 6).
 # FOLLOW_EMAIL_INTERVAL_HOURS=6
+# Recebe as denúncias de resenhas, com link para ocultar ou manter. Sem ela, a
+# denúncia só aparece no log do servidor (e a resenha ainda é ocultada sozinha
+# depois de 3 denúncias de pessoas diferentes).
+ADMIN_EMAIL=
diff --git a/backend/src/.env.test.example b/backend/src/.env.test.example
index 85b2419348e36817eeff52cf8e1020704b777485..8a0654ab7209db45455923df57e6a2617194845e 100644
--- a/backend/src/.env.test.example
+++ b/backend/src/.env.test.example
@@ -4,4 +4,5 @@ DB_NAME=librishelf_test
 DB_PASSWORD=
 DB_PORT=
 SECRET_KEY=
-ALLOW_DESTRUCTIVE_TEST_DB=true
\ No newline at end of file
+ALLOW_DESTRUCTIVE_TEST_DB=true# Capas enviadas nos testes (fora da pasta de uploads do desenvolvimento)
+UPLOAD_DIR=./uploads-test
diff --git a/backend/src/app.js b/backend/src/app.js
index a23003faa1cd9687c5d55f6fd2cd061fa11eebe8..fd6ddb28739f87bb360ced3d94f0f625384a65f8 100644
--- a/backend/src/app.js
+++ b/backend/src/app.js
@@ -14,6 +14,8 @@ import socialRoutes from './routes/social.js'
 import uploadsRoutes from './routes/uploads.js'
 import metaRoutes from './routes/meta.js'
 import emailRoutes from './routes/email.js'
+import reviewRoutes from './routes/reviews.js'
+import moderationRoutes from './routes/moderation.js'
 import errorHandler from './middlewares/errorHandler.js'
 import corsOptions from './config/corsOptions.js'
 import trustProxy from './config/trustProxy.js'
@@ -41,6 +43,8 @@ app.use('/community', communityRoutes)
 app.use('/social', socialRoutes)
 app.use('/meta', metaRoutes)
 app.use('/email', emailRoutes)
+app.use('/reviews', reviewRoutes)
+app.use('/moderation', moderationRoutes)
 app.get('/ping', (req, res) => { res.json({ message: 'pong' }) })
 
 app.use(errorHandler)
diff --git a/backend/src/database/queries.js b/backend/src/database/queries.js
index 99edb84dcdd65d44b8d9659a5543794d30d1f932..c2c7acd9539c7e6844b735594b7bcf91ec71779d 100644
--- a/backend/src/database/queries.js
+++ b/backend/src/database/queries.js
@@ -594,6 +594,8 @@ export const DATA_QUERIES = {
           'progressPercent', r.progress_percent)
           ORDER BY r.finished_on NULLS LAST, r.started_on, r.id)
         FROM librishelf.readings r WHERE r.book_id = b.id), '[]'::json) AS readings,
+      (SELECT json_build_object('body', rv.body, 'hasSpoiler', rv.has_spoiler, 'visibility', rv.visibility)
+        FROM librishelf.reviews rv WHERE rv.book_id = b.id) AS review,
       to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS added_at
     FROM librishelf.books b
     LEFT JOIN librishelf.publishers p ON p.id = b.publisher_id
@@ -846,3 +848,110 @@ export const FOLLOW_EMAIL_QUERIES = {
     RETURNING follow_emails, email_locale
   `
 }
+
+// ---------------------------------------------------------------------------
+// Resenhas (migration 011)
+// ---------------------------------------------------------------------------
+// Quem vê a resenha r (autor u) sendo o leitor `viewer` (id ou NULL):
+//   - public:    biblioteca do autor pública
+//   - followers: leitor é seguidor aprovado (e o autor aceita seguidores)
+//   - nunca:     oculta pela moderação, conta inativa, bloqueio entre os dois
+const REVIEW_VISIBLE = viewer => `(
+  r.hidden_at IS NULL AND u.is_active IS NOT FALSE
+  AND (
+    (r.visibility = 'public' AND u.is_public)
+    OR (r.visibility = 'followers' AND ${viewer}::int IS NOT NULL AND u.show_activity AND EXISTS (
+      SELECT 1 FROM librishelf.follows f
+      WHERE f.follower_id = ${viewer}::int AND f.followee_id = u.id AND f.status = 'accepted'))
+  )
+  AND (${viewer}::int IS NULL OR ${NOT_BLOCKED('u.id', `${viewer}::int`)})
+)`
+
+const REVIEW_COLUMNS = viewer => `
+  r.id, r.book_id, r.user_id, r.body, r.has_spoiler, r.visibility,
+  (r.hidden_at IS NOT NULL) AS hidden,
+  r.created_at, r.updated_at,
+  u.name AS username, u.is_public,
+  b.title, b.rating, ${AUTHORS_OF('b.id')} AS authors,
+  (SELECT count(*)::int FROM librishelf.review_likes l WHERE l.review_id = r.id) AS like_count,
+  (${viewer}::int IS NOT NULL AND EXISTS (
+    SELECT 1 FROM librishelf.review_likes l WHERE l.review_id = r.id AND l.user_id = ${viewer}::int)) AS liked_by_me
+`
+
+const REVIEW_FROM = `
+  FROM librishelf.reviews r
+  JOIN librishelf.users u ON u.id = r.user_id
+  JOIN librishelf.books b ON b.id = r.book_id
+`
+
+export const REVIEW_QUERIES = {
+  // A do próprio dono (vê mesmo oculta)
+  OWN: `SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM} WHERE r.book_id = $1 AND r.user_id = $2`,
+  UPSERT: `
+    INSERT INTO librishelf.reviews (book_id, user_id, body, has_spoiler, visibility)
+    VALUES ($1, $2, $3, $4, $5)
+    ON CONFLICT (book_id) DO UPDATE
+      SET body = EXCLUDED.body, has_spoiler = EXCLUDED.has_spoiler,
+          visibility = EXCLUDED.visibility, updated_at = now()
+    RETURNING id
+  `,
+  DELETE_OWN: 'DELETE FROM librishelf.reviews WHERE book_id = $1 AND user_id = $2',
+  // Livro aberto na biblioteca pública ($1 livro, $2 leitor ou NULL)
+  OF_BOOK_FOR_VIEWER: `SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM} WHERE r.book_id = $1 AND ${REVIEW_VISIBLE('$2')}`,
+  // Perfil público: as mais recentes do autor $1 que o leitor $2 pode ver
+  OF_USER_FOR_VIEWER: `
+    SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM}
+    WHERE r.user_id = $1 AND ${REVIEW_VISIBLE('$2')}
+    ORDER BY r.updated_at DESC, r.id DESC
+    LIMIT $3
+  `,
+  COUNT_OF_USER_FOR_VIEWER: `SELECT count(*)::int AS total ${REVIEW_FROM} WHERE r.user_id = $1 AND ${REVIEW_VISIBLE('$2')}`,
+  // Comunidade do livro $1 (do leitor $2): resenhas de outros leitores do mesmo
+  // livro. Públicas só de quem participa da comunidade; "seguidores" para quem segue.
+  OF_SAME_BOOK: `
+    WITH me AS (
+      SELECT ol_work_key, isbn13 FROM librishelf.books WHERE id = $1 AND user_id = $2
+    )
+    SELECT ${REVIEW_COLUMNS('$2')} ${REVIEW_FROM}
+    JOIN me ON ${SAME_BOOK('me', 'b')}
+    WHERE r.user_id <> $2 AND ${REVIEW_VISIBLE('$2')}
+      AND (r.visibility = 'followers' OR u.show_in_community)
+    ORDER BY like_count DESC, r.updated_at DESC
+    LIMIT $3
+  `,
+  // Para curtir/denunciar: a resenha existe e o leitor pode vê-la
+  VISIBLE_TO: `SELECT r.id, r.user_id ${REVIEW_FROM} WHERE r.id = $1 AND ${REVIEW_VISIBLE('$2')}`,
+  LIKE: 'INSERT INTO librishelf.review_likes (review_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
+  UNLIKE: 'DELETE FROM librishelf.review_likes WHERE review_id = $1 AND user_id = $2',
+  LIKE_COUNT: 'SELECT count(*)::int AS total FROM librishelf.review_likes WHERE review_id = $1',
+  REPORT: `
+    INSERT INTO librishelf.review_reports (review_id, reporter_id, reason, note)
+    VALUES ($1, $2, $3, $4)
+    ON CONFLICT (review_id, reporter_id) DO NOTHING
+    RETURNING id
+  `,
+  // Denúncias desde a última revisão (quem revisou e manteve "zera a conta")
+  OPEN_REPORTS: `
+    SELECT count(DISTINCT rr.reporter_id)::int AS total
+    FROM librishelf.review_reports rr
+    JOIN librishelf.reviews r ON r.id = rr.review_id
+    WHERE rr.review_id = $1 AND (r.reviewed_at IS NULL OR rr.created_at > r.reviewed_at)
+  `,
+  AUTO_HIDE: `
+    UPDATE librishelf.reviews SET hidden_at = now(), hidden_reason = 'reports'
+    WHERE id = $1 AND hidden_at IS NULL
+    RETURNING id
+  `,
+  // Moderação (link assinado no e-mail de denúncia)
+  FOR_MODERATION: `SELECT ${REVIEW_COLUMNS('NULL')}, r.hidden_at, r.hidden_reason, r.reviewed_at ${REVIEW_FROM} WHERE r.id = $1`,
+  REPORTS_OF: `
+    SELECT rr.reason, rr.note, rr.created_at, u.name AS reporter
+    FROM librishelf.review_reports rr
+    JOIN librishelf.users u ON u.id = rr.reporter_id
+    WHERE rr.review_id = $1
+    ORDER BY rr.created_at DESC
+    LIMIT 50
+  `,
+  HIDE: "UPDATE librishelf.reviews SET hidden_at = now(), hidden_reason = 'moderation', reviewed_at = now() WHERE id = $1 RETURNING id",
+  SHOW: 'UPDATE librishelf.reviews SET hidden_at = NULL, hidden_reason = NULL, reviewed_at = now() WHERE id = $1 RETURNING id'
+}
diff --git a/backend/src/middlewares/rateLimiter.js b/backend/src/middlewares/rateLimiter.js
index ce8fb75aab15c5eee6864d0101d9cc00695d2a83..098a695cc069528974099371d6512491025ab69c 100644
--- a/backend/src/middlewares/rateLimiter.js
+++ b/backend/src/middlewares/rateLimiter.js
@@ -80,6 +80,15 @@ const coverProxyLimiter = buildLimiter({
   code: 'RATE_LIMIT'
 })
 
+// Denúncias de resenha: poucas por pessoa (cada uma pode virar e-mail)
+const reportLimiter = buildLimiter({
+  windowMs: 60 * 60 * 1000,
+  max: 10,
+  perUser: true,
+  message: 'Muitas denúncias em pouco tempo. Tente novamente mais tarde.',
+  code: 'RATE_LIMIT_REPORTS'
+})
+
 // Trecho de <head> das bibliotecas públicas, pedido pelo nginx a cada
 // abertura de /u/<usuário>. Generoso: em 429 o nginx cai no noindex padrão.
 const metaLimiter = buildLimiter({
@@ -123,4 +132,4 @@ const tokenLimiter = buildLimiter({
   code: 'RATE_LIMIT_ATTEMPTS'
 })
 
-export { mailLimiter, tokenLimiter, loginLimiter, registerLimiter, sensitiveLimiter, uploadLimiter, publicLimiter, metaLimiter, isbnLimiter, bookSearchLimiter, coverProxyLimiter, socialLimiter }
+export { mailLimiter, tokenLimiter, loginLimiter, registerLimiter, sensitiveLimiter, uploadLimiter, publicLimiter, metaLimiter, isbnLimiter, bookSearchLimiter, coverProxyLimiter, reportLimiter, socialLimiter }
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index b301739650875739c41196a4c10a703029a12263..939697081aea2a5fde4f4f17f05b4fdd19a74465 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -3,6 +3,7 @@ import fs from 'fs/promises'
 import path from 'path'
 import multer from 'multer'
 import * as readingService from '../services/readingService.js'
+import * as reviewService from '../services/reviewService.js'
 import * as libraryService from '../services/libraryService.js'
 import * as dataService from '../services/dataService.js'
 import { authenticateToken, optionalAuth } from '../middlewares/auth.js'
@@ -107,13 +108,15 @@ router.get('/public/u/:username/profile', publicLimiter, optionalAuth, async (re
   }
 })
 
-router.get('/public/u/:username/book/:id', publicLimiter, validateNumericId(), async (req, res) => {
+router.get('/public/u/:username/book/:id', publicLimiter, optionalAuth, validateNumericId(), async (req, res) => {
   try {
     const { username, id } = req.params
     const book = await libraryService.getPublicBook(username, id)
 
     if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Livro não encontrado.', 'BOOK_NOT_FOUND'))
 
+    // Resenha do dono, se quem está vendo pode lê-la (pública ou seguidor)
+    book.review = await reviewService.forPublicBook(Number(id), req.user?.id)
     res.status(STATUS.OK).json(book)
   } catch (error) {
     sendError(res, error, 'Erro ao buscar livro público')
@@ -315,6 +318,34 @@ router.patch('/:id/status', validateNumericId(), async (req, res) => {
   }
 })
 
+// --- Resenha do livro (pública ou para seguidores) ---
+
+router.get('/:id/review', validateNumericId(), async (req, res) => {
+  try {
+    res.status(STATUS.OK).json({ review: await reviewService.getOwn(Number(req.params.id), req.user.id) })
+  } catch (error) {
+    sendError(res, error, 'Erro ao buscar resenha')
+  }
+})
+
+// { body, hasSpoiler?, visibility?: 'public' | 'followers' }
+router.put('/:id/review', validateNumericId(), async (req, res) => {
+  try {
+    res.status(STATUS.OK).json({ review: await reviewService.save(Number(req.params.id), req.user.id, req.body ?? {}) })
+  } catch (error) {
+    sendError(res, error, 'Erro ao salvar resenha')
+  }
+})
+
+router.delete('/:id/review', validateNumericId(), async (req, res) => {
+  try {
+    await reviewService.remove(Number(req.params.id), req.user.id)
+    res.status(STATUS.OK).json({ review: null })
+  } catch (error) {
+    sendError(res, error, 'Erro ao apagar resenha')
+  }
+})
+
 // --- Leituras (histórico, releituras) e progresso ---
 
 router.get('/:id/readings', validateNumericId(), async (req, res) => {
diff --git a/backend/src/routes/moderation.js b/backend/src/routes/moderation.js
new file mode 100644
index 0000000000000000000000000000000000000000..de84d1a33234b98c8b0953035b7850ec589d8c12
--- /dev/null
+++ b/backend/src/routes/moderation.js
@@ -0,0 +1,38 @@
+import express from 'express'
+import { tokenLimiter } from '../middlewares/rateLimiter.js'
+import * as reviewService from '../services/reviewService.js'
+import STATUS from '../utils/statusCodes.js'
+import sendError from '../utils/sendError.js'
+
+/**
+ * Moderação de resenha pelo link do e-mail de denúncia (vai para
+ * ADMIN_EMAIL). Sem login: o token assinado identifica a resenha e só vale
+ * para ela. GET mostra; POST oculta ou mantém.
+ */
+const router = express.Router()
+
+router.get('/review', tokenLimiter, async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await reviewService.forModeration(String(req.query.token ?? '')))
+  } catch (error) {
+    sendError(res, error, 'Erro ao abrir moderação')
+  }
+})
+
+router.post('/review/hide', tokenLimiter, async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await reviewService.moderate(String(req.query.token ?? ''), true))
+  } catch (error) {
+    sendError(res, error, 'Erro ao ocultar resenha')
+  }
+})
+
+router.post('/review/show', tokenLimiter, async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await reviewService.moderate(String(req.query.token ?? ''), false))
+  } catch (error) {
+    sendError(res, error, 'Erro ao reexibir resenha')
+  }
+})
+
+export default router
diff --git a/backend/src/routes/reviews.js b/backend/src/routes/reviews.js
new file mode 100644
index 0000000000000000000000000000000000000000..1e4516ba6a30f38b3f26c36fa9a3b747fe01c1df
--- /dev/null
+++ b/backend/src/routes/reviews.js
@@ -0,0 +1,39 @@
+import express from 'express'
+import { authenticateToken } from '../middlewares/auth.js'
+import { socialLimiter, reportLimiter } from '../middlewares/rateLimiter.js'
+import { validateNumericId } from '../middlewares/validateId.js'
+import * as reviewService from '../services/reviewService.js'
+import STATUS from '../utils/statusCodes.js'
+import sendError from '../utils/sendError.js'
+
+/** Curtir e denunciar resenhas de outros leitores (precisa estar logado). */
+const router = express.Router()
+
+router.use(authenticateToken)
+
+router.post('/:id/like', socialLimiter, validateNumericId(), async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await reviewService.like(Number(req.params.id), req.user.id, true))
+  } catch (error) {
+    sendError(res, error, 'Erro ao curtir resenha')
+  }
+})
+
+router.delete('/:id/like', socialLimiter, validateNumericId(), async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await reviewService.like(Number(req.params.id), req.user.id, false))
+  } catch (error) {
+    sendError(res, error, 'Erro ao descurtir resenha')
+  }
+})
+
+// { reason: 'spoiler' | 'offensive' | 'spam' | 'other', note? }
+router.post('/:id/report', reportLimiter, validateNumericId(), async (req, res) => {
+  try {
+    res.status(STATUS.OK).json(await reviewService.report(Number(req.params.id), req.user.id, req.body ?? {}))
+  } catch (error) {
+    sendError(res, error, 'Erro ao denunciar resenha')
+  }
+})
+
+export default router
diff --git a/backend/src/scripts/previewEmails.js b/backend/src/scripts/previewEmails.js
index a5e905843f74149f8f196fbb052fe12139da5cdf..3315061d425fcb085ca7cb7b23289f21d9fabbf6 100644
--- a/backend/src/scripts/previewEmails.js
+++ b/backend/src/scripts/previewEmails.js
@@ -7,7 +7,7 @@
 import fs from 'node:fs'
 import os from 'node:os'
 import path from 'node:path'
-import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail, followDigestEmail } from '../services/emailTemplates.js'
+import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail, followDigestEmail, reviewReportEmail } from '../services/emailTemplates.js'
 
 const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'librishelf-emails'))
 fs.mkdirSync(outDir, { recursive: true })
@@ -23,7 +23,8 @@ const emails = {
   'email-trocado-pt': emailChangedEmail({ name: 'Rodrigo', link: `${base}/forgot-password`, locale: 'pt', newEmail: 'ro•••@gmail.com' }),
   'seguidores-1-pt': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=requests`, locale: 'pt', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'request', actor: 'jesteves' }] }),
   'seguidores-varios-pt': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=requests`, locale: 'pt', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'request', actor: 'jesteves' }, { kind: 'request', actor: 'marina.lê' }, { kind: 'accepted', actor: 'caio_r' }] }),
-  'seguidores-aceito-en': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=following`, locale: 'en', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'accepted', actor: 'jesteves' }] })
+  'seguidores-aceito-en': followDigestEmail({ name: 'Rodrigo', link: `${base}/community?tab=following`, locale: 'en', hours: 6, unsubscribe: `${base}/unsubscribe?token=1.${token.slice(0, 32)}`, items: [{ kind: 'accepted', actor: 'jesteves' }] }),
+  'denuncia-pt': reviewReportEmail({ name: 'moderação', link: `${base}/moderation?token=12.${token.slice(0, 32)}`, locale: 'pt', author: 'jesteves', title: 'Silas e o Inverno', excerpt: 'Demorei a engrenar, mas depois não consegui largar.\n\nO final, com a revelação de que o narrador mentia, muda tudo.', reason: 'spoiler', note: 'Conta o final sem marcar como spoiler.', total: 3, hidden: true })
 }
 
 for (const [file, mail] of Object.entries(emails)) {
diff --git a/backend/src/scripts/seed.js b/backend/src/scripts/seed.js
index 169678b2afe6ce3a17fbb0e82dffbfa351c2ebce..3d8eacc3670b5a7cf8a39957f964c8f9be6dc184 100644
--- a/backend/src/scripts/seed.js
+++ b/backend/src/scripts/seed.js
@@ -629,6 +629,80 @@ async function insertReadings() {
   `)
 }
 
+// Resenhas: frases por faixa de nota, juntadas em 1 a 4 parágrafos
+const REVIEW_OPENERS = {
+  high: ['Que livro.', 'Terminei com vontade de começar de novo.', 'Um dos melhores que li nos últimos anos.', 'Demorei a engrenar, mas depois não consegui largar.', 'Li em dois dias.'],
+  mid: ['Gostei, com ressalvas.', 'Bom livro, mas esperava mais.', 'Começa muito bem e perde um pouco o fôlego no meio.', 'Leitura agradável, sem grandes surpresas.'],
+  low: ['Não funcionou para mim.', 'Insisti até o fim, mas foi difícil.', 'A premissa é ótima, a execução nem tanto.', 'Abandonei duas vezes antes de terminar.']
+}
+const REVIEW_MIDDLES = [
+  'A construção dos personagens é o ponto mais forte: dá para entender cada escolha, mesmo as piores.',
+  'O ritmo alterna capítulos curtíssimos com outros longos e contemplativos, o que nem sempre ajuda.',
+  'A ambientação é tão bem feita que dá vontade de procurar o lugar no mapa.',
+  'Os diálogos soam naturais, e o humor aparece nos momentos certos.',
+  'Algumas passagens ficaram comigo por dias — marquei várias páginas.',
+  'A tradução tem alguns tropeços, mas nada que atrapalhe a leitura.',
+  'O narrador esconde informações de propósito, e a recompensa vem no último terço.',
+  'Senti falta de mais desenvolvimento dos personagens secundários.',
+  'É o tipo de livro que pede leitura lenta, com pausas.'
+]
+const REVIEW_SPOILERS = [
+  'O final, com a revelação de que o narrador estava mentindo desde o primeiro capítulo, muda tudo o que veio antes.',
+  'A morte do irmão no meio do livro me pegou completamente desprevenida.',
+  'Quando descobrimos quem escreveu as cartas, várias pistas do começo fazem sentido.'
+]
+const REVIEW_CLOSERS = {
+  high: ['Recomendo muito.', 'Vou procurar outros do mesmo autor.', 'Entrou para a lista de favoritos.'],
+  mid: ['Vale a leitura, sem expectativas altas.', 'Bom para ler nas férias.', 'Leria o próximo da série.'],
+  low: ['Não recomendaria, mas entendo quem gosta.', 'Talvez eu não estivesse no momento certo para ele.', 'Fica a curiosidade sobre os outros livros do autor.']
+}
+
+function reviewText(rating, withSpoiler) {
+  const band = rating >= 4 ? 'high' : rating === 3 ? 'mid' : 'low'
+  const parts = [pick(REVIEW_OPENERS[band])]
+  for (const middle of pickSome(REVIEW_MIDDLES, int(0, 3))) parts.push(middle)
+  if (withSpoiler) parts.push(pick(REVIEW_SPOILERS))
+  parts.push(pick(REVIEW_CLOSERS[band]))
+  // Às vezes um parágrafo só; às vezes quebrado em dois ou três
+  if (parts.length > 2 && chance(0.6)) {
+    const cut = int(1, parts.length - 1)
+    return `${parts.slice(0, cut).join(' ')}\n\n${parts.slice(cut).join(' ')}`
+  }
+  return parts.join(' ')
+}
+
+async function insertReviews() {
+  const { rows: books } = await db.query(`
+    SELECT b.id, b.user_id, b.rating, b.read_date, u.name = 'demo' AS demo
+      FROM librishelf.books b
+      JOIN librishelf.users u ON u.id = b.user_id
+     WHERE b.read_date IS NOT NULL AND b.rating IS NOT NULL
+     ORDER BY b.id
+  `)
+  const reviews = []
+  for (const book of books) {
+    if (!chance(book.demo ? 0.3 : 0.18)) continue
+    const spoiler = chance(0.12)
+    const written = Math.min(NOW, new Date(book.read_date).getTime() + int(0, 20) * DAY)
+    reviews.push([book.id, book.user_id, reviewText(book.rating, spoiler), spoiler, chance(0.15) ? 'followers' : 'public', new Date(written).toISOString()])
+  }
+  for (let i = 0; i < reviews.length; i += 500) {
+    const chunk = reviews.slice(i, i + 500)
+    const values = chunk.map((_, j) => `($${j * 6 + 1}, $${j * 6 + 2}, $${j * 6 + 3}, $${j * 6 + 4}, $${j * 6 + 5}, $${j * 6 + 6}, $${j * 6 + 6})`).join(', ')
+    await db.query(`INSERT INTO librishelf.reviews (book_id, user_id, body, has_spoiler, visibility, created_at, updated_at) VALUES ${values}`, chunk.flat())
+  }
+  // Curtidas de leitores com biblioteca pública (cada resenha pública, de 0 a ~12)
+  await db.query(`
+    INSERT INTO librishelf.review_likes (review_id, user_id)
+    SELECT r.id, u.id
+      FROM librishelf.reviews r
+      JOIN librishelf.users u ON u.is_public AND u.id <> r.user_id
+     WHERE r.visibility = 'public' AND (r.id * 31 + u.id * 17) % 23 < (r.id % 4)
+    ON CONFLICT DO NOTHING
+  `)
+  return reviews.length
+}
+
 async function main() {
   await checkSafety()
   logger.info('Populando banco local', { db: process.env.DB_NAME, host: process.env.DB_HOST || 'localhost', ...CONFIG })
@@ -644,6 +718,7 @@ async function main() {
   await insertReadingStatusAndGoals()
   await insertReadings()
   await insertSeriesAndNotes()
+  const reviews = await insertReviews()
   const follows = await insertFollows(users)
   const covers = CONFIG.covers ? await generateCovers(catalog) : 0
 
@@ -667,6 +742,7 @@ async function main() {
     ...summary,
     livros_gravados: books,
     seguir: follows,
+    resenhas: reviews,
     capas: covers,
     segundos: Math.round((Date.now() - startedAt) / 1000),
     login: `demo / ${PASSWORD} (todas as contas usam a mesma senha)`
diff --git a/backend/src/services/communityService.js b/backend/src/services/communityService.js
index 287f39789ae6740428d39124d5e6fd6c6e836f14..2a2887948fcf86b94c2d870f3c5689c94e8734a4 100644
--- a/backend/src/services/communityService.js
+++ b/backend/src/services/communityService.js
@@ -3,6 +3,7 @@ import * as libraryRepository from '../repositories/libraryRepository.js'
 import * as authRepository from '../repositories/authRepository.js'
 import * as socialRepository from '../repositories/socialRepository.js'
 import * as readingService from './readingService.js'
+import * as reviewService from './reviewService.js'
 import STATUS from '../utils/statusCodes.js'
 import { httpError } from '../utils/httpError.js'
 
@@ -23,11 +24,13 @@ export async function bookCommunity(bookId, userId) {
   const readers = await communityRepository.readersOfBook(bookId, userId)
   const ratings = readers.map(r => r.rating).filter(r => r !== null)
 
-  const alsoHave = readers.length > 0
-    ? await communityRepository.alsoHave(bookId, userId, ALSO_HAVE_LIMIT)
-    : []
+  const [alsoHave, reviews] = await Promise.all([
+    readers.length > 0 ? communityRepository.alsoHave(bookId, userId, ALSO_HAVE_LIMIT) : [],
+    reviewService.forSameBook(bookId, userId)
+  ])
 
   return {
+    reviews,
     readerCount: readers.length,
     readers: readers
       .map(r => ({ username: r.username, hasRead: r.has_read, rating: r.rating }))
@@ -73,6 +76,9 @@ export async function publicProfile(username, viewerId) {
     viewer: null
   }
 
+  // Resenhas que este leitor pode ver (públicas; "seguidores" se ele segue)
+  profile.reviews = await reviewService.forProfile(user.id, viewerId)
+
   if (viewerId) {
     if (viewerId === user.id) {
       profile.viewer = { isOwner: true }
diff --git a/backend/src/services/dataService.js b/backend/src/services/dataService.js
index 066299bc4e8c29540b08aa0a492faa030a36a7fa..81e0775892e6109071ffdcb49fa5b727ff504a19 100644
--- a/backend/src/services/dataService.js
+++ b/backend/src/services/dataService.js
@@ -1,5 +1,5 @@
 import { db } from '../database/connection.js'
-import { DATA_QUERIES as q } from '../database/queries.js'
+import { DATA_QUERIES as q, REVIEW_QUERIES } from '../database/queries.js'
 import * as libraryRepository from '../repositories/libraryRepository.js'
 import { normalizeBookInput } from './libraryService.js'
 import * as readingService from './readingService.js'
@@ -23,7 +23,9 @@ export const CSV_COLUMNS = [
   'title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date',
   'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at',
   // Releituras: todas as datas de fim, da mais antiga para a mais recente
-  'read_dates', 'pages'
+  'read_dates', 'pages',
+  // Resenha (texto, spoiler 'yes'/vazio, public/followers)
+  'review', 'review_spoiler', 'review_visibility'
 ]
 
 // Vários nomes numa célula: separados por "; " (nome de autor pode ter vírgula).
@@ -73,6 +75,7 @@ export async function exportJson(userId) {
       notes: book.notes,
       pages: book.page_count,
       readings: book.readings,
+      review: book.review,
       addedAt: book.added_at
     }))
   }
@@ -96,7 +99,10 @@ export async function exportCsv(userId) {
     book.notes,
     book.added_at,
     book.readings.map(r => r.finishedOn).filter(Boolean).join(LIST_SEPARATOR),
-    book.page_count
+    book.page_count,
+    book.review?.body ?? '',
+    book.review?.hasSpoiler ? 'yes' : '',
+    book.review?.visibility ?? ''
   ])
   return toCsv([CSV_COLUMNS, ...rows])
 }
@@ -107,6 +113,7 @@ export async function exportCsv(userId) {
 
 export const MAX_IMPORT_ROWS = 5000
 const MAX_NOTES = 5000
+const MAX_REVIEW = 5000
 const GOODREADS_SHELVES = new Set(['read', 'currently-reading', 'to-read'])
 
 /** ="0441013597" (como o Goodreads exporta) → 0441013597. */
@@ -217,6 +224,9 @@ function fromLibrishelf(record) {
       ? uniqueDates([...splitList(record.read_dates, ';').map(cleanDate), cleanDate(record.read_date)])
       : [],
     pages: cleanPages(record.pages),
+    review: String(record.review ?? '').trim().slice(0, MAX_REVIEW) || null,
+    reviewSpoiler: String(record.review_spoiler ?? '').trim().toLowerCase() === 'yes',
+    reviewVisibility: record.review_visibility === 'followers' ? 'followers' : 'public',
     series: String(record.series ?? '').trim() || null,
     seriesIndex: String(record.volume ?? '').trim() || null,
     notes: String(record.notes ?? '').slice(0, MAX_NOTES)
@@ -284,6 +294,9 @@ export async function importCsv(userId, buffer) {
       if (input.series || input.seriesIndex !== null || input.notes || book.pages) {
         await libraryRepository.updateExtras(bookId, { ...input, pageCount: book.pages ?? null })
       }
+      if (book.review) {
+        await db.query(REVIEW_QUERIES.UPSERT, [bookId, userId, book.review, book.reviewSpoiler, book.reviewVisibility])
+      }
       await readingService.importReadings(bookId, {
         status: book.status,
         finishedDates: book.readDates ?? (book.status === 'read' && input.readDate ? [input.readDate] : []),
diff --git a/backend/src/services/emailTemplates.js b/backend/src/services/emailTemplates.js
index 639d0f2cdefbf657e599590374374ffc89a92670..aa8841f9e9b9b2daa41a05c05a4aa448208f0852 100644
--- a/backend/src/services/emailTemplates.js
+++ b/backend/src/services/emailTemplates.js
@@ -81,6 +81,19 @@ const TEXTS = {
       manage: 'Você também pode mudar isso na Conta, em Avisos por e-mail.',
       footer: 'Você recebeu este e-mail porque ativou os avisos de seguidores no Librishelf. Este é um endereço automático: respostas não são lidas.'
     },
+    report: {
+      subject: ({ title, hidden }) => `${hidden ? '[Oculta] ' : ''}Resenha denunciada: ${title}`,
+      preheader: ({ author, reasonLabel }) => `${author} · ${reasonLabel}`,
+      title: 'Resenha denunciada',
+      greeting: () => 'Olá!',
+      body: ({ hidden, total }) => (hidden
+        ? `Esta resenha recebeu ${total} denúncias e foi ocultada automaticamente até alguém revisar.`
+        : 'Um leitor denunciou esta resenha. Ela continua visível até você decidir.'),
+      line: line => line,
+      button: 'Revisar a resenha',
+      note: 'No link você vê a resenha inteira e as denúncias, e escolhe ocultar ou manter.',
+      ignore: 'Você recebeu este e-mail porque o endereço está em ADMIN_EMAIL no servidor do Librishelf.'
+    },
     fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
     tagline: 'Sua biblioteca pessoal, organizada.',
     footer: 'Você recebeu este e-mail porque ele está cadastrado no Librishelf. Este é um endereço automático: respostas não são lidas.'
@@ -132,6 +145,19 @@ const TEXTS = {
       manage: 'You can also change this in Account, under Email notifications.',
       footer: "You're receiving this email because you turned on follower notifications on Librishelf. This is an automated address: replies are not read."
     },
+    report: {
+      subject: ({ title, hidden }) => `${hidden ? '[Hidden] ' : ''}Review reported: ${title}`,
+      preheader: ({ author, reasonLabel }) => `${author} · ${reasonLabel}`,
+      title: 'Review reported',
+      greeting: () => 'Hi!',
+      body: ({ hidden, total }) => (hidden
+        ? `This review got ${total} reports and was hidden automatically until someone reviews it.`
+        : 'A reader reported this review. It stays visible until you decide.'),
+      line: line => line,
+      button: 'Review it',
+      note: 'The link shows the full review and the reports, and lets you hide or keep it.',
+      ignore: "You're receiving this email because this address is set as ADMIN_EMAIL on the Librishelf server."
+    },
     fallback: "If the button doesn't work, copy and paste this address into your browser:",
     tagline: 'Your personal library, organized.',
     footer: "You're receiving this email because it is registered on Librishelf. This is an automated address: replies are not read."
@@ -310,4 +336,30 @@ export const emailChangedEmail = params => build('changed', params)
  * Avisos de seguidores juntos num e-mail só:
  * { name, link, locale, items: [{ kind: 'request'|'accepted', actor }], hours, unsubscribe }
  */
-export const followDigestEmail = params => build('follow', params)
\ No newline at end of file
+export const followDigestEmail = params => build('follow', params)
+
+const REPORT_REASONS = {
+  pt: { spoiler: 'Spoiler sem aviso', offensive: 'Ofensiva ou discurso de ódio', spam: 'Spam ou propaganda', other: 'Outro motivo' },
+  en: { spoiler: 'Unmarked spoiler', offensive: 'Offensive or hateful', spam: 'Spam or advertising', other: 'Other' }
+}
+
+/**
+ * Denúncia de resenha para quem modera:
+ * { link, locale, author, title, excerpt, reason, note, total, hidden }
+ */
+export function reviewReportEmail({ author, title, excerpt, reason, note, total, hidden, locale, ...rest }) {
+  const code = normalizeLocale(locale)
+  const reasonLabel = REPORT_REASONS[code][reason] || reason
+  const L = code === 'en'
+    ? { book: 'Book', author: 'Author', reason: 'Reason', note: 'Reader note', excerpt: 'Excerpt', count: 'Reports' }
+    : { book: 'Livro', author: 'Autor da resenha', reason: 'Motivo', note: 'Observação do leitor', excerpt: 'Trecho', count: 'Denúncias' }
+  const items = [
+    `${L.book}: ${title}`,
+    `${L.author}: ${author}`,
+    `${L.reason}: ${reasonLabel}`,
+    ...(note ? [`${L.note}: ${note}`] : []),
+    `${L.count}: ${total}`,
+    `${L.excerpt}: “${excerpt}”`
+  ]
+  return build('report', { ...rest, locale: code, items, author, title, reasonLabel, total, hidden })
+}
\ No newline at end of file
diff --git a/backend/src/services/reviewService.js b/backend/src/services/reviewService.js
new file mode 100644
index 0000000000000000000000000000000000000000..f78f6f66555a2e514e86d7a7171b065164c05464
--- /dev/null
+++ b/backend/src/services/reviewService.js
@@ -0,0 +1,216 @@
+import { db } from '../database/connection.js'
+import { REVIEW_QUERIES as q } from '../database/queries.js'
+import * as libraryRepository from '../repositories/libraryRepository.js'
+import { sendMail } from './mailService.js'
+import { reviewReportEmail } from './emailTemplates.js'
+import { signId, readSignedId } from '../utils/signedToken.js'
+import STATUS from '../utils/statusCodes.js'
+import { httpError } from '../utils/httpError.js'
+import logger from '../utils/logger.js'
+
+/**
+ * Resenhas públicas: um texto por livro da estante, que outros leitores podem
+ * ler (as anotações continuam privadas).
+ *
+ *   visibility "public"    → quem vê a biblioteca pública; na comunidade do
+ *                            livro, se o autor participa da comunidade
+ *   visibility "followers" → só seguidores aprovados
+ *   has_spoiler            → o texto aparece borrado até a pessoa pedir
+ *
+ * Curtidas e denúncias são de leitores logados que podem ver a resenha.
+ * Denúncia vai por e-mail para ADMIN_EMAIL (com link para revisar); com
+ * AUTO_HIDE_REPORTS pessoas diferentes denunciando, ela some até a revisão.
+ */
+export const MAX_BODY = 5000
+const MAX_NOTE = 500
+const AUTO_HIDE_REPORTS = 3
+const PROFILE_LIMIT = 6
+const COMMUNITY_LIMIT = 20
+const VISIBILITIES = ['public', 'followers']
+const REASONS = ['spoiler', 'offensive', 'spam', 'other']
+const MODERATION_PURPOSE = 'moderate:review'
+
+function siteUrl() {
+  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
+}
+
+export function toApi(row, { own = false } = {}) {
+  if (!row) return null
+  const review = {
+    id: row.id,
+    bookId: row.book_id,
+    body: row.body,
+    hasSpoiler: row.has_spoiler,
+    visibility: row.visibility,
+    createdAt: row.created_at,
+    updatedAt: row.updated_at,
+    author: { username: row.username, isPublic: row.is_public },
+    book: { title: row.title, authors: row.authors, rating: row.rating },
+    likeCount: row.like_count,
+    likedByMe: row.liked_by_me
+  }
+  if (own) review.hidden = row.hidden
+  return review
+}
+
+async function ensureOwner(bookId, userId) {
+  const owner = await libraryRepository.getBookOwner(bookId)
+  if (!owner) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
+  if (owner.user_id !== userId) throw httpError('Sem permissão.', STATUS.FORBIDDEN, 'PERMISSION_DENIED')
+}
+
+function reviewInput(body = {}) {
+  const text = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim() : ''
+  if (!text) throw httpError('Escreva a resenha.', STATUS.BAD_REQUEST, 'REVIEW_EMPTY')
+  if (text.length > MAX_BODY) {
+    throw httpError(`A resenha pode ter no máximo ${MAX_BODY} caracteres.`, STATUS.BAD_REQUEST, 'REVIEW_TOO_LONG', { max: MAX_BODY })
+  }
+  const visibility = body.visibility ?? 'public'
+  if (!VISIBILITIES.includes(visibility)) {
+    throw httpError("Campo 'visibility' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'visibility' })
+  }
+  if (body.hasSpoiler !== undefined && typeof body.hasSpoiler !== 'boolean') {
+    throw httpError("Campo 'hasSpoiler' precisa ser true ou false.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'hasSpoiler' })
+  }
+  return { body: text, hasSpoiler: Boolean(body.hasSpoiler), visibility }
+}
+
+// ------------------------------------------------------------------ dono
+
+export async function getOwn(bookId, userId) {
+  await ensureOwner(bookId, userId)
+  const { rows } = await db.query(q.OWN, [bookId, userId])
+  return toApi(rows[0], { own: true })
+}
+
+/** PUT /library/:id/review — cria ou altera a resenha do livro. */
+export async function save(bookId, userId, raw) {
+  await ensureOwner(bookId, userId)
+  const input = reviewInput(raw)
+  await db.query(q.UPSERT, [bookId, userId, input.body, input.hasSpoiler, input.visibility])
+  return getOwn(bookId, userId)
+}
+
+export async function remove(bookId, userId) {
+  await ensureOwner(bookId, userId)
+  await db.query(q.DELETE_OWN, [bookId, userId])
+}
+
+// ------------------------------------------------------------------ leitores
+
+/** Resenha do livro aberto na biblioteca pública (ou null). */
+export async function forPublicBook(bookId, viewerId) {
+  const { rows } = await db.query(q.OF_BOOK_FOR_VIEWER, [bookId, viewerId ?? null])
+  return toApi(rows[0])
+}
+
+/** As mais recentes do autor no perfil público + total visível. */
+export async function forProfile(authorId, viewerId) {
+  const [list, count] = await Promise.all([
+    db.query(q.OF_USER_FOR_VIEWER, [authorId, viewerId ?? null, PROFILE_LIMIT]),
+    db.query(q.COUNT_OF_USER_FOR_VIEWER, [authorId, viewerId ?? null])
+  ])
+  return { total: count.rows[0].total, items: list.rows.map(row => toApi(row)) }
+}
+
+/** Resenhas de outros leitores do mesmo livro (comunidade do livro). */
+export async function forSameBook(bookId, viewerId) {
+  const { rows } = await db.query(q.OF_SAME_BOOK, [bookId, viewerId, COMMUNITY_LIMIT])
+  return rows.map(row => toApi(row))
+}
+
+async function visibleTo(reviewId, viewerId) {
+  const { rows } = await db.query(q.VISIBLE_TO, [reviewId, viewerId])
+  if (!rows[0]) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
+  return rows[0]
+}
+
+export async function like(reviewId, viewerId, liked) {
+  const review = await visibleTo(reviewId, viewerId)
+  if (review.user_id === viewerId) throw httpError('Você não pode curtir a sua própria resenha.', STATUS.BAD_REQUEST, 'REVIEW_OWN')
+  await db.query(liked ? q.LIKE : q.UNLIKE, [reviewId, viewerId])
+  const { rows } = await db.query(q.LIKE_COUNT, [reviewId])
+  return { liked, likeCount: rows[0].total }
+}
+
+// ------------------------------------------------------------------ denúncias
+
+export function moderationLink(reviewId) {
+  return `${siteUrl()}/moderation?token=${encodeURIComponent(signId(MODERATION_PURPOSE, reviewId))}`
+}
+
+/** POST /reviews/:id/report — { reason, note? }. Uma denúncia por pessoa. */
+export async function report(reviewId, viewerId, raw = {}) {
+  const review = await visibleTo(reviewId, viewerId)
+  if (review.user_id === viewerId) throw httpError('Você não pode denunciar a sua própria resenha.', STATUS.BAD_REQUEST, 'REVIEW_OWN')
+  if (!REASONS.includes(raw.reason)) {
+    throw httpError("Campo 'reason' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'reason' })
+  }
+  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : ''
+
+  const { rows } = await db.query(q.REPORT, [reviewId, viewerId, raw.reason, note || null])
+  if (rows.length === 0) return { reported: true, duplicate: true }
+
+  const { rows: [{ total }] } = await db.query(q.OPEN_REPORTS, [reviewId])
+  let hidden = false
+  if (total >= AUTO_HIDE_REPORTS) {
+    hidden = (await db.query(q.AUTO_HIDE, [reviewId])).rows.length > 0
+  }
+
+  void notifyAdmin(reviewId, { reason: raw.reason, note, total, hidden })
+  return { reported: true, duplicate: false }
+}
+
+async function notifyAdmin(reviewId, { reason, note, total, hidden }) {
+  const to = process.env.ADMIN_EMAIL?.trim()
+  if (!to) {
+    logger.warn('Resenha denunciada (ADMIN_EMAIL não definido: sem e-mail)', { reviewId, reason, total, hidden, link: moderationLink(reviewId) })
+    return
+  }
+  try {
+    const { rows: [row] } = await db.query(q.FOR_MODERATION, [reviewId])
+    if (!row) return
+    const mail = reviewReportEmail({
+      name: 'moderação',
+      link: moderationLink(reviewId),
+      locale: 'pt',
+      author: row.username,
+      title: row.title,
+      excerpt: row.body.length > 600 ? `${row.body.slice(0, 600)}…` : row.body,
+      reason,
+      note,
+      total,
+      hidden
+    })
+    await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html })
+  } catch (err) {
+    logger.error('E-mail de denúncia não foi enviado', { reviewId, message: err.message })
+  }
+}
+
+// ------------------------------------------------------------------ moderação
+
+function moderationId(token) {
+  const id = readSignedId(MODERATION_PURPOSE, token)
+  if (!id) throw httpError('Link de moderação inválido.', STATUS.BAD_REQUEST, 'MODERATION_TOKEN_INVALID')
+  return id
+}
+
+export async function forModeration(token) {
+  const id = moderationId(token)
+  const { rows: [row] } = await db.query(q.FOR_MODERATION, [id])
+  if (!row) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
+  const { rows: reports } = await db.query(q.REPORTS_OF, [id])
+  return {
+    review: { ...toApi(row), hidden: row.hidden, hiddenReason: row.hidden_reason, reviewedAt: row.reviewed_at },
+    reports: reports.map(item => ({ reason: item.reason, note: item.note, createdAt: item.created_at, reporter: item.reporter }))
+  }
+}
+
+/** Ocultar (hide = true) ou manter visível (hide = false, zera as denúncias). */
+export async function moderate(token, hide) {
+  const id = moderationId(token)
+  const { rows } = await db.query(hide ? q.HIDE : q.SHOW, [id])
+  if (!rows[0]) throw httpError('Resenha não encontrada.', STATUS.NOT_FOUND, 'REVIEW_NOT_FOUND')
+  return forModeration(token)
+}
diff --git a/backend/src/tests/integration/account-data.test.js b/backend/src/tests/integration/account-data.test.js
index 511f6bed8b6f83900d17b7bdc7ed5f1779a30809..cb5f10d7e8688327bfcb74787ee780bbdc284d0b 100644
--- a/backend/src/tests/integration/account-data.test.js
+++ b/backend/src/tests/integration/account-data.test.js
@@ -111,7 +111,7 @@ describe('Exportar', () => {
     })
     expect(res.headers['content-type']).toMatch(/text\/csv/)
     const rows = parseCsv(res.body)
-    expect(rows[0]).toEqual(['title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date', 'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at', 'read_dates', 'pages'])
+    expect(rows[0]).toEqual(['title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date', 'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at', 'read_dates', 'pages', 'review', 'review_spoiler', 'review_visibility'])
     expect(rows).toHaveLength(4)
 
     // A outra conta importa o CSV exportado e fica com os mesmos livros.
diff --git a/backend/src/tests/integration/reviews.test.js b/backend/src/tests/integration/reviews.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..2b75368face0916c17215298d91600080d031594
--- /dev/null
+++ b/backend/src/tests/integration/reviews.test.js
@@ -0,0 +1,193 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { db } from '../../database/connection.js'
+import { testOutbox } from '../../services/mailService.js'
+import { confirmEmail } from '../helpers/confirmEmail.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+const tokens = {}
+const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
+const ISBN = '9780140328721'
+
+async function signUp(name, visibility) {
+  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
+  await confirmEmail(name)
+  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
+  await request(app).patch('/auth/me/visibility').set(auth(name)).send(visibility)
+}
+
+async function addBook(user, title, isbn) {
+  const res = await request(app).post('/library').set(auth(user)).field({ title, authors: 'Roald Dahl', ...(isbn ? { isbn } : {}) })
+  return res.body.bookId
+}
+
+const putReview = (user, id, body) => request(app).put(`/library/${id}/review`).set(auth(user)).send(body)
+const publicBook = (owner, id, viewer) => {
+  const req = request(app).get(`/library/public/u/${owner}/book/${id}`)
+  return (viewer ? req.set(auth(viewer)) : req).then(res => res.body)
+}
+const community = (user, id) => request(app).get(`/community/books/${id}`).set(auth(user)).then(res => res.body)
+const report = (user, id, body) => request(app).post(`/reviews/${id}/report`).set(auth(user)).send(body)
+const waitMail = async () => { for (let i = 0; i < 50 && !testOutbox().length; i++) await new Promise(r => setTimeout(r, 20)) }
+
+const ids = {}
+
+beforeAll(async () => {
+  process.env.ADMIN_EMAIL = 'moderacao@example.com'
+  await clearDatabase()
+  await signUp('ana', { isPublic: true, showInCommunity: true, showActivity: true })
+  await signUp('bia', { isPublic: true, showInCommunity: true, showActivity: true })
+  for (const name of ['caio', 'davi', 'eva']) await signUp(name, { showActivity: true })
+  ids.ana = await addBook('ana', 'Fantastic Mr. Fox', ISBN)
+  ids.bia = await addBook('bia', 'Fantastic Mr Fox', ISBN)
+  testOutbox().length = 0
+})
+
+afterAll(async () => {
+  delete process.env.ADMIN_EMAIL
+  await closeDatabase()
+})
+
+describe('Escrever', () => {
+  it('valida texto, tamanho, visibilidade e dono', async () => {
+    expect((await putReview('ana', ids.ana, { body: '   ' })).body.code).toBe('REVIEW_EMPTY')
+    const long = await putReview('ana', ids.ana, { body: 'x'.repeat(5001) })
+    expect(long.body).toMatchObject({ code: 'REVIEW_TOO_LONG', params: { max: 5000 } })
+    expect((await putReview('ana', ids.ana, { body: 'ok', visibility: 'todos' })).statusCode).toBe(400)
+    expect((await putReview('ana', ids.ana, { body: 'ok', hasSpoiler: 'sim' })).statusCode).toBe(400)
+    expect((await putReview('bia', ids.ana, { body: 'ok' })).statusCode).toBe(403)
+  })
+
+  it('cria e altera (uma por livro); o dono lê a sua', async () => {
+    let res = await putReview('ana', ids.ana, { body: 'Raposa esperta.\nMuito bom.', hasSpoiler: true })
+    expect(res.statusCode).toBe(200)
+    expect(res.body.review).toMatchObject({ body: 'Raposa esperta.\nMuito bom.', hasSpoiler: true, visibility: 'public', hidden: false, likeCount: 0 })
+    res = await putReview('ana', ids.ana, { body: 'Raposa muito esperta.', hasSpoiler: true })
+    const own = (await request(app).get(`/library/${ids.ana}/review`).set(auth('ana'))).body.review
+    expect(own.body).toBe('Raposa muito esperta.')
+    const { rows } = await db.query('SELECT count(*)::int AS n FROM librishelf.reviews')
+    expect(rows[0].n).toBe(1)
+  })
+})
+
+describe('Quem vê', () => {
+  it('pública: visitante vê no livro e no perfil; anotação continua privada', async () => {
+    const book = await publicBook('ana', ids.ana)
+    expect(book.review).toMatchObject({ body: 'Raposa muito esperta.', hasSpoiler: true, author: { username: 'ana' } })
+    expect(book.notes).toBeUndefined()
+    const profile = (await request(app).get('/library/public/u/ana/profile')).body
+    expect(profile.reviews.total).toBe(1)
+    expect(profile.reviews.items[0].book.title).toBe('Fantastic Mr. Fox')
+  })
+
+  it('comunidade do livro mostra a resenha de quem participa', async () => {
+    const data = await community('bia', ids.bia)
+    expect(data.reviews.map(r => r.author.username)).toEqual(['ana'])
+    // Ana sai da comunidade: pública some da comunidade (continua na biblioteca)
+    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ showInCommunity: false })
+    expect((await community('bia', ids.bia)).reviews).toEqual([])
+    expect((await publicBook('ana', ids.ana)).review).not.toBeNull()
+    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ showInCommunity: true })
+  })
+
+  it('só seguidores: visitante não vê; seguidor aprovado vê', async () => {
+    await putReview('ana', ids.ana, { body: 'Só para quem me segue.', visibility: 'followers' })
+    expect((await publicBook('ana', ids.ana)).review).toBeNull()
+    expect((await publicBook('ana', ids.ana, 'bia')).review).toBeNull()
+    expect((await community('bia', ids.bia)).reviews).toEqual([])
+
+    await request(app).post('/social/follow/ana').set(auth('bia'))
+    expect((await publicBook('ana', ids.ana, 'bia')).review).toBeNull() // pedido ainda pendente
+    await request(app).post('/social/requests/bia/accept').set(auth('ana'))
+    expect((await publicBook('ana', ids.ana, 'bia')).review.body).toBe('Só para quem me segue.')
+    expect((await community('bia', ids.bia)).reviews).toHaveLength(1)
+    await putReview('ana', ids.ana, { body: 'Raposa muito esperta.', hasSpoiler: true, visibility: 'public' })
+  })
+
+  it('biblioteca privada: resenha pública não aparece', async () => {
+    const caioBook = await addBook('caio', 'Fox', ISBN)
+    await putReview('caio', caioBook, { body: 'Privado.' })
+    expect((await request(app).get(`/library/public/u/caio/book/${caioBook}`)).statusCode).toBe(404)
+    expect((await community('bia', ids.bia)).reviews.map(r => r.author.username)).toEqual(['ana'])
+  })
+})
+
+describe('Curtir', () => {
+  it('curte, conta, descurte; não curte a própria', async () => {
+    const reviewId = (await publicBook('ana', ids.ana)).review.id
+    let res = await request(app).post(`/reviews/${reviewId}/like`).set(auth('bia'))
+    expect(res.body).toEqual({ liked: true, likeCount: 1 })
+    await request(app).post(`/reviews/${reviewId}/like`).set(auth('bia'))
+    expect((await publicBook('ana', ids.ana, 'bia')).review).toMatchObject({ likeCount: 1, likedByMe: true })
+    expect((await publicBook('ana', ids.ana)).review).toMatchObject({ likeCount: 1, likedByMe: false })
+    res = await request(app).delete(`/reviews/${reviewId}/like`).set(auth('bia'))
+    expect(res.body).toEqual({ liked: false, likeCount: 0 })
+    expect((await request(app).post(`/reviews/${reviewId}/like`).set(auth('ana'))).body.code).toBe('REVIEW_OWN')
+    expect((await request(app).post(`/reviews/${reviewId}/like`)).statusCode).toBe(401)
+  })
+
+  it('bloqueio esconde e impede curtir', async () => {
+    const reviewId = (await publicBook('ana', ids.ana)).review.id
+    await request(app).post('/social/blocks/eva').set(auth('ana'))
+    expect((await publicBook('ana', ids.ana, 'eva')).review).toBeNull()
+    expect((await request(app).post(`/reviews/${reviewId}/like`).set(auth('eva'))).statusCode).toBe(404)
+    expect((await report('eva', reviewId, { reason: 'spam' })).statusCode).toBe(404)
+  })
+})
+
+describe('Denunciar e moderar', () => {
+  let reviewId
+  let moderationToken
+
+  beforeAll(async () => {
+    reviewId = (await publicBook('ana', ids.ana)).review.id
+  })
+
+  it('valida o motivo; denúncia vai por e-mail com link de moderação; uma por pessoa', async () => {
+    expect((await report('davi', reviewId, { reason: 'chato' })).statusCode).toBe(400)
+    expect((await report('ana', reviewId, { reason: 'spam' })).body.code).toBe('REVIEW_OWN')
+
+    const res = await report('davi', reviewId, { reason: 'spoiler', note: 'Conta o final' })
+    expect(res.body).toEqual({ reported: true, duplicate: false })
+    await waitMail()
+    const mail = testOutbox().find(m => m.to === 'moderacao@example.com')
+    expect(mail.subject).toBe('Resenha denunciada: Fantastic Mr. Fox')
+    expect(mail.text).toContain('Motivo: Spoiler sem aviso')
+    expect(mail.text).toContain('Conta o final')
+    moderationToken = decodeURIComponent(mail.text.match(/\/moderation\?token=(\S+)/)[1])
+
+    expect((await report('davi', reviewId, { reason: 'spam' })).body.duplicate).toBe(true)
+  })
+
+  it('três pessoas denunciando: some até a revisão; o dono vê "oculta"', async () => {
+    await report('caio', reviewId, { reason: 'offensive' })
+    await report('bia', reviewId, { reason: 'other' })
+    expect((await publicBook('ana', ids.ana)).review).toBeNull()
+    expect((await community('bia', ids.bia)).reviews).toEqual([])
+    const own = (await request(app).get(`/library/${ids.ana}/review`).set(auth('ana'))).body.review
+    expect(own.hidden).toBe(true)
+    await new Promise(r => setTimeout(r, 100))
+    expect(testOutbox().some(m => m.subject.startsWith('[Oculta]'))).toBe(true)
+  })
+
+  it('link de moderação: vê denúncias, mantém (reexibe e zera a conta) ou oculta', async () => {
+    expect((await request(app).get('/moderation/review?token=1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).body.code).toBe('MODERATION_TOKEN_INVALID')
+    const view = (await request(app).get(`/moderation/review?token=${encodeURIComponent(moderationToken)}`)).body
+    expect(view.review).toMatchObject({ id: reviewId, hidden: true, hiddenReason: 'reports' })
+    expect(view.reports).toHaveLength(3)
+
+    const kept = (await request(app).post(`/moderation/review/show?token=${encodeURIComponent(moderationToken)}`)).body
+    expect(kept.review.hidden).toBe(false)
+    expect((await publicBook('ana', ids.ana)).review).not.toBeNull()
+
+    const hidden = (await request(app).post(`/moderation/review/hide?token=${encodeURIComponent(moderationToken)}`)).body
+    expect(hidden.review).toMatchObject({ hidden: true, hiddenReason: 'moderation' })
+    expect((await publicBook('ana', ids.ana)).review).toBeNull()
+  })
+
+  it('o dono apaga a resenha', async () => {
+    expect((await request(app).delete(`/library/${ids.ana}/review`).set(auth('ana'))).statusCode).toBe(200)
+    expect((await request(app).get(`/library/${ids.ana}/review`).set(auth('ana'))).body.review).toBeNull()
+  })
+})
diff --git a/backend/src/tests/unit/signedToken.test.js b/backend/src/tests/unit/signedToken.test.js
new file mode 100644
index 0000000000000000000000000000000000000000..4357728877ff90068335d9f3c596d9ea6e459de5
--- /dev/null
+++ b/backend/src/tests/unit/signedToken.test.js
@@ -0,0 +1,33 @@
+import { signId, readSignedId } from '../../utils/signedToken.js'
+
+describe('signedToken', () => {
+  const previous = process.env.SECRET_KEY
+  beforeAll(() => { process.env.SECRET_KEY = 'segredo-de-teste' })
+  afterAll(() => { process.env.SECRET_KEY = previous })
+
+  test('lê o id do token que assinou', () => {
+    expect(readSignedId('moderate:review', signId('moderate:review', 42))).toBe(42)
+  })
+
+  test('token de outra finalidade não vale', () => {
+    expect(readSignedId('unsubscribe', signId('moderate:review', 42))).toBeNull()
+  })
+
+  test('trocar o id invalida a assinatura', () => {
+    const [, sig] = signId('moderate:review', 42).split('.')
+    expect(readSignedId('moderate:review', `43.${sig}`)).toBeNull()
+  })
+
+  test('recusa formatos estranhos', () => {
+    for (const token of [undefined, '', '42', '42.', 'abc.def', `42.${'a'.repeat(31)}`, 'x'.repeat(100)]) {
+      expect(readSignedId('moderate:review', token)).toBeNull()
+    }
+  })
+
+  test('muda com a SECRET_KEY', () => {
+    const token = signId('moderate:review', 7)
+    process.env.SECRET_KEY = 'outra'
+    expect(readSignedId('moderate:review', token)).toBeNull()
+    process.env.SECRET_KEY = 'segredo-de-teste'
+  })
+})
diff --git a/backend/src/utils/signedToken.js b/backend/src/utils/signedToken.js
new file mode 100644
index 0000000000000000000000000000000000000000..79b1240dcf2baec9655ab899bab9365f16112c72
--- /dev/null
+++ b/backend/src/utils/signedToken.js
@@ -0,0 +1,30 @@
+import crypto from 'node:crypto'
+
+/**
+ * Token "<id>.<assinatura>" para links sem login (ex.: moderação de resenha
+ * no e-mail de denúncia): HMAC do id + finalidade com a SECRET_KEY. Não dá
+ * para trocar o id nem usar o token de uma finalidade em outra.
+ */
+function signature(purpose, id) {
+  return crypto
+    .createHmac('sha256', process.env.SECRET_KEY || '')
+    .update(`${purpose}:${id}`)
+    .digest('base64url')
+    .slice(0, 32)
+}
+
+export function signId(purpose, id) {
+  return `${id}.${signature(purpose, id)}`
+}
+
+/** → id, ou null se o token não confere com a finalidade. */
+export function readSignedId(purpose, token) {
+  if (typeof token !== 'string' || token.length > 64) return null
+  const match = token.match(/^(\d{1,10})\.([A-Za-z0-9_-]{32})$/)
+  if (!match) return null
+  const id = Number(match[1])
+  const expected = Buffer.from(signature(purpose, id))
+  const given = Buffer.from(match[2])
+  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
+  return id
+}
diff --git a/frontend/public/robots.txt b/frontend/public/robots.txt
index e71a8f32d640b4011397f43bb2ca76d01c242251..5b3966284b7d541e8b8fc449403902495a60fc6c 100644
--- a/frontend/public/robots.txt
+++ b/frontend/public/robots.txt
@@ -7,4 +7,5 @@ Disallow: /api/
 Disallow: /reset-password
 Disallow: /verify-email
 Disallow: /unsubscribe
+Disallow: /moderation
 Allow: /
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index f98c5aa83bfbcf1e79302147e6d6abb0840ccddd..e97eed7426a1a2258d52157235eac499715f53b9 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -107,6 +107,33 @@
             @changed="onReadingChanged"
           />
 
+          <ReviewEditor
+            v-if="!isReadOnly && !loading && !loadFailed"
+            :book-id="bookId"
+          />
+
+          <!-- Biblioteca de outra pessoa: a resenha dela, se puder ver -->
+          <section
+            v-if="isReadOnly && !loading && book.review"
+            class="public-review"
+            aria-labelledby="public-review-title"
+          >
+            <h3
+              id="public-review-title"
+              class="public-review-title"
+            >
+              <i
+                class="pi pi-comment"
+                aria-hidden="true"
+              ></i>
+              {{ t('review.ofOwner', { name: ownerUsername }) }}
+            </h3>
+            <ReviewCard
+              :review="book.review"
+              flat
+            />
+          </section>
+
           <BookCommunity
             v-if="!isReadOnly && !loading && !loadFailed"
             :book-id="bookId"
@@ -154,6 +181,8 @@ import BookView from './book/BookView.vue'
 import BookEditForm from './book/BookEditForm.vue'
 import ReadingPanel from './book/ReadingPanel.vue'
 import BookCommunity from './book/BookCommunity.vue'
+import ReviewEditor from './review/ReviewEditor.vue'
+import ReviewCard from './review/ReviewCard.vue'
 import { fromApiDate, toApiDate } from '../utils/dates.js'
 import { statusOf } from '../utils/readingStatus.js'
 import { setOverlayTitle } from '../services/pageTitle.js'
@@ -185,7 +214,7 @@ const readSaving = ref(false)
 
 function emptyBook() {
   // authors: texto para exibir; authorNames: a lista que é editada e salva.
-  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, series: '', series_index: null, notes: '', pubdate: null, page_count: null, read_count: 0, current_page: null, progress_percent: null }
+  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, series: '', series_index: null, notes: '', pubdate: null, page_count: null, read_count: 0, current_page: null, progress_percent: null, review: null }
 }
 
 const book = ref(emptyBook())
@@ -350,7 +379,9 @@ function applyResponse(data) {
     page_count: data.page_count ?? null,
     read_count: data.read_count ?? (data.read_date ? 1 : 0),
     current_page: data.current_page ?? null,
-    progress_percent: data.progress_percent ?? null
+    progress_percent: data.progress_percent ?? null,
+    // Só na biblioteca pública de outra pessoa (a do dono carrega no ReviewEditor)
+    review: data.review ?? null
   }
 }
 
@@ -431,6 +462,27 @@ onBeforeUnmount(() => {
 </script>
 
 <style scoped>
+.public-review {
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+  border-top: 1px solid var(--border-color);
+  padding-top: 1rem;
+}
+
+.public-review-title {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  margin: 0;
+  font-size: var(--fs-md);
+  font-weight: 600;
+}
+
+.public-review-title .pi {
+  color: var(--text-secondary);
+}
+
 .dialog-shell {
   position: relative;
   display: flex;
diff --git a/frontend/src/components/StarRating.vue b/frontend/src/components/StarRating.vue
index ab5bade33d5d92a22ead50476514d0eeff6ef77b..ad77998cf059ad8a1262f30280b1a13ccab7bc4a 100644
--- a/frontend/src/components/StarRating.vue
+++ b/frontend/src/components/StarRating.vue
@@ -128,15 +128,16 @@ function select(value) {
   font-size: var(--fs-xs);
 }
 
-.size-sm .pi {
+/* .star-rating junto: o <dialog> também usa size-lg e as estrelas herdavam o tamanho grande */
+.star-rating.size-sm .pi {
   font-size: var(--fs-sm);
 }
 
-.size-md .pi {
+.star-rating.size-md .pi {
   font-size: var(--fs-lg);
 }
 
-.size-lg .pi {
+.star-rating.size-lg .pi {
   font-size: var(--fs-xl);
 }
 
diff --git a/frontend/src/components/book/BookCommunity.vue b/frontend/src/components/book/BookCommunity.vue
index 64574531b811cb0065fd27e80cf2dae100ee0044..5e17c9d76d76a245e052d93e64bec26492907cd2 100644
--- a/frontend/src/components/book/BookCommunity.vue
+++ b/frontend/src/components/book/BookCommunity.vue
@@ -111,6 +111,25 @@
         </div>
       </template>
 
+      <div
+        v-if="community.reviews?.length"
+        class="community-reviews"
+      >
+        <h3>{{ t('review.fromReaders', { n: community.reviews.length }, community.reviews.length) }}</h3>
+        <ReviewCard
+          v-for="item in shownReviews"
+          :key="item.id"
+          :review="item"
+          show-author
+        />
+        <button
+          v-if="community.reviews.length > REVIEWS_SHOWN && !allReviews"
+          type="button"
+          class="more-reviews"
+          @click="allReviews = true"
+        >{{ t('review.showAll', { n: community.reviews.length }) }}</button>
+      </div>
+
       <p
         v-if="!currentUser?.showInCommunity"
         class="community-hint"
@@ -130,10 +149,11 @@
 </template>
 
 <script setup>
-import { ref, watch } from 'vue'
+import { computed, ref, watch } from 'vue'
 import { useI18n } from 'vue-i18n'
 import api from '../../services/api.js'
 import StarRating from '../StarRating.vue'
+import ReviewCard from '../review/ReviewCard.vue'
 import { currentUser } from '../../services/session.js'
 
 /** Comunidade do livro: quem mais tem, média das notas e "quem tem também tem". */
@@ -144,6 +164,13 @@ const props = defineProps({
 const { t } = useI18n()
 
 const ALSO_HAVE_SHOWN = 3
+const REVIEWS_SHOWN = 3
+
+const allReviews = ref(false)
+const shownReviews = computed(() => {
+  const list = community.value?.reviews || []
+  return allReviews.value ? list : list.slice(0, REVIEWS_SHOWN)
+})
 
 const communityOpen = ref(false)
 const community = ref(null)
@@ -158,6 +185,7 @@ async function loadCommunity() {
   if (!props.bookId) return
   communityLoading.value = true
   communityError.value = false
+  allReviews.value = false
   try {
     community.value = await api.getBookCommunity(props.bookId)
   } catch {
@@ -172,6 +200,43 @@ watch(() => props.bookId, loadCommunity, { immediate: true })
 </script>
 
 <style scoped>
+/* Resenhas de outros leitores */
+.community-reviews {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+}
+
+.community-reviews h3 {
+  margin: 0;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  color: var(--text-secondary);
+}
+
+.more-reviews {
+  align-self: flex-start;
+  padding: 0.35rem 0.1rem;
+  border: none;
+  background: none;
+  color: var(--main-color);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.more-reviews:hover {
+  text-decoration: underline;
+  text-underline-offset: 3px;
+}
+
+.more-reviews:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  border-radius: 4px;
+}
+
 /* Comunidade recolhida */
 .community-section {
   border-top: 1px solid var(--border-color);
diff --git a/frontend/src/components/book/BookView.vue b/frontend/src/components/book/BookView.vue
index b7ac0c555c18fec275193921eee79823f70584b9..7f10757d5d97137695e3933955f343d413b11f44 100644
--- a/frontend/src/components/book/BookView.vue
+++ b/frontend/src/components/book/BookView.vue
@@ -37,6 +37,7 @@
             v-if="!isReadOnly"
             :model-value="book.rating"
             class="rating-row"
+            size="lg"
             :disabled="ratingSaving"
             :label="t('rating.label')"
             @update:model-value="value => emit('rate', value)"
@@ -45,6 +46,7 @@
             v-else-if="book.rating"
             :model-value="book.rating"
             class="rating-row"
+            size="lg"
             readonly
           />
         </template>
diff --git a/frontend/src/components/review/ReportDialog.vue b/frontend/src/components/review/ReportDialog.vue
new file mode 100644
index 0000000000000000000000000000000000000000..736f45db78ab1c325cfc0dd8a3622c7296c7b331
--- /dev/null
+++ b/frontend/src/components/review/ReportDialog.vue
@@ -0,0 +1,227 @@
+<template>
+  <!-- No body: a resenha pode estar dentro de outro diálogo (o do livro) -->
+  <Teleport to="body">
+    <AppDialog
+      :visible="visible"
+      size="sm"
+      :header="t('review.reportTitle')"
+      @update:visible="value => emit('update:visible', value)"
+    >
+      <form
+        class="report-form"
+        novalidate
+        @submit.prevent="submit"
+      >
+        <p class="intro">{{ t('review.reportIntro') }}</p>
+
+        <fieldset class="reasons">
+          <legend class="sr-only">{{ t('review.reportReason') }}</legend>
+          <label
+            v-for="option in REASONS"
+            :key="option"
+            class="reason"
+            :class="{ selected: reason === option }"
+          >
+            <input
+              v-model="reason"
+              type="radio"
+              name="report-reason"
+              :value="option"
+            />
+            <span>{{ t(`review.reasons.${option}`) }}</span>
+          </label>
+        </fieldset>
+
+        <div class="note-field">
+          <label
+            :for="noteId"
+            class="note-label"
+          >{{ t('review.reportNote') }}</label>
+          <textarea
+            :id="noteId"
+            v-model="note"
+            rows="3"
+            :maxlength="MAX_NOTE"
+            class="note"
+          ></textarea>
+          <small class="counter">{{ note.length }}/{{ MAX_NOTE }}</small>
+        </div>
+
+        <small
+          v-if="error"
+          class="error"
+          role="alert"
+        >{{ error }}</small>
+
+        <div class="actions">
+          <AppButton
+            type="button"
+            :label="t('common.cancel')"
+            class="btn-text btn-secondary"
+            @click="emit('update:visible', false)"
+          />
+          <AppButton
+            type="submit"
+            :label="t('review.reportSend')"
+            icon="pi pi-flag"
+            class="btn-primary"
+            :loading="sending"
+          />
+        </div>
+      </form>
+    </AppDialog>
+  </Teleport>
+</template>
+
+<script setup>
+import { ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import AppDialog from '../ui/AppDialog.vue'
+import AppButton from '../ui/AppButton.vue'
+import api from '../../services/api.js'
+import { useToast } from '../../services/toast.js'
+
+/** Denunciar uma resenha: motivo + observação opcional (vai para a moderação). */
+const props = defineProps({
+  visible: { type: Boolean, default: false },
+  reviewId: { type: Number, required: true }
+})
+const emit = defineEmits(['update:visible'])
+const { t } = useI18n()
+const toast = useToast()
+
+const REASONS = ['spoiler', 'offensive', 'spam', 'other']
+const MAX_NOTE = 500
+const noteId = `report-note-${Math.random().toString(36).slice(2, 8)}`
+
+const reason = ref('spoiler')
+const note = ref('')
+const error = ref('')
+const sending = ref(false)
+
+watch(() => props.visible, open => {
+  if (!open) return
+  reason.value = 'spoiler'
+  note.value = ''
+  error.value = ''
+})
+
+async function submit() {
+  error.value = ''
+  sending.value = true
+  try {
+    await api.reportReview(props.reviewId, reason.value, note.value.trim() || undefined)
+    emit('update:visible', false)
+    toast.add({ severity: 'success', summary: t('review.reportSent'), detail: t('review.reportSentDetail'), life: 4000 })
+  } catch (err) {
+    error.value = err.message || t('review.reportFailed')
+  } finally {
+    sending.value = false
+  }
+}
+</script>
+
+<style scoped>
+.report-form {
+  display: flex;
+  flex-direction: column;
+  gap: 1rem;
+}
+
+.intro {
+  margin: 0;
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+  line-height: 1.5;
+}
+
+.reasons {
+  display: flex;
+  flex-direction: column;
+  gap: 0.4rem;
+  margin: 0;
+  padding: 0;
+  border: none;
+}
+
+.reason {
+  display: flex;
+  align-items: center;
+  gap: 0.6rem;
+  min-height: 2.75rem;
+  padding: 0 0.85rem;
+  border: 1px solid var(--border-color);
+  border-radius: 10px;
+  cursor: pointer;
+  font-size: var(--fs-md);
+}
+
+.reason:hover {
+  border-color: var(--border-hover);
+}
+
+.reason.selected {
+  border-color: var(--main-color);
+  background: rgba(var(--main-color-rgb), 0.08);
+}
+
+.reason input {
+  accent-color: var(--main-solid);
+  width: 1.05rem;
+  height: 1.05rem;
+  margin: 0;
+}
+
+.reason:has(input:focus-visible) {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+.note-field {
+  display: flex;
+  flex-direction: column;
+  gap: 0.35rem;
+}
+
+.note-label {
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+}
+
+.note {
+  width: 100%;
+  resize: vertical;
+  padding: 0.6rem 0.75rem;
+  border: 1px solid var(--border-color);
+  border-radius: 8px;
+  background: var(--bg-input);
+  color: var(--text-primary);
+  font: inherit;
+  line-height: 1.45;
+}
+
+.note:focus {
+  outline: none;
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
+}
+
+.counter {
+  align-self: flex-end;
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+  font-variant-numeric: tabular-nums;
+}
+
+.error {
+  color: var(--red);
+  font-size: var(--fs-sm);
+}
+
+.actions {
+  display: flex;
+  justify-content: flex-end;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+}
+</style>
diff --git a/frontend/src/components/review/ReviewCard.vue b/frontend/src/components/review/ReviewCard.vue
new file mode 100644
index 0000000000000000000000000000000000000000..dcb92133e3d6c53793ccc9809b57cf9a3ac9bba8
--- /dev/null
+++ b/frontend/src/components/review/ReviewCard.vue
@@ -0,0 +1,496 @@
+<template>
+  <article
+    class="review-card"
+    :class="{ flat }"
+  >
+    <header class="review-head">
+      <div
+        v-if="showBook || showAuthor"
+        class="who"
+      >
+        <button
+          v-if="showBook"
+          type="button"
+          class="book-link"
+          @click="emit('open-book', review.bookId)"
+        >
+          <span class="book-title">{{ review.book.title }}</span>
+          <span
+            v-if="review.book.authors"
+            class="book-authors"
+          >{{ review.book.authors }}</span>
+        </button>
+        <span
+          v-if="showAuthor"
+          class="author"
+        >
+          <ReaderAvatar
+            :username="review.author.username"
+            size="sm"
+          />
+          <ReaderName
+            :username="review.author.username"
+            :is-public="review.author.isPublic"
+            :query="{ book: review.bookId }"
+          />
+        </span>
+      </div>
+      <div class="meta">
+        <!-- Sem cabeçalho (dentro do livro aberto) a nota já está logo acima -->
+        <StarRating
+          v-if="review.book.rating && (showBook || showAuthor)"
+          :model-value="review.book.rating"
+          size="sm"
+          readonly
+        />
+        <span
+          v-if="review.visibility === 'followers'"
+          class="badge"
+          v-tooltip.top="t('review.followersHint')"
+        >
+          <i
+            class="pi pi-users"
+            aria-hidden="true"
+          ></i>
+          {{ t('review.followersBadge') }}
+        </span>
+        <time
+          class="date"
+          :datetime="review.updatedAt"
+        >{{ formattedDate }}</time>
+      </div>
+    </header>
+
+    <div
+      class="body-wrap"
+      :class="{ concealed: spoilerHidden }"
+    >
+      <p
+        :id="bodyId"
+        ref="bodyEl"
+        class="body"
+        :class="{ clamped: !expanded && !plain }"
+        :aria-hidden="spoilerHidden ? 'true' : undefined"
+        :inert="spoilerHidden || undefined"
+      >{{ review.body }}</p>
+      <button
+        v-if="spoilerHidden"
+        type="button"
+        class="spoiler-btn"
+        @click="spoilerShown = true"
+      >
+        <i
+          class="pi pi-eye"
+          aria-hidden="true"
+        ></i>
+        {{ t('review.showSpoiler') }}
+      </button>
+    </div>
+
+    <footer class="review-foot">
+      <button
+        v-if="overflowing && !spoilerHidden"
+        type="button"
+        class="text-btn"
+        :aria-expanded="expanded"
+        :aria-controls="bodyId"
+        @click="expanded = !expanded"
+      >{{ expanded ? t('review.readLess') : t('review.readMore') }}</button>
+      <span class="spacer"></span>
+
+      <button
+        v-if="canInteract"
+        type="button"
+        class="like-btn"
+        :class="{ liked }"
+        :aria-pressed="liked"
+        :aria-label="liked ? t('review.unlike') : t('review.like')"
+        :disabled="liking"
+        @click="toggleLike"
+      >
+        <i
+          :class="liked ? 'pi pi-heart-fill' : 'pi pi-heart'"
+          aria-hidden="true"
+        ></i>
+        <span
+          v-if="likeCount > 0"
+          aria-hidden="true"
+        >{{ likeCount }}</span>
+      </button>
+      <span
+        v-else-if="likeCount > 0"
+        class="like-count"
+        :aria-label="t('review.likes', { n: likeCount }, likeCount)"
+      >
+        <i
+          class="pi pi-heart"
+          aria-hidden="true"
+        ></i>
+        {{ likeCount }}
+      </span>
+
+      <button
+        v-if="canInteract"
+        type="button"
+        class="icon-btn"
+        :aria-label="t('review.report')"
+        v-tooltip.top="t('review.report')"
+        @click="reportOpen = true"
+      >
+        <i
+          class="pi pi-flag"
+          aria-hidden="true"
+        ></i>
+      </button>
+    </footer>
+
+    <ReportDialog
+      v-if="canInteract"
+      v-model:visible="reportOpen"
+      :review-id="review.id"
+    />
+  </article>
+</template>
+
+<script setup>
+import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import ReaderAvatar from '../ReaderAvatar.vue'
+import ReaderName from '../ReaderName.vue'
+import StarRating from '../StarRating.vue'
+import ReportDialog from './ReportDialog.vue'
+import api from '../../services/api.js'
+import { currentUser } from '../../services/session.js'
+import { useToast } from '../../services/toast.js'
+
+/**
+ * Resenha de um leitor: texto (borrado se tiver spoiler, cortado se longo),
+ * nota do livro, data, curtir e denunciar. Curtir/denunciar só para quem está
+ * logado e não é o autor.
+ */
+const props = defineProps({
+  review: { type: Object, required: true },
+  // No perfil: mostra o livro; na comunidade do livro: mostra quem escreveu
+  showBook: { type: Boolean, default: false },
+  showAuthor: { type: Boolean, default: false },
+  // Sem borda/fundo (dentro de outro painel)
+  flat: { type: Boolean, default: false },
+  // Moderação: texto inteiro, sem borrar e sem curtir/denunciar
+  plain: { type: Boolean, default: false }
+})
+const emit = defineEmits(['open-book'])
+const { t, locale } = useI18n()
+const toast = useToast()
+
+const bodyId = `review-body-${Math.random().toString(36).slice(2, 8)}`
+const bodyEl = ref(null)
+const expanded = ref(false)
+const overflowing = ref(false)
+const spoilerShown = ref(false)
+const reportOpen = ref(false)
+const liking = ref(false)
+const liked = ref(Boolean(props.review.likedByMe))
+const likeCount = ref(Number(props.review.likeCount || 0))
+
+watch(() => props.review, review => {
+  liked.value = Boolean(review.likedByMe)
+  likeCount.value = Number(review.likeCount || 0)
+  spoilerShown.value = false
+  expanded.value = false
+  nextTick(measure)
+})
+
+const spoilerHidden = computed(() => !props.plain && props.review.hasSpoiler && !spoilerShown.value)
+const isOwn = computed(() => currentUser.value?.name === props.review.author?.username)
+const canInteract = computed(() => !props.plain && Boolean(currentUser.value) && !isOwn.value)
+
+const formattedDate = computed(() => {
+  const date = new Date(props.review.updatedAt)
+  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
+})
+
+// "Ler mais" só se o texto passar do corte
+function measure() {
+  const el = bodyEl.value
+  if (!el || expanded.value) return
+  overflowing.value = el.scrollHeight > el.clientHeight + 2
+}
+
+let observer = null
+onMounted(() => {
+  measure()
+  if (typeof ResizeObserver !== 'undefined' && bodyEl.value) {
+    observer = new ResizeObserver(() => measure())
+    observer.observe(bodyEl.value)
+  }
+})
+onBeforeUnmount(() => observer?.disconnect())
+
+async function toggleLike() {
+  const next = !liked.value
+  liking.value = true
+  // Muda na hora; volta se der erro
+  liked.value = next
+  likeCount.value += next ? 1 : -1
+  try {
+    const result = await api.likeReview(props.review.id, next)
+    if (typeof result?.likeCount === 'number') likeCount.value = result.likeCount
+  } catch (error) {
+    liked.value = !next
+    likeCount.value += next ? -1 : 1
+    toast.add({ severity: 'error', summary: t('review.likeFailed'), detail: error.message, life: 4000 })
+  } finally {
+    liking.value = false
+  }
+}
+</script>
+
+<style scoped>
+.review-card {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+  padding: 0.9rem 1rem;
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  background: var(--bg-panel);
+  min-width: 0;
+}
+
+.review-card.flat {
+  padding: 0.25rem 0 0;
+  border: none;
+  border-radius: 0;
+  background: none;
+}
+
+/* Quem escreveu (ou o livro) em cima; nota, selo e data embaixo */
+.review-head {
+  display: flex;
+  flex-direction: column;
+  gap: 0.35rem;
+}
+
+.who {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+  min-width: 0;
+}
+
+.author {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.5rem;
+  min-width: 0;
+}
+
+.book-link {
+  display: flex;
+  flex-direction: column;
+  align-items: flex-start;
+  gap: 0.1rem;
+  padding: 0;
+  border: none;
+  background: none;
+  color: var(--text-primary);
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+  min-width: 0;
+}
+
+.book-title {
+  font-family: var(--font-display);
+  font-weight: 600;
+  font-size: var(--fs-md);
+  overflow-wrap: anywhere;
+}
+
+.book-link:hover .book-title {
+  color: var(--main-color);
+}
+
+.book-link:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  border-radius: 4px;
+}
+
+.book-authors {
+  font-size: var(--fs-xs);
+  color: var(--text-secondary);
+}
+
+.meta {
+  display: flex;
+  align-items: center;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+}
+
+.badge {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.3rem;
+  padding: 0.1rem 0.5rem;
+  border-radius: 999px;
+  background: rgba(var(--main-color-rgb), 0.12);
+  color: var(--main-color);
+  font-size: var(--fs-xs);
+  font-weight: 600;
+}
+
+.badge .pi {
+  font-size: 0.7rem;
+}
+
+.date {
+  font-size: var(--fs-xs);
+  color: var(--text-muted);
+}
+
+.body-wrap {
+  position: relative;
+}
+
+.body {
+  margin: 0;
+  white-space: pre-line;
+  overflow-wrap: anywhere;
+  line-height: 1.55;
+  font-size: var(--fs-md);
+  color: var(--text-primary);
+}
+
+.body.clamped {
+  display: -webkit-box;
+  -webkit-box-orient: vertical;
+  -webkit-line-clamp: 6;
+  line-clamp: 6;
+  overflow: hidden;
+}
+
+.concealed .body {
+  filter: blur(6px);
+  user-select: none;
+  min-height: 3.2em;
+}
+
+.spoiler-btn {
+  position: absolute;
+  inset: 0;
+  margin: auto;
+  width: fit-content;
+  height: fit-content;
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  padding: 0.5rem 0.9rem;
+  border: 1px solid var(--border-hover);
+  border-radius: 999px;
+  background: var(--bg-panel);
+  color: var(--text-primary);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  cursor: pointer;
+  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
+}
+
+.spoiler-btn:hover {
+  border-color: var(--main-color);
+  color: var(--main-color);
+}
+
+.review-foot {
+  display: flex;
+  align-items: center;
+  gap: 0.25rem;
+  min-height: 2rem;
+}
+
+.spacer {
+  flex: 1;
+}
+
+.text-btn {
+  padding: 0.25rem 0;
+  border: none;
+  background: none;
+  color: var(--main-color);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.text-btn:hover {
+  text-decoration: underline;
+  text-underline-offset: 3px;
+}
+
+.like-btn,
+.icon-btn {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.35rem;
+  min-width: 2rem;
+  height: 2rem;
+  padding: 0 0.5rem;
+  border: none;
+  border-radius: 999px;
+  background: none;
+  color: var(--text-secondary);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-variant-numeric: tabular-nums;
+  cursor: pointer;
+}
+
+.like-btn:hover,
+.icon-btn:hover {
+  background: var(--bg-hover);
+  color: var(--text-primary);
+}
+
+.like-btn.liked,
+.like-btn.liked:hover {
+  color: var(--red);
+}
+
+.like-btn:disabled {
+  cursor: progress;
+}
+
+.icon-btn .pi {
+  font-size: var(--fs-sm);
+}
+
+.like-count {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.35rem;
+  padding: 0 0.5rem;
+  font-size: var(--fs-sm);
+  color: var(--text-muted);
+}
+
+.like-btn:focus-visible,
+.icon-btn:focus-visible,
+.text-btn:focus-visible,
+.spoiler-btn:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+@media (pointer: coarse) {
+
+  .like-btn,
+  .icon-btn {
+    min-width: 44px;
+    height: 44px;
+  }
+}
+</style>
diff --git a/frontend/src/components/review/ReviewEditor.vue b/frontend/src/components/review/ReviewEditor.vue
new file mode 100644
index 0000000000000000000000000000000000000000..a782886bdfee646720350a42fe38174df6196cfb
--- /dev/null
+++ b/frontend/src/components/review/ReviewEditor.vue
@@ -0,0 +1,549 @@
+<template>
+  <section
+    class="review-section"
+    :aria-labelledby="headingId"
+  >
+    <div class="section-head">
+      <h3
+        :id="headingId"
+        class="section-title"
+      >
+        <i
+          class="pi pi-comment"
+          aria-hidden="true"
+        ></i>
+        {{ t('review.title') }}
+      </h3>
+      <div
+        v-if="review && !editing"
+        class="head-actions"
+      >
+        <button
+          type="button"
+          class="text-btn"
+          :aria-label="t('review.editAria')"
+          @click="startEditing"
+        >{{ t('review.edit') }}</button>
+        <button
+          type="button"
+          class="text-btn danger"
+          :aria-label="t('review.deleteAria')"
+          @click="remove"
+        >{{ t('review.delete') }}</button>
+      </div>
+    </div>
+
+    <p
+      v-if="loading"
+      class="muted"
+    >{{ t('common.loading') }}</p>
+
+    <p
+      v-else-if="loadError"
+      class="muted"
+    >{{ t('review.loadFailed') }}</p>
+
+    <!-- Sem resenha -->
+    <button
+      v-else-if="!review && !editing"
+      type="button"
+      class="write-btn"
+      @click="startEditing"
+    >
+      <i
+        class="pi pi-pencil"
+        aria-hidden="true"
+      ></i>
+      <span>
+        <strong>{{ t('review.write') }}</strong>
+        <small>{{ t('review.writeHint') }}</small>
+      </span>
+    </button>
+
+    <!-- Resenha salva -->
+    <template v-else-if="!editing">
+      <p
+        v-if="review.hidden"
+        class="notice warn"
+        role="status"
+      >
+        <i
+          class="pi pi-eye-slash"
+          aria-hidden="true"
+        ></i>
+        {{ t('review.hiddenNotice') }}
+      </p>
+      <p
+        v-else-if="reachHint"
+        class="notice"
+      >
+        <i
+          class="pi pi-info-circle"
+          aria-hidden="true"
+        ></i>
+        <i18n-t
+          scope="global"
+          :keypath="reachHint"
+          tag="span"
+        >
+          <template #settings>
+            <router-link :to="{ name: 'settings' }">{{ t('review.settingsLink') }}</router-link>
+          </template>
+        </i18n-t>
+      </p>
+      <ReviewCard
+        :review="review"
+        flat
+      />
+    </template>
+
+    <!-- Escrevendo -->
+    <form
+      v-else
+      class="editor"
+      novalidate
+      @submit.prevent="save"
+      @keydown.esc.stop.prevent="cancel"
+    >
+      <label
+        :for="`${uid}-body`"
+        class="sr-only"
+      >{{ t('review.title') }}</label>
+      <textarea
+        :id="`${uid}-body`"
+        ref="textareaEl"
+        v-model="draft.body"
+        class="body-input"
+        rows="6"
+        :maxlength="MAX_BODY"
+        :placeholder="t('review.placeholder')"
+        :aria-describedby="`${uid}-counter`"
+      ></textarea>
+      <small
+        :id="`${uid}-counter`"
+        class="counter"
+        :class="{ near: draft.body.length > MAX_BODY - 200 }"
+      >{{ t('review.counter', { n: draft.body.length, max: MAX_BODY }) }}</small>
+
+      <div class="option-row">
+        <label
+          :for="`${uid}-spoiler`"
+          class="option-label"
+        >
+          <span>{{ t('review.spoiler') }}</span>
+          <small>{{ t('review.spoilerHint') }}</small>
+        </label>
+        <AppSwitch
+          v-model="draft.hasSpoiler"
+          :input-id="`${uid}-spoiler`"
+        />
+      </div>
+
+      <div
+        class="visibility"
+        role="radiogroup"
+        :aria-label="t('review.visibility')"
+      >
+        <span
+          class="option-label"
+          aria-hidden="true"
+        >{{ t('review.visibility') }}</span>
+        <div class="pills">
+          <PillButton
+            v-for="option in VISIBILITIES"
+            :key="option.value"
+            role="radio"
+            :aria-checked="draft.visibility === option.value ? 'true' : 'false'"
+            :pressable="false"
+            :active="draft.visibility === option.value"
+            :icon="option.icon"
+            :label="t(option.label)"
+            @click="draft.visibility = option.value"
+          />
+        </div>
+      </div>
+
+      <p
+        v-if="reachHint"
+        class="notice"
+      >
+        <i
+          class="pi pi-info-circle"
+          aria-hidden="true"
+        ></i>
+        <i18n-t
+          scope="global"
+          :keypath="reachHint"
+          tag="span"
+        >
+          <template #settings>
+            <router-link :to="{ name: 'settings' }">{{ t('review.settingsLink') }}</router-link>
+          </template>
+        </i18n-t>
+      </p>
+
+      <small
+        v-if="error"
+        class="error"
+        role="alert"
+      >{{ error }}</small>
+
+      <div class="actions">
+        <AppButton
+          type="button"
+          :label="t('common.cancel')"
+          class="btn-text btn-secondary btn-sm"
+          @click="cancel"
+        />
+        <AppButton
+          type="submit"
+          :label="t('review.save')"
+          class="btn-primary btn-sm"
+          :loading="saving"
+        />
+      </div>
+    </form>
+  </section>
+</template>
+
+<script setup>
+import { computed, nextTick, reactive, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import AppButton from '../ui/AppButton.vue'
+import AppSwitch from '../ui/AppSwitch.vue'
+import PillButton from '../form/PillButton.vue'
+import ReviewCard from './ReviewCard.vue'
+import api from '../../services/api.js'
+import { currentUser } from '../../services/session.js'
+import { useToast } from '../../services/toast.js'
+import { useConfirm } from '../../services/confirm.js'
+
+/**
+ * Resenha do dono, no livro aberto: escrever, editar, apagar. Diferente das
+ * anotações (privadas), aparece para outros leitores conforme a visibilidade.
+ */
+const props = defineProps({
+  bookId: { type: Number, required: true }
+})
+const { t } = useI18n()
+const toast = useToast()
+const confirm = useConfirm()
+
+const MAX_BODY = 5000
+const VISIBILITIES = [
+  { value: 'public', icon: 'pi pi-globe', label: 'review.public' },
+  { value: 'followers', icon: 'pi pi-users', label: 'review.followers' }
+]
+
+const uid = `review-${Math.random().toString(36).slice(2, 8)}`
+const headingId = `${uid}-heading`
+const review = ref(null)
+const loading = ref(false)
+const loadError = ref(false)
+const editing = ref(false)
+const saving = ref(false)
+const error = ref('')
+const textareaEl = ref(null)
+const draft = reactive({ body: '', hasSpoiler: false, visibility: 'public' })
+
+// Quem vai conseguir ler: biblioteca privada não mostra nada; "só seguidores"
+// precisa aceitar seguidores
+const reachHint = computed(() => {
+  const user = currentUser.value
+  if (!user) return ''
+  if (!user.isPublic) return 'review.privateHint'
+  const visibility = editing.value ? draft.visibility : review.value?.visibility
+  if (visibility === 'followers' && !user.showActivity) return 'review.followersOffHint'
+  return ''
+})
+
+async function load() {
+  if (!props.bookId) return
+  loading.value = true
+  loadError.value = false
+  editing.value = false
+  try {
+    review.value = (await api.getReview(props.bookId)).review
+  } catch {
+    loadError.value = true
+    review.value = null
+  } finally {
+    loading.value = false
+  }
+}
+
+watch(() => props.bookId, load, { immediate: true })
+
+async function startEditing() {
+  draft.body = review.value?.body ?? ''
+  draft.hasSpoiler = review.value?.hasSpoiler ?? false
+  draft.visibility = review.value?.visibility ?? 'public'
+  error.value = ''
+  editing.value = true
+  await nextTick()
+  textareaEl.value?.focus()
+}
+
+function cancel() {
+  editing.value = false
+  error.value = ''
+}
+
+async function save() {
+  error.value = ''
+  const body = draft.body.trim()
+  if (!body) {
+    error.value = t('errors.REVIEW_EMPTY')
+    return
+  }
+  saving.value = true
+  try {
+    review.value = (await api.saveReview(props.bookId, { body, hasSpoiler: draft.hasSpoiler, visibility: draft.visibility })).review
+    editing.value = false
+    toast.add({ severity: 'success', summary: t('review.saved'), life: 2500 })
+  } catch (err) {
+    error.value = err.message || t('review.saveFailed')
+  } finally {
+    saving.value = false
+  }
+}
+
+function remove() {
+  confirm.require({
+    header: t('review.deleteTitle'),
+    message: t('review.deleteMessage'),
+    icon: 'pi pi-exclamation-triangle',
+    acceptClass: 'btn-danger',
+    rejectClass: 'btn-text btn-secondary',
+    acceptLabel: t('review.deleteConfirm'),
+    rejectLabel: t('common.cancel'),
+    accept: async () => {
+      try {
+        await api.deleteReview(props.bookId)
+        review.value = null
+        toast.add({ severity: 'success', summary: t('review.deleted'), life: 2500 })
+      } catch (err) {
+        toast.add({ severity: 'error', summary: t('review.deleteFailed'), detail: err.message, life: 4000 })
+      }
+    }
+  })
+}
+</script>
+
+<style scoped>
+.review-section {
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+  border-top: 1px solid var(--border-color);
+  padding-top: 1rem;
+}
+
+.section-head {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 0.75rem;
+}
+
+.section-title {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  margin: 0;
+  font-size: var(--fs-md);
+  font-weight: 600;
+}
+
+.section-title .pi {
+  color: var(--text-secondary);
+}
+
+.head-actions {
+  display: flex;
+  gap: 0.75rem;
+}
+
+.text-btn {
+  padding: 0.25rem 0.1rem;
+  border: none;
+  background: none;
+  color: var(--main-color);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.text-btn.danger {
+  color: var(--red);
+}
+
+.text-btn:hover {
+  text-decoration: underline;
+  text-underline-offset: 3px;
+}
+
+.text-btn:focus-visible,
+.write-btn:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  border-radius: 6px;
+}
+
+.muted {
+  margin: 0;
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+}
+
+.write-btn {
+  display: flex;
+  align-items: center;
+  gap: 0.75rem;
+  width: 100%;
+  padding: 0.85rem 1rem;
+  border: 1px dashed var(--border-hover);
+  border-radius: 10px;
+  background: none;
+  color: var(--text-primary);
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+}
+
+.write-btn:hover {
+  border-color: var(--main-color);
+  background: rgba(var(--main-color-rgb), 0.05);
+}
+
+.write-btn .pi {
+  color: var(--main-color);
+}
+
+.write-btn span {
+  display: flex;
+  flex-direction: column;
+  gap: 0.15rem;
+}
+
+.write-btn strong {
+  font-size: var(--fs-md);
+  font-weight: 600;
+}
+
+.write-btn small {
+  color: var(--text-secondary);
+  font-size: var(--fs-xs);
+}
+
+.notice {
+  display: flex;
+  align-items: flex-start;
+  gap: 0.5rem;
+  margin: 0;
+  padding: 0.6rem 0.75rem;
+  border-radius: 8px;
+  background: rgba(var(--main-color-rgb), 0.08);
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+  line-height: 1.45;
+}
+
+.notice .pi {
+  margin-top: 0.15rem;
+  color: var(--main-color);
+}
+
+.notice.warn {
+  background: rgba(var(--orange-rgb), 0.12);
+}
+
+.notice.warn .pi {
+  color: var(--orange);
+}
+
+.editor {
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+  padding: 0.75rem;
+  border-radius: 10px;
+  background: rgba(var(--main-color-rgb), 0.05);
+  border: 1px solid var(--border-color);
+}
+
+.body-input {
+  width: 100%;
+  min-height: 8rem;
+  resize: vertical;
+  padding: 0.65rem 0.75rem;
+  border: 1px solid var(--border-color);
+  border-radius: 8px;
+  background: var(--bg-input);
+  color: var(--text-primary);
+  font: inherit;
+  line-height: 1.55;
+}
+
+.body-input:focus {
+  outline: none;
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
+}
+
+.counter {
+  align-self: flex-end;
+  margin-top: -0.4rem;
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+  font-variant-numeric: tabular-nums;
+}
+
+.counter.near {
+  color: var(--orange);
+}
+
+.option-row {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 1rem;
+}
+
+.option-label {
+  display: flex;
+  flex-direction: column;
+  gap: 0.1rem;
+  font-size: var(--fs-sm);
+  color: var(--text-primary);
+}
+
+.option-label small {
+  color: var(--text-secondary);
+  font-size: var(--fs-xs);
+}
+
+.visibility {
+  display: flex;
+  flex-direction: column;
+  gap: 0.4rem;
+}
+
+.pills {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.error {
+  color: var(--red);
+  font-size: var(--fs-xs);
+}
+
+.actions {
+  display: flex;
+  justify-content: flex-end;
+  gap: 0.4rem;
+}
+</style>
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index e7676bdb4e0abe5b8bd01b298ff2b891c8540e06..f762878d599791e3f0de505a30a0ac341c57d04b 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -554,6 +554,14 @@
           "You can block a reader from their public library: you stop seeing each other in the community and they can't ask to follow you."
         ]
       },
+      {
+        "title": "Reviews",
+        "paragraphs": [
+          "Unlike notes, which are only yours, a review is meant to be read by others. You choose who can read it: everyone who sees your public library (and, if you take part in the community, other readers of the same book) or only your approved followers. With a private library, nobody sees it.",
+          "Signed-in readers can like and report reviews. The author doesn't find out who reported. A report (reason, details and who sent it) goes to Librishelf moderation, which may hide the review; after several reports it is hidden automatically until it's reviewed.",
+          "You can edit or delete your review at any time. It is included when you download your data and is deleted along with the book or the account."
+        ]
+      },
       {
         "title": "Book search and camera",
         "paragraphs": [
@@ -950,7 +958,8 @@
     "publicLibrary": "{name}'s library",
     "privacy": "Privacy",
     "notFound": "Page not found",
-    "unsubscribe": "Unsubscribe"
+    "unsubscribe": "Unsubscribe",
+    "moderation": "Moderation"
   },
   "password": {
     "show": "Show password",
@@ -1056,7 +1065,11 @@
       "olEditionKey": "Open Library edition",
       "isPublic": "public library",
       "showInCommunity": "community",
-      "showActivity": "activity"
+      "showActivity": "activity",
+      "visibility": "visibility",
+      "hasSpoiler": "spoiler",
+      "reason": "reason",
+      "note": "details"
     },
     "OPENLIBRARY_UNAVAILABLE": "Open Library is unavailable right now. Try again later.",
     "SEARCH_QUERY_INVALID": "Type {min} to {max} characters to search.",
@@ -1070,7 +1083,13 @@
     "PAGE_COUNT_INVALID": "Pages must be from 1 to {max}.",
     "UNSUBSCRIBE_TOKEN_INVALID": "This unsubscribe link isn't valid.",
     "EMAIL_NOT_VERIFIED_NOTIFY": "Confirm your email to receive notifications.",
-    "OFFLINE": "You're offline. This screen hasn't been opened online on this device yet."
+    "OFFLINE": "You're offline. This screen hasn't been opened online on this device yet.",
+    "REVIEW_EMPTY": "Write the review before publishing.",
+    "REVIEW_TOO_LONG": "A review can have at most {max} characters.",
+    "REVIEW_OWN": "You can't like or report your own review.",
+    "REVIEW_NOT_FOUND": "Review not found.",
+    "MODERATION_TOKEN_INVALID": "This moderation link is invalid.",
+    "RATE_LIMIT_REPORTS": "Too many reports in a short time. Try again later."
   },
   "block": {
     "block": "Block {name}",
@@ -1083,5 +1102,81 @@
     "unblocked": "{name} was unblocked.",
     "listTitle": "Blocked readers",
     "listEmpty": "Nobody blocked. To block someone, open their public library and use the ⋯ menu."
+  },
+  "review": {
+    "title": "Review",
+    "write": "Write a review",
+    "writeHint": "What did you think? Other readers can read it — your notes stay private.",
+    "edit": "Edit",
+    "delete": "Delete",
+    "save": "Publish review",
+    "saved": "Review published",
+    "saveFailed": "Couldn't save the review.",
+    "loadFailed": "Couldn't load the review.",
+    "placeholder": "Write what you thought of the book…",
+    "counter": "{n} / {max}",
+    "spoiler": "Contains spoilers",
+    "spoilerHint": "The text stays blurred until the reader chooses to see it.",
+    "visibility": "Who can read it",
+    "public": "Everyone",
+    "followers": "Followers only",
+    "privateHint": "Your library is private: nobody sees this review until you make it public in {settings}.",
+    "followersOffHint": "You don't accept followers, so nobody sees this review. To change that, go to {settings}.",
+    "settingsLink": "Account",
+    "hiddenNotice": "This review was hidden after reports and isn't shown to other readers. Edits keep it hidden until it's reviewed.",
+    "deleteTitle": "Delete review?",
+    "deleteMessage": "The review and its likes will be deleted. This can't be undone.",
+    "deleteConfirm": "Delete",
+    "deleted": "Review deleted",
+    "deleteFailed": "Couldn't delete the review.",
+    "ofOwner": "Review by {'@'}{name}",
+    "followersBadge": "Followers",
+    "followersHint": "Visible to followers only",
+    "showSpoiler": "Contains spoilers — show",
+    "readMore": "Read more",
+    "readLess": "Read less",
+    "like": "Like review",
+    "unlike": "Unlike review",
+    "likes": "No likes | 1 like | {n} likes",
+    "likeFailed": "Couldn't like the review",
+    "report": "Report review",
+    "reportTitle": "Report review",
+    "reportIntro": "Tell us what's wrong. The author won't see who reported it; it goes to moderation.",
+    "reportReason": "Reason",
+    "reportNote": "Details (optional)",
+    "reportSend": "Send report",
+    "reportSent": "Report sent",
+    "reportSentDetail": "Thanks. We'll review it.",
+    "reportFailed": "Couldn't send the report.",
+    "reasons": {
+      "spoiler": "Unmarked spoiler",
+      "offensive": "Offensive or abusive",
+      "spam": "Spam or advertising",
+      "other": "Something else"
+    },
+    "fromReaders": "Reader reviews | 1 reader review | {n} reader reviews",
+    "showAll": "See all {n} reviews",
+    "profileTitle": "Reviews | 1 review | {n} reviews",
+    "profileMore": "And {n} more — open the books on the shelf to read them.",
+    "editAria": "Edit review",
+    "deleteAria": "Delete review"
+  },
+  "moderation": {
+    "subtitle": "Moderation",
+    "loading": "Opening…",
+    "title": "Reported review",
+    "failedTitle": "Invalid link",
+    "visible": "Visible to readers",
+    "hiddenAuto": "Hidden automatically (several reports)",
+    "hiddenManual": "Hidden by moderation",
+    "markedSpoiler": "Marked as a spoiler by the author.",
+    "reports": "Reports",
+    "reportsCount": "No reports | 1 report | {n} reports",
+    "hide": "Hide review",
+    "keep": "Keep visible",
+    "restore": "Show review again",
+    "keepHint": "Keeping or showing it again resets the count for automatic hiding.",
+    "hiddenDone": "Review hidden",
+    "keptDone": "Review visible"
   }
 }
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 96e7ed2809b78694a313c3dd307918eebd92cd28..2a8e6bebe63c25bdbecf3094ea16437fd8540139 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -554,6 +554,14 @@
           "Você pode bloquear um leitor pela biblioteca pública dele: vocês deixam de se ver na comunidade e ele não pode pedir para seguir você."
         ]
       },
+      {
+        "title": "Resenhas",
+        "paragraphs": [
+          "Diferente das anotações, que são só suas, a resenha é feita para outros lerem. Você escolhe quem pode ler: todos que veem sua biblioteca pública (e, se você participa da comunidade, outros leitores do mesmo livro) ou só seus seguidores aprovados. Com a biblioteca privada, ninguém vê.",
+          "Leitores logados podem curtir e denunciar resenhas. Quem escreveu não fica sabendo quem denunciou. A denúncia (motivo, detalhes e quem enviou) vai para a moderação do Librishelf, que pode ocultar a resenha; com várias denúncias ela é ocultada automaticamente até a revisão.",
+          "Você pode editar ou apagar sua resenha a qualquer momento. Ela também vai junto quando você baixa seus dados e é apagada com o livro ou com a conta."
+        ]
+      },
       {
         "title": "Busca de livros e câmera",
         "paragraphs": [
@@ -950,7 +958,8 @@
     "publicLibrary": "Biblioteca de {name}",
     "privacy": "Privacidade",
     "notFound": "Página não encontrada",
-    "unsubscribe": "Descadastrar avisos"
+    "unsubscribe": "Descadastrar avisos",
+    "moderation": "Moderação"
   },
   "password": {
     "show": "Mostrar senha",
@@ -1056,7 +1065,11 @@
       "olEditionKey": "edição do Open Library",
       "isPublic": "biblioteca pública",
       "showInCommunity": "comunidade",
-      "showActivity": "atividade"
+      "showActivity": "atividade",
+      "visibility": "visibilidade",
+      "hasSpoiler": "spoiler",
+      "reason": "motivo",
+      "note": "detalhes"
     },
     "OPENLIBRARY_UNAVAILABLE": "O Open Library está indisponível agora. Tente de novo mais tarde.",
     "SEARCH_QUERY_INVALID": "Digite de {min} a {max} caracteres para buscar.",
@@ -1070,7 +1083,13 @@
     "PAGE_COUNT_INVALID": "O número de páginas precisa ser de 1 a {max}.",
     "UNSUBSCRIBE_TOKEN_INVALID": "Este link de descadastro não é válido.",
     "EMAIL_NOT_VERIFIED_NOTIFY": "Confirme seu e-mail para receber avisos.",
-    "OFFLINE": "Sem conexão. Esta tela ainda não foi aberta com internet neste aparelho."
+    "OFFLINE": "Sem conexão. Esta tela ainda não foi aberta com internet neste aparelho.",
+    "REVIEW_EMPTY": "Escreva a resenha antes de publicar.",
+    "REVIEW_TOO_LONG": "A resenha pode ter no máximo {max} caracteres.",
+    "REVIEW_OWN": "Você não pode curtir nem denunciar a sua própria resenha.",
+    "REVIEW_NOT_FOUND": "Resenha não encontrada.",
+    "MODERATION_TOKEN_INVALID": "Este link de moderação é inválido.",
+    "RATE_LIMIT_REPORTS": "Muitas denúncias em pouco tempo. Tente novamente mais tarde."
   },
   "block": {
     "block": "Bloquear {name}",
@@ -1083,5 +1102,81 @@
     "unblocked": "{name} foi desbloqueado.",
     "listTitle": "Leitores bloqueados",
     "listEmpty": "Ninguém bloqueado. Para bloquear, abra a biblioteca pública da pessoa e use o menu ⋯."
+  },
+  "review": {
+    "title": "Resenha",
+    "write": "Escrever uma resenha",
+    "writeHint": "O que você achou? Outros leitores podem ler — as anotações continuam só suas.",
+    "edit": "Editar",
+    "delete": "Apagar",
+    "save": "Publicar resenha",
+    "saved": "Resenha publicada",
+    "saveFailed": "Não foi possível salvar a resenha.",
+    "loadFailed": "Não foi possível carregar a resenha.",
+    "placeholder": "Escreva o que achou do livro…",
+    "counter": "{n} / {max}",
+    "spoiler": "Contém spoiler",
+    "spoilerHint": "O texto aparece borrado até o leitor pedir para ver.",
+    "visibility": "Quem pode ler",
+    "public": "Todos",
+    "followers": "Só seguidores",
+    "privateHint": "Sua biblioteca está privada: ninguém vê a resenha até você torná-la pública em {settings}.",
+    "followersOffHint": "Você não aceita seguidores, então ninguém vê esta resenha. Para mudar, vá em {settings}.",
+    "settingsLink": "Conta",
+    "hiddenNotice": "Esta resenha foi ocultada depois de denúncias e não aparece para outros leitores. Se editar, ela continua oculta até a revisão.",
+    "deleteTitle": "Apagar resenha?",
+    "deleteMessage": "A resenha e as curtidas dela serão apagadas. Não dá para desfazer.",
+    "deleteConfirm": "Apagar",
+    "deleted": "Resenha apagada",
+    "deleteFailed": "Não foi possível apagar a resenha.",
+    "ofOwner": "Resenha de {'@'}{name}",
+    "followersBadge": "Seguidores",
+    "followersHint": "Visível só para seguidores",
+    "showSpoiler": "Contém spoiler — mostrar",
+    "readMore": "Ler mais",
+    "readLess": "Ler menos",
+    "like": "Curtir resenha",
+    "unlike": "Descurtir resenha",
+    "likes": "Nenhuma curtida | 1 curtida | {n} curtidas",
+    "likeFailed": "Não foi possível curtir",
+    "report": "Denunciar resenha",
+    "reportTitle": "Denunciar resenha",
+    "reportIntro": "Conte o que há de errado. A denúncia é anônima para quem escreveu e vai para a moderação.",
+    "reportReason": "Motivo",
+    "reportNote": "Detalhes (opcional)",
+    "reportSend": "Enviar denúncia",
+    "reportSent": "Denúncia enviada",
+    "reportSentDetail": "Obrigado. Vamos revisar a resenha.",
+    "reportFailed": "Não foi possível enviar a denúncia.",
+    "reasons": {
+      "spoiler": "Spoiler sem aviso",
+      "offensive": "Ofensiva ou abusiva",
+      "spam": "Spam ou propaganda",
+      "other": "Outro motivo"
+    },
+    "fromReaders": "Resenhas de leitores | 1 resenha de leitor | {n} resenhas de leitores",
+    "showAll": "Ver todas as {n} resenhas",
+    "profileTitle": "Resenhas | 1 resenha | {n} resenhas",
+    "profileMore": "E mais {n} — abra os livros da estante para ler.",
+    "editAria": "Editar resenha",
+    "deleteAria": "Apagar resenha"
+  },
+  "moderation": {
+    "subtitle": "Moderação",
+    "loading": "Abrindo…",
+    "title": "Resenha denunciada",
+    "failedTitle": "Link inválido",
+    "visible": "Visível para os leitores",
+    "hiddenAuto": "Oculta automaticamente (várias denúncias)",
+    "hiddenManual": "Oculta pela moderação",
+    "markedSpoiler": "Marcada pelo autor como spoiler.",
+    "reports": "Denúncias",
+    "reportsCount": "Nenhuma denúncia | 1 denúncia | {n} denúncias",
+    "hide": "Ocultar resenha",
+    "keep": "Manter visível",
+    "restore": "Reexibir resenha",
+    "keepHint": "Manter ou reexibir zera a contagem para a ocultação automática.",
+    "hiddenDone": "Resenha ocultada",
+    "keptDone": "Resenha visível"
   }
 }
diff --git a/frontend/src/router/index.js b/frontend/src/router/index.js
index c3222b0c273a3bc55438fca750f1ee4ed4f9813e..b154f7d27559d195c266f64615adfa97881103c4 100644
--- a/frontend/src/router/index.js
+++ b/frontend/src/router/index.js
@@ -9,7 +9,8 @@ import { installRouteFocus } from '../services/routeFocus.js'
  *   requiresAuth — precisa de sessão; sem ela vai para /login?redirect=...
  *   guestOnly    — login/cadastro; quem já está logado vai para o início
  *   standalone   — tela cheia, sem o menu lateral
- *   public       — acessível com ou sem sessão (mostra o menu se houver sessão)
+ *   public       — acessível com ou sem sessão: carrega a sessão, se houver (e
+ *                  mostra o menu, a não ser que seja standalone)
  *   title        — chave de pageTitle.* para o título da aba (services/pageTitle.js)
  *   noindex      — fora de buscadores; 'server' = o nginx decide (ver pageTitle.js)
  *
@@ -35,8 +36,9 @@ const router = createRouter({
     { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPassword.vue'), meta: { standalone: true, title: 'resetPassword' } },
     { path: '/verify-email', name: 'verify-email', component: () => import('../views/VerifyEmail.vue'), meta: { standalone: true, title: 'verifyEmail' } },
     { path: '/unsubscribe', name: 'unsubscribe', component: () => import('../views/Unsubscribe.vue'), meta: { standalone: true, title: 'unsubscribe', noindex: true } },
+    { path: '/moderation', name: 'moderation', component: () => import('../views/Moderation.vue'), meta: { standalone: true, title: 'moderation', noindex: true } },
 
-    { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true, title: 'publicLibrary', noindex: 'server' } },
+    { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true, public: true, title: 'publicLibrary', noindex: 'server' } },
     { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { public: true, title: 'privacy' } },
 
     { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFound.vue'), meta: { public: true, title: 'notFound' } }
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 76fedf0819951fb0c65583f11fa090d628671d77..146211c27bb5fc849d72a2d3401545db74e3fb60 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -151,6 +151,38 @@ export default {
     return client.patch(`/library/${id}/status`, date ? { status, date } : { status })
   },
 
+  // --- Resenhas ---
+  getReview(bookId) {
+    return client.get(`/library/${bookId}/review`)
+  },
+
+  /** { body, hasSpoiler, visibility: 'public' | 'followers' } */
+  saveReview(bookId, review) {
+    return client.put(`/library/${bookId}/review`, review)
+  },
+
+  deleteReview(bookId) {
+    return client.delete(`/library/${bookId}/review`)
+  },
+
+  likeReview(reviewId, liked) {
+    return liked ? client.post(`/reviews/${reviewId}/like`, {}) : client.delete(`/reviews/${reviewId}/like`)
+  },
+
+  /** reason: 'spoiler' | 'offensive' | 'spam' | 'other' */
+  reportReview(reviewId, reason, note) {
+    return client.post(`/reviews/${reviewId}/report`, { reason, note })
+  },
+
+  // Moderação pelo link do e-mail de denúncia (sem login)
+  getModeration(token) {
+    return client.get(`/moderation/review?token=${enc(token)}`)
+  },
+
+  moderateReview(token, hide) {
+    return client.post(`/moderation/review/${hide ? 'hide' : 'show'}?token=${enc(token)}`, {})
+  },
+
   // --- Leituras (histórico) e progresso ---
   getReadings(id) {
     return client.get(`/library/${id}/readings`)
diff --git a/frontend/src/views/Moderation.vue b/frontend/src/views/Moderation.vue
new file mode 100644
index 0000000000000000000000000000000000000000..af2d22983658a7fb6f4b7a611620fba09da17504
--- /dev/null
+++ b/frontend/src/views/Moderation.vue
@@ -0,0 +1,249 @@
+<template>
+  <AuthLayout
+    title="Librishelf"
+    :subtitle="t('moderation.subtitle')"
+  >
+    <div
+      class="header"
+      role="status"
+    >
+      <h1>{{ heading }}</h1>
+      <p
+        v-if="message"
+        class="subtitle"
+      >{{ message }}</p>
+    </div>
+
+    <template v-if="data">
+      <p
+        class="state"
+        :class="data.review.hidden ? 'hidden' : 'visible'"
+      >
+        <i
+          :class="data.review.hidden ? 'pi pi-eye-slash' : 'pi pi-eye'"
+          aria-hidden="true"
+        ></i>
+        {{ data.review.hidden
+          ? t(data.review.hiddenReason === 'reports' ? 'moderation.hiddenAuto' : 'moderation.hiddenManual')
+          : t('moderation.visible') }}
+      </p>
+
+      <div class="review-box">
+        <p
+          v-if="data.review.hasSpoiler"
+          class="flag"
+        >{{ t('moderation.markedSpoiler') }}</p>
+        <ReviewCard
+          :review="data.review"
+          show-book
+          show-author
+          plain
+        />
+      </div>
+
+      <section
+        class="reports"
+        :aria-label="t('moderation.reports')"
+      >
+        <h2>{{ t('moderation.reportsCount', { n: data.reports.length }, data.reports.length) }}</h2>
+        <ul>
+          <li
+            v-for="(report, index) in data.reports"
+            :key="index"
+          >
+            <span class="reason">{{ t(`review.reasons.${report.reason}`) }}</span>
+            <span class="by">@{{ report.reporter }} · {{ formatDate(report.createdAt) }}</span>
+            <p
+              v-if="report.note"
+              class="note"
+            >{{ report.note }}</p>
+          </li>
+        </ul>
+      </section>
+
+      <div class="auth-form">
+        <AppButton
+          v-if="!data.review.hidden"
+          :label="t('moderation.hide')"
+          icon="pi pi-eye-slash"
+          class="btn-danger w-full"
+          :loading="busy === 'hide'"
+          :disabled="Boolean(busy)"
+          @click="act(true)"
+        />
+        <AppButton
+          :label="data.review.hidden ? t('moderation.restore') : t('moderation.keep')"
+          icon="pi pi-check"
+          :class="data.review.hidden ? 'btn-primary w-full' : 'btn-outlined btn-secondary w-full'"
+          :loading="busy === 'show'"
+          :disabled="Boolean(busy)"
+          @click="act(false)"
+        />
+        <p class="hint">{{ t('moderation.keepHint') }}</p>
+      </div>
+    </template>
+  </AuthLayout>
+</template>
+
+<script setup>
+import { computed, onMounted, ref } from 'vue'
+import { useRoute, useRouter } from 'vue-router'
+import { useI18n } from 'vue-i18n'
+import AppButton from '../components/ui/AppButton.vue'
+import AuthLayout from '../components/AuthLayout.vue'
+import ReviewCard from '../components/review/ReviewCard.vue'
+import api from '../services/api.js'
+import { useToast } from '../services/toast.js'
+
+/**
+ * Link do e-mail de denúncia (vai para ADMIN_EMAIL): mostra a resenha e as
+ * denúncias e deixa ocultar ou manter. Sem login — o token assinado só vale
+ * para esta resenha.
+ */
+const { t, locale } = useI18n()
+const route = useRoute()
+const router = useRouter()
+const toast = useToast()
+
+const state = ref('loading') // loading | ready | failed
+const errorMessage = ref('')
+const data = ref(null)
+const busy = ref('')
+let token = ''
+
+const heading = computed(() => ({
+  loading: t('moderation.loading'),
+  ready: t('moderation.title'),
+  failed: t('moderation.failedTitle')
+}[state.value]))
+
+const message = computed(() => (state.value === 'failed' ? errorMessage.value : ''))
+
+function formatDate(value) {
+  const date = new Date(value)
+  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' })
+}
+
+async function act(hide) {
+  busy.value = hide ? 'hide' : 'show'
+  try {
+    data.value = await api.moderateReview(token, hide)
+    toast.add({ severity: 'success', summary: hide ? t('moderation.hiddenDone') : t('moderation.keptDone'), life: 3000 })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
+  } finally {
+    busy.value = ''
+  }
+}
+
+onMounted(async () => {
+  token = String(route.query.token || '')
+  // Tira o token da barra de endereço/histórico (o link do e-mail continua valendo)
+  router.replace({ query: {} })
+  try {
+    data.value = await api.getModeration(token)
+    state.value = 'ready'
+  } catch (error) {
+    errorMessage.value = error.message
+    state.value = 'failed'
+  }
+})
+</script>
+
+<style scoped>
+.state {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  margin: 0 0 1rem;
+  padding: 0.6rem 0.8rem;
+  border-radius: 8px;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+}
+
+.state.visible {
+  background: rgba(var(--green-rgb), 0.12);
+  color: var(--green);
+}
+
+.state.hidden {
+  background: rgba(var(--orange-rgb), 0.14);
+  color: var(--orange);
+}
+
+.review-box {
+  display: flex;
+  flex-direction: column;
+  gap: 0.4rem;
+  text-align: left;
+}
+
+.flag {
+  margin: 0;
+  font-size: var(--fs-xs);
+  color: var(--text-secondary);
+}
+
+.reports {
+  margin-top: 1.25rem;
+  text-align: left;
+}
+
+.reports h2 {
+  margin: 0 0 0.5rem;
+  font-size: var(--fs-sm);
+  text-transform: uppercase;
+  letter-spacing: 0.05em;
+  color: var(--text-muted);
+}
+
+.reports ul {
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+  margin: 0;
+  padding: 0;
+  list-style: none;
+}
+
+.reports li {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: baseline;
+  gap: 0.25rem 0.6rem;
+  padding: 0.6rem 0.75rem;
+  border: 1px solid var(--border-color);
+  border-radius: 8px;
+}
+
+.reason {
+  font-weight: 600;
+  font-size: var(--fs-sm);
+}
+
+.by {
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+}
+
+.note {
+  flex-basis: 100%;
+  margin: 0.2rem 0 0;
+  white-space: pre-line;
+  overflow-wrap: anywhere;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+}
+
+.auth-form {
+  margin-top: 1.25rem;
+}
+
+.hint {
+  margin: 0;
+  font-size: var(--fs-xs);
+  color: var(--text-muted);
+  text-align: center;
+}
+</style>
diff --git a/frontend/src/views/PublicLibrary.vue b/frontend/src/views/PublicLibrary.vue
index 1758add858d83ee48c13b0f99c207a84b88f8189..19e483c9716a719b3702a308aa1526b855b37853 100644
--- a/frontend/src/views/PublicLibrary.vue
+++ b/frontend/src/views/PublicLibrary.vue
@@ -278,6 +278,26 @@
               viewer.commonCount - viewer.commonBooks.length }) }}</p>
         </div>
       </div>
+
+      <div
+        v-if="reviews.items.length"
+        class="panel reviews-panel"
+      >
+        <h2>{{ t('review.profileTitle', { n: reviews.total }, reviews.total) }}</h2>
+        <div class="review-grid">
+          <ReviewCard
+            v-for="item in reviews.items"
+            :key="item.id"
+            :review="item"
+            show-book
+            @open-book="openBook"
+          />
+        </div>
+        <p
+          v-if="reviews.total > reviews.items.length"
+          class="muted small"
+        >{{ t('review.profileMore', { n: reviews.total - reviews.items.length }) }}</p>
+      </div>
     </section>
 
     <div
@@ -371,6 +391,7 @@
 </template>
 
 <script setup>
+import ReviewCard from '../components/review/ReviewCard.vue'
 import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
 import { useRoute, useRouter } from 'vue-router'
 import { useI18n } from 'vue-i18n'
@@ -404,6 +425,7 @@ const bookDialogVisible = ref(false)
 
 const stats = computed(() => profile.value?.stats ?? {})
 const viewer = computed(() => profile.value?.viewer ?? null)
+const reviews = computed(() => profile.value?.reviews ?? { total: 0, items: [] })
 const followStatus = computed(() => viewer.value?.followStatus ?? null)
 
 // Barras dos últimos anos com leitura, proporcionais ao ano com mais livros.
@@ -494,6 +516,8 @@ async function block() {
     profile.value.viewer.followStatus = null
     profile.value.viewer.commonCount = null
     profile.value.viewer.commonBooks = []
+    // Bloqueado não aparece mais aqui (e a resenha deixa de ser visível)
+    profile.value.reviews = { total: 0, items: [] }
     toast.add({ severity: 'success', summary: t('common.success'), detail: t('block.blocked', { name: username.value }), life: 4000 })
   } catch (error) {
     toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
@@ -729,6 +753,21 @@ watch(username, () => {
   font-weight: 600;
 }
 
+.reviews-panel {
+  margin-top: 1rem;
+}
+
+.review-grid {
+  display: grid;
+  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
+  align-items: start;
+  gap: 0.75rem;
+}
+
+.reviews-panel .small {
+  margin: 0.75rem 0 0;
+}
+
 .panel .sub-heading {
   margin-top: 1rem;
 }
diff --git a/frontend/sw/sw.js b/frontend/sw/sw.js
index 6db72454b1c4d5bfd5565ce251d8ffc5ef23a1fb..20e0bc3a07e6a91c67a44c35138d1e6d8d63fb2f 100644
--- a/frontend/sw/sw.js
+++ b/frontend/sw/sw.js
@@ -40,7 +40,7 @@ const MAX_COVERS = 500
 
 // Nunca guardados: sessão/conta, buscas externas, prévia, descadastro e o
 // mosaico aleatório da tela de login
-const API_BYPASS = [/^\/api\/auth\//, /^\/api\/isbn\//, /^\/api\/meta\//, /^\/api\/email\//, /^\/api\/ping$/, /^\/api\/library\/covers\/random/]
+const API_BYPASS = [/^\/api\/auth\//, /^\/api\/isbn\//, /^\/api\/meta\//, /^\/api\/email\//, /^\/api\/moderation\//, /^\/api\/ping$/, /^\/api\/library\/covers\/random/]
 
 self.addEventListener('install', event => {
   event.waitUntil((async () => {
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
echo "Migration nova: 011_reviews (só acrescenta; nada é apagado)"
echo "  - tabelas reviews, review_likes e review_reports"
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
echo "  Resenhas de exemplo no banco local:  (cd backend && npm run db:seed -- --reset)  (APAGA o banco local)"
echo "  Testes de integração:  (cd backend && npm run db:migrate:test && npm test)"
echo "  Ver o e-mail de denúncia:  (cd backend && npm run email:preview)"
echo "  Produção (no deploy):  docker compose exec <container do backend> npm run db:migrate:docker"
echo
echo "⚠ Variável nova (opcional) na VPS, em backend/src/.env:"
echo "    ADMIN_EMAIL=seu@email   → recebe as denúncias com o link de moderação"
echo "  Sem ela, a denúncia só vai para o log do backend (com o link) e a"
echo "  resenha ainda some sozinha com 3 denúncias de pessoas diferentes."

echo
echo "✓ Tudo certo. Mensagem de commit sugerida:"
echo "────────────────────────────────────────────"
cat <<'__MSG__'
feat: resenhas públicas com spoiler, curtidas e denúncia (pacote 14)

- Resenha por livro da estante (até 5000 caracteres), separada das
  anotações privadas; escrever, editar e apagar no livro aberto
- "Contém spoiler": o texto aparece borrado até o leitor pedir
- Quem pode ler: todos que veem a biblioteca pública (e, na comunidade,
  leitores do mesmo livro se o autor participa) ou só seguidores
  aprovados; avisos quando a biblioteca está privada ou sem seguidores
- Onde aparece: no livro aberto da biblioteca pública, na comunidade do
  livro ("Resenhas de leitores") e num painel novo no perfil público
- Curtir (otimista) e denunciar (motivo + detalhes) para leitores
  logados; uma denúncia por pessoa, 10 por hora
- Denúncia vai por e-mail para ADMIN_EMAIL com link assinado para
  /moderation (sem login): ocultar ou manter visível; com 3 denúncias
  de pessoas diferentes a resenha some até a revisão
- Exportar/importar dados (CSV e JSON) levam a resenha
- Migration 011: reviews, review_likes, review_reports
- StarRating: tamanho sm/md/lg não herda mais o size-lg do <dialog>
  (estrelas pequenas do histórico e da comunidade voltam a ser pequenas)
- Perfil público carrega a sessão (curtir/denunciar no perfil)
- Seed com resenhas e curtidas; .env.test.example com UPLOAD_DIR
__MSG__
echo "────────────────────────────────────────────"
echo "Revise com 'git status' / 'git diff' e commite quando quiser."