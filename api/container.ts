import type { SQL } from 'bun'
import type { ApiConfig } from './core/config/env'
import { createDatabasePool } from './core/database/client'
import { createLogger, type Logger } from './core/http/logger'
import { createAgentRuntime, type AgentRuntime } from './core/runtime'
import { createRateLimiter, type RateLimiter } from './core/security/rate-limiter'
import { createAgentService } from './modules/agents/service'
import { createApprovalService } from './modules/approvals/service'
import { createAuthService } from './modules/auth/service'
import { createMembershipService } from './modules/memberships/service'
import { createRealtimeHub, type RealtimeHub } from './modules/realtime/hub'
import { createRunService } from './modules/runs/service'
import { createTaskService } from './modules/tasks/service'
import { createTenantService } from './modules/tenants/service'

export { createReadinessGate, type ReadinessGate, type ReadinessState } from './core/database/readiness'

export interface ApiDependencies {
  config: ApiConfig
  sql: SQL
  logger: Logger
  /** Pembatas laju in-memory (per proses; antarmuka siap diganti Valkey). */
  limits: {
    loginEmail: RateLimiter
    loginIp: RateLimiter
    registerIp: RateLimiter
    tenantCreate: RateLimiter
    taskCreate: RateLimiter
  }
  /** Adapter AI Runtime terpilih (kredensial hanya di proses server). */
  runtime: AgentRuntime
  /** Hub dispatch outbox → koneksi SSE (per proses). */
  realtimeHub: RealtimeHub
  services: {
    auth: ReturnType<typeof createAuthService>
    tenants: ReturnType<typeof createTenantService>
    memberships: ReturnType<typeof createMembershipService>
    agents: ReturnType<typeof createAgentService>
    tasks: ReturnType<typeof createTaskService>
    runs: ReturnType<typeof createRunService>
    approvals: ReturnType<typeof createApprovalService>
  }
}

/** Komposisi dependensi backend (manual DI, tanpa framework). */
export function createDependencies(options: {
  config: ApiConfig
  sql?: SQL
  logger?: Logger
  runtime?: AgentRuntime
  /** `fetch` kustom untuk adapter provider (test). */
  fetch?: typeof fetch
}): ApiDependencies {
  const { config } = options
  const sql = options.sql ?? createDatabasePool(config.database)
  const logger = options.logger ?? createLogger({ json: config.isProduction, silent: config.nodeEnv === 'test' })
  const { rateLimit } = config.security
  const minutes = (value: number) => value * 60_000
  const limits: ApiDependencies['limits'] = {
    loginEmail: createRateLimiter({
      max: config.security.loginMaxFailures,
      windowMs: minutes(config.security.loginWindowMinutes),
    }),
    loginIp: createRateLimiter({
      max: rateLimit.loginPerIp.max,
      windowMs: minutes(rateLimit.loginPerIp.windowMinutes),
    }),
    registerIp: createRateLimiter({
      max: rateLimit.registerPerIp.max,
      windowMs: minutes(rateLimit.registerPerIp.windowMinutes),
    }),
    tenantCreate: createRateLimiter({
      max: rateLimit.tenantCreatePerUser.max,
      windowMs: minutes(rateLimit.tenantCreatePerUser.windowMinutes),
    }),
    taskCreate: createRateLimiter({
      max: rateLimit.taskCreatePerUser.max,
      windowMs: minutes(rateLimit.taskCreatePerUser.windowMinutes),
    }),
  }
  const runtime = options.runtime ?? createAgentRuntime(config.ai, { fetch: options.fetch })
  const realtimeHub = createRealtimeHub({ sql, pollMs: config.realtime.outboxPollMs, logger })

  return {
    config,
    sql,
    logger,
    limits,
    runtime,
    realtimeHub,
    services: {
      auth: createAuthService({ sql, config, limits }),
      tenants: createTenantService({ sql }),
      memberships: createMembershipService({ sql }),
      agents: createAgentService({ sql }),
      tasks: createTaskService({ sql, config, runtime, limits: { taskCreate: limits.taskCreate } }),
      runs: createRunService({ sql }),
      approvals: createApprovalService({ sql, config }),
    },
  }
}
