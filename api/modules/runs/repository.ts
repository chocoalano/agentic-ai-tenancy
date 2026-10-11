import type { OutputType, RunStatus } from '../../../domains/tasks/types'
import type { TenantScope } from '../../core/database/transactions'

export interface RunRecord {
  id: string
  tenantId: string
  taskId: string
  agentId: string
  attempt: number
  status: RunStatus
  runtimeProvider: string
  runtimeModel: string
  workerId: string | null
  leaseExpiresAt: Date | null
  claimedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  cancelRequested: boolean
  errorCode: string | null
  errorMessage: string | null
  retryable: boolean | null
  providerRequestId: string | null
  usageInputTokens: number | null
  usageOutputTokens: number | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface RunEventRecord {
  id: number
  runId: string
  taskId: string
  eventType: string
  payload: Record<string, unknown>
  createdAt: Date
}

export interface RunOutputRecord {
  id: string
  runId: string
  taskId: string
  outputType: OutputType
  content: string
  released: boolean
  createdAt: Date
}

interface RunRow {
  id: string
  tenant_id: string
  task_id: string
  agent_id: string
  attempt: number
  status: RunStatus
  runtime_provider: string
  runtime_model: string
  worker_id: string | null
  lease_expires_at: Date | null
  claimed_at: Date | null
  started_at: Date | null
  completed_at: Date | null
  cancel_requested: boolean
  error_code: string | null
  error_message: string | null
  retryable: boolean | null
  provider_request_id: string | null
  usage_input_tokens: number | null
  usage_output_tokens: number | null
  version: number
  created_at: Date
  updated_at: Date
}

function toRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    attempt: row.attempt,
    status: row.status,
    runtimeProvider: row.runtime_provider,
    runtimeModel: row.runtime_model,
    workerId: row.worker_id,
    leaseExpiresAt: row.lease_expires_at,
    claimedAt: row.claimed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelRequested: row.cancel_requested,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryable: row.retryable,
    providerRequestId: row.provider_request_id,
    usageInputTokens: row.usage_input_tokens,
    usageOutputTokens: row.usage_output_tokens,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COLUMNS = `id, tenant_id, task_id, agent_id, attempt, status, runtime_provider, runtime_model, worker_id,
  lease_expires_at, claimed_at, started_at, completed_at, cancel_requested, error_code, error_message, retryable,
  provider_request_id, usage_input_tokens, usage_output_tokens, version, created_at, updated_at`

export type RunFinalStatus = 'completed' | 'failed' | 'canceled' | 'waiting_approval'

/**
 * Repository run (percobaan eksekusi), event run, dan output. Transisi status
 * memakai compare-and-swap; transisi oleh worker juga mencocokkan `worker_id`
 * sehingga worker yang lease-nya sudah diambil alih tidak dapat menulis hasil
 * ganda.
 */
export const runsRepository = {
  async create(
    scope: TenantScope,
    input: { taskId: string; agentId: string; attempt: number; provider: string; model: string },
  ): Promise<RunRecord> {
    const [row] = await scope.sql<RunRow[]>`
      insert into agent_runs (tenant_id, task_id, agent_id, attempt, status, runtime_provider, runtime_model)
      values (${scope.tenantId}, ${input.taskId}, ${input.agentId}, ${input.attempt}, 'queued', ${input.provider}, ${input.model})
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    if (!row) throw new Error('Insert agent_runs tidak mengembalikan baris')
    return toRecord(row)
  },

  async findById(scope: TenantScope, id: string): Promise<RunRecord | null> {
    const [row] = await scope.sql<RunRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_runs where id = ${id} and tenant_id = ${scope.tenantId}
    `
    return row ? toRecord(row) : null
  },

  async listForTask(scope: TenantScope, taskId: string): Promise<RunRecord[]> {
    const rows = await scope.sql<RunRow[]>`
      select ${scope.sql.unsafe(COLUMNS)} from agent_runs
      where task_id = ${taskId} and tenant_id = ${scope.tenantId}
      order by attempt
    `
    return rows.map(toRecord)
  },

  /** Run aktif terbaru per agent (untuk status runtime di daftar agent). */
  async activeByAgent(
    scope: TenantScope,
    agentIds: readonly string[],
  ): Promise<Map<string, { runId: string; taskId: string; status: RunStatus }>> {
    if (agentIds.length === 0) return new Map()
    const rows = await scope.sql<{ agent_id: string; id: string; task_id: string; status: RunStatus }[]>`
      select distinct on (agent_id) agent_id, id, task_id, status
      from agent_runs
      where tenant_id = ${scope.tenantId}
        and agent_id = any(${scope.sql.array([...agentIds], 'UUID')})
        and status in ('queued', 'claimed', 'running', 'waiting_approval')
      order by agent_id, created_at desc
    `
    return new Map(rows.map((row) => [row.agent_id, { runId: row.id, taskId: row.task_id, status: row.status }]))
  },

  /** claimed → running oleh worker pemilik lease. */
  async markRunning(scope: TenantScope, input: { id: string; workerId: string }): Promise<RunRecord | null> {
    const [row] = await scope.sql<RunRow[]>`
      update agent_runs
      set status = 'running', started_at = now(), version = version + 1
      where id = ${input.id} and tenant_id = ${scope.tenantId} and status = 'claimed' and worker_id = ${input.workerId}
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  async recordProviderRequest(scope: TenantScope, input: { id: string; providerRequestId: string | null }) {
    await scope.sql`
      update agent_runs set provider_request_id = ${input.providerRequestId}
      where id = ${input.id} and tenant_id = ${scope.tenantId}
    `
  },

  /**
   * Perpanjang lease; mengembalikan null bila lease sudah bukan milik worker ini
   * (dipulihkan/dibatalkan) — worker harus menghentikan eksekusi.
   */
  async heartbeat(
    scope: TenantScope,
    input: { id: string; workerId: string; leaseSeconds: number },
  ): Promise<{ cancelRequested: boolean } | null> {
    const [row] = await scope.sql<{ cancel_requested: boolean }[]>`
      update agent_runs
      set lease_expires_at = now() + make_interval(secs => ${input.leaseSeconds})
      where id = ${input.id} and tenant_id = ${scope.tenantId} and worker_id = ${input.workerId}
        and status in ('claimed', 'running')
      returning cancel_requested
    `
    return row ? { cancelRequested: row.cancel_requested } : null
  },

  /**
   * Finalisasi run (compare-and-swap). `workerId` wajib cocok untuk transisi
   * oleh worker; `null` untuk transisi oleh sistem/pengguna (pembatalan,
   * keputusan persetujuan, pemulihan lease).
   */
  async finish(
    scope: TenantScope,
    input: {
      id: string
      workerId: string | null
      from: readonly RunStatus[]
      to: RunFinalStatus
      errorCode?: string | null
      errorMessage?: string | null
      retryable?: boolean | null
      usageInputTokens?: number | null
      usageOutputTokens?: number | null
    },
  ): Promise<RunRecord | null> {
    const terminal = input.to !== 'waiting_approval'
    const [row] = await scope.sql<RunRow[]>`
      update agent_runs
      set status = ${input.to},
          completed_at = case when ${terminal} then now() else completed_at end,
          lease_expires_at = case when ${terminal} then null else lease_expires_at end,
          error_code = ${input.errorCode ?? null},
          error_message = ${input.errorMessage ?? null},
          retryable = ${input.retryable ?? null},
          usage_input_tokens = coalesce(${input.usageInputTokens ?? null}, usage_input_tokens),
          usage_output_tokens = coalesce(${input.usageOutputTokens ?? null}, usage_output_tokens),
          version = version + 1
      where id = ${input.id} and tenant_id = ${scope.tenantId}
        and status = any(${scope.sql.array([...input.from], 'TEXT')})
        and (${input.workerId ?? null}::text is null or worker_id = ${input.workerId ?? null}::text)
      returning ${scope.sql.unsafe(COLUMNS)}
    `
    return row ? toRecord(row) : null
  },

  /** Minta pembatalan run yang sedang diklaim/berjalan (worker menghentikan pada heartbeat berikutnya). */
  async requestCancel(scope: TenantScope, id: string): Promise<boolean> {
    const rows = await scope.sql`
      update agent_runs set cancel_requested = true, version = version + 1
      where id = ${id} and tenant_id = ${scope.tenantId} and status in ('claimed', 'running')
      returning id
    `
    return rows.length > 0
  },

  async appendEvent(
    scope: TenantScope,
    input: { runId: string; taskId: string; type: string; payload: Record<string, unknown> },
  ): Promise<void> {
    await scope.sql`
      insert into agent_run_events (tenant_id, run_id, task_id, event_type, payload)
      values (${scope.tenantId}, ${input.runId}, ${input.taskId}, ${input.type}, ${JSON.stringify(input.payload)}::jsonb)
    `
  },

  async listEvents(scope: TenantScope, runId: string): Promise<RunEventRecord[]> {
    const rows = await scope.sql<
      {
        id: number | string
        run_id: string
        task_id: string
        event_type: string
        payload: Record<string, unknown>
        created_at: Date
      }[]
    >`
      select id, run_id, task_id, event_type, payload, created_at from agent_run_events
      where run_id = ${runId} and tenant_id = ${scope.tenantId}
      order by id
      limit 500
    `
    return rows.map((row) => ({
      id: Number(row.id),
      runId: row.run_id,
      taskId: row.task_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at,
    }))
  },

  async saveOutput(
    scope: TenantScope,
    input: { runId: string; taskId: string; outputType: OutputType; content: string; released: boolean },
  ): Promise<RunOutputRecord> {
    const [row] = await scope.sql<
      {
        id: string
        run_id: string
        task_id: string
        output_type: OutputType
        content: string
        released: boolean
        created_at: Date
      }[]
    >`
      insert into agent_run_outputs (tenant_id, run_id, task_id, output_type, content, released)
      values (${scope.tenantId}, ${input.runId}, ${input.taskId}, ${input.outputType}, ${input.content}, ${input.released})
      on conflict (run_id) do nothing
      returning id, run_id, task_id, output_type, content, released, created_at
    `
    if (!row) {
      const existing = await runsRepository.findOutput(scope, input.runId)
      if (!existing) throw new Error('Output run tidak ditemukan setelah konflik')
      return existing
    }
    return {
      id: row.id,
      runId: row.run_id,
      taskId: row.task_id,
      outputType: row.output_type,
      content: row.content,
      released: row.released,
      createdAt: row.created_at,
    }
  },

  async findOutput(scope: TenantScope, runId: string): Promise<RunOutputRecord | null> {
    const [row] = await scope.sql<
      {
        id: string
        run_id: string
        task_id: string
        output_type: OutputType
        content: string
        released: boolean
        created_at: Date
      }[]
    >`
      select id, run_id, task_id, output_type, content, released, created_at from agent_run_outputs
      where run_id = ${runId} and tenant_id = ${scope.tenantId}
    `
    return row
      ? {
          id: row.id,
          runId: row.run_id,
          taskId: row.task_id,
          outputType: row.output_type,
          content: row.content,
          released: row.released,
          createdAt: row.created_at,
        }
      : null
  },

  async releaseOutput(scope: TenantScope, runId: string): Promise<boolean> {
    const rows = await scope.sql`
      update agent_run_outputs set released = true
      where run_id = ${runId} and tenant_id = ${scope.tenantId} and released = false
      returning id
    `
    return rows.length > 0
  },
}
