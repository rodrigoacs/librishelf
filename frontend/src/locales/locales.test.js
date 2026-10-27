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
