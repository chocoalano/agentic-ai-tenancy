import { Elysia, type Cookie } from 'elysia'
import type { PermissionKey } from '../../../domains/auth/permissions'
import { ACTIVE_TENANT_HEADER, TENANT_ID_HEADER, TENANT_MISMATCH_CODE } from '../../../domains/tenancy/headers'
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
 * Header opsional dari klien yang menyatakan tenant yang DIKIRA aktif oleh tab
 * tersebut. Bukan sumber identitas (identitas tetap dari cookie); hanya
 * pemeriksaan konsistensi: bila berbeda dari tenant aktif di sesi server
 * (mis. tab lain sudah berganti tenant), request ditolak 409 sehingga data
 * tenant lain tidak pernah masuk ke cache tab yang usang.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertClientTenantMatches(request: Request, activeTenantId: string) {
  const claimed = request.headers.get(ACTIVE_TENANT_HEADER)
  if (claimed === null || claimed === '') return
  if (!UUID_PATTERN.test(claimed) || claimed.toLowerCase() !== activeTenantId.toLowerCase()) {
    throw new AppError(409, TENANT_MISMATCH_CODE, 'Perusahaan aktif telah berubah. Muat ulang halaman.', {
      activeTenantId,
    })
  }
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
      async resolve({ cookie, request, set }) {
        const session = await authenticate(deps, cookie)
        if (!session.activeTenantId) {
          throw new AppError(403, 'TENANT_NOT_SELECTED', 'Pilih perusahaan terlebih dahulu.')
        }
        assertClientTenantMatches(request, session.activeTenantId)
        const tenant = await deps.auth.activeTenantFor(session, requestIdOf(request))
        if (!tenant) {
          throw new AppError(403, 'TENANT_ACCESS_DENIED', 'Anda tidak lagi memiliki akses ke perusahaan ini.')
        }
        if (!hasPermission(tenant, permission)) {
          throw new AppError(403, 'PERMISSION_DENIED', 'Peran Anda tidak memiliki izin untuk tindakan ini.', {
            required: permission,
          })
        }
        set.headers[TENANT_ID_HEADER] = tenant.tenantId
        return { session, tenant }
      },
    }),
  })
}
