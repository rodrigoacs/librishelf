import { describe, expect, it } from 'vitest'
import { anchorId } from './anchor.js'

describe('anchorId', () => {
  it('ids simples passam; o resto é null', () => {
    expect(anchorId('#settings-notifications')).toBe('settings-notifications')
    expect(anchorId('#a_b-1')).toBe('a_b-1')
    expect(anchorId('')).toBeNull()
    expect(anchorId('settings')).toBeNull()
    expect(anchorId('#1abc')).toBeNull()
    expect(anchorId('#a b')).toBeNull()
    expect(anchorId('#x"]')).toBeNull()
    expect(anchorId('#%E0%A4%A')).toBeNull()
    expect(anchorId(undefined)).toBeNull()
  })
})
