/** Membutuhkan PostgreSQL (TEST_DATABASE_URL). */
import { afterAll, describe, expect, test } from 'bun:test'
import { createSession, createTestApp, rawRequest } from '../helpers/app'

const app = createTestApp()
afterAll(() => app.close())

describe('API dasar', () => {
  test('GET /v1/health melaporkan status tanpa detail infrastruktur', async () => {
    const response = await rawRequest(app, 'GET', '/v1/health')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'ok', checks: { database: 'ok' } })
    expect(response.text).not.toMatch(/postgres|agentic_|password|version/i)
  })

  test('semua respons membawa x-request-id dan header keamanan', async () => {
    const response = await rawRequest(app, 'GET', '/v1/health', { headers: { 'x-request-id': 'req-test-12345' } })
    expect(response.headers.get('x-request-id')).toBe('req-test-12345')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('route tidak dikenal mengembalikan ApiError 404', async () => {
    const response = await rawRequest(app, 'GET', '/v1/tidak-ada')
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ code: 'ROUTE_NOT_FOUND', requestId: expect.any(String) })
  })

  test('error validasi 422 tidak memantulkan nilai input sensitif', async () => {
    const response = await rawRequest(app, 'POST', '/v1/auth/register', {
      body: { email: 'bukan-email', password: 'pendek-RAHASIA', displayName: 'x' },
    })
    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(response.text).not.toContain('pendek-RAHASIA')
  })

  test('body JSON rusak ditolak dengan ApiError', async () => {
    const response = await app.app.handle(
      new Request('http://localhost:3000/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email":',
      }),
    )
    expect([400, 422]).toContain(response.status)
    expect(await response.json()).toMatchObject({ code: expect.any(String), message: expect.any(String) })
  })
})

describe('OpenAPI', () => {
  test('UI dan spesifikasi JSON tersedia, lengkap dengan skema keamanan cookie', async () => {
    const ui = await rawRequest(app, 'GET', '/openapi')
    expect(ui.status).toBe(200)
    expect(ui.headers.get('content-type')).toContain('text/html')

    const spec = await rawRequest(app, 'GET', '/openapi/json')
    expect(spec.status).toBe(200)
    expect(spec.body).toMatchObject({
      openapi: expect.stringMatching(/^3\./),
      servers: [{ url: '/api' }],
      components: { securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'aivo_session' } } },
    })
    for (const path of [
      '/v1/health',
      '/v1/auth/login',
      '/v1/auth/me',
      '/v1/tenants',
      '/v1/tenants/{id}',
      '/v1/memberships',
      '/v1/agents',
      '/v1/agents/{id}',
    ]) {
      expect(spec.body).toHaveProperty(['paths', path])
    }
  })

  test('OpenAPI dapat dinonaktifkan lewat konfigurasi', async () => {
    const disabled = createTestApp({ OPENAPI_ENABLED: 'false' })
    try {
      expect((await rawRequest(disabled, 'GET', '/openapi/json')).status).toBe(404)
    } finally {
      await disabled.close()
    }
  })
})

describe('Eden Treaty ↔ Elysia', () => {
  test('klien Eden berkomunikasi dengan aplikasi dan mengembalikan data bertipe', async () => {
    const { api } = createSession(app)
    const { data, error } = await api.v1.health.get()
    expect(error).toBeNull()
    expect(data?.status).toBe('ok')
    // Eden mengubah timestamp ISO menjadi Date; schema memakai t.Date() agar tipe sesuai.
    expect(data?.time).toBeInstanceOf(Date)
  })
})
