import { describe, expect, test } from 'bun:test'
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from '../../api/core/auth/session-token'

describe('token sesi', () => {
  test('token acak 256-bit berformat base64url dan unik', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken))
    expect(tokens.size).toBe(200)
    for (const token of tokens) expect(isWellFormedSessionToken(token)).toBe(true)
  })

  test('hash HMAC deterministik, bergantung pada secret, dan tidak memuat token', () => {
    const token = generateSessionToken()
    const a = hashSessionToken(token, 'secret-a'.repeat(5))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSessionToken(token, 'secret-a'.repeat(5))).toBe(a)
    expect(hashSessionToken(token, 'secret-b'.repeat(5))).not.toBe(a)
    expect(a.includes(token)).toBe(false)
  })

  test('menolak nilai cookie yang tidak wajar', () => {
    for (const value of [undefined, '', 'abc', 'x'.repeat(43) + '!', { token: 'x' }, 42]) {
      expect(isWellFormedSessionToken(value)).toBe(false)
    }
  })
})
