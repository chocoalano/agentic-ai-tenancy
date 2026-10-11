import type { AgentLifecycleStatus } from '../../domains/agents/types'
import type { OfficeRealtimeEvent, RealtimeClosedEvent, RealtimeConnectionState } from '../../domains/office/realtime'
import type { CharacterKey } from '../utils/game-assets'
import { liveActivity, type ActivityState, type LiveRuntimeStatus } from './agent-state'
import type { AgentSpec } from './engine'
import type { IslandId } from './world'

/*
 * Adaptor mode LIVE: memetakan data & event backend yang BENAR-BENAR ada ke
 * aksi game. Semua state bisnis berasal dari backend (tugas/run/persetujuan);
 * frontend hanya memilih presentasi:
 *
 *   agent.task.created        → acknowledge (robot "menerima perintah")
 *   agent.task.queued         → thinking (menunggu worker)
 *   agent.run.started         → work (menuju stasiun rumah, animasi kerja)
 *   agent.run.activity        → work (aktivitas tetap; efek stasiun)
 *   agent.run.waiting_approval→ wait_approval
 *   agent.run.completed       → complete (celebrate, lalu siaga) + hasil tersedia
 *   agent.run.failed          → fail (reaksi error; retryScheduled → thinking lagi)
 *   agent.run.canceled        → cancel (siaga)
 *   approval.*                → task_changed (muat ulang daftar/persetujuan)
 *   ready/heartbeat/closed    → resync/confirm/closed
 *
 * Tidak ada event yang dikarang: tanpa event, status robot = status otoritatif
 * terakhir dari API (`runtimeStatus` agent).
 */
export type LiveGameAction =
  | { type: 'resync'; reason: 'ready' }
  | { type: 'confirm'; serverTime: Date }
  | { type: 'closed'; reason: RealtimeClosedEvent['data']['reason'] }
  | { type: 'acknowledge'; agentId: string; taskId: string; title: string }
  | { type: 'queued'; agentId: string; taskId: string }
  | { type: 'work'; agentId: string; taskId: string; runId: string | null; activity: string }
  | { type: 'wait_approval'; agentId: string; taskId: string; runId: string | null; approvalId: string }
  | { type: 'complete'; agentId: string; taskId: string; runId: string | null; released: boolean }
  | {
      type: 'fail'
      agentId: string
      taskId: string
      runId: string | null
      errorCode: string
      errorMessage: string
      retryScheduled: boolean
    }
  | { type: 'cancel'; agentId: string; taskId: string; runId: string | null }
  | { type: 'task_changed'; agentId: string; taskId: string; runId: string | null }

export function mapRealtimeEvent(event: OfficeRealtimeEvent): LiveGameAction[] {
  switch (event.event) {
    case 'ready':
      return [
        { type: 'resync', reason: 'ready' },
        { type: 'confirm', serverTime: event.data.serverTime },
      ]
    case 'heartbeat':
      return [{ type: 'confirm', serverTime: event.data.serverTime }]
    case 'closed':
      return [{ type: 'closed', reason: event.data.reason }]
    case 'agent.task.created':
      return [
        { type: 'acknowledge', agentId: event.data.agentId, taskId: event.data.taskId, title: event.data.title },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'agent.task.queued':
      return [
        { type: 'queued', agentId: event.data.agentId, taskId: event.data.taskId },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'agent.run.started':
    case 'agent.run.activity':
      return [
        {
          type: 'work',
          agentId: event.data.agentId,
          taskId: event.data.taskId,
          runId: event.data.runId,
          activity: event.data.activity,
        },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'agent.run.waiting_approval':
      return [
        {
          type: 'wait_approval',
          agentId: event.data.agentId,
          taskId: event.data.taskId,
          runId: event.data.runId,
          approvalId: event.data.approvalId,
        },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'agent.run.completed':
      return [
        {
          type: 'complete',
          agentId: event.data.agentId,
          taskId: event.data.taskId,
          runId: event.data.runId,
          released: event.data.released,
        },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'agent.run.failed':
      return [
        {
          type: 'fail',
          agentId: event.data.agentId,
          taskId: event.data.taskId,
          runId: event.data.runId,
          errorCode: event.data.errorCode,
          errorMessage: event.data.errorMessage,
          retryScheduled: event.data.retryScheduled,
        },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'agent.run.canceled':
      return [
        { type: 'cancel', agentId: event.data.agentId, taskId: event.data.taskId, runId: event.data.runId },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
    case 'approval.requested':
    case 'approval.decided':
      return [
        { type: 'task_changed', agentId: event.data.agentId, taskId: event.data.taskId, runId: event.data.runId },
        { type: 'confirm', serverTime: event.data.occurredAt },
      ]
  }
}

export interface LiveAgentInput {
  id: string
  name: string
  lifecycleStatus: AgentLifecycleStatus
  runtimeStatus: LiveRuntimeStatus
}

export interface LivePlacement {
  character: CharacterKey
  stationId: IslandId
  slot: number
}

/** Snapshot agent nyata → spesifikasi mesin (posisi dari pemetaan presentasi; state dari status otoritatif). */
export function liveAgentSpecs(
  agents: readonly LiveAgentInput[],
  placements: ReadonlyMap<string, LivePlacement>,
): AgentSpec[] {
  return agents.flatMap((agent) => {
    const placement = placements.get(agent.id)
    if (!placement) return []
    return [
      {
        key: agent.id,
        character: placement.character,
        name: agent.name,
        island: placement.stationId,
        slot: placement.slot,
        activity: liveActivity(agent.lifecycleStatus, agent.runtimeStatus),
        preview: false,
      },
    ]
  })
}

/** State visual untuk aksi `work` (aktivitas stasiun rumah agent; presentasi saja). */
export function workActivityFor(stationActivity: ActivityState): ActivityState {
  return stationActivity === 'communicating' ? 'working' : stationActivity
}

/** Label koneksi untuk UI: status terakhir dikonfirmasi vs terputus. */
export function confirmationLabel(state: RealtimeConnectionState, lastConfirmed: Date | null): string {
  if (state === 'open' && lastConfirmed) return 'Status live terkonfirmasi'
  if (lastConfirmed) return 'Menampilkan status terakhir yang dikonfirmasi'
  return 'Belum ada konfirmasi realtime'
}
