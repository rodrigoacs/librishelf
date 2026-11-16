// Sobe API, worker e Vite juntos, com a saída de cada um prefixada.
//   npm run dev         → backend com src/.env
//   npm run dev:local   → backend com src/.env.local (banco do docker-compose.local.yml)
// Ctrl+C encerra os três; se um deles sair, os outros são encerrados também.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { styleText } from 'node:util'

const local = process.argv.includes('--local')
const suffix = local ? ':local' : ''

const processes = [
  { name: 'api', color: 'cyan', cwd: 'backend', script: `server${suffix}` },
  { name: 'worker', color: 'magenta', cwd: 'backend', script: `worker${suffix}` },
  { name: 'web', color: 'green', cwd: 'frontend', script: 'dev' },
]

const width = Math.max(...processes.map(p => p.name.length))
const root = new URL('..', import.meta.url)
const children = []
let stopping = false

function pipe(stream, prefix, out) {
  createInterface({ input: stream }).on('line', line => out.write(`${prefix} ${line}\n`))
}

function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  process.exitCode = code
}

for (const { name, color, cwd, script } of processes) {
  const prefix = styleText(color, `[${name.padEnd(width)}]`)
  const child = spawn('npm', ['run', '--silent', script], {
    cwd: new URL(`${cwd}/`, root),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.stdout.isTTY ? '1' : '0' },
  })
  pipe(child.stdout, prefix, process.stdout)
  pipe(child.stderr, prefix, process.stderr)
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${prefix} saiu (${signal ?? `código ${code}`}); encerrando os outros`)
      stopAll(code || 1)
    }
  })
  children.push(child)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stopAll(0))
