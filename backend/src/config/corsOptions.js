const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8080'
]

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : DEFAULT_DEV_ORIGINS

if (!process.env.ALLOWED_ORIGINS) {
  console.log(`[System] ALLOWED_ORIGINS não definido, usando padrão de desenvolvimento: ${allowedOrigins.join(', ')}`)
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    const err = new Error(`Origem não permitida pelo CORS: ${origin}`)
    err.status = 403
    return callback(err)
  },
  credentials: true
}

export default corsOptions