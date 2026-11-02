import { parseCsv, csvToObjects, toCsv, sniffDelimiter } from '../../utils/csv.js'
import { fromGoodreads } from '../../services/dataService.js'

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

describe('CSV genérico e Goodreads', () => {
  it('ponto e vírgula e tab, com o separador dentro das aspas', () => {
    const semi = 'Título;Autor\r\n"Memórias; póstumas";"Machado\nde Assis"\r\n'
    expect(sniffDelimiter(semi)).toBe(';')
    expect(parseCsv(semi, { delimiter: ';' })).toEqual([['Título', 'Autor'], ['Memórias; póstumas', 'Machado\nde Assis']])
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    // Vírgulas dentro de aspas no cabeçalho não confundem
    expect(sniffDelimiter('"a;b",c,d\n')).toBe(',')
  })

  it('ISBN do Goodreads como ="..." é sempre texto, com zero à esquerda', () => {
    const { records } = csvToObjects('Title,Author,ISBN,ISBN13,Exclusive Shelf,My Rating\nX,Y,"=""0140328726""","=""""",read,0\n')
    const book = fromGoodreads(records[0])
    expect(book.isbn).toBe('0140328726')
    expect(book.rating).toBeNull()
    expect(book.status).toBe('read')
  })
})
