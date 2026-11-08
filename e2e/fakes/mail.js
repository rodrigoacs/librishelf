import net from 'node:net'

/**
 * Caixa de e-mail dos testes: um servidor SMTP mínimo (sem TLS, sem
 * autenticação) que guarda tudo em memória. O backend manda pelo SMTP de
 * verdade (nodemailer), como em produção; os testes leem por HTTP
 * (GET /__fake/mail, em server.js).
 *
 * Só o necessário do RFC 5321: EHLO/HELO, MAIL, RCPT, DATA, RSET, NOOP, QUIT.
 */
const messages = []

export function inbox() {
  return messages
}

export function clearInbox() {
  messages.length = 0
}

export function startSmtp(port) {
  const server = net.createServer(socket => session(socket))
  server.listen(port, () => console.log(`[fakes] SMTP em :${port}`))
  return server
}

function session(socket) {
  let buffer = ''
  let envelope = { from: null, to: [] }
  let data = null // linhas do DATA enquanto recebe

  const reply = line => socket.write(`${line}\r\n`)
  reply('220 fakes.librishelf.test ESMTP')

  socket.on('data', chunk => {
    buffer += chunk.toString('latin1')
    let index
    while ((index = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)

      if (data) {
        if (line === '.') {
          store(envelope, data.join('\r\n'))
          data = null
          envelope = { from: null, to: [] }
          reply('250 OK')
        } else {
          // Ponto no começo da linha vem dobrado (dot-stuffing)
          data.push(line.startsWith('..') ? line.slice(1) : line)
        }
        continue
      }

      const command = line.slice(0, 4).toUpperCase()
      if (command === 'EHLO') reply('250-fakes.librishelf.test\r\n250 8BITMIME')
      else if (command === 'HELO') reply('250 fakes.librishelf.test')
      else if (command === 'MAIL') { envelope.from = address(line); reply('250 OK') }
      else if (command === 'RCPT') { envelope.to.push(address(line)); reply('250 OK') }
      else if (command === 'DATA') { data = []; reply('354 Fim com <CRLF>.<CRLF>') }
      else if (command === 'RSET') { envelope = { from: null, to: [] }; reply('250 OK') }
      else if (command === 'NOOP') reply('250 OK')
      else if (command === 'QUIT') { reply('221 Tchau'); socket.end() }
      else reply('502 Comando não implementado')
    }
  })
  socket.on('error', () => { })
}

function address(line) {
  return (line.match(/<([^>]*)>/)?.[1] ?? line.split(':')[1] ?? '').trim().toLowerCase()
}

function store(envelope, raw) {
  const message = parseMessage(Buffer.from(raw, 'latin1'))
  messages.push({
    from: envelope.from,
    to: envelope.to,
    subject: message.headers.subject ? decodeWords(message.headers.subject) : '',
    text: message.text,
    html: message.html,
    receivedAt: new Date().toISOString()
  })
}

// ---------------------------------------------------------------------------
// MIME: só o que o nodemailer gera (multipart, quoted-printable, base64)
// ---------------------------------------------------------------------------

function parseMessage(buffer) {
  const raw = buffer.toString('latin1')
  const split = raw.indexOf('\r\n\r\n')
  const head = split === -1 ? raw : raw.slice(0, split)
  const body = split === -1 ? '' : raw.slice(split + 4)

  const headers = {}
  for (const line of head.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
  }

  const type = headers['content-type'] || 'text/plain'
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1]
  const result = { headers, text: '', html: '' }

  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break
      const child = parseMessage(Buffer.from(part.replace(/^\r\n/, ''), 'latin1'))
      result.text ||= child.text
      result.html ||= child.html
    }
    return result
  }

  const content = decodeBody(body, headers['content-transfer-encoding'])
  if (/^text\/html/i.test(type)) result.html = content
  else if (/^text\/plain/i.test(type)) result.text = content
  return result
}

function decodeBody(body, encoding = '') {
  const kind = encoding.toLowerCase()
  if (kind === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
  if (kind === 'quoted-printable') return quotedPrintable(body)
  return Buffer.from(body, 'latin1').toString('utf8')
}

function quotedPrintable(text) {
  const joined = text.replace(/=\r\n/g, '')
  const bytes = []
  for (let i = 0; i < joined.length; i++) {
    const hex = joined.slice(i + 1, i + 3)
    if (joined[i] === '=' && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff)
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

// Assunto com acento: =?UTF-8?Q?...?= ou =?UTF-8?B?...?=
function decodeWords(value) {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_, charset, kind, text) => kind.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64').toString('utf8')
      : quotedPrintable(text.replace(/_/g, ' ')))
}
