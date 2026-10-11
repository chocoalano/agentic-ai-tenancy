import type { AgentLifecycleStatus } from '../../domains/agents/types'
import { CHARACTERS, type CharacterKey } from './game-assets'
import {
  STATIONS,
  slotPoint,
  type OfficeSceneModel,
  type SceneAgentInput,
  type StationId,
  type StationState,
} from './office-layout'
import type { MissionStepStatus, SetupMission } from './office-mission'
import type { IslandId } from '../game/world'

/*
 * Aktor scene + MODE PRATINJAU DESAIN.
 *
 * Mode live hanya berisi AI employee nyata dari API. Mode pratinjau (default
 * untuk tenant tanpa agent, dapat dinyalakan manual) menampilkan kelima
 * karakter asset pack beserta angka contoh dari lembar konsep "Project Atlas".
 * Semua nilai pratinjau ditandai `preview: true` dan UI wajib melabelinya
 * sebagai contoh — tidak ada inferensi AI, eksekusi tugas, tagihan, atau XP
 * yang disimpan.
 */

export interface SceneActor {
  /** ID agent nyata, atau `preview:<karakter>`. */
  key: string
  preview: boolean
  name: string
  roleTitle: string
  character: CharacterKey
  /** Status siklus hidup nyata (null untuk karakter pratinjau). */
  lifecycle: AgentLifecycleStatus | null
  stationId: StationId
  slot: number
  /** Titik kaki robot (unit dunia). */
  x: number
  y: number
  /** Teks status pada label dunia & roster. */
  statusLabel: string
  /** Hanya pratinjau (angka contoh). */
  level?: number
  xp?: number
}

interface PreviewCastMember {
  character: CharacterKey
  roleTitle: string
  stationId: StationId
  level: number
  xp: number
  statusLabel: string
}

/** Lima karakter pratinjau; level/XP/status = contoh dari lembar konsep. */
export const PREVIEW_CAST: readonly PreviewCastMember[] = [
  { character: 'sage', roleTitle: 'Peneliti', stationId: 'web-research', level: 11, xp: 76, statusLabel: 'Meriset…' },
  { character: 'bolt', roleTitle: 'Pembangun', stationId: 'client-brief', level: 10, xp: 90, statusLabel: 'Menyusun…' },
  {
    character: 'pixel',
    roleTitle: 'Analis',
    stationId: 'analytics-tool',
    level: 11,
    xp: 68,
    statusLabel: 'Menganalisis…',
  },
  {
    character: 'echo',
    roleTitle: 'Operator',
    stationId: 'knowledge-base',
    level: 10,
    xp: 74,
    statusLabel: 'Mengelola…',
  },
  {
    character: 'nova',
    roleTitle: 'Koordinator',
    stationId: 'report-builder',
    level: 12,
    xp: 82,
    statusLabel: 'Mengorkestrasi…',
  },
]

export function previewActors(): SceneActor[] {
  return PREVIEW_CAST.map((member) => {
    const station = STATIONS.find((item) => item.id === member.stationId)
    const point = station ? slotPoint(station, 0) : { x: 0, y: 0 }
    return {
      key: `preview:${member.character}`,
      preview: true,
      name: CHARACTERS[member.character].name,
      roleTitle: member.roleTitle,
      character: member.character,
      lifecycle: null,
      stationId: member.stationId,
      slot: 0,
      x: point.x,
      y: point.y,
      statusLabel: member.statusLabel,
      level: member.level,
      xp: member.xp,
    }
  })
}

export function liveActors<T extends SceneAgentInput & { roleTitle: string }>(
  scene: OfficeSceneModel<T>,
  statusLabel: (status: AgentLifecycleStatus) => string,
): SceneActor[] {
  return [...scene.placements.values()].map((placed) => ({
    key: placed.agent.id,
    preview: false,
    name: placed.agent.name,
    roleTitle: placed.agent.roleTitle,
    character: placed.character,
    lifecycle: placed.agent.lifecycleStatus,
    stationId: placed.stationId,
    slot: placed.slot,
    x: placed.x,
    y: placed.y,
    statusLabel: statusLabel(placed.agent.lifecycleStatus),
  }))
}

/** Status stasiun: live dari agent nyata; pratinjau = seluruh jaringan menyala (contoh). */
export function stationStatesFor<T extends SceneAgentInput>(
  scene: OfficeSceneModel<T>,
  preview: boolean,
): ReadonlyMap<StationId, StationState> {
  return new Map(scene.stations.map((station) => [station.definition.id, preview ? 'active' : station.state]))
}

/* ------------------------------------------------------------------ *
 * Misi
 * ------------------------------------------------------------------ */

export interface MissionStepView {
  id: string
  title: string
  description: string
  status: MissionStepStatus
  evidence: string
  link?: { to: string; label: string }
}

export interface MissionViewModel {
  title: string
  description: string
  steps: MissionStepView[]
  completed: number
  total: number
  progress: number
  preview: boolean
}

export function missionFromSetup(mission: SetupMission): MissionViewModel {
  return { ...mission, preview: false }
}

const PREVIEW_OBJECTIVES = [
  { id: 'collect', title: 'Kumpulkan data pasar', description: 'Sage meriset sumber di Web Research.' },
  { id: 'analyze', title: 'Analisis tren utama', description: 'Pixel mengolah data di Analytics Tool.' },
  { id: 'build', title: 'Susun laporan akhir', description: 'Bolt menyusun laporan; Echo menjalankan alat data.' },
  { id: 'deliver', title: 'Kirim ke klien', description: 'Nova merangkum di Mission Hub; simulasi selesai.' },
] as const

/**
 * Misi contoh "Project Atlas — Market Research Mission" untuk mode pratinjau.
 * Sasaran tercentang mengikuti kemajuan SIMULASI frontend (bukan data nyata).
 */
export function previewMission(completed: readonly string[]): MissionViewModel {
  const steps = PREVIEW_OBJECTIVES.map((objective) => ({
    id: objective.id,
    title: objective.title,
    description: objective.description,
    status: completed.includes(objective.id) ? ('done' as const) : ('todo' as const),
    evidence: completed.includes(objective.id) ? 'Langkah simulasi selesai (pratinjau)' : 'Menunggu simulasi',
  }))
  const done = steps.filter((step) => step.status === 'done').length
  return {
    title: 'Project Atlas — Market Research',
    description:
      'Simulasi: susun laporan riset pasar dari beberapa sumber data dan kirim insight akhir. Tidak ada tugas nyata yang dijalankan.',
    steps,
    completed: done,
    total: steps.length,
    progress: Math.round((done / steps.length) * 100),
    preview: true,
  }
}

/** Misi contoh awal (sebelum simulasi berjalan). */
export const PREVIEW_MISSION: MissionViewModel = previewMission([])

/** Angka HUD contoh (lembar konsep). Tidak pernah ditampilkan di mode live. */
export const PREVIEW_HUD = {
  level: 12,
  xp: 1240,
  xpTarget: 2000,
  energy: 86,
  energyMax: 120,
  credits: 4320,
  compute: 720,
} as const

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

export interface RosterEntry {
  key: string
  preview: boolean
  name: string
  roleTitle: string
  character: CharacterKey
  lifecycle: AgentLifecycleStatus | null
  statusLabel: string
  stationId: IslandId | null
  level?: number
  xp?: number
}

/** Roster live: SEMUA agent nyata (termasuk arsip/tanpa slot), stasiun dari penempatan scene. */
export function liveRoster<T extends SceneAgentInput & { roleTitle: string }>(
  agents: readonly T[],
  scene: OfficeSceneModel<T>,
  character: (agent: T) => CharacterKey,
  statusLabel: (status: AgentLifecycleStatus) => string,
): RosterEntry[] {
  return agents.map((agent) => ({
    key: agent.id,
    preview: false,
    name: agent.name,
    roleTitle: agent.roleTitle,
    character: scene.placements.get(agent.id)?.character ?? character(agent),
    lifecycle: agent.lifecycleStatus,
    statusLabel: statusLabel(agent.lifecycleStatus),
    stationId: scene.placements.get(agent.id)?.stationId ?? null,
  }))
}

export function previewRoster(): RosterEntry[] {
  return previewActors().map((actor) => ({
    key: actor.key,
    preview: true,
    name: actor.name,
    roleTitle: actor.roleTitle,
    character: actor.character,
    lifecycle: null,
    statusLabel: actor.statusLabel,
    stationId: actor.stationId,
    level: actor.level,
    xp: actor.xp,
  }))
}
