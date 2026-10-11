/**
 * Gerbang kesiapan database (fail-closed) — api/core/database/readiness.ts.
 *
 * Skenario brief: database tersedia & role aman; database tidak tersedia saat
 * start; database tersedia belakangan (pemulihan); role BYPASSRLS; role
 * superuser; proteksi RLS hilang; request paralel saat belum siap.
 * Mode standalone diuji di standalone.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { createApi } from '../../api/app'
import { createDependencies } from '../../api/container'
import { createReadinessGate } from '../../api/core/database/readiness'
import { inspectRuntimeRole, type RuntimeRoleReport } from '../../api/core/database/safety'
import { createLogger } from '../../api/core/http/logger'
import { isReadinessExempt } from '../../api/core/http/http-plugin'
import { createTestApp, rawRequest, type TestApp } from '../helpers/app'
import { testConfig, testDatabaseUrls } from '../helpers/env'

const logger = createLogger({ json: false, silent: true })
const SAFE_REPORT: RuntimeRoleReport = {
  role: 'agentic_app',
  isSuperuser: false,
  bypassesRls: false,
  ownedTables: [],
  tablesWithoutForcedRls: [],
  unlistedTenantTables: [],
}

/** Error konektivitas NYATA dari driver Bun (port tertutup), bukan tiruan. */
let connectionError: unknown
const unreachable = new SQL({ url: 'postgresql://nobody:nobody@127.0.0.1:1/nowhere', max: 1, connectionTimeout: 2 })
const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 1 })
let base: TestApp

beforeAll(async () => {
  base = createTestApp()
  try {
    await unreachable`select 1`
  } catch (error) {
    connectionError = error
  }
  expect(connectionError).toBeDefined()
})

afterAll(async () => {
  await base.close()
  await ownerSql.close()
  await unreachable.close()
})

/** Aplikasi dengan database test NYATA, tetapi pemeriksa role dapat diganti. */
function appWith(inspect: (sql: SQL) => Promise<RuntimeRoleReport>, intervals = { retry: 50, recheck: 50 }) {
  const config = testConfig()
  const deps = createDependencies({ config, sql: base.sql, logger })
  const readiness = createReadinessGate(deps, {
    inspect,
    retryIntervalMs: intervals.retry,
    recheckIntervalMs: intervals.recheck,
  })
  const app = createApi(deps, { readiness })
  const testApp: TestApp = { app, deps, sql: base.sql, config, close: async () => {} }
  return { testApp, readiness }
}

describe('gerbang kesiapan database', () => {
  test('1. database tersedia & role aman: siap, request dilayani, health 200', async () => {
    const readiness = createReadinessGate({ sql: base.sql, logger })
    const state = await readiness.verify()
    expect(state.status).toBe('ready')
    expect(state.problems).toEqual([])

    const me = await rawRequest(base, 'GET', '/v1/auth/me')
    expect(me.status).toBe(401) // melewati gerbang; ditolak karena tanpa sesi
    const health = await rawRequest(base, 'GET', '/v1/health')
    expect(health.status).toBe(200)
    expect(health.body).toMatchObject({ status: 'ok', checks: { database: 'ok' } })
  })

  test('2. database tidak tersedia saat start: 503 DATABASE_UNAVAILABLE, handler & query tenant tidak berjalan', async () => {
    let inspections = 0
    const { testApp, readiness } = appWith(async () => {
      inspections += 1
      throw connectionError
    })
    expect(readiness.state().status).toBe('pending')

    // Kredensial pengguna nyata TIDAK dicoba: bila handler berjalan, respons akan 401/200, bukan 503.
    const login = await rawRequest(testApp, 'POST', '/v1/auth/login', {
      body: { email: 'siapa@test.local', password: 'correct-horse-battery-staple' },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(login.status).toBe(503)
    expect(login.body).toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    expect(login.headers.get('retry-after')).toBe('1')
    expect(login.headers.get('cache-control')).toBe('no-store')

    const agents = await rawRequest(testApp, 'GET', '/v1/agents')
    expect(agents.status).toBe(503)
    expect(agents.body).toMatchObject({ code: 'DATABASE_UNAVAILABLE' })

    const health = await rawRequest(testApp, 'GET', '/v1/health')
    expect(health.status).toBe(503)
    expect(health.body).toMatchObject({ status: 'degraded', checks: { database: 'unavailable' } })
    expect(readiness.state().status).toBe('unavailable')
    // Semua request di atas datang dalam jeda retry: hanya pemeriksaan awal yang berjalan.
    expect(inspections).toBe(1)
  })

  test('3. database tersedia belakangan: pulih otomatis setelah jeda retry, tanpa restart', async () => {
    let inspections = 0
    const { testApp, readiness } = appWith(async (sql) => {
      inspections += 1
      if (inspections <= 2) throw connectionError
      return inspectRuntimeRole(sql)
    })
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(503)
    expect(readiness.state().attempts).toBe(1)

    await Bun.sleep(60)
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(503) // percobaan ke-2 masih gagal
    expect(readiness.state().attempts).toBe(2)

    await Bun.sleep(60)
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(401) // pulih: lolos gerbang
    expect(readiness.state()).toMatchObject({ status: 'ready', attempts: 3 })
    const health = await rawRequest(testApp, 'GET', '/v1/health')
    expect(health.status).toBe(200)
  })

  test.each([
    ['4. role BYPASSRLS', { ...SAFE_REPORT, bypassesRls: true }],
    ['5. role superuser', { ...SAFE_REPORT, isSuperuser: true }],
    ['6a. tabel tenant tanpa FORCE RLS', { ...SAFE_REPORT, tablesWithoutForcedRls: ['agents'] }],
    ['6b. role runtime memiliki tabel tenant', { ...SAFE_REPORT, ownedTables: ['tenants'] }],
  ])('%s: 503 SERVICE_MISCONFIGURED, health misconfigured', async (_label, report) => {
    const { testApp, readiness } = appWith(async () => report)
    const me = await rawRequest(testApp, 'GET', '/v1/auth/me')
    expect(me.status).toBe(503)
    expect(me.body).toMatchObject({ code: 'SERVICE_MISCONFIGURED' })
    expect(readiness.state().status).toBe('misconfigured')
    expect(readiness.state().problems.length).toBeGreaterThan(0)
    const health = await rawRequest(testApp, 'GET', '/v1/health')
    expect(health.status).toBe(503)
    expect(health.body).toMatchObject({ status: 'degraded', checks: { database: 'misconfigured' } })
    // Pesan ke klien tidak memuat nama role/tabel.
    expect(JSON.stringify(me.body)).not.toContain('agentic')
    expect(JSON.stringify(me.body)).not.toContain('tenants')
  })

  test('6c. role pemilik tabel NYATA (agentic_owner) ditolak oleh pemeriksa asli', async () => {
    const readiness = createReadinessGate({ sql: ownerSql, logger })
    const state = await readiness.verify()
    expect(state.status).toBe('misconfigured')
    await expect(readiness.waitUntilReady()).rejects.toMatchObject({ status: 503, code: 'SERVICE_MISCONFIGURED' })
  })

  test('pemeriksaan yang gagal bukan karena konektivitas tetap menutup gerbang (tidak fail-open)', async () => {
    const { testApp, readiness } = appWith(async () => {
      throw new Error('permission denied for table pg_roles')
    })
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(503)
    expect(readiness.state().status).toBe('misconfigured')
  })

  test('8. request paralel saat belum siap: semua 503 dan hanya SATU pemeriksaan berjalan', async () => {
    let inspections = 0
    const { testApp, readiness } = appWith(async () => {
      inspections += 1
      await Bun.sleep(100)
      throw connectionError
    })
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        rawRequest(testApp, 'GET', index % 2 === 0 ? '/v1/auth/me' : '/v1/agents'),
      ),
    )
    expect(responses.map((response) => response.status)).toEqual(Array(25).fill(503))
    expect(inspections).toBe(1)
    expect(readiness.state().attempts).toBe(1)
  })

  test('setelah siap, verifikasi diulang berkala dan role yang berubah tidak aman menutup gerbang lagi', async () => {
    let unsafe = false
    const { testApp, readiness } = appWith(async () => (unsafe ? { ...SAFE_REPORT, bypassesRls: true } : SAFE_REPORT), {
      retry: 50,
      recheck: 50,
    })
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(401)
    unsafe = true
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(401) // masih dalam jeda recheck
    await Bun.sleep(60)
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(503)
    expect(readiness.state().status).toBe('misconfigured')
    unsafe = false
    await Bun.sleep(60)
    expect((await rawRequest(testApp, 'GET', '/v1/auth/me')).status).toBe(401) // pulih setelah DBA memperbaiki
  })

  test('health dan OpenAPI tidak ditahan gerbang; endpoint lain ditahan apa pun prefix mount-nya', () => {
    expect(isReadinessExempt('/v1/health')).toBe(true)
    expect(isReadinessExempt('/api/v1/health')).toBe(true)
    expect(isReadinessExempt('/api/openapi')).toBe(true)
    expect(isReadinessExempt('/api/openapi/json')).toBe(true)
    expect(isReadinessExempt('/api/v1/agents')).toBe(false)
    expect(isReadinessExempt('/api/v1/healthz')).toBe(false)
    expect(isReadinessExempt('/api/v1/tenants/openapi-corp/switch')).toBe(false)
  })

  test('createApi tanpa opsi membuat gerbang sendiri (mode mount nuxt-elysia)', async () => {
    const deps = createDependencies({ config: testConfig(), sql: unreachable, logger })
    const app = createApi(deps)
    const response = await app.handle(
      new Request('http://localhost:3000/v1/auth/me', { headers: { host: 'localhost:3000' } }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
  })
})
