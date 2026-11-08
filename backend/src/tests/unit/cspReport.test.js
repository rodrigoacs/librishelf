import { cleanUrl, normalize } from '../../services/cspReportService.js'

describe('relatórios de CSP', () => {
  test('URL perde query e fragmento (tokens de e-mail ficam fora)', () => {
    expect(cleanUrl('https://librishelf.com/reset-password?token=segredo#x')).toBe('https://librishelf.com/reset-password')
    expect(cleanUrl('data:image/png;base64,AAAA')).toBe('data')
    expect(cleanUrl('blob:https://librishelf.com/1234')).toBe('blob')
    expect(cleanUrl('inline')).toBe('inline')
    expect(cleanUrl('')).toBeNull()
    expect(cleanUrl(42)).toBeNull()
  })

  test('formato antigo (report-uri)', () => {
    const reports = normalize({
      'csp-report': {
        'document-uri': 'https://librishelf.com/confirm-email?token=abc',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        'source-file': 'https://librishelf.com/assets/index.js?v=1',
        'line-number': 12,
        'script-sample': 'alert(document.cookie)',
        disposition: 'report'
      }
    })
    expect(reports).toEqual([{
      page: 'https://librishelf.com/confirm-email',
      directive: 'script-src-elem',
      blocked: 'inline',
      source: 'https://librishelf.com/assets/index.js',
      line: 12,
      disposition: 'report'
    }])
    expect(JSON.stringify(reports)).not.toContain('cookie')
  })

  test('Reporting API (report-to): só csp-violation, com limite', () => {
    const entry = {
      type: 'csp-violation',
      body: { documentURL: 'https://librishelf.com/u/ana?shelf=read', effectiveDirective: 'img-src', blockedURL: 'https://evil.example/x.png', disposition: 'enforce', sample: 'segredo' }
    }
    const reports = normalize([entry, { type: 'deprecation', body: {} }, { type: 'csp-violation' }])
    expect(reports).toEqual([{
      page: 'https://librishelf.com/u/ana', directive: 'img-src', blocked: 'https://evil.example/x.png', source: null, line: null, disposition: 'enforce'
    }])
    expect(normalize(Array(50).fill(entry))).toHaveLength(20)
  })

  test('lixo vira lista vazia', () => {
    for (const payload of [null, undefined, 'x', 1, {}, { 'csp-report': {} }, [null], [{ type: 'csp-violation', body: 'x' }]]) {
      expect(normalize(payload)).toEqual([])
    }
  })
})
