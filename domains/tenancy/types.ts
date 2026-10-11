import type { PermissionKey } from '../auth/permissions'

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

export const TENANT_STATUSES = ['active', 'suspended'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

/**
 * Konteks tenant yang sudah diverifikasi backend untuk satu request.
 *
 * Objek ini hanya boleh dibuat oleh resolver tenant di backend setelah
 * keanggotaan aktif dicek di database. Frontend tidak pernah mengirim objek
 * ini; frontend hanya memilih tenant, lalu backend memvalidasinya.
 */
export interface TenantContext {
  tenantId: string
  userId: string
  membershipId: string
  userRoles: string[]
  permissions: PermissionKey[]
  requestId: string
}

export function hasPermission(context: Pick<TenantContext, 'permissions'>, permission: PermissionKey): boolean {
  return context.permissions.includes(permission)
}
