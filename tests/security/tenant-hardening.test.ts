/**
 * Pengerasan tenant yang ditegakkan DATABASE (bukan hanya filter aplikasi).
 * Membutuhkan PostgreSQL test (role aplikasi + role pemilik).
 *
 *  - tabel ber-tenant_id yang tidak dilindungi RLS terdeteksi (gerbang kesiapan menutup);
 *  - tenant ditangguhkan & pengguna dinonaktifkan kehilangan akses;
 *  - konteks tenant tidak bisa mengubah peran/izin sistem (lintas tenant);
 *  - anggota biasa tidak bisa menaikkan perannya sendiri lewat membership_roles;
 *  - matriks GRANT: role runtime tidak bisa DELETE tenants, INSERT permissions, dsb.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { describeRuntimeRoleProblems, inspectRuntimeRole } from '../../api/core/database/safety'
import { withTenantTransaction, withUserTransaction } from '../../api/core/database/transactions'
import { resolveTenantContext } from '../../api/core/tenancy/resolve-context'
import {
  addMember,
  createTestApp,
  ownerContext,
  registerOwner,
  registerUser,
  type RegisteredUser,
} from '../helpers/app'
import { testDatabaseUrls } from '../helpers/env'

const app = createTestApp()
const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 2 })
afterAll(async () => {
  await app.close()
  await ownerSql.close()
})

/** Bungkus query Bun SQL agar `expect(...).rejects` tidak menggantung (jebakan Bun). */
const run = <T>(query: () => Promise<T>) => (async () => query())()

let ownerA: RegisteredUser & { tenantId: string }
let member: RegisteredUser

beforeAll(async () => {
  ownerA = await registerOwner(app, 'hard-a', 'Tenant Hardening A')
  member = await registerUser(app, 'hard-member')
  await addMember(app, await ownerContext(app, ownerA.userId, ownerA.tenantId), member.userId, 'member')
})

describe('deteksi tabel tenant tanpa perlindungan RLS', () => {
  test('tabel baru ber-kolom tenant_id di luar daftar RLS membuat role runtime dinyatakan tidak aman', async () => {
    const report = describeRuntimeRoleProblems(await inspectRuntimeRole(app.sql))
    expect(report).toEqual([])
    await ownerSql`create table if not exists hardening_widgets (id serial primary key, tenant_id uuid not null)`
    try {
      const problems = describeRuntimeRoleProblems(await inspectRuntimeRole(app.sql))
      expect(problems.some((problem) => problem.includes('hardening_widgets'))).toBe(true)
    } finally {
      await ownerSql`drop table if exists hardening_widgets`
    }
    expect(describeRuntimeRoleProblems(await inspectRuntimeRole(app.sql))).toEqual([])
  })
})

describe('tenant ditangguhkan & pengguna dinonaktifkan', () => {
  test('tenant suspended: konteks tidak terselesaikan, switch ditolak, endpoint tenant 403', async () => {
    const owner = await registerOwner(app, 'hard-susp', 'Tenant Suspended')
    expect((await owner.api.v1.agents.get()).error).toBeNull()
    // Role pemilik pun tunduk FORCE RLS: perubahan status dilakukan di dalam konteks tenant.
    const setStatus = (status: 'suspended' | 'active') =>
      ownerSql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${owner.tenantId}, true)`
        const rows = await tx<
          { id: string }[]
        >`update tenants set status = ${status} where id = ${owner.tenantId} returning id`
        if (rows.length !== 1) throw new Error(`status tenant tidak berubah (${rows.length} baris)`)
      })
    await setStatus('suspended')
    try {
      expect(
        await resolveTenantContext(app.sql, { userId: owner.userId, tenantId: owner.tenantId, requestId: 't' }),
      ).toBeNull()
      const switched = await owner.api.v1.tenants({ id: owner.tenantId }).switch.post()
      expect(switched.error?.status).toBe(404)
      const agents = await owner.api.v1.agents.get()
      expect(agents.error?.status).toBe(403)
    } finally {
      await setStatus('active')
    }
  })

  test('pengguna dinonaktifkan: sesi yang ada langsung tidak valid (401) dan login ditolak', async () => {
    const user = await registerUser(app, 'hard-disabled')
    expect((await user.api.v1.auth.me.get()).error).toBeNull()
    await ownerSql`update users set status = 'disabled' where id = ${user.userId}`
    try {
      expect((await user.api.v1.auth.me.get()).error?.status).toBe(401)
      const login = await app.app.handle(
        new Request('http://localhost:3000/v1/auth/login', {
          method: 'POST',
          headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({ email: user.email, password: 'correct-horse-battery-staple' }),
        }),
      )
      expect(login.status).toBe(401)
    } finally {
      await ownerSql`update users set status = 'active' where id = ${user.userId}`
    }
  })
})

describe('peran & izin sistem tidak dapat diubah dari konteks tenant (RLS + GRANT)', () => {
  test('UPDATE/DELETE peran sistem dan role_permissions-nya dari konteks tenant: 0 baris (RLS)', async () => {
    const context = await ownerContext(app, ownerA.userId, ownerA.tenantId)
    await withTenantTransaction(app.sql, context, async ({ sql }) => {
      const updated = await sql`update roles set name = 'Pwned' where tenant_id is null and key = 'owner' returning id`
      expect(updated).toHaveLength(0)
      const deleted = await sql`delete from roles where tenant_id is null returning id`
      expect(deleted).toHaveLength(0)
      const unlinked = await sql`
        delete from role_permissions where role_id in (select id from roles where tenant_id is null) returning role_id
      `
      expect(unlinked).toHaveLength(0)
    })
    const [owner] = await ownerSql<{ name: string }[]>`select name from roles where tenant_id is null and key = 'owner'`
    expect(owner?.name).not.toBe('Pwned')
  })

  test('katalog permissions: role runtime tidak punya hak INSERT/UPDATE/DELETE (GRANT)', async () => {
    const context = await ownerContext(app, ownerA.userId, ownerA.tenantId)
    await expect(
      run(() =>
        withTenantTransaction(
          app.sql,
          context,
          ({ sql }) => sql`insert into permissions (key, description) values ('x.y', 'x')`,
        ),
      ),
    ).rejects.toThrow()
    await expect(
      run(() =>
        withTenantTransaction(app.sql, context, ({ sql }) => sql`delete from permissions where key = 'agents.read'`),
      ),
    ).rejects.toThrow()
  })

  test('matriks GRANT: role runtime tidak dapat DELETE tenants maupun DROP/ALTER tabel', async () => {
    const context = await ownerContext(app, ownerA.userId, ownerA.tenantId)
    await expect(
      run(() =>
        withTenantTransaction(app.sql, context, ({ sql }) => sql`delete from tenants where id = ${ownerA.tenantId}`),
      ),
    ).rejects.toThrow()
    await expect(run(() => app.sql`alter table agents add column pwned text`)).rejects.toThrow()
    await expect(run(() => app.sql`drop table agents`)).rejects.toThrow()
  })
})

describe('eskalasi hak oleh anggota biasa', () => {
  test('anggota tanpa members.manage tidak bisa menautkan peran owner ke keanggotaannya sendiri', async () => {
    // Konteks tenant anggota biasa (peran member) — bukan owner.
    const context = await resolveTenantContext(app.sql, {
      userId: member.userId,
      tenantId: ownerA.tenantId,
      requestId: 'escalation',
    })
    if (!context) throw new Error('konteks anggota tidak terselesaikan')
    expect(context.permissions).not.toContain('members.manage')
    const [membership] = await withUserTransaction(
      app.sql,
      member.userId,
      ({ sql }) =>
        sql<
          { id: string }[]
        >`select id from tenant_memberships where tenant_id = ${ownerA.tenantId} and user_id = ${member.userId}`,
    )
    if (!membership) throw new Error('keanggotaan anggota tidak ditemukan')
    const attempt = run(() =>
      withTenantTransaction(
        app.sql,
        context,
        ({ sql }) => sql`
          insert into membership_roles (membership_id, tenant_id, role_id)
          select ${membership.id}, ${ownerA.tenantId}, id from roles where tenant_id is null and key = 'owner'
          returning membership_id
        `,
      ),
    )
    await expect(attempt).rejects.toThrow()
    const after = await resolveTenantContext(app.sql, {
      userId: member.userId,
      tenantId: ownerA.tenantId,
      requestId: 'escalation-after',
    })
    expect(after?.userRoles).toEqual(['member'])
  })
})
