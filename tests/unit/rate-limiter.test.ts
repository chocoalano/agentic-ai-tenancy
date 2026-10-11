import { describe, expect, test } from 'bun:test'
import { createRateLimiter } from '../../api/core/security/rate-limiter'

describe('pembatas laju (fixed window, atomik, terbatas)', () => {
  test('mengunci setelah batas dan terbuka lagi setelah jendela waktu; kunci lain tidak terpengaruh', () => {
    let now = 1_000_000
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: () => now })
    for (let i = 0; i < 3; i += 1) expect(limiter.consume('a@b.c').allowed).toBe(true)
    const blocked = limiter.consume('a@b.c')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(60)
    expect(limiter.consume('other@b.c').allowed).toBe(true)
    now += 60_000
    expect(limiter.consume('a@b.c').allowed).toBe(true)
  })

  test('consume bersifat periksa-DAN-hitung: ledakan paralel tidak melampaui batas', () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000 })
    const decisions = Array.from({ length: 50 }, () => limiter.consume('burst'))
    expect(decisions.filter((d) => d.allowed)).toHaveLength(5)
    expect(decisions.filter((d) => !d.allowed)).toHaveLength(45)
  })

  test('reset membuka kunci; peek tidak menghitung', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 })
    limiter.consume('x')
    limiter.consume('x')
    expect(limiter.peek('x').allowed).toBe(false)
    expect(limiter.peek('x').allowed).toBe(false)
    limiter.reset('x')
    expect(limiter.consume('x').allowed).toBe(true)
  })

  test('penyimpanan dibatasi: kunci tertua dibuang saat penuh (tidak tumbuh tanpa batas)', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, maxEntries: 100 })
    for (let i = 0; i < 1_000; i += 1) limiter.consume(`k${i}`)
    expect(limiter.size).toBe(100)
    // Kunci lama sudah dibuang → boleh lagi; kunci terbaru masih terkunci.
    expect(limiter.consume('k0').allowed).toBe(true)
    expect(limiter.consume('k999').allowed).toBe(false)
  })
})
