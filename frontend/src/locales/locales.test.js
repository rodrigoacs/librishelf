import { describe, expect, it } from 'vitest'
import pt from './pt.json'
import en from './en.json'

// pt e en precisam ter as mesmas chaves, os mesmos {parâmetros} e o mesmo
// número de formas de plural ("a | b | c"); senão a tela mostra a chave crua.
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') flatten(value, path, out)
    else out[path] = String(value)
  }
  return out
}

const params = text => [...new Set(text.match(/\{\s*\w+\s*\}/g) || [])].map(p => p.replace(/\s/g, '')).sort()
const plurals = text => text.split(/(?<!\\)\|/).length

const PT = flatten(pt)
const EN = flatten(en)

describe('locales pt/en', () => {
  it('mesmas chaves', () => {
    expect(Object.keys(EN).filter(k => !(k in PT))).toEqual([])
    expect(Object.keys(PT).filter(k => !(k in EN))).toEqual([])
  })

  it('mesmos parâmetros e formas de plural', () => {
    const diffs = Object.keys(PT)
      .filter(k => k in EN)
      .filter(k => JSON.stringify(params(PT[k])) !== JSON.stringify(params(EN[k])) || plurals(PT[k]) !== plurals(EN[k]))
      .map(k => `${k}: "${PT[k]}" × "${EN[k]}"`)
    expect(diffs).toEqual([])
  })

  it('todo código de erro tem texto (errors.*)', () => {
    expect(Object.keys(PT).filter(k => k.startsWith('errors.')).length).toBeGreaterThan(50)
    expect(PT['errors.UNKNOWN']).toBeTruthy()
  })
})

// --- Vocabulário (pacote 12): texto em frase e nenhuma chave sobrando ---

// Nomes próprios, siglas e nomes de recursos que podem ter maiúscula no meio
const PROPER = new Set([
  'Librishelf', 'ISBN', 'ISBNs', 'Open', 'Library', 'Goodreads', 'Google', 'Bing', 'WhatsApp',
  'CSV', 'JSON', 'SMTP', 'PDF', 'Esc', 'Enter', 'Tab', 'Ctrl', 'OK', 'TRUST_PROXY', 'Secure',
  // status e seções citados pelo nome dentro de uma frase
  'Quero', 'Lidos', 'Lido', 'Lendo', 'Read', 'Reading', 'Want', 'Conta', 'Account', 'Comunidade', 'Community',
  // exemplos ("Ex.: Duna", "E.g. Dune")
  'Ex', 'Duna', 'Dune', 'Emprestados', 'Lent', 'Ficção', 'Clássicos', 'Fiction', 'Classics', 'I'
])

/** Rótulo curto (botão, título, campo): até 5 palavras e sem ponto final. */
function isShortLabel(text) {
  const words = text.replace(/\{[^}]*\}/g, '').match(/[\p{L}][\p{L}\p{N}'’-]*/gu) || []
  return words.length >= 2 && words.length <= 5 && !/[.!?…:]\s*$/.test(text.trim())
}

function titleCaseWords(text) {
  const words = text.replace(/\{[^}]*\}/g, '').match(/[\p{L}][\p{L}\p{N}'’_-]*/gu) || []
  return words.slice(1).filter(word => /^\p{Lu}/u.test(word) && !PROPER.has(word) && word !== word.toUpperCase())
}

describe('vocabulário', () => {
  for (const [name, all] of [['pt', PT], ['en', EN]]) {
    it(`rótulos curtos só com a primeira maiúscula (${name})`, () => {
      const bad = Object.entries(all)
        .filter(([key]) => !key.startsWith('errors.') && !key.startsWith('privacy.'))
        .flatMap(([key, value]) => value.split(/(?<!\\)\|/).map(part => [key, part.trim()]))
        .filter(([, part]) => isShortLabel(part) && titleCaseWords(part).length > 0)
        .map(([key, part]) => `${key}: "${part}"`)
      expect(bad).toEqual([])
    })
  }

  it('glossário: "Excluir" (não "Deletar"/"Apagar") e "categoria" (não "tag"/"gênero")', () => {
    // A política de privacidade fala de dados "apagados" (texto corrido, não ação da tela)
    const bad = Object.entries(PT)
      .filter(([key]) => !key.startsWith('privacy.'))
      .filter(([, value]) => /\b(delet\w*|apag\w*|tags?)\b|gêner/i.test(value))
      .map(([key, value]) => `${key}: "${value}"`)
    expect(bad).toEqual([])
  })

  it('nenhuma chave sem uso no código', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = fileURLToPath(new URL('..', import.meta.url))
    let code = ''
    const walk = dir => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) { if (name !== 'locales') walk(path) }
        else if (/\.(vue|js)$/.test(name) && !name.endsWith('.test.js')) code += readFileSync(path, 'utf8') + '\n'
      }
    }
    walk(root)
    const literals = new Set([...code.matchAll(/['"`]([a-zA-Z]\w*(?:\.[\w-]+)+)['"`]/g)].map(m => m[1]))
    // t(`status.${x}`), t(`${prefixo}.title`): prefixos e sufixos dinâmicos
    const prefixes = [...code.matchAll(/`([a-zA-Z][\w.]*\.)\$\{/g)].map(m => m[1])
    const suffixes = [...code.matchAll(/`\$\{[^}]+\}(\.[\w.]+)`/g)].map(m => m[1])
    // errors.* vêm do código de erro do servidor; pageTitle.* do meta das rotas
    const dynamic = ['errors.', 'pageTitle.', ...prefixes]
    const unused = Object.keys(PT).filter(key =>
      !literals.has(key) && !dynamic.some(p => key.startsWith(p)) && !suffixes.some(s => key.endsWith(s)) &&
      // listas (privacy.sections) e plurais aninhados contam pela chave de cima
      !literals.has(key.replace(/\.\d+(\..*)?$/, '')))
    expect(unused).toEqual([])
  })
})
