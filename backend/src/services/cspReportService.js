import logger from '../utils/logger.js'

/**
 * Relatórios de violação da Content-Security-Policy (frontend/nginx).
 *
 * O navegador manda em dois formatos:
 *   - report-uri (antigo):  { "csp-report": { "document-uri", "violated-directive", ... } }
 *   - report-to (Reporting API): [{ type: "csp-violation", body: { documentURL, effectiveDirective, ... } }]
 *
 * Nada de dados pessoais: das URLs ficam só origem e caminho (sem query nem
 * fragmento, onde vivem tokens de confirmação e de senha), e o trecho do
 * código bloqueado (sample) é descartado.
 *
 * Pacote 37: estes relatórios passam a ser guardados com os outros erros do
 * cliente (client_errors). Por enquanto vão para o log.
 */

const MAX_REPORTS = 20
const MAX_FIELD = 300

/** Origem + caminho; 'inline', 'eval', 'data', 'blob' e afins ficam como vieram. */
export function cleanUrl(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    if (url.protocol === 'data:' || url.protocol === 'blob:') return url.protocol.slice(0, -1)
    return `${url.origin}${url.pathname}`.slice(0, MAX_FIELD)
  } catch {
    return value.slice(0, 40)
  }
}

const text = value => (typeof value === 'string' && value ? value.slice(0, MAX_FIELD) : null)
const line = value => (Number.isInteger(value) && value >= 0 ? value : null)

function fromLegacy(report) {
  return {
    page: cleanUrl(report['document-uri']),
    directive: text(report['effective-directive'] || report['violated-directive']),
    blocked: cleanUrl(report['blocked-uri']),
    source: cleanUrl(report['source-file']),
    line: line(report['line-number']),
    disposition: text(report.disposition)
  }
}

function fromReportingApi(body) {
  return {
    page: cleanUrl(body.documentURL),
    directive: text(body.effectiveDirective),
    blocked: cleanUrl(body.blockedURL),
    source: cleanUrl(body.sourceFile),
    line: line(body.lineNumber),
    disposition: text(body.disposition)
  }
}

/** Corpo recebido → lista de violações já limpas (formato desconhecido: []). */
export function normalize(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload['csp-report']) {
    return [fromLegacy(payload['csp-report'])].filter(report => report.directive)
  }
  if (Array.isArray(payload)) {
    return payload
      .slice(0, MAX_REPORTS)
      .filter(entry => entry?.type === 'csp-violation' && entry.body && typeof entry.body === 'object')
      .map(entry => fromReportingApi(entry.body))
      .filter(report => report.directive)
  }
  return []
}

export function record(payload) {
  const reports = normalize(payload)
  for (const report of reports) logger.warn('CSP: violação', report)
  return reports.length
}
