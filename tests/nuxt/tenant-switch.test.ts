import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ACTIVE_TENANT_HEADER } from '~~/domains/tenancy/headers'
import { AUTH_SYNC_CHANNEL, type AuthSyncMessage } from '~/utils/auth-sync'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers
  if (!headers) return null
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name)?.[1] ?? null
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return entry ? String(entry[1]) : null
}

/**
 * Backend tiruan: menyimpan tenant aktif seperti SESI SERVER (dibagi semua
 * tab) dan menegakkan header x-active-tenant seperti guard asli (409).
 */
function createFakeBackend() {
  const state = { activeTenantId: TENANT_A, rejectSwitch: false, loggedOut: false, logoutFails: false }
  const calls: string[] = []
  const agentHeaders: Array<string | null> = []
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const unauthenticated = () => json({ code: 'UNAUTHENTICATED', message: 'Sesi tidak valid.' }, 401)

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/api/v1/auth/logout') {
      if (state.logoutFails)
        return json({ code: 'DATABASE_UNAVAILABLE', message: 'Database sedang tidak tersedia.' }, 503)
      state.loggedOut = true
      return json({ ok: true })
    }
    if (state.loggedOut) return unauthenticated()
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
    if (url.pathname === '/api/v1/agents') {
      const claimed = headerOf(init, ACTIVE_TENANT_HEADER)
      agentHeaders.push(claimed)
      if (claimed !== null && claimed !== state.activeTenantId) {
        return json({ code: 'TENANT_MISMATCH', message: 'Perusahaan aktif telah berubah.' }, 409)
      }
      return json({ items: [{ id: `agent-of-${state.activeTenantId}` }] })
    }
    const switchMatch = /^\/api\/v1\/tenants\/([^/]+)\/switch$/.exec(url.pathname)
    if (switchMatch?.[1]) {
      if (state.rejectSwitch) return json({ code: 'TENANT_NOT_FOUND', message: 'Perusahaan tidak ditemukan.' }, 404)
      state.activeTenantId = switchMatch[1]
      return json({ tenantId: switchMatch[1], membershipId: 'm1', roles: ['member'], permissions: ['agents.read'] })
    }
    return json({ code: 'ROUTE_NOT_FOUND', message: 'x' }, 404)
  })
  return { state, calls, agentHeaders, fetchMock }
}

let backend: ReturnType<typeof createFakeBackend>

/** "Tab lain": instance BroadcastChannel terpisah yang mengirim/menerima pesan sinkronisasi. */
function otherTab() {
  const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL)
  const received: AuthSyncMessage[] = []
  channel.addEventListener('message', (event: MessageEvent<AuthSyncMessage>) => received.push(event.data))
  return { post: (message: AuthSyncMessage) => channel.postMessage(message), received, close: () => channel.close() }
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await flushPromises()
    await nextTick()
  }
}

/** Komponen probe yang ter-mount; di-unmount setelah tiap test agar tidak mengisi ulang cache test berikutnya. */
const mounted: Array<{ unmount(): void }> = []

beforeEach(() => {
  backend = createFakeBackend()
  vi.stubGlobal('fetch', backend.fetchMock)
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
  clearNuxtData()
})

/** Komponen yang memuat data tenant lewat $api-like fetch dengan header konsistensi. Nama kunci unik per test. */
function probeComponent(name: string, seen: Array<{ tenantId: string; header: string | null }>) {
  return defineComponent({
    async setup() {
      const { data } = await useTenantAsyncData(name, async (tenantId, _signal, request) => {
        const response = await fetch('http://localhost/api/v1/agents', { headers: request.headers })
        seen.push({ tenantId, header: headerOf({ headers: request.headers }, ACTIVE_TENANT_HEADER) })
        const body: unknown = await response.json()
        if (!response.ok) {
          const info = body as { code: string; message: string }
          throw createError({
            statusCode: response.status,
            statusMessage: info.code,
            message: info.message,
            data: info,
          })
        }
        return (body as { items: Array<{ id: string }> }).items.map((item) => item.id).join(',')
      })
      return () => h('p', data.value ?? 'kosong')
    },
  })
}

describe('ganti tenant di satu tab', () => {
  it('membuang cache data tenant lama, memuat ulang konteks, dan memberi tahu tab lain', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    const tab = otherTab()
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
    await settle()
    expect(tab.received).toEqual([{ type: 'session-changed', activeTenantId: TENANT_B, userId: 'u1' }])
    tab.close()
  })

  it('useTenantAsyncData mengirim header x-active-tenant dan mengambil ulang data untuk tenant baru', async () => {
    const auth = useAuth()
    await auth.refresh()
    const seen: Array<{ tenantId: string; header: string | null }> = []
    const wrapper = await mountSuspended(probeComponent('probe-header', seen))
    mounted.push(wrapper)
    expect(wrapper.text()).toBe(`agent-of-${TENANT_A}`)
    expect(seen).toEqual([{ tenantId: TENANT_A, header: TENANT_A }])

    await auth.switchTenant(TENANT_B)
    await settle()
    expect(seen.map((item) => item.header)).toEqual([TENANT_A, TENANT_B])
    expect(wrapper.text()).toBe(`agent-of-${TENANT_B}`)
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

  it('ganti tenant beruntun: state akhir = tenant terakhir di server', async () => {
    const auth = useAuth()
    await auth.refresh()
    await Promise.all([auth.switchTenant(TENANT_B), auth.switchTenant(TENANT_A), auth.switchTenant(TENANT_B)])
    await settle()
    expect(backend.state.activeTenantId).toBe(TENANT_B)
    expect(auth.activeTenantId.value).toBe(TENANT_B)
  })
})

describe('tenant berubah di tab lain', () => {
  it('pesan BroadcastChannel membuat tab ini konvergen: cache lama dibuang, data tenant baru diambil', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    await auth.refresh()
    const seen: Array<{ tenantId: string; header: string | null }> = []
    const wrapper = await mountSuspended(probeComponent('probe-broadcast', seen))
    mounted.push(wrapper)
    expect(wrapper.text()).toBe(`agent-of-${TENANT_A}`)

    // Tab lain berganti ke B: sesi server berubah, lalu memberi tahu.
    backend.state.activeTenantId = TENANT_B
    const tab = otherTab()
    tab.post({ type: 'session-changed', activeTenantId: TENANT_B, userId: 'u1' })
    await vi.waitFor(() => expect(auth.activeTenantId.value).toBe(TENANT_B))
    await settle()
    expect(nuxtApp.payload.data[tenantDataKey(TENANT_A, 'probe-broadcast')]).toBeUndefined()
    expect(wrapper.text()).toBe(`agent-of-${TENANT_B}`)
    expect(seen.map((item) => item.header)).toEqual([TENANT_A, TENANT_B])
    tab.close()
  })

  it('request yang berjalan dengan konteks usang ditolak 409 → tidak mengisi cache tenant lama → konvergen', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    await auth.refresh()
    const seen: Array<{ tenantId: string; header: string | null }> = []
    const wrapper = await mountSuspended(probeComponent('probe-stale', seen))
    mounted.push(wrapper)
    expect(wrapper.text()).toBe(`agent-of-${TENANT_A}`)

    // Sesi server sudah B (tab lain), tetapi pesan sinkronisasi terlewat; tab ini mengambil ulang data.
    backend.state.activeTenantId = TENANT_B
    await refreshNuxtData(tenantDataKey(TENANT_A, 'probe-stale'))
    await vi.waitFor(() => expect(auth.activeTenantId.value).toBe(TENANT_B))
    await settle()
    expect(nuxtApp.payload.data[tenantDataKey(TENANT_A, 'probe-stale')]).not.toBe(`agent-of-${TENANT_B}`)
    expect(wrapper.text()).toBe(`agent-of-${TENANT_B}`)
    expect(seen.map((item) => item.header)).toEqual([TENANT_A, TENANT_A, TENANT_B])
  })

  it('event SSE `ready` dengan tenant lain memuat ulang konteks tab', async () => {
    const auth = useAuth()
    await auth.refresh()
    backend.state.activeTenantId = TENANT_B
    const Host = defineComponent({
      setup() {
        useOfficeRealtime({
          transport: {
            kind: 'sse',
            subscribe({ onEvent, onStateChange }) {
              onStateChange('open')
              onEvent({
                event: 'ready',
                data: { tenantId: TENANT_B, connectionId: 'c1', serverTime: new Date(), heartbeatIntervalMs: 1000 },
              })
              return () => {}
            },
          },
        })
        return () => h('div')
      },
    })
    mounted.push(await mountSuspended(Host))
    await vi.waitFor(() => expect(auth.activeTenantId.value).toBe(TENANT_B))
  })

  it('logout di tab lain: tab ini kehilangan sesi dan diarahkan ke /login', async () => {
    const auth = useAuth()
    await auth.refresh()
    expect(auth.isAuthenticated.value).toBe(true)
    backend.state.loggedOut = true
    const tab = otherTab()
    tab.post({ type: 'logged-out' })
    await vi.waitFor(() => expect(auth.isAuthenticated.value).toBe(false))
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/login'))
    tab.close()
  })
})

describe('keluar (logout)', () => {
  it('server gagal mencabut sesi: state tetap masuk, error dikembalikan, tidak ada pesan ke tab lain', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    await auth.refresh()
    nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')] = ['tetap']
    const tab = otherTab()
    backend.state.logoutFails = true

    const failure = await auth.logout()
    expect(failure?.code).toBe('DATABASE_UNAVAILABLE')
    expect(auth.isAuthenticated.value).toBe(true)
    expect(nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')]).toEqual(['tetap'])
    await settle()
    expect(tab.received).toEqual([])
    tab.close()
  })

  it('server mengonfirmasi: state & cache dikosongkan, tab lain diberi tahu, diarahkan ke /login', async () => {
    const nuxtApp = useNuxtApp()
    const auth = useAuth()
    await auth.refresh()
    nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')] = ['lama']
    const tab = otherTab()

    expect(await auth.logout()).toBeNull()
    expect(auth.isAuthenticated.value).toBe(false)
    expect(nuxtApp.payload.data[tenantDataKey(TENANT_A, 'agents')]).toBeUndefined()
    await vi.waitFor(() => expect(tab.received).toEqual([{ type: 'logged-out' }]))
    expect(useRouter().currentRoute.value.path).toBe('/login')
    tab.close()
  })

  it('refresh tidak menganggap error server pada /memberships sebagai "keluar"', async () => {
    const auth = useAuth()
    await auth.refresh()
    const original = backend.fetchMock.getMockImplementation()
    backend.fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/api/v1/memberships')) return new Response('{}', { status: 500 })
      return original ? original(input, init) : new Response(null, { status: 404 })
    })
    await expect(auth.refresh()).rejects.toBeDefined()
    expect(auth.isAuthenticated.value).toBe(true)
  })
})
