import { styleText } from 'node:util'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_PRODUCTION = NODE_ENV === 'production'
const IS_TEST = NODE_ENV === 'test'

function resolveFormat() {
  const value = process.env.LOG_FORMAT?.trim().toLowerCase()
  if (value === 'json' || value === 'pretty') return value
  if (IS_PRODUCTION || IS_TEST) return 'json'
  return process.stdout.isTTY ? 'pretty' : 'json'
}

function resolveMinLevel() {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase()
  if (value in LEVELS) return LEVELS[value]
  return IS_PRODUCTION ? LEVELS.info : LEVELS.debug
}

const FORMAT = resolveFormat()
const MIN_LEVEL = resolveMinLevel()

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function formatJson(level, message, meta) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && Object.keys(meta).length ? { meta } : {})
  })
}

// ---------------------------------------------------------------------------
// Pretty
// ---------------------------------------------------------------------------

const LEVEL_STYLE = {
  debug: ['gray'],
  info: ['cyan'],
  warn: ['yellow', 'bold'],
  error: ['red', 'bold']
}

function colorsEnabled(stream) {
  return Boolean(stream.isTTY) && !('NO_COLOR' in process.env)
}

function paint(useColor, format, text) {
  return useColor ? styleText(format, text, { validateStream: false }) : text
}

function localTime(date = new Date()) {
  const pad = (n, size = 2) => String(n).padStart(size, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function formatValue(value) {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return /[\s="]/.test(value) || value === '' ? JSON.stringify(value) : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function formatPretty(level, message, meta, useColor) {
  const { stack, ...rest } = meta || {}

  const time = paint(useColor, 'gray', localTime())
  const label = paint(useColor, LEVEL_STYLE[level], level.toUpperCase().padEnd(5))
  const text = level === 'error' ? paint(useColor, 'red', message) : message

  const pairs = Object.entries(rest)
    .map(([key, value]) => `${paint(useColor, 'gray', `${key}=`)}${formatValue(value)}`)
    .join(' ')

  let line = `${time} ${label} ${text}${pairs ? `  ${pairs}` : ''}`

  // Stack fora da linha principal: legível e clicável no terminal do editor.
  if (stack) {
    const frames = String(stack).split('\n').slice(1).map(frame => `    ${frame.trim()}`).join('\n')
    if (frames) line += `\n${paint(useColor, 'dim', frames)}`
  }

  return line
}

// ---------------------------------------------------------------------------

function write(level, message, meta) {
  if (LEVELS[level] < MIN_LEVEL) return

  const isError = level === 'error' || level === 'warn'
  const stream = isError ? process.stderr : process.stdout

  const line = FORMAT === 'pretty'
    ? formatPretty(level, message, meta, colorsEnabled(stream))
    : formatJson(level, message, meta)

  if (isError) {
    console.error(line)
  } else {
    console.log(line)
  }
}

const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  format: FORMAT
}

export default logger