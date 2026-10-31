import { describe, expect, it } from 'vitest'
import { bookCreatedTick, notifyBookCreated, setTabBarHidden, tabBarHidden } from './appNav.js'

describe('barra de abas escondida', () => {
  it('some enquanto houver um pedido e volta quando todos saem', () => {
    expect(tabBarHidden.value).toBe(false)
    setTabBarHidden('select', true)
    setTabBarHidden('keyboard', true)
    expect(tabBarHidden.value).toBe(true)
    setTabBarHidden('select', false)
    expect(tabBarHidden.value).toBe(true)
    setTabBarHidden('keyboard', false)
    expect(tabBarHidden.value).toBe(false)
  })

  it('pedir duas vezes pelo mesmo motivo conta uma', () => {
    setTabBarHidden('select', true)
    setTabBarHidden('select', true)
    setTabBarHidden('select', false)
    expect(tabBarHidden.value).toBe(false)
  })
})

describe('livro criado pelo +', () => {
  it('avisa as telas abertas', () => {
    const before = bookCreatedTick.value
    notifyBookCreated()
    expect(bookCreatedTick.value).toBe(before + 1)
  })
})
