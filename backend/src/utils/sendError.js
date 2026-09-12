import STATUS from './statusCodes.js'
import logger from './logger.js'

const GENERIC_MESSAGE = 'Erro interno do servidor.'

function sendError(res, error, context) {
  const isControlled = Boolean(error.status)
  const status = error.status || STATUS.INTERNAL_SERVER_ERROR
  const message = isControlled ? error.message : GENERIC_MESSAGE

  if (!isControlled) {
    logger.error(context || 'Erro não tratado', { message: error.message, stack: error.stack })
  }

  return res.status(status).json({ error: message })
}

export default sendError