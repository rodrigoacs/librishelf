import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, FAKES_URL, NATIVE_PORTS as NATIVE } from './support/env.js'

/**
 * Testes de ponta a ponta. Dois jeitos de rodar:
 *
 * 1. Com Docker (o mesmo do CI): imagens de produção (nginx com CSP e SSI).
 *      npm run stack:up && npm run test:stack && npm run stack:down
 *
 * 2. Sem Docker: o Playwright sobe os serviços falsos, o backend + worker e o
 *    build do frontend (vite preview). Precisa de um Postgres com o banco
 *    librishelf_e2e criado (padrão: o do docker-compose.local.yml, porta 5433):
 *      docker compose -f docker-compose.local.yml exec db createdb -U librishelf librishelf_e2e
 *      npm test
 *    E2E_DB_HOST, E2E_DB_PORT, E2E_DB_NAME, E2E_DB_USER, E2E_DB_PASSWORD trocam o banco.
 *
 * Só um aparelho: npx playwright test --project=pixel (pixel, iphone, desktop).
 */
const here = path.dirname(new URL(import.meta.url).pathname)
const CI = Boolean(process.env.CI)
const stack = Boolean(process.env.E2E_BASE_URL)

// iPhone roda no WebKit (Safari). Sem as dependências do WebKit na máquina,
// E2E_IPHONE_BROWSER=chromium emula só tela e toque.
const IPHONE_BROWSER = process.env.E2E_IPHONE_BROWSER || 'webkit'

function nativeBackendEnv() {
  const base = parseEnv(fs.readFileSync(path.join(here, 'backend.env'), 'utf8'))
  return {
    ...process.env,
    ...base,
    PORT: String(NATIVE.backend),
    DB_HOST: process.env.E2E_DB_HOST || 'localhost',
    DB_PORT: process.env.E2E_DB_PORT || '5433',
    DB_NAME: process.env.E2E_DB_NAME || base.DB_NAME,
    DB_USER: process.env.E2E_DB_USER || base.DB_USER,
    DB_PASSWORD: process.env.E2E_DB_PASSWORD || base.DB_PASSWORD,
    APP_URL: BASE_URL,
    ALLOWED_ORIGINS: BASE_URL,
    SMTP_HOST: 'localhost',
    SMTP_PORT: String(NATIVE.smtp),
    MP_API_URL: FAKES_URL,
    MP_NOTIFICATION_URL: `http://localhost:${NATIVE.backend}/webhooks/mercadopago`,
    UPLOAD_DIR: path.join(here, '.tmp', 'uploads')
  }
}

const nativeServers = () => [
  {
    name: 'fakes',
    command: 'node fakes/server.js',
    cwd: here,
    url: `${FAKES_URL}/health`,
    env: {
      ...process.env,
      PORT: String(NATIVE.fakes),
      SMTP_PORT: String(NATIVE.smtp),
      PUBLIC_URL: FAKES_URL,
      MP_WEBHOOK_SECRET: nativeBackendEnv().MP_WEBHOOK_SECRET
    },
    reuseExistingServer: !CI
  },
  {
    // Migrations, worker (fila: e-mails, webhooks) e API
    name: 'backend',
    command: 'node src/database/migrate.js && (node src/worker.js & exec node src/server.js)',
    cwd: path.join(here, '..', 'backend'),
    url: `http://localhost:${NATIVE.backend}/ping`,
    env: nativeBackendEnv(),
    timeout: 60_000,
    reuseExistingServer: !CI
  },
  {
    // Build de produção servido pelo vite preview, com /api repassado ao backend
    name: 'frontend',
    command: `npm run build && npx vite preview --port ${NATIVE.frontend} --strictPort`,
    cwd: path.join(here, '..', 'frontend'),
    url: BASE_URL,
    env: { ...process.env, VITE_API_URL: '/api', VITE_DEV_API_TARGET: `http://localhost:${NATIVE.backend}` },
    timeout: 240_000,
    reuseExistingServer: !CI
  }
]

export default defineConfig({
  testDir: './tests',
  outputDir: './.tmp/results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: './.tmp/report' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Service worker fora: cada teste começa sem cache de um build anterior
    serviceWorkers: 'block'
  },

  // Celular é o padrão do Librishelf; desktop confere o layout largo
  projects: [
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'], defaultBrowserType: IPHONE_BROWSER } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } }
  ],

  webServer: stack ? undefined : nativeServers()
})
