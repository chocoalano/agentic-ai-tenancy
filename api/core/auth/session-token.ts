import { createHmac, randomBytes } from 'node:crypto'

/** 32 byte acak → 43 karakter base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isWellFormedSessionToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/**
 * Hash token yang disimpan di database: HMAC-SHA256(SESSION_SECRET, token).
 * Token mentah hanya ada di cookie HttpOnly milik browser.
 */
export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}
