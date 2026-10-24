import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'

function buildLimiter({ windowMs, max, message, code, perUser = false }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    // Rotas autenticadas contam por usuário (vários usuários atrás do mesmo IP
    // não se bloqueiam); as abertas, por IP.
    keyGenerator: perUser
      ? (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip))
      : (req) => ipKeyGenerator(req.ip),
    handler: (req, res) => {
      res.status(STATUS.TOO_MANY_REQUESTS).json(errorBody(message, code))
    }
  })
}

const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
  code: 'RATE_LIMIT_LOGIN'
})

const registerLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas de cadastro. Tente novamente mais tarde.',
  code: 'RATE_LIMIT_REGISTER'
})

// Troca de senha e exclusão de conta pedem a senha atual: mesmo cuidado do login.
const sensitiveLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  perUser: true,
  message: 'Muitas tentativas. Tente novamente em alguns minutos.',
  code: 'RATE_LIMIT_ATTEMPTS'
})

// Upload converte para AVIF (pesado em CPU).
const uploadLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  perUser: true,
  message: 'Muitos envios em pouco tempo. Tente novamente em alguns minutos.',
  code: 'RATE_LIMIT_UPLOAD'
})

// Rotas públicas (biblioteca compartilhada, mosaico): sem login, por IP.
const publicLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Muitas requisições. Tente novamente em instantes.',
  code: 'RATE_LIMIT'
})

// Trecho de <head> das bibliotecas públicas, pedido pelo nginx a cada
// abertura de /u/<usuário>. Generoso: em 429 o nginx cai no noindex padrão.
const metaLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Muitas requisições. Tente novamente em instantes.',
  code: 'RATE_LIMIT'
})

// Busca por ISBN: cada consulta vira chamadas ao Open Library.
const isbnLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 30,
  perUser: true,
  message: 'Muitas buscas por ISBN em pouco tempo. Aguarde um minuto.',
  code: 'RATE_LIMIT_ISBN'
})

// Seguir/aceitar/remover: evita spam de pedidos.
const socialLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  perUser: true,
  message: 'Muitas ações em pouco tempo. Tente novamente em alguns minutos.',
  code: 'RATE_LIMIT_ACTIONS'
})

// E-mails (esqueci minha senha, reenviar confirmação): poucos por hora.
const mailLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Muitos pedidos de e-mail. Tente novamente mais tarde.',
  code: 'RATE_LIMIT_EMAIL'
})

// Links recebidos por e-mail (redefinir senha, confirmar e-mail): sem chute em massa.
const tokenLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas. Tente novamente em alguns minutos.',
  code: 'RATE_LIMIT_ATTEMPTS'
})

export { mailLimiter, tokenLimiter, loginLimiter, registerLimiter, sensitiveLimiter, uploadLimiter, publicLimiter, metaLimiter, isbnLimiter, socialLimiter }
