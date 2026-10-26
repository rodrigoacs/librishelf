import logger from '../utils/logger.js'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'
import { serverError } from '../utils/metrics.js'

const GENERIC_MESSAGE = 'Erro interno do servidor.'

// Último middleware da cadeia. Erros com status < 500 são "controlados" e a
// mensagem vai para o cliente; qualquer 500 recebe mensagem genérica e os
// detalhes ficam só no log — mesmo contrato do utils/sendError.js.
export default (err, req, res, next) => {
  if (res.headersSent) return next(err)

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

  res.status(statusCode).json({
    status: 'error',
    ...(isControlled
      ? errorBody(err.message, err.errorCode, err.params)
      : errorBody(GENERIC_MESSAGE))
  })
}
