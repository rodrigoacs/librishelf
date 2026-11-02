import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import { tierOf, FREE } from '../config/features.js'
import * as entitlementService from '../services/entitlementService.js'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const PRO_REQUIRED = 'Este recurso é do Pro. Seus dados continuam guardados e visíveis.'

// Uma consulta por requisição, mesmo com vários requirePro na cadeia
function proOf(req) {
  req.proCheck ??= entitlementService.hasPro(req.user.id)
  return req.proCheck
}

function check(feature, { writesOnly }) {
  // Nome errado quebra no carregamento das rotas, não em produção
  const tier = tierOf(feature)

  return async function requirePro(req, res, next) {
    if (tier === FREE) return next()
    if (writesOnly && READ_METHODS.has(req.method)) return next()
    if (!req.user) return res.status(STATUS.UNAUTHORIZED).json(errorBody('Faça login para continuar.', 'AUTH_REQUIRED'))

    try {
      if (await proOf(req)) return next()
      res.status(STATUS.FORBIDDEN).json(errorBody(PRO_REQUIRED, 'PRO_REQUIRED', { feature }))
    } catch (err) {
      next(err)
    }
  }
}

/** Depois de authenticateToken. Recusa leitura e escrita sem Pro ativo. */
export function requirePro(feature) {
  return check(feature, { writesOnly: false })
}

/**
 * Depois de authenticateToken. Regra dos dados Pro: sem Pro ativo (nunca teve,
 * teste acabou, assinatura venceu) os dados continuam visíveis — GET/HEAD
 * passam — e qualquer escrita recebe 403 PRO_REQUIRED. Nada é apagado.
 */
export function requireProForWrites(feature) {
  return check(feature, { writesOnly: true })
}
