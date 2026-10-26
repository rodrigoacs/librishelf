import logger from '../utils/logger.js'

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8080'
]

// Em produção o frontend chama a API pelo mesmo domínio (/api): sem
// ALLOWED_ORIGINS, nenhuma origem de fora é aceita (nem localhost, que
// qualquer pessoa pode servir na própria máquina com o cookie de sessão).
const isProduction = process.env.NODE_ENV === 'production'

const allowedOrigins = process.env.ALLOWED_ORIGINS?.trim()
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : (isProduction ? [] : DEFAULT_DEV_ORIGINS)

if (!process.env.ALLOWED_ORIGINS?.trim()) {
  logger.info(isProduction
    ? 'ALLOWED_ORIGINS não definido: só o próprio domínio (sem CORS)'
    : 'ALLOWED_ORIGINS não definido, usando padrão de desenvolvimento', { origins: allowedOrigins })
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    const err = new Error(`Origem não permitida pelo CORS: ${origin}`)
    err.status = 403
    err.errorCode = 'CORS_ORIGIN'
    return callback(err)
  },
  credentials: true
}

export default corsOptions