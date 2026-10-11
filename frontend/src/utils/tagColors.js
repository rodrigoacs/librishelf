/**
 * Cor de cada categoria (tag), a mesma em todo o app.
 *
 * A cor vem do nome, não da posição na lista: "Fantasia" é sempre da mesma
 * cor na lista de Categorias, no livro, no filtro e na página pública,
 * em qualquer ordem e com qualquer filtro.
 */
export const TAG_COLOR_NAMES = ['red', 'green', 'blue', 'purple', 'yellow', 'orange']

export function tagColorName(name = '') {
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return TAG_COLOR_NAMES[Math.abs(hash) % TAG_COLOR_NAMES.length]
}

/** Valor CSS pronto para usar em style: var(--red), var(--blue)... */
export function tagColor(name) {
  return `var(--${tagColorName(name)})`
}