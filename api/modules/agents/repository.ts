import type { AgentLifecycleStatus } from '../../../domains/agents/types'
import type { TenantTransaction } from '../../core/database/transactions'

export interface AgentSummary {
  id: string
  slug: string
  name: string
  roleKey: string
  roleTitle: string
  description: string
  lifecycleStatus: AgentLifecycleStatus
  isSeedData: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AgentDetail extends AgentSummary {
  mainInstruction: string
}

interface AgentRow {
  id: string
  slug: string
  name: string
  role_key: string
  role_title: string
  description: string
  lifecycle_status: AgentLifecycleStatus
  is_seed_data: boolean
  created_at: Date
  updated_at: Date
}

interface AgentDetailRow extends AgentRow {
  main_instruction: string
}

function toAgentSummary(row: AgentRow): AgentSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    roleKey: row.role_key,
    roleTitle: row.role_title,
    description: row.description,
    lifecycleStatus: row.lifecycle_status,
    isSeedData: row.is_seed_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Repository Agent Instance. Semua fungsi menerima `TenantTransaction`, sehingga
 * hanya dapat dipanggil di dalam `withTenantTransaction`. Filter tenant_id
 * eksplisit di query bersifat defense-in-depth; isolasi utama adalah RLS.
 */
export const agentsRepository = {
  async list(scope: TenantTransaction): Promise<AgentSummary[]> {
    const rows = await scope.sql<AgentRow[]>`
      select id, slug, name, role_key, role_title, description, lifecycle_status, is_seed_data, created_at, updated_at
      from agents
      where tenant_id = ${scope.context.tenantId}
        and lifecycle_status <> 'archived'
      order by name
    `
    return rows.map(toAgentSummary)
  },

  async findById(scope: TenantTransaction, agentId: string): Promise<AgentDetail | null> {
    const [row] = await scope.sql<AgentDetailRow[]>`
      select id, slug, name, role_key, role_title, description, main_instruction, lifecycle_status,
             is_seed_data, created_at, updated_at
      from agents
      where id = ${agentId}
        and tenant_id = ${scope.context.tenantId}
    `
    return row ? { ...toAgentSummary(row), mainInstruction: row.main_instruction } : null
  },
}
