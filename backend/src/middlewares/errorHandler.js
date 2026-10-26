import logger from '../utils/logger.js'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'
import { serverError } from '../utils/metrics.js'

const GENERIC_MESSAGE = 'Erro interno do servidor.'

// Erros do express.json() (body-parser): mensagem em português e código,
// em vez do texto cru em inglês ("Unexpected end of JSON input").
const BODY_ERRORS = {
  'entity.parse.failed': { status: STATUS.BAD_REQUEST, message: 'O corpo da requisição não é um JSON válido.', code: 'JSON_INVALID' },
  'entity.too.large': { status: 413, message: 'O corpo da requisição é grande demais.', code: 'PAYLOAD_TOO_LARGE' },
  'encoding.unsupported': { status: 415, message: 'Codificação não suportada.', code: 'ENCODING_UNSUPPORTED' },
  'charset.unsupported': { status: 415, message: 'Codificação não suportada.', code: 'ENCODING_UNSUPPORTED' }
}

// Último middleware da cadeia. Erros com status < 500 são "controlados" e a
// mensagem vai para o cliente; qualquer 500 recebe mensagem genérica e os
// detalhes ficam só no log — mesmo contrato e mesmo corpo ({ error, code?,
// params? }) do utils/sendError.js.
export default (err, req, res, next) => {
  if (res.headersSent) return next(err)

  const bodyError = BODY_ERRORS[err.type]
  if (bodyError) {
    logger.warn(bodyError.message, { statusCode: bodyError.status, method: req.method, path: req.path })
    return res.status(bodyError.status).json(errorBody(bodyError.message, bodyError.code))
  }

  const rawStatus = err.status || err.statusCode
  const statusCode = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600
    ? rawStatus
    : STATUS.INTERNAL_SERVER_ERROR

  const isControlled = statusCode < STATUS.INTERNAL_SERVER_ERROR

  if (isControlled) {
    logger.warn(err.message, { statusCode, method: req.method, path: req.path })
  } else {
    logger.error(err.message || 'Erro não tratado', { statusCode, method: req.method, path: req.path, stack: err.stack })
    serverError({ method: req.method, path: req.originalUrl?.split('?')[0], context: 'errorHandler', message: err.message })
  }

  res.status(statusCode).json(isControlled
    ? errorBody(err.message, err.errorCode, err.params)
    : errorBody(GENERIC_MESSAGE))
}
