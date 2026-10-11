import type { TenantStatus } from '../../../domains/tenancy/types'
import type { TenantBootstrapTransaction, TenantTransaction } from '../../core/database/transactions'

export interface Tenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  createdAt: Date
  updatedAt: Date
}

interface TenantRow {
  id: string
  slug: string
  name: string
  status: TenantStatus
  created_at: Date
  updated_at: Date
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const tenantsRepository = {
  /** Membaca tenant konteks aktif. RLS memastikan hanya tenant ini yang terlihat. */
  async findCurrent(scope: TenantTransaction): Promise<Tenant | null> {
    const [row] = await scope.sql<TenantRow[]>`
      select id, slug, name, status, created_at, updated_at
      from tenants
      where id = ${scope.context.tenantId}
    `
    return row ? toTenant(row) : null
  },

  /**
   * Filter tenant_id WAJIB: kebijakan RLS tenant_memberships juga memperlihatkan
   * keanggotaan milik pengguna saat ini di tenant lain (user_id = app.current_user_id()).
   */
  async countMembers(scope: TenantTransaction): Promise<number> {
    const [row] = await scope.sql<{ total: number }[]>`
      select count(*)::int as total
      from tenant_memberships
      where tenant_id = ${scope.context.tenantId} and status = 'active'
    `
    return row?.total ?? 0
  },

  /**
   * Membuat tenant, keanggotaan pemilik, dan penugasan peran sistem "owner"
   * di dalam satu transaksi bootstrap tenant.
   */
  async createWithOwner(
    scope: TenantBootstrapTransaction,
    input: { slug: string; name: string },
  ): Promise<{ tenant: Tenant; membershipId: string }> {
    const [tenantRow] = await scope.sql<TenantRow[]>`
      insert into tenants (id, slug, name, created_by_user_id)
      values (${scope.tenantId}, ${input.slug}, ${input.name}, ${scope.userId})
      returning id, slug, name, status, created_at, updated_at
    `
    if (!tenantRow) throw new Error('Insert tenants tidak mengembalikan baris')

    const [membership] = await scope.sql<{ id: string }[]>`
      insert into tenant_memberships (tenant_id, user_id, status)
      values (${scope.tenantId}, ${scope.userId}, 'active')
      returning id
    `
    if (!membership) throw new Error('Insert tenant_memberships tidak mengembalikan baris')

    const assigned = await scope.sql`
      insert into membership_roles (membership_id, tenant_id, role_id)
      select ${membership.id}, ${scope.tenantId}, r.id
      from roles r
      where r.tenant_id is null and r.key = 'owner'
      returning role_id
    `
    if (assigned.length !== 1) throw new Error('Peran sistem "owner" tidak ditemukan; jalankan migrasi.')

    return { tenant: toTenant(tenantRow), membershipId: membership.id }
  },
}
