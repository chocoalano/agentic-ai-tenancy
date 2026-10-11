import { ACTIVITY_PRESENTATION, type ActivityState } from './agent-state'
import type { AgentAnimationName } from './animation-spec'
import { ISLAND_ART_GEOMETRY } from './island-geometry'
import type { IslandId } from './world'

/*
 * Sistem aktivitas workstation (murni, tanpa Vue/DOM).
 *
 *   OfficeSimulation → state machine agent → aktivitas workstation (file ini)
 *   → animasi karakter (ACTIVITY_PRESENTATION) + efek visual workstation
 *     (OfficeWorkstationEffects.vue).
 *
 * Setiap pulau yang dapat dijalani mendefinisikan aktivitas yang dikenali di
 * sana: state aktivitas apa yang dijalankan robot, animasinya, efek visual
 * yang menyala, dan anchor interaksi (id slot geometri artwork). Efek
 * DITURUNKAN dari state agent yang sudah ada (bukan state kedua): menyala saat
 * robot berada di pulau itu, tidak bergerak, dan state-nya `workstationActive`;
 * padam begitu robot pergi, dibatalkan, atau kembali siaga.
 *
 * Mode pratinjau: durasi ditentukan skenario (`simulated`). Mode live: hanya
 * event backend yang terkonfirmasi (`event-driven`) — frontend tidak pernah
 * mengarang penyelesaian kerja.
 */

export type WorkstationEffect =
  | 'mission-hologram'
  | 'signal-pulse'
  | 'document-holograms'
  | 'search-rings'
  | 'chart-hologram'
  | 'data-particles'
  | 'typing-glow'
  | 'document-assembly'
  | 'terminal-lines'
  | 'tool-controls'
  | 'brief-bubble'
  | 'knowledge-shelf'
  | 'quality-seal'
  | 'approval-beacon'
  | 'completion-burst'
  | 'error-flicker'

export type DurationMode = 'simulated' | 'event-driven'

export interface WorkstationActivity {
  id: string
  workstationId: IslandId
  label: string
  /** State agent yang menjalankan aktivitas ini (sumber animasi & label status). */
  activity: ActivityState
  animation: AgentAnimationName
  effects: readonly WorkstationEffect[]
  /** Anchor interaksi utama = id slot geometri artwork (`slot-0`, `slot-1`). */
  interactionAnchorId: string
  durationMode: DurationMode
}

function activity(
  workstationId: IslandId,
  id: string,
  label: string,
  state: ActivityState,
  effects: readonly WorkstationEffect[],
): WorkstationActivity {
  return {
    id: `${workstationId}:${id}`,
    workstationId,
    label,
    activity: state,
    animation: ACTIVITY_PRESENTATION[state].animation,
    effects,
    interactionAnchorId: 'slot-0',
    durationMode: 'simulated',
  }
}

/** Aktivitas per workstation; entri PERTAMA = aktivitas default stasiun. */
export const WORKSTATION_ACTIVITIES: Record<IslandId, readonly WorkstationActivity[]> = {
  'mission-hub': [
    activity('mission-hub', 'coordinate', 'Mengoordinasikan tim', 'communicating', [
      'mission-hologram',
      'signal-pulse',
    ]),
    activity('mission-hub', 'monitor', 'Memantau progres misi', 'thinking', ['mission-hologram']),
    activity('mission-hub', 'review', 'Meninjau laporan masuk', 'reading', ['mission-hologram']),
    activity('mission-hub', 'plan', 'Menyusun rencana misi', 'working', ['mission-hologram', 'signal-pulse']),
  ],
  'web-research': [
    activity('web-research', 'research', 'Meriset sumber pasar', 'researching', ['document-holograms', 'search-rings']),
    activity('web-research', 'read', 'Membaca temuan', 'reading', ['document-holograms']),
    activity('web-research', 'summarize', 'Merangkum temuan', 'working', ['document-holograms']),
    activity('web-research', 'think', 'Menilai sumber', 'thinking', ['search-rings']),
  ],
  'analytics-tool': [
    activity('analytics-tool', 'analyze', 'Menganalisis metrik', 'working', ['chart-hologram', 'data-particles']),
    activity('analytics-tool', 'compare', 'Membandingkan tren', 'thinking', ['chart-hologram']),
    activity('analytics-tool', 'process', 'Memproses data', 'using_tool', ['chart-hologram', 'data-particles']),
    activity('analytics-tool', 'read', 'Membaca hasil analisis', 'reading', ['chart-hologram']),
  ],
  'report-builder': [
    activity('report-builder', 'write', 'Menyusun laporan', 'working', ['typing-glow', 'document-assembly']),
    activity('report-builder', 'arrange', 'Merapikan dokumen', 'reading', ['document-assembly']),
    activity('report-builder', 'outline', 'Menyusun kerangka', 'thinking', ['document-assembly']),
    activity('report-builder', 'export', 'Menyiapkan artefak keluaran', 'using_tool', ['typing-glow']),
  ],
  'data-warehouse': [
    activity('data-warehouse', 'operate', 'Mengoperasikan alat data', 'using_tool', [
      'terminal-lines',
      'tool-controls',
    ]),
    activity('data-warehouse', 'process', 'Memproses permintaan alat', 'working', ['terminal-lines']),
    activity('data-warehouse', 'inspect', 'Memeriksa penyimpanan', 'reading', ['tool-controls']),
    activity('data-warehouse', 'monitor', 'Memantau alur kerja', 'thinking', ['terminal-lines']),
  ],
  'client-brief': [
    activity('client-brief', 'brief', 'Menerima brief klien', 'communicating', ['brief-bubble']),
    activity('client-brief', 'read', 'Membaca permintaan', 'reading', ['brief-bubble']),
    activity('client-brief', 'clarify', 'Mengklarifikasi kebutuhan', 'thinking', ['brief-bubble']),
    activity('client-brief', 'draft', 'Menyusun brief kerja', 'working', ['brief-bubble']),
  ],
  'knowledge-base': [
    activity('knowledge-base', 'read', 'Membaca SOP & pengetahuan', 'reading', ['knowledge-shelf']),
    activity('knowledge-base', 'lookup', 'Mencari referensi internal', 'researching', ['knowledge-shelf']),
    activity('knowledge-base', 'recall', 'Mengingat kebijakan', 'thinking', ['knowledge-shelf']),
    activity('knowledge-base', 'curate', 'Merapikan pengetahuan', 'working', ['knowledge-shelf']),
  ],
  'task-manager': [
    activity('task-manager', 'finalize', 'Finalisasi & kontrol kualitas', 'working', ['quality-seal']),
    activity('task-manager', 'review', 'Meninjau hasil akhir', 'reading', ['quality-seal']),
    activity('task-manager', 'check', 'Memeriksa kelengkapan', 'thinking', ['quality-seal']),
    activity('task-manager', 'deliver', 'Mengirim hasil kerja', 'using_tool', ['quality-seal']),
  ],
  // Dekoratif: tanpa permukaan jalan yang terkalibrasi → tidak ada aktivitas workstation.
  'research-lab': [],
  'training-center': [],
}

/** Aktivitas default saat robot dikirim ke stasiun (pulau dekoratif: `thinking` sebagai fallback tipe). */
export const STATION_DEFAULT_ACTIVITY: Record<IslandId, ActivityState> = Object.fromEntries(
  (Object.keys(WORKSTATION_ACTIVITIES) as IslandId[]).map((island) => [
    island,
    WORKSTATION_ACTIVITIES[island][0]?.activity ?? 'thinking',
  ]),
) as Record<IslandId, ActivityState>

export function defaultWorkstationActivity(island: IslandId): WorkstationActivity | null {
  return WORKSTATION_ACTIVITIES[island][0] ?? null
}

/** Aktivitas workstation yang cocok dengan state agent di pulau itu (null bila state bukan aktivitas kerja di sana). */
export function workstationActivity(island: IslandId, state: ActivityState): WorkstationActivity | null {
  return WORKSTATION_ACTIVITIES[island].find((item) => item.activity === state) ?? null
}

/** Pandangan minimal agent yang dibutuhkan untuk menurunkan visual (dipenuhi AgentRuntime maupun OfficeAgentView). */
export interface WorkstationAgentView {
  key: string
  island: IslandId
  slot: number | null
  activity: ActivityState
  moving: boolean
  preview: boolean
}

export interface WorkstationAnchor {
  key: string
  slot: number
  anchorId: string
}

export interface WorkstationVisual {
  island: IslandId
  /** Id aktivitas workstation (null untuk reaksi: persetujuan, selesai, gagal). */
  activityId: string | null
  label: string
  effects: WorkstationEffect[]
  anchors: WorkstationAnchor[]
  durationMode: DurationMode
}

const REACTION_EFFECTS: Partial<Record<ActivityState, WorkstationEffect>> = {
  waiting_approval: 'approval-beacon',
  completed: 'completion-burst',
  failed: 'error-flicker',
}

function anchorFor(agent: WorkstationAgentView): WorkstationAnchor {
  const slot = agent.slot ?? 0
  const anchorId = ISLAND_ART_GEOMETRY[agent.island].workstationSlots[slot]?.id ?? `slot-${slot}`
  return { key: agent.key, slot, anchorId }
}

/**
 * Visual workstation yang sedang aktif, diturunkan dari state agent:
 * - robot di pulau (bukan bergerak) dengan state `workstationActive` → aktivitas stasiun + efeknya;
 * - reaksi (`waiting_approval`, `completed`, `failed`) → efek reaksi di anchor robot.
 * Satu entri per pulau; efek digabung (unik, urutan stabil).
 */
export function workstationVisuals(agents: Iterable<WorkstationAgentView>): WorkstationVisual[] {
  const byIsland = new Map<IslandId, WorkstationVisual>()
  for (const agent of agents) {
    if (agent.moving) continue
    const presentation = ACTIVITY_PRESENTATION[agent.activity]
    const matched = presentation.workstationActive ? workstationActivity(agent.island, agent.activity) : null
    const reaction = REACTION_EFFECTS[agent.activity]
    if (!matched && !reaction) continue
    const effects = matched ? [...matched.effects] : []
    if (reaction) effects.push(reaction)
    const existing = byIsland.get(agent.island)
    const durationMode: DurationMode = agent.preview ? 'simulated' : 'event-driven'
    if (!existing) {
      byIsland.set(agent.island, {
        island: agent.island,
        activityId: matched?.id ?? null,
        label: matched?.label ?? presentation.label,
        effects,
        anchors: [anchorFor(agent)],
        durationMode,
      })
      continue
    }
    for (const effect of effects) if (!existing.effects.includes(effect)) existing.effects.push(effect)
    if (!existing.activityId && matched) {
      existing.activityId = matched.id
      existing.label = matched.label
    }
    existing.anchors.push(anchorFor(agent))
  }
  return [...byIsland.values()]
}
