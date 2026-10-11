/**
 * Konsistensi tenant antar-tab: tenant aktif hidup di sesi server (dibagi
 * semua tab). Tab mengirim `x-active-tenant`; server menolak 409
 * TENANT_MISMATCH bila berbeda dari sesi, sehingga tab yang usang tidak pernah
 * menerima (dan menyimpan) data tenant lain. Membutuhkan PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ACTIVE_TENANT_HEADER, TENANT_ID_HEADER } from '../../domains/tenancy/headers'
import { createTestApp, rawRequest, registerOwner, type RegisteredUser } from '../helpers/app'

const app = createTestApp()
afterAll(() => app.close())

let owner: RegisteredUser & { tenantId: string }
let tenantA = ''
let tenantB = ''

function cookieOf(user: RegisteredUser) {
  return { cookie: user.jar.cookie, origin: 'http://localhost:3000' }
}

async function switchTo(tenantId: string) {
  const { error } = await owner.api.v1.tenants({ id: tenantId }).switch.post()
  expect(error).toBeNull()
}

function agents(headers: Record<string, string> = {}) {
  return rawRequest(app, 'GET', '/v1/agents', { headers: { ...cookieOf(owner), ...headers } })
}

beforeAll(async () => {
  owner = await registerOwner(app, 'consistency', 'Konsistensi Tab A')
  tenantA = owner.tenantId
  const { data, error } = await owner.api.v1.tenants.post({ name: 'Konsistensi Tab B' })
  if (error || !data) throw new Error('gagal membuat tenant B')
  tenantB = data.id
  await switchTo(tenantA)
})

describe('header x-active-tenant vs tenant aktif sesi', () => {
  test('header cocok: 200 dan respons menyatakan tenant yang dipakai (x-tenant-id)', async () => {
    const response = await agents({ [ACTIVE_TENANT_HEADER]: tenantA })
    expect(response.status).toBe(200)
    expect(response.headers.get(TENANT_ID_HEADER)).toBe(tenantA)
  })

  test('tanpa header (klien lama/SSR): tetap dilayani dengan tenant sesi', async () => {
    const response = await agents()
    expect(response.status).toBe(200)
    expect(response.headers.get(TENANT_ID_HEADER)).toBe(tenantA)
  })

  test('tab usang (header tenant lain): 409 TENANT_MISMATCH, tanpa data', async () => {
    const response = await agents({ [ACTIVE_TENANT_HEADER]: tenantB })
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ code: 'TENANT_MISMATCH', details: { activeTenantId: tenantA } })
    expect(JSON.stringify(response.body)).not.toContain('items')
  })

  test('header rusak diperlakukan sebagai tidak cocok (bukan dipercaya)', async () => {
    const response = await agents({ [ACTIVE_TENANT_HEADER]: "abc' or 1=1" })
    expect(response.status).toBe(409)
  })

  test('ganti tenant beruntun: hanya tenant terakhir di sesi yang diterima', async () => {
    await switchTo(tenantB)
    await switchTo(tenantA)
    await switchTo(tenantB)
    expect((await agents({ [ACTIVE_TENANT_HEADER]: tenantA })).status).toBe(409)
    const current = await agents({ [ACTIVE_TENANT_HEADER]: tenantB })
    expect(current.status).toBe(200)
    expect(current.headers.get(TENANT_ID_HEADER)).toBe(tenantB)
    await switchTo(tenantA)
  })

  test('stream SSE juga ditolak sebelum dibuka bila tenant tab usang', async () => {
    const response = await app.app.handle(
      new Request('http://localhost:3000/v1/realtime/stream', {
        headers: { host: 'localhost:3000', cookie: owner.jar.cookie, [ACTIVE_TENANT_HEADER]: tenantB },
      }),
    )
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).not.toContain('text/event-stream')
  })

  test('header tidak memberi akses ke tenant yang bukan milik pengguna (identitas tetap dari sesi)', async () => {
    const outsider = await registerOwner(app, 'consistency-x', 'Konsistensi Luar')
    const response = await rawRequest(app, 'GET', '/v1/agents', {
      headers: { ...cookieOf(outsider), [ACTIVE_TENANT_HEADER]: tenantA },
    })
    expect(response.status).toBe(409)
    expect(JSON.stringify(response.body)).not.toContain('items')
  })
})
