import logger from '../utils/logger.js'

export default (err, req, res, next) => {
  const statusCode = err.status || 500
  const message = err.message || 'Internal Server Error'

  if (statusCode >= 500) {
    logger.error(message, { statusCode, stack: err.stack })
  } else {
    logger.warn(message, { statusCode })
  }

  res.status(statusCode).json({
    status: 'error',
    message: message
  })
}