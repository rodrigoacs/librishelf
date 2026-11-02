import crypto from 'node:crypto'

/**
 * Validação do header x-signature dos webhooks do Mercado Pago, sem SDK
 * (https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks):
 *
 *   x-signature: ts=<timestamp>,v1=<hash>
 *   manifest:    id:[data.id da query];request-id:[x-request-id];ts:[ts];
 *   v1 = HMAC-SHA256(manifest, chave secreta da integração), em hexadecimal
 *
 * data.id alfanumérico vai em minúsculas; campo ausente sai do manifest.
 */
export function parseSignature(header) {
  const parts = {}
  for (const piece of String(header || '').split(',')) {
    const index = piece.indexOf('=')
    if (index > 0) parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim()
  }
  return { ts: parts.ts || null, v1: parts.v1 || null }
}

export function buildManifest({ dataId, requestId, ts }) {
  let manifest = ''
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`
  if (requestId) manifest += `request-id:${requestId};`
  if (ts) manifest += `ts:${ts};`
  return manifest
}

export function sign(manifest, secret) {
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex')
}

/** → true só com assinatura presente e igual (comparação em tempo constante) */
export function verifySignature({ header, requestId, dataId, secret }) {
  if (!secret) return false
  const { ts, v1 } = parseSignature(header)
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false

  const expected = Buffer.from(sign(buildManifest({ dataId, requestId, ts }), secret), 'hex')
  const received = Buffer.from(v1, 'hex')
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}
