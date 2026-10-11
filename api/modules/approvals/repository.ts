import type { ApprovalActionType, ApprovalStatus } from '../../../domains/tasks/types'
import type { TenantScope } from '../../core/database/transactions'

export interface ApprovalRecord {
  id: string
  tenantId: string
  taskId: string
  runId: string
  agentId: string
  actionType: ApprovalActionType
  actionSummary: string
  status: ApprovalStatus
  requestedBy: string
  requestedAt: Date
  expiresAt: Date
  decidedByUserId: string | null
  decidedAt: Date | null
  decisionNote: string | null
  version: number
  updatedAt: Date
}

interface ApprovalRow {
  id: string
  tenant_id: string
  task_id: string
  run_id: string
  agent_id: string
  action_type: ApprovalActionType
  action_summary: string
  status: ApprovalStatus
  requested_by: string
  requested_at: Date
  expires_at: Date
  decided_by_user_id: string | null
  decided_at: Date | null
  decision_note: string | null
  version: number
  updated_at: Date
}

function toRecord(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    taskId: row.task_id,
    runId: row.run_id,
    agentId: row.agent_id,
    actionType: row.action_type,
    actionSummary: row.action_summary,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    decidedByUserId: row.decided_by_user_id,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

const COLUMNS = `id, tenant_id, task_id, run_id, agent_id, action_type, action_summary, status, requested_by,
  requested_at, expires_at, decided_by_user_id, decided_at, decision_note, version, updated_at`

export const approvalsRepository = {
  async create(
    scope: TenantScope,
    input: {
      taskId: string
      runId: string
      agentId: string
      actionType: ApprovalActionType
      actionSummary: string
      expiresAt: Date
    },
  ): Promise<ApprovalRecord> {
    const [row] = await scope.sql<ApprovalRow[]>`
      insert into agent_approvals (tenant_id, task_id, run_id, agent_id, action_type, action_summary, status, expires_at)
      values (${scope.tenantId}, ${input.taskId}, ${input.runId}, ${input.agentId}, ${input.actionType},
              ${input.actionSummary}, 'pending', ${input.expiresAt})
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    if (!row) throw new Error('Insert agent_approvals tidak mengembalikan baris')
    return toRecord(row)
  },

  async findById(scope: TenantScope, id: string): Promise<ApprovalRecord | null> {
    const [row] = await scope.sql<ApprovalRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_approvals where id = ${id} and tenant_id = ${scope.tenantId}
    `
    return row ? toRecord(row) : null
  },

  async lockById(scope: TenantScope, id: string): Promise<ApprovalRecord | null> {
    const [row] = await scope.sql<ApprovalRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_approvals
      where id = ${id} and tenant_id = ${scope.tenantId}
      for update
    `
    return row ? toRecord(row) : null
  },

  async list(scope: TenantScope, filter: { status?: ApprovalStatus; limit: number }): Promise<ApprovalRecord[]> {
    const limit = Math.max(1, Math.min(filter.limit, 100))
    const rows = await scope.sql<ApprovalRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_approvals
      where tenant_id = ${scope.tenantId}
        and (${filter.status ?? null}::text is null or status = ${filter.status ?? null}::text)
      order by requested_at desc, id desc
      limit ${limit}
    `
    return rows.map(toRecord)
  },

  async findPendingForRun(scope: TenantScope, runId: string): Promise<ApprovalRecord | null> {
    const [row] = await scope.sql<ApprovalRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_approvals
      where run_id = ${runId} and tenant_id = ${scope.tenantId} and status = 'pending'
    `
    return row ? toRecord(row) : null
  },

  /** pending → approved/rejected (compare-and-swap; keputusan ganda tidak mungkin). */
  async decide(
    scope: TenantScope,
    input: { id: string; status: 'approved' | 'rejected'; userId: string; note: string | null },
  ): Promise<ApprovalRecord | null> {
    const [row] = await scope.sql<ApprovalRow[]>`
      update agent_approvals
      set status = ${input.status}, decided_by_user_id = ${input.userId}, decided_at = now(),
          decision_note = ${input.note}, version = version + 1
      where id = ${input.id} and tenant_id = ${scope.tenantId} and status = 'pending'
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  /** pending → expired/canceled oleh sistem. */
  async close(
    scope: TenantScope,
    input: { id: string; status: 'expired' | 'canceled' },
  ): Promise<ApprovalRecord | null> {
    const [row] = await scope.sql<ApprovalRow[]>`
      update agent_approvals set status = ${input.status}, version = version + 1
      where id = ${input.id} and tenant_id = ${scope.tenantId} and status = 'pending'
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },
}
