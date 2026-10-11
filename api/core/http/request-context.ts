import { randomUUID } from 'node:crypto'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/
const requestIds = new WeakMap<Request, string>()

/**
 * ID korelasi per request. Menerima `x-request-id` dari klien/proxy bila
 * formatnya aman; selain itu dibuat UUID baru. Disimpan di WeakMap sehingga
 * dapat dibaca oleh hook mana pun tanpa state global per koneksi.
 */
export function requestIdOf(request: Request): string {
  const existing = requestIds.get(request)
  if (existing) return existing
  const incoming = request.headers.get('x-request-id')
  const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID()
  requestIds.set(request, id)
  return id
}

export function userAgentOf(request: Request): string | null {
  const value = request.headers.get('user-agent')
  return value ? value.slice(0, 512) : null
}
