import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'

/** Backend tiruan: menyimpan tenant aktif seperti sesi di server. */
function createFakeBackend() {
  const state = { activeTenantId: TENANT_A, rejectSwitch: false }
  const calls: string[] = []
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/api/v1/auth/me') {
      return json({
        user: { id: 'u1', email: 'c@test.local', displayName: 'C', createdAt: '2026-01-01T00:00:00.000Z' },
        session: { expiresAt: '2026-12-01T00:00:00.000Z' },
        activeTenant: {
          tenantId: state.activeTenantId,
          membershipId: 'm1',
          roles: ['member'],
          permissions: ['agents.read'],
        },
      })
    }
    if (url.pathname === '/api/v1/memberships') {
      return json({
        items: [TENANT_A, TENANT_B].map((id) => ({
          id: `m-${id}`,
          status: 'active',
          roles: ['member'],
          createdAt: '2026-01-01T00:00:00.000Z',
          isActiveTenant: id === state.activeTenantId,
          tenant: { id, slug: id.slice(0, 4), name: `Tenant ${id.slice(0, 1)}`, status: 'active' },
        })),
      })
    }
    const switchMatch = /^\/api\/v1\/tenants\/([^/]+)\/switch$/.exec(url.pathname)
    if (switchMatch?.[1]) {
      if (state.rejectSwitch) return json({ code: 'TENANT_NOT_FOUND', message: 'Perusahaan tidak ditemukan.' }, 404)
      state.activeTenantId = switchMatch[1]
      return json({ tenantId: switchMatch[1], membershipId: 'm1', roles: ['member'], permissions: ['agents.read'] })
    }
    return json({ code: 'ROUTE_NOT_FOUND', message: 'x' }, 404)
  })
  return { state, calls, fetchMock }
}

let backend: ReturnType<typeof createFakeBackend>

beforeEach(() => {
  backend = createFakeBackend()
  vi.stubGlobal('fetch', backend.fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  clearNuxtData()
})

describe('ganti tenant di frontend', () => {
  it('membuang cache data tenant lama dan memuat ulang konteks dari backend', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    await auth.refresh()
    expect(auth.activeTenantId.value).toBe(TENANT_A)

    nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')] = [{ id: 'agent-a' }]
    nuxtApp.payload.data['bukan-data-tenant'] = 'tetap'

    const failure = await auth.switchTenant(TENANT_B)
    expect(failure).toBeNull()
    expect(nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')]).toBeUndefined()
    expect(nuxtApp.payload.data['bukan-data-tenant']).toBe('tetap')
    expect(auth.activeTenantId.value).toBe(TENANT_B)
    expect(backend.calls).toContain(`POST /api/v1/tenants/${TENANT_B}/switch`)
    expect(backend.calls.filter((call) => call === 'GET /api/v1/auth/me')).toHaveLength(2)
  })

  it('useTenantAsyncData mengambil ulang data untuk tenant baru dan tidak memakai data tenant lama', async () => {
    const auth = useAuth()
    await auth.refresh()
    const seen: string[] = []
    const Probe = defineComponent({
      async setup() {
        const { data } = await useTenantAsyncData('probe', async (tenantId) => {
          seen.push(tenantId)
          return `data-milik-${tenantId}`
        })
        return () => h('p', data.value ?? 'kosong')
      },
    })
    const wrapper = await mountSuspended(Probe)
    expect(wrapper.text()).toBe(`data-milik-${TENANT_A}`)

    await auth.switchTenant(TENANT_B)
    await flushPromises()
    await nextTick()
    expect(seen).toEqual([TENANT_A, TENANT_B])
    expect(wrapper.text()).toBe(`data-milik-${TENANT_B}`)
  })

  it('switch yang ditolak backend tidak mengubah konteks maupun cache', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    await auth.refresh()
    nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')] = ['tetap']
    backend.state.rejectSwitch = true

    const failure = await auth.switchTenant(TENANT_B)
    expect(failure?.code).toBe('TENANT_NOT_FOUND')
    expect(auth.activeTenantId.value).toBe(TENANT_A)
    expect(nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')]).toEqual(['tetap'])
  })
})
