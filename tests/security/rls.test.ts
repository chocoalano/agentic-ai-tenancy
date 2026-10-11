/**
 * Row Level Security diuji langsung pada PostgreSQL, tanpa lapisan API.
 * Membutuhkan PostgreSQL (TEST_DATABASE_URL & TEST_DATABASE_MIGRATION_URL).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { describeRuntimeRoleProblems, inspectRuntimeRole, RLS_PROTECTED_TABLES } from '../../api/core/database/safety'
import { withUserTransaction } from '../../api/core/database/transactions'
import { PERMISSION_KEYS } from '../../domains/auth/permissions'
import { addAgents, createTestApp, ownerContext, registerOwner } from '../helpers/app'
import { testDatabaseUrls } from '../helpers/env'

const app = createTestApp()
const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 2 })
afterAll(async () => {
  await app.close()
  await ownerSql.close()
})

let tenantA: string
let tenantB: string
let userA: string
let agentA: string
let agentB: string

beforeAll(async () => {
  const a = await registerOwner(app, 'rls-a', 'RLS Tenant A')
  const b = await registerOwner(app, 'rls-b', 'RLS Tenant B')
  tenantA = a.tenantId
  tenantB = b.tenantId
  userA = a.userId
  agentA = (await addAgents(app, await ownerContext(app, a.userId, a.tenantId), [{ name: 'RLS Agent A' }]))[0] ?? ''
  agentB = (await addAgents(app, await ownerContext(app, b.userId, b.tenantId), [{ name: 'RLS Agent B' }]))[0] ?? ''
})

async function run(query: () => PromiseLike<unknown>): Promise<unknown> {
  return await query()
}

/** Menjalankan query di transaksi dengan konteks tenant tertentu (seperti withTenantTransaction). */
function asTenant<T>(sql: SQL, tenantId: string, fn: (tx: SQL) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx)
  })
}

describe('role database runtime', () => {
  test('bukan superuser, tanpa BYPASSRLS, tidak memiliki tabel, dan semua tabel memakai FORCE RLS', async () => {
    const report = await inspectRuntimeRole(app.sql)
    expect(report.isSuperuser).toBe(false)
    expect(report.bypassesRls).toBe(false)
    expect(report.ownedTables).toEqual([])
    expect(report.tablesWithoutForcedRls).toEqual([])
    expect(describeRuntimeRoleProblems(report)).toEqual([])
  })

  test('pemeriksaan keamanan mendeteksi role pemilik tabel (tidak aman untuk runtime)', async () => {
    const report = await inspectRuntimeRole(ownerSql)
    expect(report.ownedTables.sort()).toEqual([...RLS_PROTECTED_TABLES].sort())
    expect(describeRuntimeRoleProblems(report).length).toBeGreaterThan(0)
  })

  test('role runtime tidak dapat membuat tabel atau mengubah skema', async () => {
    // Query Bun SQL bersifat lazy: selalu bungkus dengan fungsi async yang meng-await query
    // (meneruskan objek Query mentah ke expect().rejects membuat runner menggantung).
    await expect(run(() => app.sql`create table rls_probe (id int)`)).rejects.toThrow()
    await expect(run(() => app.sql`alter table agents disable row level security`)).rejects.toThrow()
  })

  test('katalog izin di database sama persis dengan kontrak kode', async () => {
    const rows = await app.sql<{ key: string }[]>`select key from permissions order by key`
    expect(rows.map((row) => row.key)).toEqual([...PERMISSION_KEYS].sort())
  })
})

describe('kebijakan RLS', () => {
  test('tanpa konteks tenant, tidak ada data tenant yang terlihat', async () => {
    const [counts] = await app.sql<
      { agents: number; tenants: number; memberships: number; membership_roles: number }[]
    >`
      select
        (select count(*)::int from agents) as agents,
        (select count(*)::int from tenants) as tenants,
        (select count(*)::int from tenant_memberships) as memberships,
        (select count(*)::int from membership_roles) as membership_roles
    `
    expect(counts).toEqual({ agents: 0, tenants: 0, memberships: 0, membership_roles: 0 })
  })

  test('query TANPA filter tenant_id tetap hanya mengembalikan baris tenant aktif', async () => {
    const rows = await asTenant(
      app.sql,
      tenantA,
      (tx) => tx<{ id: string; tenant_id: string }[]>`select id, tenant_id from agents`,
    )
    expect(rows.map((row) => row.id)).toEqual([agentA])
    expect(rows.every((row) => row.tenant_id === tenantA)).toBe(true)
  })

  test('baris tenant lain tidak terlihat meskipun difilter dengan ID-nya', async () => {
    const rows = await asTenant(app.sql, tenantA, (tx) => tx`select id from agents where id = ${agentB}`)
    expect(rows).toHaveLength(0)
  })

  test('INSERT ke tenant lain ditolak oleh WITH CHECK', async () => {
    const attempt = asTenant(
      app.sql,
      tenantA,
      (tx) =>
        tx`insert into agents (tenant_id, slug, name, role_key, role_title) values (${tenantB}, 'evil', 'Evil', 'x-role', 'X')`,
    )
    await expect(attempt).rejects.toThrow(/row-level security/)
  })

  test('UPDATE/DELETE tidak dapat menyentuh atau memindahkan baris lintas tenant', async () => {
    const updated = await asTenant(
      app.sql,
      tenantA,
      (tx) => tx`update agents set name = 'hijack' where id = ${agentB} returning id`,
    )
    expect(updated).toHaveLength(0)
    const deleted = await asTenant(app.sql, tenantA, (tx) => tx`delete from agents where id = ${agentB} returning id`)
    expect(deleted).toHaveLength(0)
    const move = asTenant(app.sql, tenantA, (tx) => tx`update agents set tenant_id = ${tenantB} where id = ${agentA}`)
    await expect(move).rejects.toThrow(/row-level security/)
  })

  test('konteks pengguna hanya memperlihatkan keanggotaan miliknya sendiri', async () => {
    const rows = await withUserTransaction(
      app.sql,
      userA,
      ({ sql }) => sql<{ user_id: string; tenant_id: string }[]>`select user_id, tenant_id from tenant_memberships`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.user_id === userA)).toBe(true)
    expect(rows.map((row) => row.tenant_id)).not.toContain(tenantB)
  })

  test('tenant tidak dapat dibuat atas nama pengguna lain', async () => {
    const attempt = app.sql.begin(async (tx) => {
      const forgedId = crypto.randomUUID()
      await tx`select set_config('app.tenant_id', ${forgedId}, true), set_config('app.user_id', ${userA}, true)`
      await tx`insert into tenants (id, slug, name, created_by_user_id) values (${forgedId}, 'forged-tenant-x', 'Forged', ${null})`
    })
    await expect(attempt).rejects.toThrow(/row-level security/)
  })

  test('FORCE RLS: pemilik tabel pun tidak melihat data tanpa konteks', async () => {
    const [row] = await ownerSql<{ total: number }[]>`select count(*)::int as total from agents`
    expect(row?.total).toBe(0)
  })

  test('peran milik tenant lain tidak dapat ditautkan ke keanggotaan', async () => {
    const contextA = await ownerContext(app, userA, tenantA)
    const customRoleB = await asTenant(app.sql, tenantB, async (tx) => {
      const [role] = await tx<{ id: string }[]>`
        insert into roles (tenant_id, key, name) values (${tenantB}, ${`custom-${crypto.randomUUID().slice(0, 6)}`}, 'Custom B')
        returning id
      `
      return role?.id ?? ''
    })
    const attempt = asTenant(
      app.sql,
      tenantA,
      (tx) =>
        tx`insert into membership_roles (membership_id, tenant_id, role_id) values (${contextA.membershipId}, ${tenantA}, ${customRoleB})`,
    )
    await expect(attempt).rejects.toThrow()
  })

  test('nilai konteks tenant yang tidak valid menggagalkan query (fail-closed)', async () => {
    const attempt = app.sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', 'bukan-uuid', true)`
      return tx`select id from agents`
    })
    await expect(attempt).rejects.toThrow()
  })
})
