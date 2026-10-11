import type { SQL } from 'bun'
import { isPermissionKey, type PermissionKey } from '../../../domains/auth/permissions'
import type { TenantContext } from '../../../domains/tenancy/types'
import { withUserTransaction } from '../database/transactions'

interface MembershipGrantRow {
  membership_id: string
  role_key: string | null
  permission_key: string | null
}

/**
 * Langkah 2–4 alur tenant-scoped: memvalidasi tenant terpilih terhadap
 * catatan keanggotaan nyata dan me-resolve peran serta izin dari database.
 *
 * Query berjalan dengan konteks `app.user_id` sehingga RLS hanya
 * memperlihatkan keanggotaan milik pengguna ini. Mengembalikan `null` bila
 * pengguna bukan anggota aktif dari tenant aktif.
 */
export async function resolveTenantContext(
  sql: SQL,
  input: { userId: string; tenantId: string; requestId: string },
): Promise<TenantContext | null> {
  const rows = await withUserTransaction(
    sql,
    input.userId,
    ({ sql: tx }) =>
      tx<MembershipGrantRow[]>`
      select
        m.id as membership_id,
        r.key as role_key,
        p.key as permission_key
      from tenant_memberships m
      join tenants t on t.id = m.tenant_id and t.status = 'active'
      left join membership_roles mr on mr.membership_id = m.id
      left join roles r on r.id = mr.role_id
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      where m.tenant_id = ${input.tenantId}
        and m.user_id = ${input.userId}
        and m.status = 'active'
    `,
  )

  const membershipId = rows[0]?.membership_id
  if (!membershipId) return null

  const roles = new Set<string>()
  const permissions = new Set<PermissionKey>()
  for (const row of rows) {
    if (row.role_key) roles.add(row.role_key)
    if (row.permission_key && isPermissionKey(row.permission_key)) permissions.add(row.permission_key)
  }

  return {
    tenantId: input.tenantId,
    userId: input.userId,
    membershipId,
    userRoles: [...roles].sort(),
    permissions: [...permissions].sort(),
    requestId: input.requestId,
  }
}
