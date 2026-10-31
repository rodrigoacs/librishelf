import { describe, expect, it } from 'vitest'
import { activeTab, opensKeyboard } from './tabs.js'

function input(attrs = {}, tag = 'INPUT') {
  return {
    nodeType: 1,
    tagName: tag,
    isContentEditable: Boolean(attrs.editable),
    readOnly: Boolean(attrs.readOnly),
    disabled: Boolean(attrs.disabled),
    getAttribute: name => (name === 'type' ? attrs.type ?? null : null)
  }
}

describe('aba acesa', () => {
  it('telas com aba própria acendem a própria aba', () => {
    expect(activeTab('home')).toBe('home')
    expect(activeTab('library')).toBe('library')
    expect(activeTab('community')).toBe('community')
  })

  it('as outras telas acendem "Menu", onde elas estão', () => {
    for (const name of ['lists', 'list', 'authors', 'publishers', 'tags', 'dashboard', 'settings', 'admin', 'year', 'not-found', undefined]) {
      expect(activeTab(name)).toBe('menu')
    }
  })
})

describe('foco que abre o teclado', () => {
  it('campos de texto abrem', () => {
    expect(opensKeyboard(input())).toBe(true)
    expect(opensKeyboard(input({ type: 'search' }))).toBe(true)
    expect(opensKeyboard(input({ type: 'email' }))).toBe(true)
    expect(opensKeyboard(input({ type: 'number' }))).toBe(true)
    expect(opensKeyboard(input({}, 'TEXTAREA'))).toBe(true)
    expect(opensKeyboard({ ...input({}, 'DIV'), isContentEditable: true })).toBe(true)
  })

  it('interruptores, botões, arquivos e campos travados não abrem', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'range', 'file']) {
      expect(opensKeyboard(input({ type }))).toBe(false)
    }
    expect(opensKeyboard(input({ readOnly: true }))).toBe(false)
    expect(opensKeyboard(input({ disabled: true }))).toBe(false)
    expect(opensKeyboard(input({}, 'BUTTON'))).toBe(false)
    expect(opensKeyboard(null)).toBe(false)
  })
})
