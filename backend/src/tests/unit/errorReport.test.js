import { cleanPath, cleanStack, fromClient, scrub, signatureOf } from '../../services/errorReportService.js'

describe('erros: sem dados pessoais', () => {
  test('mensagem perde e-mail, token, uuid e query', () => {
    const text = scrub('Falha para ana@example.com em /reset?token=abc123 com eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEyMzQ1Njc4OTB9.c2lnbmF0dXJl e 3f2b1c4e-1111-4a2b-9c3d-123456789abc')
    expect(text).toBe('Falha para <email> em /reset com <token> e <uuid>')
    // Nome longo de função, sem dígito, fica
    expect(scrub('at handleSubscriptionPreapproval')).toBe('at handleSubscriptionPreapproval')
  })

  test('caminho: sem origem, query e ids', () => {
    expect(cleanPath('https://librishelf.com/lists/12345?x=1#top')).toBe('/lists/:id')
    expect(cleanPath('/u/ana/books/987')).toBe('/u/ana/books/:id')
    expect(cleanPath('')).toBeNull()
    expect(cleanPath(null)).toBeNull()
  })

  test('pilha: poucas linhas, sem domínio', () => {
    const stack = ['TypeError: x is undefined', ...Array.from({ length: 10 }, (_, i) => `    at f${i} (https://librishelf.com/assets/index-Ab12.js?v=2:1:${i})`)].join('\n')
    const out = cleanStack(stack).split('\n')
    expect(out).toHaveLength(6)
    expect(out[1]).toBe('at f0 (/assets/index-Ab12.js:1:0)')
  })

  test('assinatura junta o mesmo erro com números diferentes', () => {
    expect(signatureOf('client', 'Livro 12 não carregou', '/books')).toBe(signatureOf('client', 'Livro 98 não carregou', '/books'))
    expect(signatureOf('client', 'Livro 12 não carregou', '/books')).not.toBe(signatureOf('server', 'Livro 12 não carregou', '/books'))
    expect(signatureOf('client', 'x', '/books')).not.toBe(signatureOf('client', 'x', '/lists'))
  })

  test('corpo do navegador: só o formato conhecido', () => {
    expect(fromClient({ kind: 'vue', message: 'boom', page: 'https://librishelf.com/books?q=a', info: 'render function', release: 'b-1' }))
      .toMatchObject({ source: 'client', message: 'boom', location: '/books', detail: { kind: 'vue', info: 'render function', release: 'b-1' } })
    for (const body of [null, 'x', [], {}, { kind: 'outro', message: 'a' }, { kind: 'error', message: '  ' }, { kind: 'error', message: 3 }]) {
      expect(fromClient(body)).toBeNull()
    }
  })
})
