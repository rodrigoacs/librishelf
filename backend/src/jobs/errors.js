/** Lançado por um handler: desistir na hora, sem novas tentativas. */
export class PermanentJobError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermanentJobError'
  }
}
