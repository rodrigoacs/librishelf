import app from './app.js'
import logger from './utils/logger.js'

const PORT = process.env.PORT || 3050
const MIN_SECRET_LENGTH = 32

function validateEnv() {
  const secret = process.env.SECRET_KEY

  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    logger.error('SECRET_KEY ausente ou fraca', { minLength: MIN_SECRET_LENGTH })
    process.exit(1)
  }
}

validateEnv()

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
})