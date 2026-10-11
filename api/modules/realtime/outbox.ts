import type { TransactionSQL } from 'bun'
import type { AgentEventType } from '../../../domains/office/realtime'
import { REALTIME_SCHEMA_VERSION } from '../../../domains/office/realtime'
import type { TenantScope } from '../../core/database/transactions'

/*
 * Outbox realtime: event bisnis ditulis DALAM transaksi yang sama dengan
 * perubahan state (tugas/run/persetujuan) sehingga tidak pernah ada event
 * "selesai" yang diterbitkan sebelum commit. Dispatcher SSE (hub.ts) membaca
 * baris baru pasca-commit dan menyalurkannya per tenant. `id` outbox menjadi
 * SSE event id (monoton) untuk deduplikasi, urutan, dan replay Last-Event-ID.
 */
export interface OutboxEventInput {
  type: AgentEventType
  agentId: string
  taskId: string
  runId: string | null
  /** Payload tersanitasi (tanpa prompt, penalaran model, kredensial, pesan error mentah). */
  payload: Record<string, unknown>
}

export interface OutboxRow {
  id: number
  tenant_id: string
  event_type: string
  schema_version: number
  agent_id: string | null
  task_id: string | null
  run_id: string | null
  payload: Record<string, unknown>
  created_at: Date
}

/** Menulis event ke outbox tenant scope saat ini; mengembalikan id event. */
export async function enqueueRealtimeEvent(scope: TenantScope, input: OutboxEventInput): Promise<number> {
  const [row] = await scope.sql<{ id: number | string }[]>`
    insert into realtime_outbox (tenant_id, event_type, schema_version, agent_id, task_id, run_id, payload)
    values (${scope.tenantId}, ${input.type}, ${REALTIME_SCHEMA_VERSION}, ${input.agentId}, ${input.taskId},
            ${input.runId}, ${JSON.stringify(input.payload)}::jsonb)
    returning id
  `
  if (!row) throw new Error('Insert realtime_outbox tidak mengembalikan baris')
  return Number(row.id)
}

/** Dispatcher: baris outbox lintas tenant setelah `after` (fungsi SECURITY DEFINER; disaring per koneksi). */
export async function readOutboxAfter(sql: TransactionSQL | import('bun').SQL, after: number, limit: number) {
  const rows = await sql<OutboxRow[]>`select * from app.realtime_outbox_after(${after}, ${limit})`
  return rows.map((row) => ({ ...row, id: Number(row.id) }))
}

export async function latestOutboxId(sql: import('bun').SQL): Promise<number> {
  const [row] = await sql<{ realtime_outbox_latest_id: number | string }[]>`select app.realtime_outbox_latest_id()`
  return Number(row?.realtime_outbox_latest_id ?? 0)
}

/** Replay untuk satu tenant (dalam konteks tenant; RLS membatasi). */
export async function readTenantOutboxAfter(scope: TenantScope, after: number, limit: number): Promise<OutboxRow[]> {
  const rows = await scope.sql<OutboxRow[]>`
    select id, tenant_id, event_type, schema_version, agent_id, task_id, run_id, payload, created_at
    from realtime_outbox
    where tenant_id = ${scope.tenantId} and id > ${after}
    order by id
    limit ${Math.max(1, Math.min(limit, 1000))}
  `
  return rows.map((row) => ({ ...row, id: Number(row.id) }))
}
