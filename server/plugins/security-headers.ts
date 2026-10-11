import { createHash } from 'node:crypto'

/**
 * Header keamanan untuk halaman HTML (API Elysia menyetel header-nya sendiri).
 *
 * - Content-Security-Policy per respons: skrip hanya dari origin sendiri plus
 *   HASH skrip inline yang dirender Nuxt (konfigurasi runtime, color-mode,
 *   importmap) — tanpa 'unsafe-inline'/'unsafe-eval' untuk skrip. Gaya inline
 *   tetap diizinkan ('unsafe-inline' pada style-src) karena dunia game
 *   diposisikan lewat atribut style.
 * - Strict-Transport-Security hanya bila SECURITY_HSTS=true (lingkungan HTTPS).
 * - Cache-Control: private, no-store untuk SEMUA HTML yang dirender dengan
 *   cookie sesi (payload SSR memuat state autentikasi), bukan hanya rute
 *   tertentu.
 * Tidak aktif di `nuxt dev` (Vite HMR memerlukan skrip inline/eval).
 */
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)(?:__Host-)?aivo_session=/
const INLINE_SCRIPT_PATTERN = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi

function inlineScriptHashes(chunks: string[]): string[] {
  const hashes = new Set<string>()
  for (const chunk of chunks) {
    for (const match of chunk.matchAll(INLINE_SCRIPT_PATTERN)) {
      const body = match[1] ?? ''
      // Payload JSON (type="application/json") tidak dieksekusi; tetap aman di-hash.
      hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
    }
  }
  return [...hashes]
}

export function buildContentSecurityPolicy(scriptHashes: string[], https: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (https) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return
  const hsts = process.env.SECURITY_HSTS === 'true'
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const hashes = inlineScriptHashes([...html.head, ...html.bodyPrepend, ...html.bodyAppend])
    setResponseHeader(event, 'content-security-policy', buildContentSecurityPolicy(hashes, hsts))
    if (hsts) setResponseHeader(event, 'strict-transport-security', 'max-age=31536000; includeSubDomains')
    const cookie = getRequestHeader(event, 'cookie') ?? ''
    if (SESSION_COOKIE_PATTERN.test(cookie)) setResponseHeader(event, 'cache-control', 'private, no-store')
  })
})
