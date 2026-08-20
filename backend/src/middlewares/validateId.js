import STATUS from '../utils/statusCodes.js'

const NUMERIC_ID_PATTERN = /^\d+$/

function validateNumericId(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName]

    if (!NUMERIC_ID_PATTERN.test(value)) {
      return res.status(STATUS.BAD_REQUEST).json({
        error: `Parâmetro '${paramName}' inválido: deve ser um número inteiro positivo.`
      })
    }

    next()
  }
}

export { validateNumericId }