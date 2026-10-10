import app from './app.js'
import logger from './utils/logger.js'

const PORT = process.env.PORT || 3050
const MIN_SECRET_LENGTH = 32
const REQUIRED_DB_VARS = ['DB_HOST', 'DB_NAME', 'DB_USER']

function validateEnv() {
  const secret = process.env.SECRET_KEY

  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    logger.error('SECRET_KEY ausente ou fraca', { minLength: MIN_SECRET_LENGTH })
    process.exit(1)
  }

  const missingDbVars = REQUIRED_DB_VARS.filter(name => !process.env[name]?.trim())

  if (missingDbVars.length > 0) {
    logger.error('Variáveis de banco ausentes', { missing: missingDbVars })
    process.exit(1)
  }
}

validateEnv()

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
})
