import { Elysia, type Cookie } from 'elysia'
import type { PermissionKey } from '../../../domains/auth/permissions'
import { hasPermission } from '../../../domains/tenancy/types'
import type { ActiveSession } from '../../modules/auth/session.repository'
import type { AuthService } from '../../modules/auth/service'
import type { ApiConfig } from '../config/env'
import { AppError, errors } from '../errors/app-error'
import { requestIdOf } from '../http/request-context'
import { clearSessionCookie, readSessionCookie } from './session-cookie'

interface GuardDeps {
  config: ApiConfig
  auth: AuthService
}

/**
 * Langkah 1: autentikasi. Token dibaca dari cookie HttpOnly dan divalidasi
 * terhadap tabel sessions. ID pengguna tidak pernah diterima dari klien.
 */
async function authenticate(deps: GuardDeps, cookie: Record<string, Cookie<unknown>>): Promise<ActiveSession> {
  const token = readSessionCookie(cookie, deps.config)
  if (token === undefined || token === '') throw errors.unauthenticated()
  const session = await deps.auth.authenticate(token)
  if (!session) {
    clearSessionCookie(cookie, deps.config)
    throw errors.unauthenticated()
  }
  return session
}

/**
 * Macro otorisasi untuk route:
 *
 *   { auth: true }               → butuh sesi valid; menyediakan `session`
 *   { tenant: 'agents.read' }    → butuh sesi valid + tenant aktif + keanggotaan
 *                                  aktif + izin tertentu; menyediakan `session`
 *                                  dan `tenant` (TenantContext)
 *
 * Operasi data tenant kemudian dijalankan service melalui
 * `withTenantTransaction(tenant, ...)` sehingga RLS PostgreSQL berlaku.
 */
export function guardPlugin(deps: GuardDeps) {
  return new Elysia().macro({
    auth: {
      async resolve({ cookie }) {
        return { session: await authenticate(deps, cookie) }
      },
    },
    tenant: (permission: PermissionKey) => ({
      async resolve({ cookie, request }) {
        const session = await authenticate(deps, cookie)
        if (!session.activeTenantId) {
          throw new AppError(403, 'TENANT_NOT_SELECTED', 'Pilih perusahaan terlebih dahulu.')
        }
        const tenant = await deps.auth.activeTenantFor(session, requestIdOf(request))
        if (!tenant) {
          throw new AppError(403, 'TENANT_ACCESS_DENIED', 'Anda tidak lagi memiliki akses ke perusahaan ini.')
        }
        if (!hasPermission(tenant, permission)) {
          throw new AppError(403, 'PERMISSION_DENIED', 'Peran Anda tidak memiliki izin untuk tindakan ini.', {
            required: permission,
          })
        }
        return { session, tenant }
      },
    }),
  })
}
