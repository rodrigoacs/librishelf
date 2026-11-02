import crypto from 'node:crypto'
import { parseSignature, buildManifest, sign, verifySignature } from '../../utils/mercadoPagoSignature.js'

const SECRET = 'chave-secreta'

describe('x-signature do Mercado Pago', () => {
  test('lê ts e v1', () => {
    expect(parseSignature('ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839'))
      .toEqual({ ts: '1704908010', v1: '618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839' })
    expect(parseSignature(undefined)).toEqual({ ts: null, v1: null })
  })

  test('manifest no formato da documentação; data.id em minúsculas; ausente sai', () => {
    expect(buildManifest({ dataId: 'ABC123', requestId: 'req-9', ts: '1704908010' })).toBe('id:abc123;request-id:req-9;ts:1704908010;')
    expect(buildManifest({ dataId: null, requestId: 'req-9', ts: '1' })).toBe('request-id:req-9;ts:1;')
    expect(buildManifest({ dataId: '42', requestId: undefined, ts: '1' })).toBe('id:42;ts:1;')
  })

  test('HMAC SHA-256 em hexadecimal com a chave secreta', () => {
    const manifest = 'id:42;request-id:r;ts:1;'
    expect(sign(manifest, SECRET)).toBe(crypto.createHmac('sha256', SECRET).update(manifest).digest('hex'))
  })

  test('confere: aceita a certa, recusa o resto', () => {
    const ts = '1704908010'
    const v1 = sign(buildManifest({ dataId: '42', requestId: 'r', ts }), SECRET)
    const header = `ts=${ts},v1=${v1}`
    expect(verifySignature({ header, requestId: 'r', dataId: '42', secret: SECRET })).toBe(true)

    expect(verifySignature({ header, requestId: 'r', dataId: '43', secret: SECRET })).toBe(false)
    expect(verifySignature({ header, requestId: 'outro', dataId: '42', secret: SECRET })).toBe(false)
    expect(verifySignature({ header: `ts=9,v1=${v1}`, requestId: 'r', dataId: '42', secret: SECRET })).toBe(false)
    expect(verifySignature({ header, requestId: 'r', dataId: '42', secret: 'outra' })).toBe(false)
    expect(verifySignature({ header, requestId: 'r', dataId: '42', secret: '' })).toBe(false)
    expect(verifySignature({ header: 'ts=1,v1=zz', requestId: 'r', dataId: '42', secret: SECRET })).toBe(false)
    expect(verifySignature({ header: 'v1=abc', requestId: 'r', dataId: '42', secret: SECRET })).toBe(false)
  })
})
