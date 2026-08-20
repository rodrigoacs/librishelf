import rateLimit from 'express-rate-limit'
import STATUS from '../utils/statusCodes.js'

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (req, res) => {
      res.status(STATUS.TOO_MANY_REQUESTS).json({ error: message })
    }
  })
}

const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas de login. Tente novamente em alguns minutos.'
})

const registerLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas de cadastro. Tente novamente mais tarde.'
})

export { loginLimiter, registerLimiter }