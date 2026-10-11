/**
 * Proteksi CSRF untuk autentikasi berbasis cookie.
 *
 * Algoritma mengikuti desain `http.CrossOriginProtection` Go 1.25
 * (Fetch Metadata + Origin):
 *
 * 1. Metode aman (GET, HEAD, OPTIONS) selalu diizinkan — metode ini tidak
 *    boleh mengubah state.
 * 2. Bila browser mengirim `Sec-Fetch-Site`, hanya `same-origin` atau `none`
 *    (navigasi langsung oleh pengguna) yang diizinkan.
 * 3. Bila tidak ada `Sec-Fetch-Site` tetapi ada `Origin`, host Origin harus
 *    sama dengan header Host.
 * 4. Request tanpa kedua header berasal dari klien non-browser (curl, server
 *    ke server) yang tidak dapat dipaksa oleh situs lain, sehingga diizinkan.
 *
 * Origin pada `trustedOrigins` selalu diizinkan. Lapisan ini melengkapi cookie
 * `SameSite=Lax` dan body JSON wajib pada endpoint mutasi.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type CrossOriginVerdict = { allowed: true } | { allowed: false; reason: string }

export function checkCrossOrigin(request: Request, trustedOrigins: readonly string[]): CrossOriginVerdict {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { allowed: true }

  const origin = request.headers.get('origin')
  if (origin && trustedOrigins.includes(origin)) return { allowed: true }

  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return { allowed: true }
    return { allowed: false, reason: `sec-fetch-site=${fetchSite}` }
  }

  if (!origin) return { allowed: true }

  const host = request.headers.get('host')
  try {
    if (host && new URL(origin).host === host) return { allowed: true }
  } catch {
    return { allowed: false, reason: 'origin tidak valid' }
  }
  return { allowed: false, reason: 'origin berbeda dengan host' }
}
