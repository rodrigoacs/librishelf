import { jest } from '@jest/globals'
import request from 'supertest'
import app from '../../app.js'
import logger from '../../utils/logger.js'

describe('POST /csp-report', () => {
  let warn
  beforeEach(() => { warn = jest.spyOn(logger, 'warn').mockImplementation(() => {}) })
  afterEach(() => warn.mockRestore())

  const legacy = { 'csp-report': { 'document-uri': 'https://librishelf.com/books?q=x', 'effective-directive': 'style-src-attr', 'blocked-uri': 'inline' } }

  test('report-uri (application/csp-report): 204 e vai para o log', async () => {
    const res = await request(app).post('/csp-report').set('Content-Type', 'application/csp-report').send(JSON.stringify(legacy))
    expect(res.status).toBe(204)
    expect(warn).toHaveBeenCalledWith('CSP: violação', expect.objectContaining({ page: 'https://librishelf.com/books', directive: 'style-src-attr' }))
  })

  test('report-to (application/reports+json)', async () => {
    const body = [{ type: 'csp-violation', body: { documentURL: 'https://librishelf.com/', effectiveDirective: 'img-src', blockedURL: 'https://x.example/a.png' } }]
    const res = await request(app).post('/csp-report').set('Content-Type', 'application/reports+json').send(JSON.stringify(body))
    expect(res.status).toBe(204)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('JSON inválido ou corpo grande: 204 sem log', async () => {
    let res = await request(app).post('/csp-report').set('Content-Type', 'application/csp-report').send('{nope')
    expect(res.status).toBe(204)
    res = await request(app).post('/csp-report').set('Content-Type', 'application/csp-report').send(JSON.stringify({ 'csp-report': { x: 'a'.repeat(40000) } }))
    expect(res.status).toBe(204)
    expect(warn).not.toHaveBeenCalled()
  })
})
