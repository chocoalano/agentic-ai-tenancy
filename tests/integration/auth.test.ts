/** Membutuhkan PostgreSQL (TEST_DATABASE_URL). */
import { afterAll, describe, expect, test } from 'bun:test'
import {
  TEST_PASSWORD,
  createSession,
  createTestApp,
  rawRequest,
  registerOwner,
  registerUser,
  uniqueEmail,
} from '../helpers/app'

const app = createTestApp({ AUTH_LOGIN_MAX_FAILURES: '3' })
afterAll(() => app.close())

describe('endpoint terlindungi tanpa autentikasi', () => {
  const protectedRoutes: [string, string][] = [
    ['GET', '/v1/auth/me'],
    ['POST', '/v1/auth/logout'],
    ['GET', '/v1/tenants'],
    ['GET', '/v1/tenants/00000000-0000-4000-8000-000000000000'],
    ['POST', '/v1/tenants/00000000-0000-4000-8000-000000000000/switch'],
    ['GET', '/v1/memberships'],
    ['GET', '/v1/agents'],
    ['GET', '/v1/agents/00000000-0000-4000-8000-000000000000'],
    ['GET', '/v1/realtime/stream'],
  ]

  for (const [method, path] of protectedRoutes) {
    test(`${method} ${path} → 401`, async () => {
      const response = await rawRequest(app, method, path)
      expect(response.status).toBe(401)
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' })
    })
  }

  test('token palsu atau berformat salah ditolak', async () => {
    for (const cookie of ['aivo_session=' + 'A'.repeat(43), 'aivo_session=../../etc', 'aivo_session=']) {
      const response = await rawRequest(app, 'GET', '/v1/auth/me', { headers: { cookie } })
      expect(response.status).toBe(401)
    }
  })
})

describe('registrasi', () => {
  test('membuat akun, perusahaan (owner), dan sesi yang langsung dapat dipakai', async () => {
    const user = await registerOwner(app, 'reg', 'PT Registrasi Test')
    const me = await user.api.v1.auth.me.get()
    expect(me.error).toBeNull()
    expect(me.data?.user.email).toBe(user.email)
    expect(me.data?.activeTenant?.tenantId).toBe(user.tenantId)
    expect(me.data?.activeTenant?.roles).toEqual(['owner'])
    expect(me.data?.activeTenant?.permissions).toContain('tenant.manage')
  })

  test('email dinormalisasi dan duplikat ditolak 409', async () => {
    const email = uniqueEmail('dup')
    const first = await rawRequest(app, 'POST', '/v1/auth/register', {
      body: { email, password: TEST_PASSWORD, displayName: 'Dup' },
    })
    expect(first.status).toBe(201)
    const second = await rawRequest(app, 'POST', '/v1/auth/register', {
      body: { email: `  ${email.toUpperCase()} `.trim(), password: TEST_PASSWORD, displayName: 'Dup' },
    })
    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' })
  })

  test('password di bawah kebijakan minimum ditolak', async () => {
    const response = await rawRequest(app, 'POST', '/v1/auth/register', {
      body: { email: uniqueEmail('weak'), password: 'pendek', displayName: 'Weak' },
    })
    expect(response.status).toBe(422)
  })
})

describe('login dan sesi', () => {
  test('login valid membuat sesi dengan cookie HttpOnly + SameSite=Lax', async () => {
    const owner = await registerUser(app, 'login')
    const response = await rawRequest(app, 'POST', '/v1/auth/login', {
      body: { email: owner.email, password: TEST_PASSWORD },
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^aivo_session=[A-Za-z0-9_-]{43};/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    // Token tidak pernah muncul di body respons.
    expect(response.text).not.toContain(cookie.split(';')[0]?.split('=')[1] ?? '###')

    const session = createSession(app)
    session.jar.cookie = cookie.split(';')[0] ?? ''
    const me = await session.api.v1.auth.me.get()
    expect(me.data?.user.email).toBe(owner.email)
  })

  test('login dengan password salah atau email tak dikenal ditolak dengan pesan yang sama', async () => {
    const user = await registerUser(app, 'wrong')
    const wrongPassword = await rawRequest(app, 'POST', '/v1/auth/login', {
      body: { email: user.email, password: 'password-yang-salah' },
    })
    const unknownEmail = await rawRequest(app, 'POST', '/v1/auth/login', {
      body: { email: uniqueEmail('ghost'), password: 'password-yang-salah' },
    })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    const expected = { code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah.' }
    expect(wrongPassword.body).toMatchObject(expected)
    expect(unknownEmail.body).toMatchObject(expected)
    expect(wrongPassword.headers.get('set-cookie')).toBeNull()
  })

  test('percobaan gagal berulang dibatasi (429 + Retry-After)', async () => {
    const user = await registerUser(app, 'throttle')
    for (let i = 0; i < 3; i++) {
      await rawRequest(app, 'POST', '/v1/auth/login', { body: { email: user.email, password: 'salah-salah-salah' } })
    }
    const blocked = await rawRequest(app, 'POST', '/v1/auth/login', {
      body: { email: user.email, password: TEST_PASSWORD },
    })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  test('logout mencabut sesi di database: cookie lama tidak lagi berlaku', async () => {
    const user = await registerUser(app, 'logout')
    const stolenCookie = user.jar.cookie
    const logout = await user.api.v1.auth.logout.post()
    expect(logout.data?.revoked).toBe(true)
    expect(user.jar.cookie).toBe('')

    const replay = await rawRequest(app, 'GET', '/v1/auth/me', { headers: { cookie: stolenCookie } })
    expect(replay.status).toBe(401)
    const [row] = await app.sql<{ revoked: boolean }[]>`
      select revoked_at is not null as revoked from sessions s join users u on u.id = s.user_id where u.email = ${user.email}
    `
    expect(row?.revoked).toBe(true)
  })

  test('sesi kedaluwarsa ditolak', async () => {
    const user = await registerUser(app, 'expired')
    await app.sql`
      update sessions set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
      where user_id = ${user.userId}
    `
    const me = await user.api.v1.auth.me.get()
    expect(me.error?.status).toBe(401)
  })

  test('token sesi disimpan sebagai HMAC, bukan token mentah', async () => {
    const user = await registerUser(app, 'hash')
    const token = user.jar.cookie.split('=')[1] ?? ''
    const rows = await app.sql<{ token_hash: string }[]>`select token_hash from sessions where user_id = ${user.userId}`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0]?.token_hash).not.toBe(token)
  })

  test('ID pengguna dari klien diabaikan: identitas hanya dari sesi', async () => {
    const victim = await registerOwner(app, 'victim', 'PT Korban')
    const attacker = await registerUser(app, 'attacker')
    const me = await rawRequest(app, 'GET', '/v1/auth/me', {
      headers: { cookie: attacker.jar.cookie, 'x-user-id': victim.userId, 'x-tenant-id': victim.tenantId },
    })
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ user: { id: attacker.userId }, activeTenant: null })
  })
})
