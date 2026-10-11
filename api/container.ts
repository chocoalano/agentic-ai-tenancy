import type { SQL } from 'bun'
import type { ApiConfig } from './core/config/env'
import { createDatabasePool } from './core/database/client'
import { createLogger, type Logger } from './core/http/logger'
import { createInMemoryLoginThrottle } from './core/security/login-throttle'
import { createAgentService } from './modules/agents/service'
import { createAuthService } from './modules/auth/service'
import { createMembershipService } from './modules/memberships/service'
import { createTenantService } from './modules/tenants/service'

export { createReadinessGate, type ReadinessGate, type ReadinessState } from './core/database/readiness'

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
