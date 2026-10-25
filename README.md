# Librishelf 📚

**Librishelf** is a personal library manager: catalog your books, track what you have read and find anything in your collection in seconds.

Live at **[librishelf.com](https://librishelf.com)**.

## Features

- **Your collection, your way** — add books with authors, publisher, ISBN, tags, publication date, cover art and a 1–5 star rating.
- **ISBN lookup, barcode and title search** — type or scan an ISBN with the camera, or search by title/author, and the title, authors, publisher, date, pages and cover are filled in from [Open Library](https://openlibrary.org) (queried by the server, never by the browser). Invalid ISBNs are flagged so you can fix them.
- **Reading log** — want to read, reading and read; every reading is kept, so rereads count again (with their own dates and an optional rating), and books in progress track the current page or percentage.
- **Reviews** — write a review per book (spoiler warning, public or followers only); readers can like and report them, with moderation by email.
- **Lists** — "Best of 2026", "Vacation reads": pick books from your shelf, drag (or use the keyboard) to order them, optionally numbered. Public lists show on your profile and get their own shareable page (`/u/your-username/lists/<id>`) with a link preview of the list's covers.
- **Search and filters** — search by title or ISBN; filter by author, publisher, tag, reading status and year; sort by any field.
- **Dashboard** — totals, reading rate, books read per year, top authors and tags.
- **Your year in books** — a yearly recap (available all year; "so far" for the current one): books and pages read, month by month, goal, best rated, most-read authors and records (longest, fastest…), plus a 9:16 story image drawn in the browser to download or share.
- **Public library (opt-in)** — share a read-only link (`/u/your-username`) to your shelf (with a link preview on WhatsApp and social networks: title, book count and a mosaic of your covers), with a profile: reading by year, top authors and tags, recently read and books you have in common. Libraries are private by default.
- **Community (opt-in)** — see who else has a book, their average rating and what people who have it also have. Follow other readers (they approve each request) and get a feed of what they add and finish. Everything is off until the user turns it on.
- **Account control** — email confirmation, password recovery by email, change your password (signs out other sessions) and delete your account with all its data.
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
frontend/
  src/                     Vue app
  nginx.conf               production server + /api proxy
docker-compose.yml
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
   | `ALLOWED_ORIGINS` | only matters for cross-origin calls; in dev the Vite proxy makes it same-origin |
   | `TRUST_PROXY` | number of reverse proxies in front of the API (empty in dev) |
   | `DB_SSL` | `true` to connect over SSL |

3. **Create the database schema**

   ```sh
   cd backend
   npm run db:migrate
   ```

   On an empty database this applies `db/schema.sql`; on an existing one it applies only the pending files in `db/migrations/`.

4. **Start both servers**

   ```sh
   cd backend && npm run server     # API on http://localhost:3050 (node --watch)
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

The API sends email over SMTP: the password reset link (valid for 1 hour), the sign-up confirmation link (valid for 3 days) and, for users who turn it on in Account, follower notifications (someone asked to follow you / accepted your request) — at most one every `FOLLOW_EMAIL_INTERVAL_HOURS` (default 6), with one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058). When a reader reports a review, `ADMIN_EMAIL` gets the review text and a signed link to `/moderation` to hide it or keep it visible; after 3 reports from different readers it is hidden automatically until reviewed. Until a user confirms their email, public library, community and following stay locked; accounts that existed before this version count as confirmed.

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
ADMIN_EMAIL=you@example.com             # receives review reports (link to hide/keep); without it reports only go to the log
```

To send as `@librishelf.com` without landing in spam, add the SPF and DKIM records your SMTP provider gives you to the domain's DNS (and ideally a DMARC record). Without `SMTP_HOST` nothing is sent: the email content, links included, goes to the server log — handy for local development.

### Upgrading an existing installation

```sh
git pull
docker compose build
docker compose run --rm backend npm run db:migrate:docker   # the API refuses to start with pending migrations
docker compose up -d
```

Migrations must run as the role that **owns** the tables (the same `DB_USER` the app uses, if it created them). Back up first: `003_per_user_names_and_community` moves authors, publishers and tags from shared tables to per-user ones (each user gets their own copy; case-only duplicates are merged).

Optional, after upgrading: link books that already have an ISBN to Open Library, so they match other readers' copies even across editions. Set `OPENLIBRARY_CONTACT` (an e-mail, sent in the User-Agent as Open Library asks) and run:

```sh
docker compose exec backend npm run enrich:isbn:docker -- --dry-run   # preview
docker compose exec backend npm run enrich:isbn:docker
```

`db/manual/drop-legacy-public-schema.sql` removes the old tables left in the `public` schema by earlier versions. It is destructive and optional; back up before running it by hand.

## Privacy

Libraries are private unless the owner turns on sharing; community and followers are separate opt-ins, both off by default. ISBN lookups go from the server to Open Library with only the ISBN. Session uses a single essential httpOnly cookie; fonts are self-hosted and the app loads nothing from third parties. See the in-app privacy policy at `/privacy`.

---

Made with ❤️ by **[acs](https://github.com/rodrigoacs)**
