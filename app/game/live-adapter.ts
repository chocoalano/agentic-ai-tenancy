import type { OfficeRealtimeEvent, RealtimeConnectionState } from '../../domains/office/realtime'
import type { AgentLifecycleStatus } from '../../domains/agents/types'
import type { CharacterKey } from '../utils/game-assets'
import { liveActivity } from './agent-state'
import type { AgentSpec } from './engine'
import type { IslandId } from './world'

/*
 * Adaptor mode LIVE: memetakan data & event backend yang BENAR-BENAR ada ke
 * aksi game. Phase 1 hanya memancarkan event SSE `ready` dan `heartbeat`
 * (domains/office/realtime.ts) — tidak ada event agent/run/tugas/persetujuan.
 * Karena itu:
 * - `ready`     → sinkron ulang snapshot agent dari API (setelah (re)koneksi),
 * - `heartbeat` → perbarui waktu konfirmasi terakhir,
 * - status robot = status otoritatif terakhir (siklus hidup), tidak ada
 *   aktivitas yang dikarang saat event tidak tersedia.
 * Pemetaan event masa depan didokumentasikan di docs/live-agent-event-mapping.md.
 */

export type LiveGameAction = { type: 'resync'; reason: 'ready' } | { type: 'confirm'; serverTime: Date }

export function mapRealtimeEvent(event: OfficeRealtimeEvent): LiveGameAction[] {
  switch (event.event) {
    case 'ready':
      return [
        { type: 'resync', reason: 'ready' },
        { type: 'confirm', serverTime: event.data.serverTime },
      ]
    case 'heartbeat':
      return [{ type: 'confirm', serverTime: event.data.serverTime }]
  }
}

export interface LiveAgentInput {
  id: string
  name: string
  lifecycleStatus: AgentLifecycleStatus
  runtimeStatus: null
}

export interface LivePlacement {
  character: CharacterKey
  stationId: IslandId
  slot: number
}

/** Snapshot agent nyata → spesifikasi mesin (posisi dari pemetaan presentasi). */
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

/** Label koneksi untuk UI: status terakhir dikonfirmasi vs terputus. */
export function confirmationLabel(state: RealtimeConnectionState, lastConfirmed: Date | null): string {
  if (state === 'open' && lastConfirmed) return 'Status live terkonfirmasi'
  if (lastConfirmed) return 'Menampilkan status terakhir yang dikonfirmasi'
  return 'Belum ada konfirmasi realtime'
}
