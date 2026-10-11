/**
 * Proteksi CSRF pada endpoint mutasi berbasis cookie.
 * Membutuhkan PostgreSQL (TEST_DATABASE_URL).
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { TEST_ORIGIN, TEST_PASSWORD, createTestApp, rawRequest, registerUser } from '../helpers/app'

const app = createTestApp()
afterAll(() => app.close())

describe('CSRF', () => {
  test('POST login lintas situs ditolak sebelum kredensial diproses', async () => {
    const user = await registerUser(app, 'csrf-login')
    const response = await rawRequest(app, 'POST', '/v1/auth/login', {
      body: { email: user.email, password: TEST_PASSWORD },
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    })
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'CROSS_ORIGIN_REQUEST_BLOCKED' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('logout paksa dari situs lain ditolak dan sesi tetap aktif', async () => {
    const user = await registerUser(app, 'csrf-logout')
    const forged = await rawRequest(app, 'POST', '/v1/auth/logout', {
      headers: { cookie: user.jar.cookie, origin: 'https://evil.example' },
    })
    expect(forged.status).toBe(403)
    expect((await user.api.v1.auth.me.get()).error).toBeNull()
  })

  test('ganti tenant dari situs lain ditolak', async () => {
    const user = await registerUser(app, 'csrf-switch', 'CSRF Corp')
    const response = await rawRequest(app, 'POST', `/v1/tenants/${user.tenantId}/switch`, {
      headers: { cookie: user.jar.cookie, 'sec-fetch-site': 'cross-site' },
    })
    expect(response.status).toBe(403)
  })

  test('request same-origin dari browser diizinkan', async () => {
    const user = await registerUser(app, 'csrf-ok')
    const response = await rawRequest(app, 'POST', '/v1/auth/login', {
      body: { email: user.email, password: TEST_PASSWORD },
      headers: { origin: TEST_ORIGIN, 'sec-fetch-site': 'same-origin' },
    })
    expect(response.status).toBe(200)
  })

  test('GET tidak terpengaruh (tidak mengubah state)', async () => {
    const response = await rawRequest(app, 'GET', '/v1/health', { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(response.status).toBe(200)
  })
})
