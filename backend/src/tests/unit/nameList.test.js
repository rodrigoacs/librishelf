import { parseNameList, parseTagList, validateNameList, MAX_NAMES } from '../../utils/nameList.js'

describe('parseNameList (autores, editoras, filtros)', () => {
  it('não separa por vírgula: texto é UM nome', () => {
    expect(parseNameList('Strugátski, Boris')).toEqual(['Strugátski, Boris'])
  })

  it('aceita array (campo/parâmetro repetido)', () => {
    expect(parseNameList(['Neil Gaiman', 'Terry Pratchett'])).toEqual(['Neil Gaiman', 'Terry Pratchett'])
  })

  it('aceita array em JSON', () => {
    expect(parseNameList('["A, com vírgula","B"]')).toEqual(['A, com vírgula', 'B'])
  })

  it('texto que parece JSON mas não é vira um nome', () => {
    expect(parseNameList('[Edição especial]')).toEqual(['[Edição especial]'])
  })

  it('tira espaços extras, vazios e repetidos (sem diferenciar maiúsculas), mantendo a ordem', () => {
    expect(parseNameList(['  Ana  Maria ', '', 'ana maria', 'Bruno', 42])).toEqual(['Ana Maria', 'Bruno'])
  })

  it('valores ausentes viram lista vazia', () => {
    expect(parseNameList(undefined)).toEqual([])
    expect(parseNameList(null)).toEqual([])
    expect(parseNameList('')).toEqual([])
  })
})

describe('parseTagList', () => {
  it('separa o texto do formulário por vírgula', () => {
    expect(parseTagList('ficção, clássico ,  , ficção')).toEqual(['ficção', 'clássico'])
  })

  it('aceita array', () => {
    expect(parseTagList(['a', 'b, c'])).toEqual(['a', 'b', 'c'])
  })
})

describe('validateNameList', () => {
  it('limita a quantidade e o tamanho', () => {
    expect(validateNameList(Array.from({ length: MAX_NAMES + 1 }, (_, i) => `n${i}`), 'autores')).toMatch(/No máximo/)
    expect(validateNameList(['x'.repeat(201)], 'autores')).toMatch(/muito longo/)
    expect(validateNameList(['ok'], 'autores')).toBeNull()
  })
})
