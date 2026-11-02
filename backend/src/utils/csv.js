/**
 * CSV (RFC 4180) sem dependência: aspas, aspas duplicadas, quebras de linha
 * e separadores dentro de campos entre aspas, CRLF e BOM do Excel.
 *   https://www.rfc-editor.org/rfc/rfc4180
 *
 * O separador padrão é a vírgula (Goodreads, Librishelf). CSV genérico pode
 * vir com ponto e vírgula (Excel em português) ou tab: sniffDelimiter() olha
 * a primeira linha, fora das aspas.
 */
export const DELIMITERS = [',', ';', '\t']

/** Texto CSV → lista de linhas (cada linha é uma lista de campos). */
export function parseCsv(text, { delimiter = ',' } = {}) {
  const input = String(text).replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Linhas totalmente vazias (fim do arquivo, linhas em branco) não contam.
  return rows.filter(cells => cells.some(cell => cell.trim() !== ''))
}

/** Separador mais frequente na primeira linha (fora das aspas); vírgula no empate. */
export function sniffDelimiter(text) {
  const input = String(text).replace(/^﻿/, '')
  const counts = Object.fromEntries(DELIMITERS.map(d => [d, 0]))
  let inQuotes = false
  for (const char of input) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && (char === '\n' || char === '\r')) break
    else if (!inQuotes && char in counts) counts[char]++
  }
  return DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best), ',')
}

/** Linhas → objetos usando a primeira linha como cabeçalho. */
export function csvToObjects(text, options = {}) {
  const [header, ...rows] = parseCsv(text, options)
  if (!header) return { headers: [], records: [] }
  const headers = header.map(name => name.trim())
  const records = rows.map(cells => Object.fromEntries(headers.map((name, i) => [name, cells[i] ?? ''])))
  return { headers, records }
}

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Fórmula em planilha (=, +, -, @ no começo) vira texto: evita "CSV injection".
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Lista de linhas → texto CSV (com BOM para o Excel abrir acentos certo). */
export function toCsv(rows) {
  return '﻿' + rows.map(cells => cells.map(escapeCell).join(',')).join('\r\n') + '\r\n'
}
