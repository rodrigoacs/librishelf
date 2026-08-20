import app from './app.js'

const PORT = process.env.PORT || 3050
const MIN_SECRET_LENGTH = 32

function validateEnv() {
  const secret = process.env.SECRET_KEY

  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    console.error(`[FATAL] SECRET_KEY ausente ou fraca (mínimo ${MIN_SECRET_LENGTH} caracteres).`)
    process.exit(1)
  }
}

validateEnv()

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})