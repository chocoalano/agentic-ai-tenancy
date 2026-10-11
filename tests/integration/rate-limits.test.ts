/**
 * Pembatasan laju autentikasi & pembuatan tenant (per IP, per email, per pengguna).
 * IP klien disimulasikan lewat header internal `x-aivo-client-ip` — di harness
 * in-process tidak ada middleware Nitro/soket; di production header ini selalu
 * ditimpa server (diuji e2e). Membutuhkan PostgreSQL.
 */
import { describe, expect, test } from 'bun:test'
import { CLIENT_IP_HEADER } from '../../domains/security/client-ip'
import { TEST_PASSWORD, createTestApp, rawRequest, registerUser, uniqueEmail, type TestApp } from '../helpers/app'

const ORIGIN = { origin: 'http://localhost:3000' }

async function withApp(overrides: Record<string, string>, run: (app: TestApp) => Promise<void>) {
  const app = createTestApp(overrides)
  try {
    await run(app)
  } finally {
    await app.close()
  }
}

describe('pembatasan laju', () => {
  test('registrasi per IP: melebihi batas → 429 + Retry-After; IP lain tidak terpengaruh; tanpa IP dilewati', async () => {
    await withApp({ RATE_LIMIT_REGISTER_IP_MAX: '2' }, async (app) => {
      const register = (ip: string | null) =>
        rawRequest(app, 'POST', '/v1/auth/register', {
          body: { email: uniqueEmail('rl'), password: TEST_PASSWORD, displayName: 'RL' },
          headers: ip === null ? ORIGIN : { ...ORIGIN, [CLIENT_IP_HEADER]: ip },
        })
      expect((await register('203.0.113.5')).status).toBe(201)
      expect((await register('203.0.113.5')).status).toBe(201)
      const blocked = await register('203.0.113.5')
      expect(blocked.status).toBe(429)
      expect(blocked.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' })
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await register('203.0.113.6')).status).toBe(201)
      // IP tidak diketahui (harness tanpa soket/middleware): hanya batas per identitas yang berlaku.
      expect((await register(null)).status).toBe(201)
    })
  })

  test('password spraying: percobaan masuk ke banyak email dari satu IP dibatasi', async () => {
    await withApp({ RATE_LIMIT_LOGIN_IP_MAX: '3' }, async (app) => {
      const attempt = (email: string) =>
        rawRequest(app, 'POST', '/v1/auth/login', {
          body: { email, password: 'salah-salah-salah' },
          headers: { ...ORIGIN, [CLIENT_IP_HEADER]: '203.0.113.9' },
        })
      const statuses: number[] = []
      for (let i = 0; i < 5; i += 1) statuses.push((await attempt(uniqueEmail(`spray${i}`))).status)
      expect(statuses).toEqual([401, 401, 401, 429, 429])
    })
  })

  test('ledakan paralel ke satu email: hitungan atomik — paling banyak N verifikasi, sisanya 429 seketika', async () => {
    await withApp({ AUTH_LOGIN_MAX_FAILURES: '3' }, async (app) => {
      const user = await registerUser(app, 'burst')
      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          rawRequest(app, 'POST', '/v1/auth/login', {
            body: { email: user.email, password: 'salah-salah-salah' },
            headers: ORIGIN,
          }),
        ),
      )
      const statuses = responses.map((response) => response.status)
      expect(statuses.filter((status) => status === 401)).toHaveLength(3)
      expect(statuses.filter((status) => status === 429)).toHaveLength(9)
    })
  })

  test('login sukses mereset hitungan per email, tetapi kuota per IP tetap berjalan', async () => {
    await withApp({ AUTH_LOGIN_MAX_FAILURES: '3', RATE_LIMIT_LOGIN_IP_MAX: '4' }, async (app) => {
      const user = await registerUser(app, 'reset')
      const login = (password: string) =>
        rawRequest(app, 'POST', '/v1/auth/login', {
          body: { email: user.email, password },
          headers: { ...ORIGIN, [CLIENT_IP_HEADER]: '203.0.113.11' },
        })
      expect((await login('salah-salah-salah')).status).toBe(401)
      expect((await login('salah-salah-salah')).status).toBe(401)
      expect((await login(TEST_PASSWORD)).status).toBe(200) // percobaan ke-3 sukses → per email direset
      expect((await login('salah-salah-salah')).status).toBe(401) // per email 1 lagi; per IP sudah 4 → berikutnya 429
      expect((await login(TEST_PASSWORD)).status).toBe(429)
    })
  })

  test('pembuatan perusahaan per pengguna dibatasi (429), tidak mengganggu pengguna lain', async () => {
    await withApp({ RATE_LIMIT_TENANT_CREATE_MAX: '2' }, async (app) => {
      const user = await registerUser(app, 'tenant-rl')
      const other = await registerUser(app, 'tenant-rl-other')
      const create = (who: typeof user, name: string) => who.api.v1.tenants.post({ name })
      expect((await create(user, 'Perusahaan Satu')).error).toBeNull()
      expect((await create(user, 'Perusahaan Dua')).error).toBeNull()
      const blocked = await create(user, 'Perusahaan Tiga')
      expect(blocked.error?.status).toBe(429)
      expect((await create(other, 'Perusahaan Lain')).error).toBeNull()
    })
  })
})
