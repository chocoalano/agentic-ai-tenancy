import type { SQL } from 'bun'
import type { ApiConfig } from './core/config/env'
import { createDatabasePool } from './core/database/client'
import { normalizeDatabaseError } from './core/database/errors'
import { AppError } from './core/errors/app-error'
import { describeRuntimeRoleProblems, inspectRuntimeRole } from './core/database/safety'
import { createLogger, type Logger } from './core/http/logger'
import { createInMemoryLoginThrottle } from './core/security/login-throttle'
import { createAgentService } from './modules/agents/service'
import { createAuthService } from './modules/auth/service'
import { createMembershipService } from './modules/memberships/service'
import { createTenantService } from './modules/tenants/service'

export interface ApiDependencies {
  config: ApiConfig
  sql: SQL
  logger: Logger
  services: {
    auth: ReturnType<typeof createAuthService>
    tenants: ReturnType<typeof createTenantService>
    memberships: ReturnType<typeof createMembershipService>
    agents: ReturnType<typeof createAgentService>
  }
}

/** Komposisi dependensi backend (manual DI, tanpa framework). */
export function createDependencies(options: { config: ApiConfig; sql?: SQL; logger?: Logger }): ApiDependencies {
  const { config } = options
  const sql = options.sql ?? createDatabasePool(config.database)
  const logger = options.logger ?? createLogger({ json: config.isProduction, silent: config.nodeEnv === 'test' })
  const throttle = createInMemoryLoginThrottle({
    maxFailures: config.security.loginMaxFailures,
    windowMs: config.security.loginWindowMinutes * 60_000,
  })

  return {
    config,
    sql,
    logger,
    services: {
      auth: createAuthService({ sql, config, throttle }),
      tenants: createTenantService({ sql }),
      memberships: createMembershipService({ sql }),
      agents: createAgentService({ sql }),
    },
  }
}

/**
 * Menolak start bila role database runtime dapat melewati RLS
 * (superuser, BYPASSRLS, pemilik tabel) atau RLS belum dipaksa.
 * Bila database belum dapat dihubungi, pemeriksaan ditunda ke health check.
 */
export async function verifyDatabaseOnStartup(deps: Pick<ApiDependencies, 'sql' | 'logger'>): Promise<void> {
  let problems: string[]
  try {
    problems = describeRuntimeRoleProblems(await inspectRuntimeRole(deps.sql))
  } catch (error) {
    // Hanya error konektivitas yang boleh ditunda; error lain (query/izin) menggagalkan startup.
    if (normalizeDatabaseError(error)?.code !== 'DATABASE_UNAVAILABLE') throw error
    deps.logger.warn('Database belum dapat dihubungi saat startup; pemeriksaan role ditunda ke /api/v1/health', {
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }
  if (problems.length > 0) {
    throw new Error(`Konfigurasi database tidak aman untuk multi-tenancy:\n- ${problems.join('\n- ')}`)
  }
}

/**
 * Gerbang kesiapan untuk mode mount (nuxt-elysia).
 *
 * Nitro 2 tidak menunggu plugin async, sehingga factory nuxt-elysia harus
 * sinkron agar aplikasi Elysia terdaftar sebelum request pertama. Verifikasi
 * role database tetap dijalankan sekali saat start; setiap request API
 * menunggu hasilnya. Bila role tidak aman, semua request API ditolak 503
 * (fail-closed) dan error dicatat — data tenant tidak pernah dilayani.
 */
export function createReadinessGate(deps: Pick<ApiDependencies, 'sql' | 'logger'>): () => Promise<void> {
  const verification = verifyDatabaseOnStartup(deps).then(
    () => null,
    (error: unknown) => {
      deps.logger.error('API ditahan: verifikasi database gagal', {
        error: error instanceof Error ? error.message : String(error),
      })
      return error
    },
  )
  return async () => {
    if ((await verification) !== null) {
      throw new AppError(503, 'SERVICE_MISCONFIGURED', 'Layanan belum siap. Hubungi administrator.')
    }
  }
}
