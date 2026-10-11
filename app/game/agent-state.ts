import type { AgentLifecycleStatus } from '../../domains/agents/types'
import type { AgentAnimationName } from './animation-spec'

/*
 * State machine aktivitas agent (murni).
 *
 * Dua sumber state yang DIPISAH:
 * - Otoritatif: status dari backend (mode live: siklus hidup & — kelak —
 *   status runtime orchestrator). Frontend tidak pernah mengarangnya.
 * - Visual sementara: `moving` (dan fase teleport di dalamnya) milik
 *   pengendali gerak; tidak pernah dianggap status bisnis.
 *
 * Di mode pratinjau, transisi digerakkan oleh skenario simulasi yang
 * berlabel jelas — tidak ada yang ditulis ke backend.
 */

export const ACTIVITY_STATES = [
  'offline',
  'idle',
  'moving',
  'thinking',
  'working',
  'researching',
  'reading',
  'using_tool',
  'communicating',
  'waiting_approval',
  'completed',
  'failed',
] as const

export type ActivityState = (typeof ACTIVITY_STATES)[number]

const WORK_STATES: readonly ActivityState[] = ['thinking', 'working', 'researching', 'reading', 'using_tool']

/** Transisi yang sah. `moving` dapat disela kapan saja (pembatalan/rute baru). */
export const TRANSITIONS: Record<ActivityState, readonly ActivityState[]> = {
  offline: ['idle'],
  // idle → completed: perayaan akhir misi, dan resync live dapat mengungkap run yang sudah selesai.
  idle: ['moving', 'communicating', 'waiting_approval', 'completed', 'offline', 'failed', ...WORK_STATES],
  moving: ['idle', 'communicating', 'failed', ...WORK_STATES],
  thinking: ['moving', 'idle', 'communicating', 'waiting_approval', 'failed', 'completed', ...WORK_STATES],
  working: ['moving', 'idle', 'communicating', 'waiting_approval', 'completed', 'failed', ...WORK_STATES],
  researching: ['moving', 'idle', 'communicating', 'completed', 'failed', ...WORK_STATES],
  reading: ['moving', 'idle', 'communicating', 'completed', 'failed', ...WORK_STATES],
  using_tool: ['moving', 'idle', 'communicating', 'waiting_approval', 'completed', 'failed', ...WORK_STATES],
  communicating: ['moving', 'idle', 'waiting_approval', 'completed', ...WORK_STATES],
  waiting_approval: ['working', 'idle', 'failed', 'communicating'],
  completed: ['idle', 'moving', 'communicating'],
  failed: ['idle', 'moving'],
}

export function canTransition(from: ActivityState, to: ActivityState): boolean {
  return from === to || TRANSITIONS[from].includes(to)
}

export type ActivityEffect = 'none' | 'hologram' | 'particles' | 'alert' | 'success' | 'approval'

export interface ActivityPresentation {
  animation: AgentAnimationName
  label: string
  effect: ActivityEffect
  /** Lampu workstation menyala. */
  workstationActive: boolean
}

export const ACTIVITY_PRESENTATION: Record<ActivityState, ActivityPresentation> = {
  offline: { animation: 'idle', label: 'Offline', effect: 'none', workstationActive: false },
  idle: { animation: 'idle', label: 'Siaga', effect: 'none', workstationActive: false },
  moving: { animation: 'walk', label: 'Berpindah', effect: 'none', workstationActive: false },
  thinking: { animation: 'think', label: 'Berpikir', effect: 'particles', workstationActive: true },
  working: { animation: 'work', label: 'Bekerja', effect: 'hologram', workstationActive: true },
  researching: { animation: 'read', label: 'Meriset', effect: 'particles', workstationActive: true },
  reading: { animation: 'read', label: 'Membaca', effect: 'none', workstationActive: true },
  using_tool: { animation: 'work', label: 'Memakai alat', effect: 'hologram', workstationActive: true },
  // Berkomunikasi di stasiun (brief klien, koordinasi di Mission Hub) menyalakan workstation-nya.
  communicating: { animation: 'communicate', label: 'Berkomunikasi', effect: 'none', workstationActive: true },
  waiting_approval: { animation: 'think', label: 'Menunggu persetujuan', effect: 'approval', workstationActive: true },
  completed: { animation: 'celebrate', label: 'Selesai', effect: 'success', workstationActive: false },
  failed: { animation: 'error', label: 'Gagal', effect: 'alert', workstationActive: false },
}

/** Status runtime otoritatif dari API agent (run aktif terbaru); null = tidak sedang mengerjakan tugas. */
export type LiveRuntimeStatus = 'thinking' | 'working' | 'waiting_approval' | null

/**
 * Mode live: status otoritatif → state visual. Siklus hidup non-aktif →
 * offline; selain itu status runtime dari run aktif terbaru (queued/claimed →
 * thinking, running → working, waiting_approval) atau siaga. Tidak ada
 * aktivitas karangan: tanpa run aktif, robot siaga.
 */
export function liveActivity(lifecycle: AgentLifecycleStatus, runtimeStatus: LiveRuntimeStatus): ActivityState {
  if (lifecycle !== 'active') return 'offline'
  switch (runtimeStatus) {
    case 'thinking':
      return 'thinking'
    case 'working':
      return 'working'
    case 'waiting_approval':
      return 'waiting_approval'
    default:
      return 'idle'
  }
}
