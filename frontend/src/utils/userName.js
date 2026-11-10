/**
 * Nome de usuário em pouco espaço (menu lateral e barra do topo).
 */

/** Até 15 caracteres inteiros; acima disso, os 12 primeiros e "..." */
export function truncateName(name) {
  return name.length > 15 ? name.substring(0, 12) + '...' : name
}

/** Primeira letra, maiúscula ("rodrigo" → "R") */
export function userInitial(name) {
  return name.charAt(0).toUpperCase()
}

/** Até duas iniciais: primeira e última parte ("maria_souza" → "MS") */
export function userInitials(name) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 1)
  return letters.toUpperCase()
}
