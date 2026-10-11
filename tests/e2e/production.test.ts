/**
 * E2E terhadap build production (`.output/server/index.mjs`) yang dijalankan
 * dengan runtime Bun. Membutuhkan:
 *   - `bun run build` sudah dijalankan,
 *   - PostgreSQL (TEST_DATABASE_URL & TEST_DATABASE_MIGRATION_URL).
 *
 * Memverifikasi bahwa satu server production melayani frontend Nuxt (SSR)
 * dan endpoint Elysia (/api/v1/*, /api/openapi, SSE) sekaligus.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Subprocess } from 'bun'
import {
  TEST_PASSWORD,
  addAgents,
  addMember,
  createTestApp,
  ownerContext,
  registerOwner,
  registerUser,
} from '../helpers/app'
import { TEST_SESSION_SECRET, testDatabaseUrls } from '../helpers/env'

const SERVER_ENTRY = '.output/server/index.mjs'
const COOKIE_NAME = '__Host-aivo_session'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('port'))))
    })
  })
}

const fixtures = createTestApp()
let server: Subprocess
let base = ''
const firstResponseStatuses: number[] = []
let tenantA = ''
let tenantB = ''
const agentNamesA = ['Orion Analyst', 'Orion Support']
const agentNamesB = ['Vega Planner']
let memberEmail = ''

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/v1/health`)
      firstResponseStatuses.push(response.status)
      if (response.status === 200) return
    } catch {
      // port belum terbuka
    }
    await Bun.sleep(25)
  }
  throw new Error('Server production tidak siap dalam 30 detik')
}

async function login(email: string): Promise<string> {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  })
  expect(response.status).toBe(200)
  const setCookie = response.headers.get('set-cookie') ?? ''
  return setCookie.split(';')[0] ?? ''
}

beforeAll(async () => {
  if (!existsSync(SERVER_ENTRY))
    throw new Error('Build production belum ada. Jalankan "bun run build" terlebih dahulu.')

  const ownerA = await registerOwner(fixtures, 'e2e-a', 'E2E Orion Corp')
  const ownerB = await registerOwner(fixtures, 'e2e-b', 'E2E Vega Corp')
  tenantA = ownerA.tenantId
  tenantB = ownerB.tenantId
  const contextA = await ownerContext(fixtures, ownerA.userId, tenantA)
  const contextB = await ownerContext(fixtures, ownerB.userId, tenantB)
  await addAgents(
    fixtures,
    contextA,
    agentNamesA.map((name) => ({ name })),
  )
  await addAgents(
    fixtures,
    contextB,
    agentNamesB.map((name) => ({ name })),
  )
  const member = await registerUser(fixtures, 'e2e-member')
  memberEmail = member.email
  await addMember(fixtures, contextA, member.userId, 'member')
  await addMember(fixtures, contextB, member.userId, 'viewer')

  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = Bun.spawn(['bun', SERVER_ENTRY], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: testDatabaseUrls().app,
      SESSION_SECRET: TEST_SESSION_SECRET,
      REALTIME_HEARTBEAT_MS: '1000',
      SECURITY_HSTS: 'true',
      RATE_LIMIT_REGISTER_IP_MAX: '2',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await waitForServer()
}, 60_000)

afterAll(async () => {
  server?.kill()
  await server?.exited
  await fixtures.close()
})

describe('server production (Bun + Nitro preset bun)', () => {
  test('request pertama setelah start langsung dilayani Elysia (tanpa jendela race startup)', () => {
    // Setiap respons yang diterima harus dari Elysia: 200 (siap) atau 503 (menunggu readiness gate).
    expect(firstResponseStatuses.every((status) => status === 200 || status === 503)).toBe(true)
  })

  test('melayani halaman Nuxt SSR dengan header keamanan', async () => {
    const response = await fetch(`${base}/`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    const html = await response.text()
    expect(html).toMatch(/<html\s+lang="id"/)
    expect(html).toContain('AI digital employee')
  })

  test('melayani Elysia di /api/v1; dokumentasi OpenAPI MATI secara default di production', async () => {
    const health = await fetch(`${base}/api/v1/health`)
    expect(health.status).toBe(200)
    expect(health.headers.get('x-request-id')).toBeTruthy()
    expect(await health.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } })

    expect((await fetch(`${base}/api/openapi`)).status).toBe(404)
    expect((await fetch(`${base}/api/openapi/json`)).status).toBe(404)
  })

  test('header keamanan HTML: CSP dengan hash skrip inline (tanpa unsafe-inline/eval), HSTS bila diaktifkan', async () => {
    const response = await fetch(`${base}/login`)
    const csp = response.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain('upgrade-insecure-requests')
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    // Setiap skrip inline yang dirender harus ter-hash di CSP (kalau tidak, browser memblokirnya).
    const html = await response.text()
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? '')
    expect(inline.length).toBeGreaterThan(0)
    const { createHash } = await import('node:crypto')
    for (const body of inline) {
      expect(csp).toContain(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
    }
  })

  test('HTML yang dirender dengan cookie sesi memakai Cache-Control private, no-store (termasuk /)', async () => {
    const cookie = await login(memberEmail)
    const home = await fetch(`${base}/`, { headers: { cookie } })
    expect(home.status).toBe(200)
    expect(home.headers.get('cache-control')).toBe('private, no-store')
    const anonymous = await fetch(`${base}/`)
    expect(anonymous.headers.get('cache-control')).not.toBe('private, no-store')
  })

  test('IP klien diteruskan ke API lewat Nitro: registrasi per IP dibatasi (429) di mode mount', async () => {
    const register = (prefix: string) =>
      fetch(`${base}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, 'x-aivo-client-ip': '198.51.100.7' },
        body: JSON.stringify({
          email: `${prefix}-${Date.now()}@test.local`,
          password: TEST_PASSWORD,
          displayName: 'E2E',
        }),
      })
    // Header palsu dari klien ditimpa middleware: ketiga request dihitung untuk 127.0.0.1, bukan 198.51.100.7.
    const statuses = [await register('rl-a'), await register('rl-b'), await register('rl-c')].map((r) => r.status)
    expect(statuses.slice(0, 2)).toEqual([201, 201])
    expect(statuses[2]).toBe(429)
  })

  test('cookie sesi production memakai prefix __Host- dan atribut Secure', async () => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: memberEmail, password: TEST_PASSWORD }),
    })
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie.startsWith(`${COOKIE_NAME}=`)).toBe(true)
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
  })

  test('harness QA visual tidak ada di build production: 404 dan tidak masuk manifest/chunk', async () => {
    for (const path of ['/__office-visual-qa', '/__dev/office-visual-qa']) {
      const response = await fetch(`${base}${path}`)
      expect(response.status).toBe(404)
    }
    const files = await Array.fromAsync(new Bun.Glob('**/*.{js,mjs,json}').scan({ cwd: '.output', onlyFiles: true }))
    expect(files.length).toBeGreaterThan(0)
    const leaked: string[] = []
    for (const file of files) {
      if ((await Bun.file(`.output/${file}`).text()).includes('office-visual-qa')) leaked.push(file)
    }
    expect(leaked).toEqual([])
  })

  test('halaman terlindungi mengarahkan pengguna anonim ke /login', async () => {
    const response = await fetch(`${base}/office`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/login?redirect=/office')
  })

  test('SSR /office dan /agents memuat data tenant aktif melalui Eden in-process, lalu berganti saat switch', async () => {
    const cookie = await login(memberEmail)
    const switchTo = (tenantId: string) =>
      fetch(`${base}/api/v1/tenants/${tenantId}/switch`, { method: 'POST', headers: { cookie, origin: base } })

    expect((await switchTo(tenantA)).status).toBe(200)
    const officeA = await fetch(`${base}/office`, { headers: { cookie } })
    expect(officeA.status).toBe(200)
    expect(officeA.headers.get('cache-control')).toBe('private, no-store')
    const htmlA = await officeA.text()
    expect(htmlA).toContain('E2E Orion Corp')
    for (const name of agentNamesA) expect(htmlA).toContain(name)
    for (const name of agentNamesB) expect(htmlA).not.toContain(name)

    expect((await switchTo(tenantB)).status).toBe(200)
    const htmlB = await (await fetch(`${base}/agents`, { headers: { cookie } })).text()
    for (const name of agentNamesB) expect(htmlB).toContain(name)
    for (const name of agentNamesA) expect(htmlB).not.toContain(name)
  })

  test('SSE melalui mount Nitro: event ready lalu heartbeat, dan dapat dibatalkan', async () => {
    const cookie = await login(memberEmail)
    await fetch(`${base}/api/v1/tenants/${tenantA}/switch`, { method: 'POST', headers: { cookie, origin: base } })
    const controller = new AbortController()
    const response = await fetch(`${base}/api/v1/realtime/stream`, { headers: { cookie }, signal: controller.signal })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Body SSE tidak tersedia')
    const decoder = new TextDecoder()
    let buffer = ''
    const deadline = Date.now() + 5_000
    while (!buffer.includes('event: heartbeat') && Date.now() < deadline) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
    }
    controller.abort()
    expect(buffer).toContain('event: ready')
    expect(buffer).toContain(tenantA)
    expect(buffer).toContain('event: heartbeat')
  })

  test('SSE ditolak tanpa sesi', async () => {
    const response = await fetch(`${base}/api/v1/realtime/stream`)
    expect(response.status).toBe(401)
  })

  test('Phase 5: tanpa runtime, tugas nyata ditolak jujur (409 RUNTIME_NOT_CONFIGURED) dan /tasks SSR menampilkannya', async () => {
    const cookie = await login(memberEmail)
    await fetch(`${base}/api/v1/tenants/${tenantA}/switch`, { method: 'POST', headers: { cookie, origin: base } })
    const agents = (await (await fetch(`${base}/api/v1/agents`, { headers: { cookie } })).json()) as {
      items: { id: string; runtimeStatus: unknown; currentTaskId: unknown }[]
    }
    expect(agents.items.length).toBeGreaterThan(0)
    expect(agents.items[0]?.runtimeStatus).toBeNull()
    const capabilities = (await (await fetch(`${base}/api/v1/tasks/capabilities`, { headers: { cookie } })).json()) as {
      runtime: { available: boolean; kind: string }
      canCreate: boolean
    }
    expect(capabilities.runtime).toMatchObject({ available: false, kind: 'none' })
    expect(capabilities.canCreate).toBe(false)
    const created = await fetch(`${base}/api/v1/tasks`, {
      method: 'POST',
      headers: { cookie, origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: agents.items[0]?.id, instruction: 'Riset pasar' }),
    })
    expect(created.status).toBe(409)
    expect(await created.json()).toMatchObject({ code: 'RUNTIME_NOT_CONFIGURED' })
    const list = (await (await fetch(`${base}/api/v1/tasks`, { headers: { cookie } })).json()) as { items: unknown[] }
    expect(list.items).toEqual([])
    const page = await fetch(`${base}/tasks`, { headers: { cookie } })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Runtime AI belum dikonfigurasi')
  })
})

describe('server production dengan database tidak terjangkau (gerbang kesiapan mode mount)', () => {
  let degraded: Subprocess | undefined
  let degradedBase = ''

  beforeAll(async () => {
    const port = await freePort()
    degradedBase = `http://127.0.0.1:${port}`
    degraded = Bun.spawn(['bun', SERVER_ENTRY], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOST: '127.0.0.1',
        DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/nowhere',
        DATABASE_CONNECT_TIMEOUT_SECONDS: '2',
        SESSION_SECRET: TEST_SESSION_SECRET,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        await fetch(`${degradedBase}/api/v1/health`)
        return
      } catch {
        await Bun.sleep(25)
      }
    }
    throw new Error('Server degraded tidak membuka port')
  }, 60_000)

  afterAll(async () => {
    degraded?.kill()
    await degraded?.exited
  })

  test('health 503 "unavailable"; API tenant 503 DATABASE_UNAVAILABLE (fail-closed, bukan 500/hang)', async () => {
    const health = await fetch(`${degradedBase}/api/v1/health`)
    expect(health.status).toBe(503)
    expect(await health.json()).toMatchObject({ status: 'degraded', checks: { database: 'unavailable' } })

    const agents = await fetch(`${degradedBase}/api/v1/agents`)
    expect(agents.status).toBe(503)
    expect(await agents.json()).toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    expect(agents.headers.get('retry-after')).toBeTruthy()

    const login = await fetch(`${degradedBase}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: degradedBase },
      body: JSON.stringify({ email: 'x@test.local', password: 'correct-horse-battery-staple' }),
    })
    expect(login.status).toBe(503)
  })

  test('halaman publik tetap dirender (SSR) walau database tidak tersedia; HSTS tidak dipasang tanpa SECURITY_HSTS', async () => {
    const response = await fetch(`${degradedBase}/login`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<html')
    expect(response.headers.get('strict-transport-security')).toBeNull()
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    // Halaman terlindungi: 503 yang jujur (bukan 500, bukan redirect seolah belum login).
    const office = await fetch(`${degradedBase}/office`, { redirect: 'manual' })
    expect(office.status).toBe(503)
  })
})
