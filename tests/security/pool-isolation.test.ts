/**
 * Konteks tenant tidak boleh bocor antar request melalui koneksi pool.
 * Membutuhkan PostgreSQL (TEST_DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { withTenantTransaction } from '../../api/core/database/transactions'
import type { TenantContext } from '../../domains/tenancy/types'
import { addAgents, createTestApp, ownerContext, registerOwner, type RegisteredUser } from '../helpers/app'
import { testDatabaseUrls } from '../helpers/env'

const app = createTestApp()
/** Pool sengaja kecil agar koneksi dipakai ulang secara intensif. */
const smallPool = new SQL({ url: testDatabaseUrls().app, max: 3 })
afterAll(async () => {
  await app.close()
  await smallPool.close()
})

let ownerA: RegisteredUser & { tenantId: string }
let ownerB: RegisteredUser & { tenantId: string }
let contextA: TenantContext
let contextB: TenantContext
let agentsA: string[]
let agentsB: string[]

beforeAll(async () => {
  ownerA = await registerOwner(app, 'pool-a', 'Pool Tenant A')
  ownerB = await registerOwner(app, 'pool-b', 'Pool Tenant B')
  contextA = await ownerContext(app, ownerA.userId, ownerA.tenantId)
  contextB = await ownerContext(app, ownerB.userId, ownerB.tenantId)
  agentsA = await addAgents(app, contextA, [{ name: 'Pool A1' }, { name: 'Pool A2' }])
  agentsB = await addAgents(app, contextB, [{ name: 'Pool B1' }, { name: 'Pool B2' }, { name: 'Pool B3' }])
})

describe('isolasi konteks pada connection pool', () => {
  test('transaksi tenant paralel dengan pool kecil selalu melihat datanya sendiri', async () => {
    const jobs = Array.from({ length: 60 }, (_, index) => {
      const context = index % 2 === 0 ? contextA : contextB
      return withTenantTransaction(smallPool, context, async ({ sql }) => {
        // Jeda acak memaksa interleaving antar transaksi di koneksi yang berbeda/dipakai ulang.
        await sql`select pg_sleep(${Math.random() * 0.02})`
        const [setting] = await sql<{ tenant: string }[]>`select current_setting('app.tenant_id') as tenant`
        const rows = await sql<{ id: string; tenant_id: string }[]>`select id, tenant_id from agents`
        return { expected: context.tenantId, setting: setting?.tenant, rows }
      })
    })
    const results = await Promise.all(jobs)
    for (const result of results) {
      expect(result.setting).toBe(result.expected)
      expect(result.rows.every((row) => row.tenant_id === result.expected)).toBe(true)
      const expectedIds = result.expected === ownerA.tenantId ? agentsA : agentsB
      expect(result.rows.map((row) => row.id).sort()).toEqual([...expectedIds].sort())
    }
  })

  test('setelah commit dan rollback, koneksi pool tidak membawa konteks tenant', async () => {
    await withTenantTransaction(smallPool, contextA, async ({ sql }) => sql`select 1`)
    await withTenantTransaction(smallPool, contextB, async () => {
      throw new Error('rollback disengaja')
    }).catch(() => {})

    // Ambil semua koneksi pool secara bersamaan dan periksa setting sesi masing-masing.
    const reserved = await Promise.all([smallPool.reserve(), smallPool.reserve(), smallPool.reserve()])
    try {
      for (const connection of reserved) {
        const [row] = await connection<{ tenant: string | null; user: string | null }[]>`
          select nullif(current_setting('app.tenant_id', true), '') as tenant,
                 nullif(current_setting('app.user_id', true), '') as user
        `
        expect(row?.tenant ?? null).toBeNull()
        expect(row?.user ?? null).toBeNull()
        const [visible] = await connection<{ total: number }[]>`select count(*)::int as total from agents`
        expect(visible?.total).toBe(0)
      }
    } finally {
      for (const connection of reserved) connection.release()
    }
  })

  test('request HTTP paralel dari dua tenant tidak saling bocor', async () => {
    const requests = Array.from({ length: 40 }, (_, index) => {
      const owner = index % 2 === 0 ? ownerA : ownerB
      return owner.api.v1.agents.get().then((response) => ({ owner, response }))
    })
    for (const { owner, response } of await Promise.all(requests)) {
      expect(response.error).toBeNull()
      const expected = owner === ownerA ? agentsA : agentsB
      expect(response.data?.items.map((agent) => agent.id).sort()).toEqual([...expected].sort())
    }
  })
})
