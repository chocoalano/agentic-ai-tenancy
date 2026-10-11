import type { TaskPriority, TaskStatus } from '../../../domains/tasks/types'
import type { TenantScope } from '../../core/database/transactions'

export interface TaskRecord {
  id: string
  tenantId: string
  agentId: string
  createdByUserId: string | null
  title: string
  instruction: string
  priority: TaskPriority
  status: TaskStatus
  requiresApproval: boolean
  idempotencyKey: string | null
  latestRunId: string | null
  attempts: number
  maxAttempts: number
  errorCode: string | null
  errorMessage: string | null
  version: number
  createdAt: Date
  updatedAt: Date
  queuedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
}

interface TaskRow {
  id: string
  tenant_id: string
  agent_id: string
  created_by_user_id: string | null
  title: string
  instruction: string
  priority: TaskPriority
  status: TaskStatus
  requires_approval: boolean
  idempotency_key: string | null
  latest_run_id: string | null
  attempts: number
  max_attempts: number
  error_code: string | null
  error_message: string | null
  version: number
  created_at: Date
  updated_at: Date
  queued_at: Date | null
  started_at: Date | null
  completed_at: Date | null
}

function toRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    instruction: row.instruction,
    priority: row.priority,
    status: row.status,
    requiresApproval: row.requires_approval,
    idempotencyKey: row.idempotency_key,
    latestRunId: row.latest_run_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

const COLUMNS = `id, tenant_id, agent_id, created_by_user_id, title, instruction, priority, status, requires_approval,
  idempotency_key, latest_run_id, attempts, max_attempts, error_code, error_message, version, created_at, updated_at,
  queued_at, started_at, completed_at`

/**
 * Repository tugas. Semua fungsi menerima scope tenant (transaksi pengguna
 * atau worker). Filter `tenant_id` eksplisit = defense-in-depth; isolasi utama
 * adalah RLS. Transisi status memakai compare-and-swap (`status = any(from)`)
 * sehingga state terminal tidak pernah ditimpa oleh event yang terlambat.
 */
export const tasksRepository = {
  async create(
    scope: TenantScope,
    input: {
      agentId: string
      createdByUserId: string
      title: string
      instruction: string
      priority: TaskPriority
      requiresApproval: boolean
      idempotencyKey: string | null
      maxAttempts: number
    },
  ): Promise<{ task: TaskRecord; created: boolean }> {
    const [row] = await scope.sql<TaskRow[]>`
      insert into agent_tasks (tenant_id, agent_id, created_by_user_id, title, instruction, priority, status,
                               requires_approval, idempotency_key, max_attempts)
      values (${scope.tenantId}, ${input.agentId}, ${input.createdByUserId}, ${input.title}, ${input.instruction},
              ${input.priority}, 'created', ${input.requiresApproval}, ${input.idempotencyKey}, ${input.maxAttempts})
      on conflict (tenant_id, created_by_user_id, idempotency_key) do nothing
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    if (row) return { task: toRecord(row), created: true }
    if (!input.idempotencyKey) throw new Error('Insert agent_tasks tidak mengembalikan baris')
    const existing = await tasksRepository.findByIdempotencyKey(scope, input.createdByUserId, input.idempotencyKey)
    if (!existing) throw new Error('Tugas idempoten tidak ditemukan setelah konflik')
    return { task: existing, created: false }
  },

  async findByIdempotencyKey(scope: TenantScope, userId: string, key: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_tasks
      where tenant_id = ${scope.tenantId} and created_by_user_id = ${userId} and idempotency_key = ${key}
    `
    return row ? toRecord(row) : null
  },

  async findById(scope: TenantScope, id: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_tasks where id = ${id} and tenant_id = ${scope.tenantId}
    `
    return row ? toRecord(row) : null
  },

  /** Kunci baris tugas untuk transisi yang bergantung pada state saat ini (dalam transaksi). */
  async lockById(scope: TenantScope, id: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_tasks
      where id = ${id} and tenant_id = ${scope.tenantId}
      for update
    `
    return row ? toRecord(row) : null
  },

  async list(
    scope: TenantScope,
    filter: { agentId?: string; status?: TaskStatus; limit: number },
  ): Promise<TaskRecord[]> {
    const limit = Math.max(1, Math.min(filter.limit, 100))
    const rows = await scope.sql<TaskRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_tasks
      where tenant_id = ${scope.tenantId}
        and (${filter.agentId ?? null}::uuid is null or agent_id = ${filter.agentId ?? null}::uuid)
        and (${filter.status ?? null}::text is null or status = ${filter.status ?? null}::text)
      order by created_at desc, id desc
      limit ${limit}
    `
    return rows.map(toRecord)
  },

  /** Tugas → queued dengan run terbaru (percobaan ke-n). */
  async markQueued(
    scope: TenantScope,
    input: { id: string; runId: string; attempts: number },
  ): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      update agent_tasks
      set status = 'queued', latest_run_id = ${input.runId}, attempts = ${input.attempts},
          queued_at = coalesce(queued_at, now()), error_code = null, error_message = null, version = version + 1
      where id = ${input.id} and tenant_id = ${scope.tenantId} and status in ('created', 'queued', 'running')
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  async markRunning(scope: TenantScope, id: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      update agent_tasks
      set status = 'running', started_at = coalesce(started_at, now()), version = version + 1
      where id = ${id} and tenant_id = ${scope.tenantId} and status = 'queued'
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  async markWaitingApproval(scope: TenantScope, id: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      update agent_tasks set status = 'waiting_approval', version = version + 1
      where id = ${id} and tenant_id = ${scope.tenantId} and status = 'running'
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  async markCompleted(scope: TenantScope, id: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      update agent_tasks
      set status = 'completed', completed_at = now(), error_code = null, error_message = null, version = version + 1
      where id = ${id} and tenant_id = ${scope.tenantId} and status in ('running', 'waiting_approval')
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  async markFailed(
    scope: TenantScope,
    input: { id: string; errorCode: string; errorMessage: string },
  ): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      update agent_tasks
      set status = 'failed', completed_at = now(), error_code = ${input.errorCode}, error_message = ${input.errorMessage},
          version = version + 1
      where id = ${input.id} and tenant_id = ${scope.tenantId}
        and status in ('created', 'queued', 'running', 'waiting_approval')
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  async markCanceled(scope: TenantScope, id: string): Promise<TaskRecord | null> {
    const [row] = await scope.sql<TaskRow[]>`
      update agent_tasks
      set status = 'canceled', completed_at = now(), error_code = 'CANCELED', error_message = 'Dibatalkan oleh pengguna.',
          version = version + 1
      where id = ${id} and tenant_id = ${scope.tenantId}
        and status in ('created', 'queued', 'running', 'waiting_approval')
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  /** Jumlah tugas tenant yang belum terminal (pengaman kapasitas). */
  async countActive(scope: TenantScope): Promise<number> {
    const [row] = await scope.sql<{ count: number | string }[]>`
      select count(*) as count from agent_tasks
      where tenant_id = ${scope.tenantId} and status in ('created', 'queued', 'running', 'waiting_approval')
    `
    return Number(row?.count ?? 0)
  },

  async countCreatedSince(scope: TenantScope, since: Date): Promise<number> {
    const [row] = await scope.sql<{ count: number | string }[]>`
      select count(*) as count from agent_tasks where tenant_id = ${scope.tenantId} and created_at >= ${since}
    `
    return Number(row?.count ?? 0)
  },
}
