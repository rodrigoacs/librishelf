/**
 * "Alterações não salvas": compara o formulário com o valor que ele tinha ao
 * abrir. A comparação ignora diferenças que não mudam o que seria salvo:
 * espaços nas pontas, null × '' × undefined, número × texto ("2" = 2) e a hora
 * de uma data (só o dia conta).
 *
 *   const initial = formSnapshot(form)       // ao carregar
 *   hasChanges(initial, form)                // ao fechar
 */
function pad(n) {
  return String(n).padStart(2, '0')
}

function normalize(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object') {
    // Arquivo escolhido (capa): nome e tamanho bastam para saber se mudou
    if (typeof File !== 'undefined' && value instanceof File) return `file:${value.name}:${value.size}`
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key])
    return out
  }
  return String(value)
}

/** Fotografia comparável do formulário (texto). */
export function formSnapshot(value) {
  return JSON.stringify(normalize(value))
}

/** O formulário mudou desde a fotografia? Sem fotografia, não. */
export function hasChanges(snapshot, value) {
  if (snapshot === null || snapshot === undefined) return false
  return formSnapshot(value) !== snapshot
}
