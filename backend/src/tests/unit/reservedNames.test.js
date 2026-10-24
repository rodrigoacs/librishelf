import { isReservedUsername } from '../../utils/reservedNames.js'

describe('isReservedUsername', () => {
  it.each(['admin', 'ADMIN', 'Suporte', 'su.por-te', 'Ádmin', 'librishelf', 'LibriShelf_BR', 'api', 'u'])('%s é reservado', name => {
    expect(isReservedUsername(name)).toBe(true)
  })

  it.each(['ana', 'ana.leitora', 'busca', 'administra.dora', 'support42', 'leitor_u'])('%s é livre', name => {
    expect(isReservedUsername(name)).toBe(false)
  })
})
