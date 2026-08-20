const MIN_LENGTH = 8

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return { valid: false, reason: `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.` }
  }

  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, reason: 'A senha precisa conter pelo menos uma letra.' }
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'A senha precisa conter pelo menos um número.' }
  }

  return { valid: true }
}

export { validatePassword, MIN_LENGTH }