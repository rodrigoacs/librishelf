import { describe, expect, it } from 'vitest'
import { buildReport, reportKey } from './errorReport.js'

const href = 'https://librishelf.com/books/12?q=ana@example.com#x'

describe('relatório de erro do navegador', () => {
  it('erro comum: mensagem, pilha e só o caminho da página', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'title')")
    const report = buildReport({ kind: 'vue', error, info: 'render function', href, release: '2026-11-08' })
    expect(report).toMatchObject({ kind: 'vue', message: error.message, page: '/books/12', info: 'render function', release: '2026-11-08' })
    expect(report.stack).toContain('TypeError')
    expect(JSON.stringify(report)).not.toContain('example.com')
  })

  it('promessa rejeitada com texto ou objeto', () => {
    expect(buildReport({ kind: 'unhandledrejection', error: 'falhou', href }).message).toBe('falhou')
    expect(buildReport({ kind: 'unhandledrejection', error: { message: 'objeto' }, href }).message).toBe('objeto')
    expect(buildReport({ kind: 'unhandledrejection', error: { code: 1 }, href }).message).toBe('{"code":1}')
  })

  it('ruído e extensões ficam de fora', () => {
    expect(buildReport({ kind: 'error', error: 'ResizeObserver loop completed with undelivered notifications.', href })).toBeNull()
    expect(buildReport({ kind: 'error', error: 'Script error.', href })).toBeNull()
    expect(buildReport({ kind: 'error', error: '', href })).toBeNull()
    const fromExtension = new Error('x')
    fromExtension.stack = 'Error: x\n at chrome-extension://abc/content.js:1:1'
    expect(buildReport({ kind: 'error', error: fromExtension, href })).toBeNull()
  })

  it('mensagem longa é cortada; chave junta o mesmo erro', () => {
    const report = buildReport({ kind: 'error', error: 'a'.repeat(500), href })
    expect(report.message).toHaveLength(300)
    expect(reportKey(report)).toBe(reportKey(buildReport({ kind: 'error', error: 'a'.repeat(400), href: 'https://librishelf.com/books/12' })))
  })
})
