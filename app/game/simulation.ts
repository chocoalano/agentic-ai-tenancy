import type { CharacterKey } from '../utils/game-assets'
import type { ActivityState } from './agent-state'
import type { AgentSpec, OfficeEngine } from './engine'
import type { IslandId } from './world'

/*
 * Simulasi pratinjau "Project Atlas — Market Research Mission".
 *
 * Timeline fase eksplisit yang HANYA menggerakkan mesin frontend (gerak,
 * aktivitas, ucapan berlabel simulasi). Tidak ada request ke backend, tidak
 * ada run/biaya/XP/penyelesaian yang ditulis ke tabel bisnis, dan ucapan robot
 * adalah teks skrip — bukan respons AI.
 */

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface SimulationAction {
  actor: CharacterKey
  /** Pindah ke pulau (slot otomatis) lalu menjalankan aktivitas. */
  moveTo?: IslandId
  activity: ActivityState
  /** Lama aktivitas (detik simulasi) sebelum aksi dianggap selesai. */
  seconds: number
  say?: string
}

export interface SimulationPhase {
  id: string
  label: string
  /** Sasaran misi contoh yang tercapai saat fase selesai. */
  objective?: string
  actions: SimulationAction[]
}

/** Posisi awal tersebar pada workstation utama, mengikuti komposisi referensi. */
export const ATLAS_START: ReadonlyArray<{ character: CharacterKey; island: IslandId; slot: number }> = [
  { character: 'nova', island: 'client-brief', slot: 0 },
  { character: 'sage', island: 'web-research', slot: 0 },
  { character: 'pixel', island: 'analytics-tool', slot: 0 },
  { character: 'bolt', island: 'report-builder', slot: 0 },
  { character: 'echo', island: 'knowledge-base', slot: 0 },
]

export const ATLAS_PHASES: readonly SimulationPhase[] = [
  {
    id: 'brief',
    label: 'Nova menerima perintah dan membagi tugas',
    actions: [{ actor: 'nova', activity: 'communicating', seconds: 2.5, say: 'Siap! Membagi tugas Project Atlas.' }],
  },
  {
    id: 'research',
    label: 'Sage meriset pasar di Web Research',
    objective: 'collect',
    actions: [
      { actor: 'sage', moveTo: 'web-research', activity: 'researching', seconds: 4, say: 'Mengumpulkan sumber pasar…' },
      { actor: 'nova', activity: 'thinking', seconds: 2 },
    ],
  },
  {
    id: 'analysis',
    label: 'Pixel menganalisis tren di Analytics Tool',
    objective: 'analyze',
    actions: [
      { actor: 'pixel', moveTo: 'analytics-tool', activity: 'working', seconds: 4, say: 'Menganalisis tren utama…' },
      { actor: 'sage', activity: 'reading', seconds: 2 },
    ],
  },
  {
    id: 'report',
    label: 'Bolt menyusun laporan · Echo mengoperasikan alat',
    objective: 'build',
    actions: [
      { actor: 'bolt', moveTo: 'report-builder', activity: 'working', seconds: 4, say: 'Menyusun draf laporan…' },
      { actor: 'echo', moveTo: 'data-warehouse', activity: 'using_tool', seconds: 4, say: 'Menjalankan alat data…' },
    ],
  },
  {
    id: 'coordinate',
    label: 'Nova kembali ke Mission Hub untuk koordinasi',
    actions: [
      {
        actor: 'nova',
        moveTo: 'mission-hub',
        activity: 'communicating',
        seconds: 3,
        say: 'Semua bagian siap, merangkum hasil.',
      },
    ],
  },
  {
    id: 'complete',
    label: 'Simulasi selesai',
    objective: 'deliver',
    actions: (['nova', 'sage', 'pixel', 'bolt', 'echo'] as const).map((actor) => ({
      actor,
      activity: 'completed' as const,
      seconds: 1.4,
    })),
  },
]

export function atlasAgentSpecs(names: Record<CharacterKey, string>): AgentSpec[] {
  return ATLAS_START.map((start) => ({
    key: `preview:${start.character}`,
    character: start.character,
    name: names[start.character],
    island: start.island,
    slot: start.slot,
    activity: 'idle',
    preview: true,
  }))
}

interface PendingAction {
  key: string
  waitingArrival: boolean
  until: number | null
  done: boolean
  action: SimulationAction
}

export interface SimulationSnapshot {
  status: SimulationStatus
  phaseIndex: number
  phaseLabel: string
  completedObjectives: string[]
  task: string
  speed: number
}

/**
 * Pengendali timeline. Dipanggil setiap tick setelah `engine.tick`; memakai jam
 * mesin sehingga jeda/kecepatan berlaku seragam untuk gerak, animasi, dan skrip.
 */
export class SimulationController {
  status: SimulationStatus = 'idle'
  phaseIndex = -1
  task = ''
  readonly completedObjectives: string[] = []
  /** Aksi fase yang ditolak mesin (transisi tidak sah/agent hilang). Harus kosong; diuji. */
  readonly rejectedActions: string[] = []
  private pending: PendingAction[] = []
  private readonly listeners = new Set<() => void>()
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly engine: OfficeEngine,
    private readonly phases: readonly SimulationPhase[] = ATLAS_PHASES,
  ) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  snapshot(): SimulationSnapshot {
    return {
      status: this.status,
      phaseIndex: this.phaseIndex,
      phaseLabel: this.phases[this.phaseIndex]?.label ?? '',
      completedObjectives: [...this.completedObjectives],
      task: this.task,
      speed: this.engine.speed,
    }
  }

  start(task: string) {
    if (this.status === 'running') return
    this.task = task.trim() || 'Lakukan riset pasar Project Atlas'
    this.status = 'running'
    this.engine.paused = false
    this.phaseIndex = -1
    this.completedObjectives.length = 0
    this.rejectedActions.length = 0
    this.unsubscribe?.()
    this.unsubscribe = this.engine.on((event) => {
      if (event.type !== 'arrived') return
      for (const item of this.pending) {
        if (item.key === event.key && item.waitingArrival) {
          item.waitingArrival = false
          item.until = this.engine.time + item.action.seconds
        }
      }
    })
    this.nextPhase()
  }

  pause() {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.engine.paused = true
    this.notify()
  }

  resume() {
    if (this.status !== 'paused') return
    this.status = 'running'
    this.engine.paused = false
    this.notify()
  }

  setSpeed(speed: number) {
    this.engine.speed = Math.min(3, Math.max(0.25, speed))
    this.notify()
  }

  /** Kembalikan semua karakter ke posisi & state awal. */
  reset(names: Record<CharacterKey, string>) {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.pending = []
    this.status = 'idle'
    this.phaseIndex = -1
    this.task = ''
    this.completedObjectives.length = 0
    this.rejectedActions.length = 0
    this.engine.paused = false
    this.engine.setAgents([])
    this.engine.setAgents(atlasAgentSpecs(names))
    this.notify()
  }

  private nextPhase() {
    const finished = this.phases[this.phaseIndex]
    if (finished?.objective) this.completedObjectives.push(finished.objective)
    this.phaseIndex += 1
    const phase = this.phases[this.phaseIndex]
    if (!phase) {
      this.status = 'completed'
      this.pending = []
      this.unsubscribe?.()
      this.unsubscribe = null
      this.notify()
      return
    }
    this.pending = phase.actions.map((action) => {
      const key = `preview:${action.actor}`
      const until = this.engine.time + action.seconds
      if (action.say) this.engine.say(key, action.say, Math.min(action.seconds + 1.5, 5))
      if (action.moveTo) {
        const moved = this.engine.moveTo(key, { island: action.moveTo }, { state: action.activity })
        if (!moved) this.rejectedActions.push(`${phase.id}:${action.actor}:moveTo`)
        // Sudah di tujuan / reduced motion → moveTo tiba seketika; event 'arrived'
        // terjadi sebelum item ini terdaftar, jadi jangan menunggunya.
        const travelling = moved && (this.engine.agents.get(key)?.route.length ?? 0) > 0
        return { key, action, waitingArrival: travelling, until: travelling ? null : until, done: false }
      }
      if (!this.engine.setActivity(key, { state: action.activity })) {
        this.rejectedActions.push(`${phase.id}:${action.actor}:${action.activity}`)
      }
      return { key, action, waitingArrival: false, until, done: false }
    })
    this.notify()
  }

  /** Dipanggil setiap tick. */
  update() {
    if (this.status !== 'running') return
    let allDone = true
    for (const item of this.pending) {
      if (item.done) continue
      if (!item.waitingArrival && item.until !== null && this.engine.time >= item.until) {
        item.done = true
        // Durasi aktivitas habis → kembali siaga.
        this.engine.setActivity(item.key, { state: 'idle' })
      }
      if (!item.done) allDone = false
    }
    if (allDone) this.nextPhase()
  }
}
