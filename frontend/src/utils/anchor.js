/**
 * Âncora da URL (#settings-notifications) → id do elemento, ou null.
 * Só ids simples (letras, números, - e _): o hash vem de fora (link de
 * e-mail) e não deve virar seletor.
 */
export function anchorId(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return null
  let id
  try {
    id = decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
  return /^[A-Za-z][\w-]{0,80}$/.test(id) ? id : null
}
