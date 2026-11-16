# Librishelf 📚

**Librishelf** is a personal library manager: catalog your books, track what you have read and find anything in your collection in seconds.

Live at **[librishelf.com](https://librishelf.com)**.

## Features

- **Your collection, your way** — add books with authors, publisher, ISBN, tags, publication date, cover art and a 1–5 star rating.
- **ISBN lookup, barcode and title search** — type or scan an ISBN with the camera, or search by title/author, and the title, authors, publisher, date, pages and cover are filled in from [Open Library](https://openlibrary.org) (queried by the server, never by the browser). Invalid ISBNs are flagged so you can fix them.
- **Reading log** — want to read, reading and read; every reading is kept, so rereads count again (with their own dates and an optional rating), and books in progress track the current page or percentage.
- **Profile photo** — pick a photo and crop it in a circle (pinch and drag on the phone; drag, wheel, slider or keyboard on desktop), and choose who sees it: everyone, only your followers or only you. Everyone else sees your initial. Photos can be reported like reviews.
- **Reviews** — write a review per book (spoiler warning, public or followers only); readers can like and report them, with moderation by email.
- **Lists** — "Best of 2026", "Vacation reads": pick books from your shelf, drag (or use the keyboard) to order them, optionally numbered. Public lists show on your profile and get their own shareable page (`/u/your-username/lists/<id>`) with a link preview of the list's covers.
- **Search and filters** — search by title or ISBN; filter by author, publisher, tag, reading status and year; sort by any field.
- **Dashboard** — totals, reading rate, books read per year, top authors and tags.
- **Your year in books** — a yearly recap (available all year; "so far" for the current one): books and pages read, month by month, goal, best rated, most-read authors and records (longest, fastest…), plus a 9:16 story image drawn in the browser to download or share.
- **Public library (opt-in)** — share a read-only link (`/u/your-username`) to your shelf (with a link preview on WhatsApp and social networks: title, book count and a mosaic of your covers), with a profile: reading by year, top authors and tags, recently read and books you have in common. Libraries are private by default.
- **Community (opt-in)** — see who else has a book, their average rating and what people who have it also have. Follow other readers (they approve each request) and get a feed of what they add and finish. Everything is off until the user turns it on.
- **Admin area** (`/admin`, desktop) — for accounts with `role = 'admin'`, after re-entering the password (unlocked for 30 idle minutes): site numbers and weekly sign-ups, the queue of reported reviews (hide / keep) and of reported profile photos (keep / remove), account search with suspend / reactivate (nothing is deleted; a suspended account can't sign in and its public pages disappear) a log of every admin action, usage (sign-up funnel, who uses each feature, daily counters such as camera scans and imports), moderation signals (frequent reporters, new accounts already reported), a per-account drawer (totals, privacy flags, history; resend confirmation) and a **System** tab: backend/frontend versions, database and pending migrations, disk and covers, SMTP status with a test email, Open Library calls and failure rate, rate-limit hits and the latest 500 errors. Optional: set `APP_VERSION` (e.g. the git commit) to show it there.
- **Account control** — email confirmation, password recovery by email, change your password (signs out other sessions), sign out that ends the session on the server (the old cookie stops working), download all your data (JSON, including follows, blocks, likes and reports; or books as CSV) and delete your account with all its data. Usernames and emails are unique regardless of case (`Demo` = `demo`).
- **Import** — Goodreads export or any CSV (pick the columns in a preview), with a guide for Skoob; runs in the background and fetches covers afterwards.
- **Collection and loans** — who has your books and since when (free); copy photos, shelf location, price paid, collection value and loan reminders by email (Pro).
- **First steps** — after confirming the email, new accounts choose how to start (Goodreads/CSV import, barcode or title search), add their first 3 books, optionally turn on the public library (with a preview) and see the road to the Vanguarda badge. It can be skipped and resumed from Home; the step is stored on the server.
- **Pro plan** — paid with [Mercado Pago](https://www.mercadopago.com.br) (monthly subscription, annual, founder offers), 14-day free trial, 7-day withdrawal from inside the app. Pro adds advanced stats, collector tools, extra themes (also on your public page), automatic backups and your public page visits. Nothing that is free becomes paid. The first 100 accounts with a confirmed email and 10 books get the **Vanguarda** badge and Pro for life.
- **Portuguese and English**, light and dark themes, six accent colors.

## Tech stack

| Layer    | Tech                                                                 |
|----------|----------------------------------------------------------------------|
| Frontend | Vue 3, Vite, vue-i18n, Chart.js, PrimeIcons (own UI components in `src/components/ui`) |
| Backend  | Node.js 22+, Express 5, `pg`, `sharp` (covers → AVIF/JPG), JWT in an httpOnly cookie |
| Database | PostgreSQL (schema `librishelf`)                                     |
| Deploy   | Docker Compose; nginx serves the SPA and proxies `/api` to the backend |

```
backend/
  db/schema.sql            full schema (fresh install)
  db/migrations/           incremental changes for existing databases
  db/manual/               optional, destructive scripts (never run automatically)
  src/                     Express app (routes → services → repositories)
  src/worker.js            job queue (same image, own container)
frontend/
  src/                     Vue app
  nginx.conf               production server + /api proxy
  nginx-security.conf      security headers and Content-Security-Policy (every location)
e2e/                       Playwright end-to-end tests + fake Mercado Pago and SMTP
.github/workflows/ci.yml   backend, frontend and E2E jobs
docker-compose.yml         production: frontend, backend and worker on the "proxy" network
docker-compose.local.yml   Postgres for development (127.0.0.1:5433)
```

## Running locally

**Requirements:** Node.js 22.12+ and PostgreSQL 15+.

1. **Install dependencies**

   ```sh
   git clone https://github.com/rodrigoacs/librishelf.git
   cd librishelf
   (cd backend && npm install)
   (cd frontend && npm install)
   ```

2. **Configure the backend** — copy `backend/src/.env.example` to `backend/src/.env` and fill it in. The important ones:

   | Variable | Notes |
   |----------|-------|
   | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
   | `SECRET_KEY` | at least 32 characters (the server refuses to start otherwise) |
   | `COOKIE_SECURE` | leave empty: it follows `NODE_ENV` (secure in production) |
   | `ALLOWED_ORIGINS` | only matters for cross-origin calls; in dev the Vite proxy makes it same-origin. Empty = `localhost:5173/8080` outside production, none in production |
   | `TRUST_PROXY` | number of reverse proxies in front of the API (empty in dev) |
   | `DB_SSL` | `true` to connect over SSL |

3. **Create the database schema**

   ```sh
   cd backend
   npm run db:migrate
   ```

   On an empty database this applies `db/schema.sql`; on an existing one it applies only the pending files in `db/migrations/`.

4. **Start everything**

   From the repository root, `npm run dev` starts the API, the worker and Vite together, each line prefixed with `[api]`, `[worker]` or `[web]` (`npm run dev:local` uses `backend/src/.env.local`). Ctrl+C stops all three; if one of them exits, the others are stopped too. To run them in separate terminals:

   ```sh
   cd backend && npm run server     # API on http://localhost:3050 (node --watch)
   cd backend && npm run worker     # job queue: emails, imports, backups, expirations
   cd frontend && npm run dev       # app on http://localhost:5173
   ```

   The Vite dev server proxies `/api` to `http://localhost:3050`, the same way nginx does in production. To point it elsewhere, set `VITE_DEV_API_TARGET` in `frontend/.env`.

### Local database with sample data

A throwaway Postgres with dozens of fictional readers, thousands of books (several editions of the same work, ISBN-10/13, invalid ISBNs, ratings, reading dates), generated covers, privacy settings, followers and pending requests:

```sh
docker compose -f docker-compose.local.yml up -d     # Postgres 16 on 127.0.0.1:5433
cp backend/src/.env.local.example backend/src/.env.local
cd backend
npm run db:migrate:local
npm run db:seed                                      # --reset to start over; --users=80 --books=150 for more
npm run server:local                                 # API on :3050 using the local database
```

Or, from the repository root, `npm run dev:local` (API, worker and Vite together, using the local database).

Log in as `demo` / `senha12345` (every seeded account uses that password; `privado` has everything off, `vazio` has no books). The seed refuses to run against a non-local host, with `NODE_ENV=production`, or on a database that already has users (unless `--reset`).

## Tests

The integration tests truncate tables, so they only run against a database whose name contains `test` **and** with `ALLOW_DESTRUCTIVE_TEST_DB=true`.

```sh
cd backend
cp src/.env.test.example src/.env.test   # point it to e.g. librishelf_test
npm run db:migrate:test
npm test                                  # unit + integration
npm run test:unit                         # unit only, no database needed
```

Mercado Pago, email and Open Library are faked in the integration tests (`setFetch()` in `services/mercadoPago.js`, `testOutbox()` in `mailService.js`, `tests/helpers/openLibraryMock.js`); with `NODE_ENV=test` nothing leaves the machine and rate limits are off.

Frontend (no database or server needed):

```sh
cd frontend
npm test        # Vitest: src/utils, composables and the pt/en locale files
npm run lint    # ESLint (eslint-plugin-vue), --max-warnings=0; npm run lint -- --fix fixes what it can
```

### End-to-end (Playwright)

`e2e/` runs real browsers (Pixel, iPhone and desktop) against fake Mercado Pago and SMTP servers (`e2e/fakes`). Tests select elements by their Portuguese accessible names, create their own users (the database is not cleaned between runs) and fail on any Content-Security-Policy violation. Two ways to run:

```sh
cd e2e && npm ci
# 1. Docker, same as CI: production images (nginx with CSP and SSI)
npm run stack:up && npm run test:stack && npm run stack:down
# 2. No Docker: Playwright starts the fakes, backend + worker and `vite preview`
docker compose -f ../docker-compose.local.yml exec db createdb -U librishelf librishelf_e2e   # once
npm test
```

The backend runs with `NODE_ENV=e2e`: rate limits are off and `MP_API_URL` points Mercado Pago at the fake (it is ignored in every other environment). `npx playwright test --project=pixel` runs one device; without WebKit's system dependencies, `E2E_IPHONE_BROWSER=chromium` emulates the iPhone in Chromium.

### CI

`.github/workflows/ci.yml` runs on every push and pull request: backend (migrations on a fresh Postgres, unit and integration tests), frontend (lint, Vitest, build and an `nginx -t` check of the production config) and E2E (the Docker stack and Playwright, with traces uploaded when something fails).

## Deploying with Docker

The compose file expects an external Docker network named `proxy`, shared with the reverse proxy on the host.

```sh
docker network create proxy                 # once, if it does not exist
sudo chown -R 1000:1000 ./uploads           # the API runs as the non-root "node" user
docker compose build
docker compose run --rm backend npm run db:migrate:docker
docker compose up -d
```

- `librishelf-frontend` serves the built app and proxies `/api/*` to `librishelf-backend:3050`.
- The backend publishes no host port; only the frontend container talks to it.
- Covers are stored in `./uploads` (mounted into the backend).

Point your host reverse proxy at the frontend container. Example for nginx:

```nginx
server {
  server_name librishelf.com;
  client_max_body_size 12m;                       # covers up to 10 MB

  location / {
    proxy_pass http://librishelf-frontend:80;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`TRUST_PROXY=2` in `docker-compose.yml` matches this chain (host nginx → frontend nginx → API) so rate limiting sees the real client IP.

### Email (password recovery and sign-up confirmation)

The API sends email over SMTP: the password reset link (valid for 1 hour), the sign-up confirmation link (valid for 3 days) and, for users who turn it on in Account, follower notifications (someone asked to follow you / accepted your request) — at most one every `FOLLOW_EMAIL_INTERVAL_HOURS` (default 6), with one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058). When a reader reports a review, `ADMIN_EMAIL` gets the review text and a signed link to `/moderation` to hide it or keep it visible; after 3 reports from different readers it is hidden automatically until reviewed. Reported profile photos work the same way (signed link to keep or remove the photo; 3 reports take it down until reviewed). Until a user confirms their email, public library, community and following stay locked; accounts that existed before this version count as confirmed.

Set in `backend/src/.env`:

```sh
APP_URL=https://librishelf.com          # links in the emails point here
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587                           # 587 + SMTP_SECURE=false (STARTTLS) or 465 + SMTP_SECURE=true
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Librishelf <noreply@librishelf.com>"
# FOLLOW_EMAIL_INTERVAL_HOURS=6         # optional
ADMIN_EMAIL=you@example.com             # receives review and profile photo reports (signed moderation link); without it reports only go to the log
```

To send as `@librishelf.com` without landing in spam, add the SPF and DKIM records your SMTP provider gives you to the domain's DNS (and ideally a DMARC record). Without `SMTP_HOST` nothing is sent: the email content, links included, goes to the server log — handy for local development.

### Background jobs (worker)

The `worker` service runs the job queue (table `librishelf.jobs`, consumed with `FOR UPDATE SKIP LOCKED`; no Redis). It uses the same image and `.env` as the backend; `docker compose up -d` starts both. Locally: `npm run worker` (or `worker:local`). More than one worker is fine: each job is taken by one only. A job that keeps failing is retried with backoff and then given up (it shows up in Admin → Errors).

| Job | When | What |
|-----|------|------|
| `entitlements.expire` | every 15 min | ends Pro that ran out |
| `reservations.release` | every 5 min | frees founder slots held by unpaid checkouts (`CHECKOUT_TTL_MINUTES`) |
| `mercadopago.reconcile` | daily | asks Mercado Pago about payments the webhook may have missed |
| `webhook.process` | on demand | processes a Mercado Pago notification (idempotent) |
| `billing.reminders` | hourly | finds annual plans and free trials about to end and queues the reminder emails |
| `email.send` | on demand | queued emails, within the mailbox daily limit (`MAIL_DAILY_LIMIT`, `MAIL_DIRECT_RESERVE`) |
| `follow-emails.sweep` | every 5 min | follower notifications, at most one per `FOLLOW_EMAIL_INTERVAL_HOURS` |
| `import.run`, `import.covers` | on demand | CSV imports and their covers (`IMPORT_COVER_PAUSE_MS` between Open Library calls) |
| `backups.sweep`, `backup.create` | hourly / on demand | automatic backups (Pro) |
| `errors.digest` | every 15 min | emails `ADMIN_EMAIL` a summary of new errors, at most every `ERROR_DIGEST_MINUTES` (default 60, minimum 5) |
| `jobs.cleanup`, `tokens.cleanup`, `imports.cleanup` | daily | removes old jobs, expired tokens, forgotten import drafts and files of failed imports |

```sh
docker compose logs -f worker
```

### Pro and Mercado Pago

Payments go through Mercado Pago's REST API with `fetch` (no SDK). Pro is granted only by the webhook or by asking the API (`paymentService.processPayment`, idempotent), never by the browser's return URL. Checkout requires a confirmed email and the current Terms accepted.

```sh
MP_ACCESS_TOKEN=APP_USR-...             # Your integrations → app → Credentials (TEST-... in development). Empty: checkout off
MP_WEBHOOK_SECRET=...                   # Webhooks → secret key; events "Payments" and "Plans and subscriptions"
# MP_NOTIFICATION_URL=...               # default {APP_URL}/api/webhooks/mercadopago (use a tunnel in development)
# MP_SANDBOX=false                      # sandbox checkout link
# CHECKOUT_TTL_MINUTES=30               # how long a checkout (and a founder slot) is held
# SUBSCRIPTION_GRACE_DAYS=3             # monthly: days of Pro after the paid month while Mercado Pago retries
```

- **Withdrawal (7 days)** — Brazilian consumer law (CDC art. 49, Decree 7.962/2013): the buyer can withdraw from inside the app (Account → plan → billing history) within 7 days of the payment. The app cancels the subscription (monthly), asks Mercado Pago for a full refund, removes that purchase's Pro and emails a confirmation. Only the first charge of a subscription qualifies (`withdrawalRules.js`).
- **Refunds** — refund in the Mercado Pago dashboard, then mark it in Admin → Pro (it removes the Pro of that purchase and stops the renewal). A refund or chargeback that arrives by webhook does the same automatically.
- Offers, prices and founder slots are edited in Admin → Pro. Founder slots do not come back after a withdrawal or refund.

### Backups, errors and logs

- **Automatic backups (Pro)** go to `BACKUP_DIR` (default `UPLOAD_DIR/backups`, i.e. the `./uploads` volume); the newest `BACKUP_KEEP` (default 5) per account are kept.
- **Errors** — 500s from the API, jobs that gave up, failed webhooks, browser errors (`POST /client-errors`, also from the public page) and CSP violations all land in one table (`error_reports`, grouped by signature, no personal data) and in Admin → Errors; `errors.digest` emails new ones to `ADMIN_EMAIL`.
- **Logs** — `LOG_FORMAT=json` (one line per event; the default in production) or `pretty`; `LOG_LEVEL` is `debug`, `info` (default in production), `warn` or `error`. Logs never contain full emails, tokens, passwords or payment bodies.
- `APP_VERSION` (e.g. the git commit) shows in Admin → System; `MAIL_LOGO_URL` changes the logo in emails; `APP_TIME_ZONE` (default `America/Sao_Paulo`) sets the day used in emails and daily counts.

### Content-Security-Policy

`frontend/nginx-security.conf` (included in every nginx `location`) sets the security headers and a strict CSP: no `unsafe-inline`, no `unsafe-eval` (only `wasm-unsafe-eval`, for the barcode reader), nothing from other domains. It ships as `Content-Security-Policy-Report-Only`: browsers report violations to `/api/csp-report` (they show up in Admin → Errors) without blocking. Once the E2E job (which fails on any violation) and the Errors tab stay clean in production, switch to blocking by renaming the header to `Content-Security-Policy` in that file and rebuilding the frontend image. HSTS belongs on the host nginx, not in the container.

### Terms and privacy

The Terms of Use and the Privacy Policy are accepted together. `TERMS_VERSION` lives in `backend/src/config/terms.js` **and** `frontend/src/config/site.js` and must match; changing it makes every user accept again on their next visit (checkout is refused until then). `frontend/src/config/site.js` also holds `OWNER` (name, document, contact shown in the texts) and `LEGAL_DRAFT` (shows a "draft" notice while the texts await legal review).

### Upgrading an existing installation

```sh
git pull
docker compose build
docker compose run --rm backend npm run db:migrate:docker   # the API refuses to start with pending migrations
docker compose up -d
```

Migrations live in `backend/db/migrations` (`001` to `029_onboarding`, each in its own transaction) and the same SQL is appended, idempotent, to `db/schema.sql` for fresh installs. Recent ones: `018`–`019` Pro and checkout, `020` email sends, `021` imports, `022` collector, `023`–`026` personalization, backups, profile cover and public page, `027` error reports, `028` public page counters, `029` first steps (accounts that already existed are marked as done, so only new ones see them).

Migrations must run as the role that **owns** the tables (the same `DB_USER` the app uses, if it created them). Back up first: `003_per_user_names_and_community` moves authors, publishers and tags from shared tables to per-user ones (each user gets their own copy; case-only duplicates are merged).

`016_cover_version_and_fk_indexes` records which books have a cover by reading the files in `UPLOAD_DIR` (the `./uploads` volume, mounted by `docker compose run` too). If covers were restored later or the volume was missing during the migration, run `docker compose exec backend npm run covers:sync:docker` to check again (it never clears anything when the folder is empty, unless you pass `-- --force`).

`017_user_avatars` adds profile photos. The files live in `UPLOAD_DIR/avatars/` (`{user id}-sm|lg.avif|jpg`), on the same `./uploads` volume as the covers, so the same backup covers both.

Optional, after upgrading: link books that already have an ISBN to Open Library, so they match other readers' copies even across editions. Set `OPENLIBRARY_CONTACT` (an e-mail, sent in the User-Agent as Open Library asks) and run:

```sh
docker compose exec backend npm run enrich:isbn:docker -- --dry-run   # preview
docker compose exec backend npm run enrich:isbn:docker
```

To use the admin area, promote your account once (there is no sign-up path to admin):

```sh
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "UPDATE librishelf.users SET role = 'admin' WHERE name = '<your-username>';"
```

Then sign out and in again (or reload) and **Admin** shows in the menu. `npm run db:seed` makes `demo` an admin.

`db/manual/drop-legacy-public-schema.sql` removes the old tables left in the `public` schema by earlier versions. It is destructive and optional; back up before running it by hand.

## Privacy

Libraries are private unless the owner turns on sharing; community and followers are separate opt-ins, both off by default. ISBN lookups go from the server to Open Library with only the ISBN. Session uses a single essential httpOnly cookie (admins get a second one, `admin_unlock`, while the admin area is unlocked); usage is counted as daily totals with no user or IP attached (IPs that hit a rate limit stay only in memory, for at most 2 hours). Public pages count visits, shares, invite clicks and sign-ups per page and per day, with no cookie, IP or visitor account; the browser remembers in `sessionStorage` that today's visit was counted. Fonts are self-hosted and the app loads nothing from third parties. See the in-app privacy policy at `/privacy`.

## Development workflow

- One change ("package") at a time, finished and tested before the next; big screens are split into section components without changing texts, labels or roles, checked with before/after screenshots.
- Native Node over packages: ESM only, `--env-file` instead of dotenv, `--watch` instead of nodemon, `fetch` instead of axios or SDKs.
- Thin routes (validate → service → respond), SQL grouped per domain in `database/queries/` with `$1` parameters, controlled errors as `httpError(message, status, 'STABLE_CODE')` translated by the frontend via `errors.<CODE>` in both locales.
- Every UI text goes in `frontend/src/locales/pt.json` and `en.json` with the same keys, parameters and plural forms (a test checks it). Design tokens from `frontend/src/assets/main.css` only; mobile first.
- New behavior comes with tests; run what the change touches (backend, frontend and E2E) before calling it done.

---

Made with ❤️ by **[acs](https://github.com/rodrigoacs)**
