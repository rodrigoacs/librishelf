/** Lançado por um handler: desistir na hora, sem novas tentativas. */
export class PermanentJobError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermanentJobError'
  }
}

/**
 * Lançado por um handler: ainda não dá (limite de envio, por exemplo).
 * O job volta para a fila em `seconds` sem gastar tentativa.
 */
export class RetryLaterError extends Error {
  constructor(message, seconds = 60) {
    super(message)
    this.name = 'RetryLaterError'
    this.seconds = Math.max(1, Math.round(seconds))
  }
}
