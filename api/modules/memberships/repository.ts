import type { MembershipStatus, TenantStatus } from '../../../domains/tenancy/types'
import type { UserTransaction } from '../../core/database/transactions'

export interface MembershipSummary {
  id: string
  status: MembershipStatus
  roles: string[]
  createdAt: Date
  tenant: {
    id: string
    slug: string
    name: string
    status: TenantStatus
  }
}

interface MembershipRow {
  id: string
  status: MembershipStatus
  created_at: Date
  tenant_id: string
  tenant_slug: string
  tenant_name: string
  tenant_status: TenantStatus
  roles: string[] | null
}

export const membershipsRepository = {
  /**
   * Keanggotaan aktif milik pengguna sendiri lintas tenant
   * (RLS: user_id = app.current_user_id()). Undangan/keanggotaan nonaktif
   * belum ditampilkan di Phase 1.
   */
  async listForUser(scope: UserTransaction): Promise<MembershipSummary[]> {
    const rows = await scope.sql<MembershipRow[]>`
      select
        m.id,
        m.status,
        m.created_at,
        t.id as tenant_id,
        t.slug as tenant_slug,
        t.name as tenant_name,
        t.status as tenant_status,
        array_remove(array_agg(r.key order by r.key), null) as roles
      from tenant_memberships m
      join tenants t on t.id = m.tenant_id
      left join membership_roles mr on mr.membership_id = m.id
      left join roles r on r.id = mr.role_id
      where m.user_id = ${scope.userId}
        and m.status = 'active'
      group by m.id, t.id
      order by t.name
    `
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      roles: row.roles ?? [],
      createdAt: row.created_at,
      tenant: { id: row.tenant_id, slug: row.tenant_slug, name: row.tenant_name, status: row.tenant_status },
    }))
  },
}
