import { describe, expect, it } from 'vitest'
import { legalParams, ownerLine, splitLinks } from './legalText.js'

const fill = (template, params) => template.replace(/\{(\w+)\}/g, (_, key) => params[key])

describe('textos legais', () => {
  it('links viram partes próprias, na ordem do texto', () => {
    const text = fill('Aceito os {terms} e a {privacy}. Contato: {email}', legalParams())
    expect(splitLinks(text)).toEqual([
      { text: 'Aceito os ' }, { link: 'terms' }, { text: ' e a ' }, { link: 'privacy' }, { text: '. Contato: ' }, { link: 'email' }
    ])
  })

  it('texto sem marcas fica inteiro; vazio não gera partes', () => {
    expect(splitLinks('Só texto.')).toEqual([{ text: 'Só texto.' }])
    expect(splitLinks('')).toEqual([])
    expect(splitLinks(null)).toEqual([])
  })

  it('marca desconhecida não vira link', () => {
    expect(splitLinks('a\u0001outra\u0001b')).toEqual([{ text: 'a' }, { text: 'b' }])
  })

  it('responsável: só as partes preenchidas', () => {
    expect(ownerLine({ name: 'Rodrigo Soares', document: '', address: '' })).toBe('Rodrigo Soares')
    expect(ownerLine({ name: 'Rodrigo Soares', document: 'CPF 1', address: 'Rua A' })).toBe('Rodrigo Soares, CPF 1, Rua A')
    expect(legalParams({ name: 'R', document: ' ', address: '' }).owner).toBe('R')
  })
})
