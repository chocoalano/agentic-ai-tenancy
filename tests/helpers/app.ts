import { randomUUID } from 'node:crypto'
import { treaty } from '@elysiajs/eden'
import { SQL } from 'bun'
import { createApi } from '../../api/app'
import { createDependencies } from '../../api/container'
import { withTenantTransaction } from '../../api/core/database/transactions'
import { resolveTenantContext } from '../../api/core/tenancy/resolve-context'
import type { AgentLifecycleStatus } from '../../domains/agents/types'
import type { TenantContext } from '../../domains/tenancy/types'
import { testConfig, testDatabaseUrls } from './env'

export const TEST_HOST = 'localhost:3000'
export const TEST_ORIGIN = `http://${TEST_HOST}`
export const TEST_PASSWORD = 'correct-horse-battery-staple'

export function createTestApp(configOverrides: Record<string, string> = {}) {
  const config = testConfig(configOverrides)
  const sql = new SQL({ url: testDatabaseUrls().app, max: config.database.poolMax })
  const deps = createDependencies({ config, sql })
  const app = createApi(deps)
  return { app, deps, sql, config, close: () => sql.close() }
}

export type TestApp = ReturnType<typeof createTestApp>

/**
 * Sesi pengguna untuk test: klien Eden Treaty yang terikat langsung ke
 * instance Elysia (tanpa jaringan) dengan cookie jar. Respons bertipe penuh
 * hasil inferensi dari aplikasi, sama seperti `$api` di Nuxt.
 */
export function createSession(app: TestApp) {
  const jar = { cookie: '' }
  const api = treaty(app.app, {
    headers: () => (jar.cookie ? { cookie: jar.cookie, host: TEST_HOST } : { host: TEST_HOST }),
    onResponse: (response) => {
      const setCookie = response.headers.get('set-cookie')
      const name = `${app.config.session.cookieName}=`
      if (setCookie?.startsWith(name)) {
        const pair = setCookie.split(';')[0] ?? ''
        jar.cookie = pair === name ? '' : pair
      }
    },
  })
  return { api, jar }
}

export type TestSession = ReturnType<typeof createSession>

/** Request mentah untuk pengujian header, cookie, dan CSRF. */
export async function rawRequest(
  app: TestApp,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { host: TEST_HOST, ...options.headers }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const response = await app.app.handle(
    new Request(`${TEST_ORIGIN}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  )
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // bukan JSON
  }
  return { status: response.status, headers: response.headers, body, text }
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}+${randomUUID().slice(0, 8)}@test.local`
}

/** Registrasi lewat endpoint publik (alur nyata), opsional membuat perusahaan. */
export async function registerUser(app: TestApp, prefix: string, companyName?: string) {
  const session = createSession(app)
  const email = uniqueEmail(prefix)
  const { data, error } = await session.api.v1.auth.register.post({
    email,
    password: TEST_PASSWORD,
    displayName: prefix,
    ...(companyName ? { companyName } : {}),
  })
  if (error) throw new Error(`Registrasi gagal: ${error.status}`)
  return { ...session, email, userId: data.user.id, tenantId: data.activeTenantId }
}

export type RegisteredUser = Awaited<ReturnType<typeof registerUser>>

/** Registrasi + perusahaan; memastikan tenantId tidak null. */
export async function registerOwner(app: TestApp, prefix: string, companyName: string) {
  const user = await registerUser(app, prefix, companyName)
  if (!user.tenantId) throw new Error('Tenant tidak dibuat saat registrasi')
  return { ...user, tenantId: user.tenantId }
}

export async function ownerContext(app: TestApp, userId: string, tenantId: string): Promise<TenantContext> {
  const context = await resolveTenantContext(app.sql, { userId, tenantId, requestId: 'test' })
  if (!context) throw new Error('Konteks owner tidak ditemukan')
  return context
}

export async function addAgents(
  app: TestApp,
  context: TenantContext,
  agents: { name: string; lifecycleStatus?: AgentLifecycleStatus }[],
): Promise<string[]> {
  return withTenantTransaction(app.sql, context, async ({ sql }) => {
    const ids: string[] = []
    for (const agent of agents) {
      const [row] = await sql<{ id: string }[]>`
        insert into agents (tenant_id, slug, name, role_key, role_title, lifecycle_status, created_by_user_id)
        values (${context.tenantId}, ${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}, ${agent.name},
                'test-role', 'Test Role', ${agent.lifecycleStatus ?? 'active'}, ${context.userId})
        returning id
      `
      if (row) ids.push(row.id)
    }
    return ids
  })
}

/** Menambahkan anggota ke tenant (sebagai owner, di bawah RLS). `roleKey: null` = tanpa peran. */
export async function addMember(app: TestApp, context: TenantContext, userId: string, roleKey: string | null) {
  return withTenantTransaction(app.sql, context, async ({ sql }) => {
    const [membership] = await sql<{ id: string }[]>`
      insert into tenant_memberships (tenant_id, user_id, status) values (${context.tenantId}, ${userId}, 'active')
      returning id
    `
    if (!membership) throw new Error('Insert keanggotaan gagal')
    if (roleKey) {
      await sql`
        insert into membership_roles (membership_id, tenant_id, role_id)
        select ${membership.id}, ${context.tenantId}, id from roles where tenant_id is null and key = ${roleKey}
      `
    }
    return membership.id
  })
}
