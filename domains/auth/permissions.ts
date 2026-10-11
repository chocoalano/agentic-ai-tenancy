/**
 * Katalog kunci izin (permission) yang dikenali oleh kode aplikasi.
 *
 * Sumber kebenaran pemetaan peran → izin ada di PostgreSQL
 * (tabel `roles`, `permissions`, `role_permissions`). Daftar di sini hanya
 * kontrak tipe agar pemeriksaan izin di backend dan tampilan di frontend
 * tidak memakai string bebas. Test integrasi memastikan katalog ini sama
 * persis dengan isi tabel `permissions`.
 */
export const PERMISSION_KEYS = [
  'tenant.read',
  'tenant.manage',
  'members.read',
  'members.manage',
  'agents.read',
  'agents.manage',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value)
}
