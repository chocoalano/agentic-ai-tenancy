import type { SQL } from 'bun'
import type { TenantContext } from '../../../domains/tenancy/types'
import { withTenantTransaction } from '../../core/database/transactions'
import { errors } from '../../core/errors/app-error'
import { agentsRepository, type AgentDetail, type AgentSummary } from './repository'

/**
 * Layanan Agent Instance (read-only pada Phase 1). Titik ekstensi berikutnya:
 * pembuatan agent dari Robot License, konfigurasi instruksi, dan delegasi ke
 * Agent Orchestrator melalui AI Runtime Interface.
 */
export function createAgentService(deps: { sql: SQL }) {
  return {
    list(context: TenantContext): Promise<AgentSummary[]> {
      return withTenantTransaction(deps.sql, context, (scope) => agentsRepository.list(scope))
    },

    async get(context: TenantContext, agentId: string): Promise<AgentDetail> {
      const agent = await withTenantTransaction(deps.sql, context, (scope) => agentsRepository.findById(scope, agentId))
      if (!agent) throw errors.notFound('AGENT_NOT_FOUND', 'AI employee tidak ditemukan.')
      return agent
    },
  }
}

export type AgentService = ReturnType<typeof createAgentService>
