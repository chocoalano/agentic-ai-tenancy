/**
 * Pembatas percobaan login gagal per email (fixed window, in-memory).
 *
 * Batasan Phase 1: state hanya ada di satu proses. Saat aplikasi berjalan
 * multi-instance, pindahkan penyimpanan ke Valkey (Wave 2) dengan antarmuka
 * yang sama.
 */
export interface LoginThrottle {
  /** Mengembalikan sisa detik penguncian, atau 0 bila boleh mencoba. */
  retryAfterSeconds(key: string): number
  recordFailure(key: string): void
  reset(key: string): void
}

export function createInMemoryLoginThrottle(options: {
  maxFailures: number
  windowMs: number
  now?: () => number
}): LoginThrottle {
  const now = options.now ?? Date.now
  const entries = new Map<string, { failures: number; windowStart: number }>()

  function current(key: string) {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (now() - entry.windowStart >= options.windowMs) {
      entries.delete(key)
      return undefined
    }
    return entry
  }

  return {
    retryAfterSeconds(key) {
      const entry = current(key)
      if (!entry || entry.failures < options.maxFailures) return 0
      return Math.max(1, Math.ceil((entry.windowStart + options.windowMs - now()) / 1000))
    },
    recordFailure(key) {
      const entry = current(key)
      if (entry) entry.failures += 1
      else entries.set(key, { failures: 1, windowStart: now() })
      // Cegah pertumbuhan tak terbatas: buang entri kedaluwarsa secara berkala.
      if (entries.size > 10_000) {
        for (const [entryKey, value] of entries) {
          if (now() - value.windowStart >= options.windowMs) entries.delete(entryKey)
        }
      }
    },
    reset(key) {
      entries.delete(key)
    },
  }
}
