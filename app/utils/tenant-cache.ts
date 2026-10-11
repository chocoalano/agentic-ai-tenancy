/*
 * Konvensi kunci cache untuk data tenant-scoped (useAsyncData).
 *
 * Setiap kunci data tenant memuat ID tenant: `tenant:<tenantId>:<nama>`.
 * Saat tenant diganti, semua kunci berprefiks `tenant:` dibuang sehingga data
 * tenant sebelumnya tidak pernah ditampilkan ulang dari cache.
 */
export const TENANT_KEY_PREFIX = 'tenant:'

export function tenantDataKey(tenantId: string | null | undefined, name: string): string {
  return `${TENANT_KEY_PREFIX}${tenantId ?? 'none'}:${name}`
}

export function isTenantScopedKey(key: string): boolean {
  return key.startsWith(TENANT_KEY_PREFIX)
}

/** Validasi target redirect setelah login: hanya path relatif internal (cegah open redirect). */
export function safeRedirectPath(value: unknown, fallback = '/office'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
