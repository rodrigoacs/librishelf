import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'

const NUMERIC_ID_PATTERN = /^\d+$/
// Teto do tipo `integer` do Postgres. Acima disso a query estoura com 500.
const MAX_INT4 = 2147483647

function isValidId(value) {
  if (typeof value !== 'string' || !NUMERIC_ID_PATTERN.test(value)) return false

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_INT4
}

function validateNumericId(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName]

    if (!isValidId(value)) {
      return res.status(STATUS.BAD_REQUEST).json(errorBody(
        `Parâmetro '${paramName}' inválido: deve ser um número inteiro positivo.`,
        'PARAM_INVALID',
        { param: paramName }
      ))
    }

    next()
  }
}

export { validateNumericId, isValidId, MAX_INT4 }
