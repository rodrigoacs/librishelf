import { describe, expect, it } from 'vitest'
import { truncateName, userInitial, userInitials } from './userName.js'

describe('truncateName', () => {
  it('mantém nomes de até 15 caracteres', () => {
    expect(truncateName('rodrigo')).toBe('rodrigo')
    expect(truncateName('a'.repeat(15))).toBe('a'.repeat(15))
  })

  it('corta acima de 15: 12 caracteres e reticências', () => {
    expect(truncateName('navmw9tsdho0irn1')).toBe('navmw9tsdho0...')
  })
})

describe('userInitial', () => {
  it('primeira letra em maiúscula', () => {
    expect(userInitial('rodrigo')).toBe('R')
    expect(userInitial('')).toBe('')
  })
})

describe('userInitials', () => {
  it('primeira e última parte, separadas por espaço, ponto, _ ou -', () => {
    expect(userInitials('maria_souza')).toBe('MS')
    expect(userInitials('ana.clara.lima')).toBe('AL')
    expect(userInitials('João da Silva')).toBe('JS')
    expect(userInitials('jose-maria')).toBe('JM')
  })

  it('uma parte só: uma letra', () => {
    expect(userInitials('rodrigo')).toBe('R')
    expect(userInitials('_rodrigo_')).toBe('_')
  })
})
