import type { AgentEventType } from '../../../domains/office/realtime'
import type { TenantScope } from '../../core/database/transactions'
import { enqueueRealtimeEvent } from '../realtime/outbox'
import type { TaskRecord } from '../tasks/repository'
import type { RunRecord } from './repository'

/*
 * Penerbit event realtime untuk tugas/run (ditulis ke outbox dalam transaksi
 * yang sama dengan perubahan state). Payload hanya berisi field yang aman:
 * status, judul, deskripsi aktivitas tingkat tinggi, kode/pesan error yang
 * sudah dinormalkan, dan metadata persetujuan — tidak pernah instruksi penuh,
 * keluaran model, atau detail provider.
 */
export function publishAgentEvent(
  scope: TenantScope,
  input: { type: AgentEventType; task: TaskRecord; run: RunRecord | null; extra?: Record<string, unknown> },
): Promise<number> {
  return enqueueRealtimeEvent(scope, {
    type: input.type,
    agentId: input.task.agentId,
    taskId: input.task.id,
    runId: input.run?.id ?? null,
    payload: {
      taskStatus: input.task.status,
      runStatus: input.run?.status ?? null,
      ...(input.extra ?? {}),
    },
  })
}
