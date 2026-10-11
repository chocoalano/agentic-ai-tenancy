/**
 * Pembatas laju in-memory (fixed window) dengan operasi ATOMIK
 * periksa-dan-hitung: `consume(key)` menaikkan hitungan sebelum mengembalikan
 * keputusan, sehingga N request paralel tidak bisa sama-sama lolos pemeriksaan
 * lalu baru dihitung belakangan. Penyimpanan dibatasi (`maxEntries`, buang
 * yang paling lama) sehingga tidak tumbuh tanpa batas.
 *
 * Batasan: state per proses. Antarmuka ini dibuat agar implementasi Valkey
 * (multi-instance) dapat menggantikannya tanpa mengubah pemanggil.
 */
export interface RateLimitDecision {
  allowed: boolean
  /** Sisa detik sampai jendela terbuka lagi (0 bila diizinkan). */
  retryAfterSeconds: number
  /** Sisa kuota dalam jendela ini setelah keputusan. */
  remaining: number
}

export interface RateLimiter {
  consume(key: string): RateLimitDecision
  /** Keputusan tanpa menghitung (mis. untuk menolak lebih awal). */
  peek(key: string): RateLimitDecision
  reset(key: string): void
  readonly size: number
}

export interface RateLimiterOptions {
  max: number
  windowMs: number
  /** Batas jumlah kunci yang disimpan (default 10.000); kunci tertua dibuang. */
  maxEntries?: number
  now?: () => number
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now
  const maxEntries = options.maxEntries ?? 10_000
  // Map menjaga urutan sisipan → kunci pertama adalah yang paling lama disentuh.
  const entries = new Map<string, { count: number; windowStart: number }>()

  function current(key: string) {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (now() - entry.windowStart >= options.windowMs) {
      entries.delete(key)
      return undefined
    }
    return entry
  }

  function decision(entry: { count: number; windowStart: number } | undefined): RateLimitDecision {
    if (!entry || entry.count <= options.max) {
      return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, options.max - (entry?.count ?? 0)) }
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStart + options.windowMs - now()) / 1000)),
      remaining: 0,
    }
  }

  return {
    consume(key) {
      const existing = current(key)
      if (existing) {
        existing.count += 1
        // Sentuh ulang agar menjadi yang terbaru (urutan Map).
        entries.delete(key)
        entries.set(key, existing)
        return decision(existing)
      }
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      const entry = { count: 1, windowStart: now() }
      entries.set(key, entry)
      return decision(entry)
    },
    peek(key) {
      const entry = current(key)
      return decision(entry ? { ...entry, count: entry.count + 1 } : undefined)
    },
    reset(key) {
      entries.delete(key)
    },
    get size() {
      return entries.size
    },
  }
}
