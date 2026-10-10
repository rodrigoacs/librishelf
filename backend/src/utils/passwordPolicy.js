const MIN_LENGTH = 8
// bcrypt só considera os primeiros 72 bytes; acima disso duas senhas
// diferentes com o mesmo prefixo virariam o mesmo hash.
const MAX_BYTES = 72

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return { valid: false, reason: `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.` }
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    return { valid: false, reason: `A senha pode ter no máximo ${MAX_BYTES} bytes.` }
  }

  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, reason: 'A senha precisa conter pelo menos uma letra.' }
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'A senha precisa conter pelo menos um número.' }
  }

  return { valid: true }
}

export { validatePassword, MIN_LENGTH, MAX_BYTES }
