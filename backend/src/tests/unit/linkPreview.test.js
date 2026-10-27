import { layoutCovers, IMAGE_WIDTH, IMAGE_HEIGHT } from '../../services/metaService.js'
import { signId, readSignedId } from '../../utils/signedToken.js'
import { UNSUBSCRIBE_PURPOSE } from '../../services/followEmailService.js'

const createUnsubscribeToken = id => signId(UNSUBSCRIBE_PURPOSE, id)
const readUnsubscribeToken = token => readSignedId(UNSUBSCRIBE_PURPOSE, token)
import { followDigestEmail, verifyEmailEmail } from '../../services/emailTemplates.js'

describe('layoutCovers (mosaico da prévia)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('%i capa(s) cabem na imagem, sem sobrepor', count => {
    const { slots } = layoutCovers(count)
    expect(slots).toHaveLength(count)
    for (const slot of slots) {
      expect(slot.left).toBeGreaterThanOrEqual(0)
      expect(slot.top).toBeGreaterThanOrEqual(0)
      expect(slot.left + slot.width).toBeLessThanOrEqual(IMAGE_WIDTH)
      expect(slot.top + slot.height).toBeLessThanOrEqual(IMAGE_HEIGHT)
      expect(slot.height / slot.width).toBeCloseTo(1.5, 1)
    }
    const sorted = [...slots].sort((a, b) => a.top - b.top || a.left - b.left)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].top === sorted[i - 1].top) expect(sorted[i].left).toBeGreaterThanOrEqual(sorted[i - 1].left + sorted[i - 1].width)
    }
  })
})

describe('token de descadastro', () => {
  it('ida e volta; adulterado não vale', () => {
    const token = createUnsubscribeToken(42)
    expect(readUnsubscribeToken(token)).toBe(42)
    expect(readUnsubscribeToken(token.replace(/^42/, '43'))).toBeNull()
    expect(readUnsubscribeToken(`${token}x`)).toBeNull()
    expect(readUnsubscribeToken('')).toBeNull()
    expect(readUnsubscribeToken(undefined)).toBeNull()
  })
})

describe('e-mail de avisos de seguidores', () => {
  const base = { name: 'Ana', link: 'https://librishelf.com/community', hours: 6, unsubscribe: 'https://librishelf.com/unsubscribe?token=1.x' }

  it('assunto conforme os avisos (pt/en)', () => {
    expect(followDigestEmail({ ...base, items: [{ kind: 'request', actor: 'bia' }] }).subject).toBe('bia pediu para seguir você no Librishelf')
    expect(followDigestEmail({ ...base, items: [{ kind: 'request', actor: 'bia' }, { kind: 'request', actor: 'caio' }] }).subject).toBe('2 pedidos para seguir você no Librishelf')
    expect(followDigestEmail({ ...base, items: [{ kind: 'accepted', actor: 'bia' }, { kind: 'request', actor: 'caio' }] }).subject).toBe('Novidades dos seus leitores no Librishelf')
    expect(followDigestEmail({ ...base, locale: 'en', items: [{ kind: 'accepted', actor: 'bia' }, { kind: 'accepted', actor: 'caio' }] }).subject).toBe('2 of your follow requests were accepted on Librishelf')
  })

  it('HTML lista os avisos, escapa nomes e traz o descadastro', () => {
    const { html, text } = followDigestEmail({ ...base, items: [{ kind: 'request', actor: '<b>x</b>' }] })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; pediu para seguir você')
    expect(html).toContain('Descadastrar com um clique')
    expect(html).toContain('ativou os avisos de seguidores')
    expect(text).toContain('Descadastrar com um clique: https://librishelf.com/unsubscribe?token=1.x')
  })

  it('os e-mails antigos continuam iguais (sem lista nem descadastro)', () => {
    const { html } = verifyEmailEmail({ name: 'Ana', link: 'https://x', locale: 'pt' })
    expect(html).not.toContain('Descadastrar')
    expect(html).toContain('Se você não criou uma conta')
  })
})
