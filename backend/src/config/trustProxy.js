import logger from '../utils/logger.js'

/**
 * Valor de `app.set('trust proxy', ...)`.
 *
 * Atrás de um reverse proxy (nginx), sem isso o req.ip de todo mundo é o IP do
 * proxy e o rate limit vira global. Mas confiar no X-Forwarded-For sem proxy na
 * frente permite que o cliente forje o próprio IP — por isso o padrão é `false`
 * e o valor vem de TRUST_PROXY:
 *   - número (ex.: "1")  → quantidade de proxies confiáveis na frente do app
 *   - "true" / "false"
 *   - lista de IPs/sub-redes ou presets do Express ("loopback", "uniquelocal")
 */
function parseTrustProxy(raw) {
  if (raw === undefined || raw.trim() === '') return false

  const value = raw.trim()

  if (value === 'true') return true
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)

  return value.split(',').map(v => v.trim()).filter(Boolean)
}

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY)

if (process.env.TRUST_PROXY === undefined) {
  logger.info('TRUST_PROXY não definido, usando padrão sem proxy (false). Defina TRUST_PROXY=1 atrás do nginx.')
}

export { parseTrustProxy }
export default trustProxy
