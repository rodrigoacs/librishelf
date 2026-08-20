import STATUS from './statusCodes.js'

const GENERIC_MESSAGE = 'Erro interno do servidor.'

function sendError(res, error, context) {
  const isControlled = Boolean(error.status)
  const status = error.status || STATUS.INTERNAL_SERVER_ERROR
  const message = isControlled ? error.message : GENERIC_MESSAGE

  if (!isControlled) {
    console.error(context ? `[${context}]` : '[Erro não tratado]', error)
  }

  return res.status(status).json({ error: message })
}

export default sendError