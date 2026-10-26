import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// corsOptions lê o ambiente ao carregar: cada caso roda num processo próprio.
const MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/corsOptions.js')

function allowed(origin, env) {
  const script = `
    const { default: cors } = await import(${JSON.stringify(MODULE)})
    cors.origin(${JSON.stringify(origin)}, err => process.stdout.write(err ? 'no' : 'yes'))
  `
  const { ALLOWED_ORIGINS, ...base } = process.env
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...base, LOG_LEVEL: 'error', ...env },
    encoding: 'utf8'
  }).trim().endsWith('yes')
}

describe('CORS por ambiente (B8)', () => {
  it('produção sem ALLOWED_ORIGINS: nenhuma origem de fora, nem localhost', () => {
    expect(allowed('http://localhost:5173', { NODE_ENV: 'production' })).toBe(false)
    expect(allowed('http://localhost:8080', { NODE_ENV: 'production' })).toBe(false)
  })

  it('produção com ALLOWED_ORIGINS: só as listadas', () => {
    const env = { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.exemplo.test' }
    expect(allowed('https://app.exemplo.test', env)).toBe(true)
    expect(allowed('http://localhost:5173', env)).toBe(false)
  })

  it('desenvolvimento sem ALLOWED_ORIGINS: localhost do Vite', () => {
    expect(allowed('http://localhost:5173', { NODE_ENV: 'development' })).toBe(true)
  })
})
