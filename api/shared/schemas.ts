import { t } from 'elysia'
import { PERMISSION_KEYS } from '../../domains/auth/permissions'

/*
 * Schema bersama untuk request/response.
 *
 * Catatan: Eden Treaty mengubah string ISO-8601 di respons menjadi objek Date
 * secara otomatis. Karena itu semua timestamp dideklarasikan sebagai
 * `t.Date()` agar tipe statis sesuai dengan nilai runtime di klien.
 */
export const Uuid = t.String({ format: 'uuid', description: 'UUID' })
export const Timestamp = t.Date({ description: 'Timestamp ISO-8601 (UTC)' })

export const PermissionKeySchema = t.UnionEnum(PERMISSION_KEYS, { description: 'Kunci izin' })

export const IdParams = t.Object({ id: Uuid })

export const UserSchema = t.Object(
  {
    id: Uuid,
    email: t.String({ format: 'email' }),
    displayName: t.String(),
    createdAt: Timestamp,
  },
  { title: 'User' },
)

export const TenantSchema = t.Object(
  {
    id: Uuid,
    slug: t.String(),
    name: t.String(),
    status: t.UnionEnum(['active', 'suspended']),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { title: 'Tenant' },
)

export const TenantContextSchema = t.Object(
  {
    tenantId: Uuid,
    membershipId: Uuid,
    roles: t.Array(t.String()),
    permissions: t.Array(PermissionKeySchema),
  },
  { title: 'TenantContext', description: 'Konteks tenant aktif yang telah diverifikasi backend' },
)
