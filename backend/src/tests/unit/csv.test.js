import { parseCsv, csvToObjects, toCsv } from '../../utils/csv.js'

describe('CSV', () => {
  it('lê aspas, vírgulas, aspas duplicadas, quebras de linha, CRLF e BOM', () => {
    const text = '﻿Title,Author\r\n"Duna, edição especial","Herbert ""Frank"""\r\n"Linha 1\nLinha 2",X\r\n\r\n'
    expect(parseCsv(text)).toEqual([
      ['Title', 'Author'],
      ['Duna, edição especial', 'Herbert "Frank"'],
      ['Linha 1\nLinha 2', 'X']
    ])
  })

  it('vira objetos pelo cabeçalho; campo faltando vira vazio', () => {
    const { headers, records } = csvToObjects('a,b,c\n1,2\n')
    expect(headers).toEqual(['a', 'b', 'c'])
    expect(records).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('escreve e lê de volta igual', () => {
    const rows = [['título', 'notas'], ['Duna, 1', 'disse "oi"\nfim'], ['=SOMA(A1)', null]]
    const back = parseCsv(toCsv(rows))
    expect(back[1]).toEqual(['Duna, 1', 'disse "oi"\nfim'])
    // fórmula vira texto
    expect(back[2]).toEqual(["'=SOMA(A1)", ''])
  })
})
