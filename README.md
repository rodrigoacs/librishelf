# Librishelf 📚

**Librishelf** is a personal library manager: catalog your books, track what you have read and find anything in your collection in seconds.

Live at **[librishelf.com](https://librishelf.com)**.

## Features

- **Your collection, your way** — add books with authors, publisher, ISBN, tags, publication date and cover art.
- **Reading log** — mark books as read and keep the date you finished them.
- **Search and filters** — search by title or ISBN; filter by author, publisher, tag, reading status and year; sort by any field.
- **Dashboard** — totals, reading rate, books read per year, top authors and tags.
- **Public library (opt-in)** — share a read-only link (`/u/your-username`) to your shelf. Libraries are private by default.
- **Account control** — change your password (signs out other sessions) and delete your account with all its data.
- **Portuguese and English**, light and dark themes, six accent colors.

## Tech stack

| Layer    | Tech                                                                 |
|----------|----------------------------------------------------------------------|
| Frontend | Vue 3, Vite, PrimeVue 3, vue-i18n, Chart.js                           |
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

**Requirements:** Node.js 22.12+ and PostgreSQL 14+.

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
docker compose up -d --build
docker compose exec backend npm run db:migrate:docker
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

### Upgrading an existing installation

```sh
git pull
docker compose up -d --build
docker compose exec backend npm run db:migrate:docker
```

`db/manual/drop-legacy-public-schema.sql` removes the old tables left in the `public` schema by earlier versions. It is destructive and optional; back up before running it by hand.

## Privacy

Libraries are private unless the owner turns on sharing. Session uses a single essential httpOnly cookie; fonts are self-hosted and the app loads nothing from third parties. See the in-app privacy policy at `/privacy`.

---

Made with ❤️ by **[acs](https://github.com/rodrigoacs)**
