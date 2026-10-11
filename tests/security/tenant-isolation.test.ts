/**
 * Isolasi tenant melalui API (lapisan HTTP + service + RLS).
 * Membutuhkan PostgreSQL (TEST_DATABASE_URL).
 *
 * Skenario:
 *   - User A: owner Tenant A
 *   - User B: owner Tenant B
 *   - User C: viewer di Tenant A dan member di Tenant B (untuk pengujian switch)
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  addAgents,
  addMember,
  createTestApp,
  ownerContext,
  rawRequest,
  registerOwner,
  registerUser,
  type RegisteredUser,
} from '../helpers/app'

const app = createTestApp()
afterAll(() => app.close())

let userA: RegisteredUser & { tenantId: string }
let userB: RegisteredUser & { tenantId: string }
let userC: RegisteredUser
let agentsA: string[]
let agentsB: string[]

beforeAll(async () => {
  userA = await registerOwner(app, 'iso-a', 'Tenant Isolasi A')
  userB = await registerOwner(app, 'iso-b', 'Tenant Isolasi B')
  userC = await registerUser(app, 'iso-c')
  const contextA = await ownerContext(app, userA.userId, userA.tenantId)
  const contextB = await ownerContext(app, userB.userId, userB.tenantId)
  agentsA = await addAgents(app, contextA, [{ name: 'Alpha One' }, { name: 'Alpha Two', lifecycleStatus: 'paused' }])
  agentsB = await addAgents(app, contextB, [{ name: 'Bravo One' }])
  await addMember(app, contextA, userC.userId, 'viewer')
  await addMember(app, contextB, userC.userId, 'member')
})

describe('akses tenant berdasarkan keanggotaan', () => {
  test('User A hanya melihat tenant tempat ia menjadi anggota', async () => {
    const { data } = await userA.api.v1.tenants.get()
    expect(data?.items.map((tenant) => tenant.id)).toEqual([userA.tenantId])
  })

  test('User A tidak dapat membaca detail Tenant B (404, keberadaan tidak bocor)', async () => {
    const { error } = await userA.api.v1.tenants({ id: userB.tenantId }).get()
    expect(error?.status).toBe(404)
    const nonexistent = await userA.api.v1.tenants({ id: '00000000-0000-4000-8000-000000000000' }).get()
    expect(nonexistent.error?.status).toBe(404)
    expect(error?.value).toMatchObject({ code: 'TENANT_NOT_FOUND' })
    expect(nonexistent.error?.value).toMatchObject({ code: 'TENANT_NOT_FOUND' })
  })

  test('User A tidak dapat memilih Tenant B sebagai tenant aktif', async () => {
    const { error } = await userA.api.v1.tenants({ id: userB.tenantId }).switch.post()
    expect(error?.status).toBe(404)
    const me = await userA.api.v1.auth.me.get()
    expect(me.data?.activeTenant?.tenantId).toBe(userA.tenantId)
  })

  test('User A hanya mendapat agent Tenant A', async () => {
    const { data } = await userA.api.v1.agents.get()
    expect(data?.items.map((agent) => agent.id).sort()).toEqual([...agentsA].sort())
  })

  test('agent Tenant B tidak dapat dibaca langsung oleh User A meskipun ID diketahui', async () => {
    const { error } = await userA.api.v1.agents({ id: agentsB[0] ?? '' }).get()
    expect(error?.status).toBe(404)
  })

  test('tenant_id palsu di sesi tidak memberi akses (keanggotaan selalu diverifikasi ulang)', async () => {
    await app.sql`
      update sessions set active_tenant_id = ${userB.tenantId}
      where user_id = ${userA.userId} and revoked_at is null
    `
    const agents = await userA.api.v1.agents.get()
    expect(agents.error?.status).toBe(403)
    expect(agents.error?.value).toMatchObject({ code: 'TENANT_ACCESS_DENIED' })
    // Pilihan tenant yang tidak sah dikosongkan oleh backend.
    const me = await userA.api.v1.auth.me.get()
    expect(me.data?.activeTenant).toBeNull()
    await userA.api.v1.tenants({ id: userA.tenantId }).switch.post()
  })
})

describe('ganti tenant (User C anggota dua tenant)', () => {
  test('data agent Tenant A tidak pernah muncul di bawah Tenant B dan sebaliknya', async () => {
    const toA = await userC.api.v1.tenants({ id: userA.tenantId }).switch.post()
    expect(toA.data?.roles).toEqual(['viewer'])
    const underA = await userC.api.v1.agents.get()
    expect(underA.data?.items.map((agent) => agent.id).sort()).toEqual([...agentsA].sort())

    const toB = await userC.api.v1.tenants({ id: userB.tenantId }).switch.post()
    expect(toB.data?.roles).toEqual(['member'])
    const underB = await userC.api.v1.agents.get()
    const idsUnderB = underB.data?.items.map((agent) => agent.id) ?? []
    expect(idsUnderB).toEqual(agentsB)
    for (const id of agentsA) expect(idsUnderB).not.toContain(id)

    const crossRead = await userC.api.v1.agents({ id: agentsA[0] ?? '' }).get()
    expect(crossRead.error?.status).toBe(404)
  })

  test('peran dan izin di-resolve ulang per tenant dari database', async () => {
    await userC.api.v1.tenants({ id: userA.tenantId }).switch.post()
    const meA = await userC.api.v1.auth.me.get()
    expect(meA.data?.activeTenant?.permissions).toEqual(['agents.read', 'approvals.read', 'tasks.read', 'tenant.read'])
    await userC.api.v1.tenants({ id: userB.tenantId }).switch.post()
    const meB = await userC.api.v1.auth.me.get()
    expect(meB.data?.activeTenant?.permissions).toEqual([
      'agents.read',
      'approvals.read',
      'members.read',
      'tasks.cancel',
      'tasks.create',
      'tasks.read',
      'tenant.read',
    ])
  })
})

describe('otorisasi berbasis izin', () => {
  test('anggota tanpa izin agents.read ditolak 403 PERMISSION_DENIED', async () => {
    const noRole = await registerUser(app, 'iso-norole')
    const contextA = await ownerContext(app, userA.userId, userA.tenantId)
    await addMember(app, contextA, noRole.userId, null)
    await noRole.api.v1.tenants({ id: userA.tenantId }).switch.post()
    const { error } = await noRole.api.v1.agents.get()
    expect(error?.status).toBe(403)
    expect(error?.value).toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  test('keanggotaan yang ditangguhkan langsung kehilangan akses', async () => {
    const temp = await registerUser(app, 'iso-suspended')
    const contextA = await ownerContext(app, userA.userId, userA.tenantId)
    const membershipId = await addMember(app, contextA, temp.userId, 'member')
    await temp.api.v1.tenants({ id: userA.tenantId }).switch.post()
    expect((await temp.api.v1.agents.get()).error).toBeNull()

    await app.sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${userA.tenantId}, true), set_config('app.user_id', ${userA.userId}, true)`
      await tx`update tenant_memberships set status = 'suspended' where id = ${membershipId}`
    })
    const { error } = await temp.api.v1.agents.get()
    expect(error?.status).toBe(403)
    const tenants = await temp.api.v1.tenants.get()
    expect(tenants.data?.items).toEqual([])
  })

  test('tanpa tenant aktif, endpoint tenant-scoped meminta pemilihan tenant', async () => {
    const lonely = await registerUser(app, 'iso-lonely')
    const { error } = await lonely.api.v1.agents.get()
    expect(error?.status).toBe(403)
    expect(error?.value).toMatchObject({ code: 'TENANT_NOT_SELECTED' })
  })
})

describe('respons tidak dapat di-cache bersama', () => {
  test('respons tenant-scoped memakai Cache-Control: no-store', async () => {
    const response = await rawRequest(app, 'GET', '/v1/agents', { headers: { cookie: userA.jar.cookie } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('agregat tenant tidak menghitung data tenant lain', () => {
  test('jumlah anggota hanya mencakup tenant yang diminta, bukan keanggotaan pengguna di tenant lain', async () => {
    // Regresi: kebijakan RLS tenant_memberships memperlihatkan keanggotaan milik pengguna
    // sendiri di tenant lain; count(*) tanpa filter tenant_id pernah menghasilkan angka salah.
    const ownerX = await registerOwner(app, 'count-x', 'Count Tenant X')
    const multi = await registerOwner(app, 'count-multi', 'Count Tenant Z')
    await addMember(app, await ownerContext(app, ownerX.userId, ownerX.tenantId), multi.userId, 'member')

    const { data } = await multi.api.v1.tenants({ id: ownerX.tenantId }).get()
    expect(data?.activeMemberCount).toBe(2)
    const own = await multi.api.v1.tenants({ id: multi.tenantId }).get()
    expect(own.data?.activeMemberCount).toBe(1)
  })
})

describe('pembuatan perusahaan', () => {
  test('POST /v1/tenants membuat tenant dengan pembuat sebagai owner, tanpa mengganti tenant aktif', async () => {
    const creator = await registerOwner(app, 'create-tenant', 'Perusahaan Awal')
    const { data, error, status } = await creator.api.v1.tenants.post({ name: 'Perusahaan Kedua Ñ' })
    expect(error).toBeNull()
    expect(status).toBe(201)
    expect(data?.slug).toMatch(/^perusahaan-kedua-n-[0-9a-f]{6}$/)

    const me = await creator.api.v1.auth.me.get()
    expect(me.data?.activeTenant?.tenantId).toBe(creator.tenantId)

    const switched = await creator.api.v1.tenants({ id: data?.id ?? '' }).switch.post()
    expect(switched.data?.roles).toEqual(['owner'])
    const outsider = await registerUser(app, 'create-outsider')
    expect((await outsider.api.v1.tenants({ id: data?.id ?? '' }).get()).error?.status).toBe(404)
  })

  test('nama perusahaan tidak valid ditolak 422', async () => {
    const creator = await registerUser(app, 'create-invalid')
    const { error } = await creator.api.v1.tenants.post({ name: 'x' })
    expect(error?.status).toBe(422)
  })
})
