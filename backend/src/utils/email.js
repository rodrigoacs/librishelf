/**
 * E-mail da conta: guardado em minúsculas (único sem diferenciar maiúsculas,
 * migration 015) e num formato simples, sem os caracteres que o parser de
 * endereços do nodemailer trata como sintaxe (aspas, <>, ;, (), vírgula,
 * colchetes, barra invertida, dois-pontos). Quem precisa de um endereço com
 * comentário ou aspas não é público deste app; um endereço comum nunca usa.
 *   https://github.com/advisories/GHSA-8c8m-p3m8-cjg8
 */
export const MAX_EMAIL_LENGTH = 254

const PART = '[^\\s@"<>;(),\\[\\]\\\\:]+'
const EMAIL_PATTERN = new RegExp(`^${PART}@${PART}\\.${PART}$`)

// Caracteres de controle (incluindo quebras de linha) nunca entram
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= MAX_EMAIL_LENGTH
    && !CONTROL_CHARS.test(email)
    && EMAIL_PATTERN.test(email)
}
