import { openapi } from '@elysia/openapi'
import { Elysia } from 'elysia'
import type { ApiDependencies } from './container'
import { createReadinessGate, type ReadinessGate } from './core/database/readiness'
import { httpPlugin } from './core/http/http-plugin'
import { agentRoutes } from './modules/agents/routes'
import { authRoutes } from './modules/auth/routes'
import { healthRoutes } from './modules/health/routes'
import { membershipRoutes } from './modules/memberships/routes'
import { realtimeRoutes } from './modules/realtime/routes'
import { tenantRoutes } from './modules/tenants/routes'

const API_DESCRIPTION = `
API Agentic AI Virtual Office (Phase 1).

**Autentikasi** — sesi berbasis cookie HttpOnly. Panggil \`POST /v1/auth/login\`; browser menyimpan cookie
sesi secara otomatis. Token tidak pernah tersedia untuk JavaScript.

**Tenant** — tenant aktif disimpan pada sesi dan dipilih melalui \`POST /v1/tenants/{id}/switch\`. Setiap
request tenant-scoped memverifikasi ulang keanggotaan aktif dan izin di database, lalu menjalankan query di
dalam transaksi dengan konteks RLS PostgreSQL.

**CSRF** — request mutasi dari browser wajib same-origin (diperiksa via \`Sec-Fetch-Site\`/\`Origin\`).

**Error** — semua error berbentuk \`{ code, message, requestId?, details? }\`.
`.trim()

/**
 * Merakit aplikasi Elysia. Fungsi ini tidak bergantung pada Nuxt/Nitro dan
 * tidak memanggil `.listen()`, sehingga dapat di-mount oleh nuxt-elysia
 * (lihat `api/index.ts`) maupun dijalankan mandiri (lihat `api/standalone.ts`).
 */
export function createApi(deps: ApiDependencies, options: { readiness?: ReadinessGate } = {}) {
  const { config, services } = deps
  const guarded = { config, auth: services.auth }
  // Gerbang kesiapan dibuat sekali per aplikasi; verifikasi pertama dimulai di sini.
  const readiness = options.readiness ?? createReadinessGate(deps)

  const v1 = new Elysia({ prefix: '/v1' })
    .use(healthRoutes({ readiness }))
    .use(authRoutes(guarded))
    .use(tenantRoutes({ ...guarded, tenants: services.tenants, memberships: services.memberships }))
    .use(membershipRoutes({ ...guarded, memberships: services.memberships }))
    .use(agentRoutes({ ...guarded, agents: services.agents }))
    .use(realtimeRoutes(guarded))

  return new Elysia()
    .use(httpPlugin({ ...deps, waitUntilReady: readiness.waitUntilReady }))
    .use(
      openapi({
        enabled: config.openapi.enabled,
        path: '/openapi',
        documentation: {
          info: { title: 'Agentic AI Virtual Office API', version: '0.1.0', description: API_DESCRIPTION },
          servers: [{ url: '/api', description: 'API ter-mount di Nuxt melalui nuxt-elysia' }],
          tags: [
            { name: 'System', description: 'Health check' },
            { name: 'Auth', description: 'Registrasi, login, logout, dan sesi' },
            { name: 'Tenants', description: 'Perusahaan, keanggotaan, dan pemilihan tenant' },
            { name: 'Agents', description: 'AI digital employee (tenant-scoped)' },
            { name: 'Realtime', description: 'Server-Sent Events' },
          ],
          components: {
            securitySchemes: {
              sessionCookie: {
                type: 'apiKey',
                in: 'cookie',
                name: config.session.cookieName,
                description: 'Cookie sesi HttpOnly yang di-set oleh /v1/auth/login atau /v1/auth/register.',
              },
            },
          },
        },
      }),
    )
    .use(v1)
}

export type Api = ReturnType<typeof createApi>
