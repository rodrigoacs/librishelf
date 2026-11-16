/**
 * Visita da página pública (pacote 41): conta uma vez por sessão do navegador
 * e por dia, sem cookie. O "já contei" fica em sessionStorage (some ao fechar
 * a aba) com o dia na chave; nada sai do aparelho além do evento.
 */
const PREFIX = 'librishelf.visit.'

export function visitKey(username, day) {
  return `${PREFIX}${String(username).toLowerCase()}.${day}`
}

/**
 * true na primeira vez (e marca); false depois, ou sem armazenamento
 * (navegação privada que bloqueia: na dúvida, não conta de novo). `storage`
 * pode ser uma função: ler window.sessionStorage já pode lançar erro.
 */
export function firstVisit(storage, username, day) {
  try {
    if (typeof storage === 'function') storage = storage()
    const key = visitKey(username, day)
    if (storage.getItem(key)) return false
    storage.setItem(key, '1')
    return true
  } catch {
    return false
  }
}
