// Espelha a regra do backend (utils/passwordPolicy.js): 8+ caracteres, até
// 72 bytes (limite do bcrypt), com pelo menos uma letra e um número.
export const PASSWORD_MIN = 8
export const PASSWORD_MAX_BYTES = 72

export function isWeakPassword(value) {
  return value.length < PASSWORD_MIN ||
    new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES ||
    !/[a-zA-Z]/.test(value) ||
    !/[0-9]/.test(value)
}
