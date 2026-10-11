import type { SQL } from 'bun'
import { runtimeStatusOfRun } from '../../../domains/tasks/types'
import type { TenantContext } from '../../../domains/tenancy/types'
import { withTenantTransaction } from '../../core/database/transactions'
import { errors } from '../../core/errors/app-error'
import { runsRepository } from '../runs/repository'
import { agentsRepository, type AgentDetail, type AgentSummary } from './repository'

export type AgentRuntimeView = {
  /** Status runtime otoritatif dari run aktif terbaru; null bila tidak ada run aktif. */
  runtimeStatus: 'thinking' | 'working' | 'waiting_approval' | null
  currentTaskId: string | null
  currentRunId: string | null
}

export type AgentSummaryWithRuntime = AgentSummary & AgentRuntimeView
export type AgentDetailWithRuntime = AgentDetail & AgentRuntimeView

/**
 * Layanan Agent Instance. Status runtime diturunkan dari run yang sedang
 * aktif (queued/claimed/running/waiting_approval) — bukan dari timer frontend.
 */
export function createAgentService(deps: { sql: SQL }) {
  return {
    list(context: TenantContext): Promise<AgentSummaryWithRuntime[]> {
      return withTenantTransaction(deps.sql, context, async (scope) => {
        const agents = await agentsRepository.list(scope)
        const active = await runsRepository.activeByAgent(
          scope,
          agents.map((agent) => agent.id),
        )
        return agents.map((agent) => {
          const run = active.get(agent.id) ?? null
          return {
            ...agent,
            runtimeStatus: runtimeStatusOfRun(run?.status ?? null),
            currentTaskId: run?.taskId ?? null,
            currentRunId: run?.runId ?? null,
          }
        })
      })
    },

    async get(context: TenantContext, agentId: string): Promise<AgentDetailWithRuntime> {
      const result = await withTenantTransaction(deps.sql, context, async (scope) => {
        const agent = await agentsRepository.findById(scope, agentId)
        if (!agent) return null
        const run = (await runsRepository.activeByAgent(scope, [agent.id])).get(agent.id) ?? null
        return {
          ...agent,
          runtimeStatus: runtimeStatusOfRun(run?.status ?? null),
          currentTaskId: run?.taskId ?? null,
          currentRunId: run?.runId ?? null,
        }
      })
      if (!result) throw errors.notFound('AGENT_NOT_FOUND', 'AI employee tidak ditemukan.')
      return result
    },
  }
}

export type AgentService = ReturnType<typeof createAgentService>
