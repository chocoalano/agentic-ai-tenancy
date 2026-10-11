import { describe, expect, test } from 'bun:test'
import { createInMemoryLoginThrottle } from '../../api/core/security/login-throttle'

describe('pembatas percobaan login', () => {
  test('mengunci setelah batas gagal dan terbuka lagi setelah jendela waktu', () => {
    let now = 1_000_000
    const throttle = createInMemoryLoginThrottle({ maxFailures: 3, windowMs: 60_000, now: () => now })
    for (let i = 0; i < 3; i++) {
      expect(throttle.retryAfterSeconds('a@b.c')).toBe(0)
      throttle.recordFailure('a@b.c')
    }
    expect(throttle.retryAfterSeconds('a@b.c')).toBe(60)
    expect(throttle.retryAfterSeconds('other@b.c')).toBe(0)
    now += 60_000
    expect(throttle.retryAfterSeconds('a@b.c')).toBe(0)
  })

  test('login sukses mereset hitungan', () => {
    const throttle = createInMemoryLoginThrottle({ maxFailures: 2, windowMs: 60_000 })
    throttle.recordFailure('x')
    throttle.reset('x')
    throttle.recordFailure('x')
    expect(throttle.retryAfterSeconds('x')).toBe(0)
  })
})
