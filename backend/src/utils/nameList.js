/**
 * Listas de nomes (autores, tags, filtros).
 *
 * Nomes de autor e de editora podem conter vírgula, então nunca são separados
 * por vírgula: chegam como lista (JSON array, campo repetido no multipart ou
 * parâmetro repetido na query string). Tags continuam aceitando o texto
 * "a, b, c" do formulário, porque o nome de tag não pode ter vírgula.
 */

export const MAX_NAMES = 30
export const MAX_NAME_LENGTH = 200

function dedupe(names) {
  const seen = new Set()
  const result = []

  for (const raw of names) {
    if (typeof raw !== 'string') continue
    const name = raw.trim().replace(/\s+/g, ' ')
    const key = name.toLocaleLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }

  return result
}

/** Valor vindo do cliente (array, string JSON ou string simples) → array de strings. */
function toArray(value) {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {
        // não é JSON: trata como um nome só
      }
    }
    return [value]
  }

  return []
}

/** Autores, editoras e filtros: nunca separa por vírgula. */
export function parseNameList(value) {
  return dedupe(toArray(value))
}

/** Tags: o formulário manda "a, b, c"; listas também são aceitas. */
export function parseTagList(value) {
  return dedupe(toArray(value).flatMap(item => (typeof item === 'string' ? item.split(',') : [])))
}

/** Erro de validação (status 400) ou null. */
export function validateNameList(names, label) {
  if (names.length > MAX_NAMES) return `No máximo ${MAX_NAMES} ${label}.`
  const tooLong = names.find(name => name.length > MAX_NAME_LENGTH)
  if (tooLong) return `Nome muito longo em ${label} (máximo ${MAX_NAME_LENGTH} caracteres).`
  return null
}
