/**
 * Erro "controlado" (status < 500 ou 502 de serviço externo): a mensagem vai
 * para o cliente. Junto vai um código estável (ex.: 'ISBN_TAKEN') e, se
 * houver, os parâmetros da mensagem ({ max: 200 }). O frontend traduz pelo
 * código; a mensagem em português fica como reserva para clientes antigos.
 *
 * O código fica em `errorCode` (e não `code`) para não se confundir com os
 * códigos de erro do Postgres ('23505'...).
 */
export function httpError(message, status, errorCode, params) {
  const error = new Error(message)
  error.status = status
  if (errorCode) error.errorCode = errorCode
  if (params) error.params = params
  return error
}

/** Corpo JSON padrão de erro: { error, code?, params? } */
export function errorBody(message, errorCode, params) {
  const body = { error: message }
  if (errorCode) body.code = errorCode
  if (params) body.params = params
  return body
}

export default httpError
