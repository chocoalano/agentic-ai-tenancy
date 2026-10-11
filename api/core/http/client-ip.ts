import { CLIENT_IP_HEADER } from '../../../domains/security/client-ip'

interface RequestIpServer {
  requestIP(request: Request): { address: string } | null
}

/**
 * Alamat IP klien untuk pembatasan laju.
 *
 * Urutan sumber (yang pertama tersedia yang dipakai):
 * 1. `server.requestIP` — mode standalone (Bun.serve), otoritatif dari soket;
 * 2. header internal `x-aivo-client-ip` — mode mount, ditulis (dan selalu
 *    ditimpa) oleh middleware Nitro dari soket/`x-forwarded-for` tepercaya;
 * 3. tidak diketahui (string kosong) — pembatasan per IP dilewati dan hanya
 *    pembatasan per identitas (email/pengguna) yang berlaku.
 * Header lain dari klien (x-forwarded-for, x-real-ip) tidak pernah dipercaya di sini.
 */
export function clientIpOf(request: Request, server: RequestIpServer | null | undefined): string {
  const fromSocket = server?.requestIP(request)?.address
  if (fromSocket) return fromSocket
  const internal = request.headers.get(CLIENT_IP_HEADER)
  return internal?.trim() ?? ''
}
