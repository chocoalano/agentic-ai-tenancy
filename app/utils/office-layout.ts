import type { AgentLifecycleStatus } from '../../domains/agents/types'
import {
  CHARACTER_KEYS,
  ISLANDS,
  visibleSize,
  type CharacterKey,
  type FxKey,
  type IslandKey,
  type TileKey,
} from './game-assets'

/*
 * Model dunia Virtual Office (murni, deterministik, aman untuk SSR).
 *
 * Semua objek scene — pulau, robot, label, jalur energi SVG, portal, partikel
 * — memakai satu sistem koordinat dunia OFFICE_WORLD (1672 × 941 unit, rasio
 * komposisi referensi "Project Atlas"). Kamera (GameWorld.vue) menskalakan
 * dunia ke viewport; tidak ada posisi yang bergantung pada lebar browser.
 *
 * Pemetaan presentasi (bukan data bisnis):
 * - AI employee → stasiun: kata kunci peran, fallback hash ID.
 * - AI employee → karakter robot: arketipe peran asset pack (Nova Koordinator,
 *   Sage Peneliti, Pixel Analis, Bolt Pembangun, Echo Operator), fallback hash
 *   ID. Nama & identitas agent tidak pernah diubah.
 */

export const OFFICE_WORLD = { width: 1672, height: 941 } as const
/** Pita vertikal dunia yang wajib terlihat di antara HUD atas dan command bar. */
export const OFFICE_SAFE_BAND = { top: 30, height: 875 } as const

/** FNV-1a 32-bit — stabil di server dan browser. */
export function stableHash(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function roleTokens(role: { roleKey: string; roleTitle: string }): Set<string> {
  return new Set(
    `${role.roleKey} ${role.roleTitle}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
}

/* ------------------------------------------------------------------ *
 * Karakter
 * ------------------------------------------------------------------ */

const CHARACTER_KEYWORDS: ReadonlyArray<readonly [CharacterKey, readonly string[]]> = [
  ['pixel', ['analyst', 'analytics', 'finance', 'financial', 'accounting', 'monitoring', 'fleet', 'data', 'insight']],
  ['sage', ['research', 'researcher', 'market', 'scout', 'intelligence', 'knowledge', 'legal', 'compliance']],
  ['nova', ['coordinator', 'manager', 'lead', 'logistics', 'project', 'operations', 'planner', 'hr', 'recruiter']],
  ['bolt', ['engineer', 'developer', 'builder', 'content', 'writer', 'designer', 'marketing', 'sales', 'development']],
  ['echo', ['support', 'customer', 'service', 'operator', 'helpdesk', 'assistant', 'success', 'client', 'account']],
]

export interface AgentIdentityInput {
  id: string
  roleKey: string
  roleTitle: string
}

/** Karakter robot untuk satu AI employee (deterministik, konsisten di semua halaman). */
export function characterForAgent(agent: AgentIdentityInput): CharacterKey {
  const tokens = roleTokens(agent)
  for (const [character, keywords] of CHARACTER_KEYWORDS) {
    if (keywords.some((keyword) => tokens.has(keyword))) return character
  }
  return CHARACTER_KEYS[stableHash(agent.id) % CHARACTER_KEYS.length] ?? 'nova'
}

/* ------------------------------------------------------------------ *
 * Stasiun & Mission Hub
 * ------------------------------------------------------------------ */

export type StationId = Exclude<IslandKey, 'mission-hub'>

export interface StationDefinition {
  id: StationId
  label: string
  purpose: string
  /** Pusat area terlihat pulau (unit dunia). */
  x: number
  y: number
  /** Lebar render (unit dunia). */
  width: number
  /** `far` = pulau di kejauhan (lebih kecil, sedikit redup). */
  depth: 'near' | 'far'
  keywords: readonly string[]
  /** Titik kaki robot, fraksi area terlihat pulau. */
  slots: ReadonlyArray<{ x: number; y: number }>
}

/** Dua slot di platform depan; slot kedua lebih rendah agar label tidak bertumpuk. */
const FRONT_SLOTS = [
  { x: 0.8, y: 0.66 },
  { x: 0.32, y: 0.7 },
] as const

/** Urutan = prioritas pencocokan kata kunci. Posisi mengikuti komposisi referensi. */
export const STATIONS: readonly StationDefinition[] = [
  {
    id: 'client-brief',
    label: 'Client Brief',
    purpose: 'Menerima permintaan pelanggan dan menyusun brief kerja.',
    x: 450,
    y: 452,
    width: 320,
    depth: 'near',
    keywords: ['customer', 'client', 'support', 'service', 'sales', 'account', 'success', 'helpdesk'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'analytics-tool',
    label: 'Analytics Tool',
    purpose: 'Mengolah metrik dan menemukan pola untuk keputusan bisnis.',
    x: 1220,
    y: 435,
    width: 305,
    depth: 'near',
    keywords: ['analyst', 'analytics', 'finance', 'financial', 'accounting', 'monitoring', 'fleet', 'insight'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'data-warehouse',
    label: 'Data Warehouse',
    purpose: 'Menyimpan dan menyiapkan data terstruktur perusahaan.',
    x: 1100,
    y: 222,
    width: 350,
    depth: 'near',
    keywords: ['data', 'database', 'procurement', 'inventory', 'warehouse', 'supply'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'web-research',
    label: 'Web Research',
    purpose: 'Mengumpulkan informasi pasar dan sumber publik.',
    x: 630,
    y: 250,
    width: 345,
    depth: 'near',
    keywords: ['research', 'researcher', 'market', 'seo', 'scout', 'intelligence', 'riset'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'report-builder',
    label: 'Report Builder',
    purpose: 'Merangkai temuan menjadi draf laporan.',
    x: 960,
    y: 695,
    width: 330,
    depth: 'near',
    keywords: ['report', 'reporting', 'writer', 'content', 'copywriter', 'editor', 'documentation'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base',
    purpose: 'Menyimpan SOP, kebijakan, dan pengetahuan internal.',
    x: 565,
    y: 656,
    width: 305,
    depth: 'near',
    keywords: ['knowledge', 'legal', 'compliance', 'policy', 'docs', 'wiki'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'task-manager',
    label: 'Final Report',
    purpose: 'Finalisasi, kontrol kualitas, dan pengiriman hasil kerja.',
    x: 1215,
    y: 648,
    width: 290,
    depth: 'near',
    keywords: ['coordinator', 'logistics', 'project', 'operations', 'ops', 'planner', 'delivery', 'admin'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'training-center',
    label: 'Training Center',
    purpose: 'Rekrutmen, onboarding, dan peningkatan kemampuan tim.',
    x: 929,
    y: 112,
    width: 90,
    depth: 'far',
    keywords: ['hr', 'recruiter', 'recruitment', 'training', 'people', 'talent', 'onboarding'],
    slots: FRONT_SLOTS,
  },
  {
    id: 'research-lab',
    label: 'Research Lab',
    purpose: 'Eksperimen produk dan prototipe solusi baru.',
    x: 428,
    y: 120,
    width: 90,
    depth: 'far',
    keywords: ['engineer', 'developer', 'product', 'lab', 'scientist', 'rnd', 'qa'],
    slots: FRONT_SLOTS,
  },
]

export const MISSION_HUB = {
  island: 'mission-hub' as const,
  label: 'Mission Hub',
  x: 836,
  y: 448,
  width: 460,
  /** Pusat platform cincin (unit dunia) — titik asal jalur energi. */
  core: { x: 836, y: 454 },
}

export interface WorldBox {
  left: number
  top: number
  width: number
  height: number
}

export function islandBox(island: IslandKey, x: number, y: number, width: number): WorldBox {
  const size = visibleSize(ISLANDS[island])
  const height = (width * size.height) / size.width
  return { left: x - width / 2, top: y - height / 2, width, height }
}

export function stationBox(station: StationDefinition): WorldBox {
  return islandBox(station.id, station.x, station.y, station.width)
}

export function hubBox(): WorldBox {
  return islandBox(MISSION_HUB.island, MISSION_HUB.x, MISSION_HUB.y, MISSION_HUB.width)
}

/** Konversi kotak unit dunia → gaya persen (relatif panggung dunia). */
export function boxStyle(box: WorldBox): Record<string, string> {
  return {
    left: `${(box.left / OFFICE_WORLD.width) * 100}%`,
    top: `${(box.top / OFFICE_WORLD.height) * 100}%`,
    width: `${(box.width / OFFICE_WORLD.width) * 100}%`,
  }
}

/** Titik unit dunia → gaya persen. */
export function pointStyle(x: number, y: number): Record<string, string> {
  return { left: `${(x / OFFICE_WORLD.width) * 100}%`, top: `${(y / OFFICE_WORLD.height) * 100}%` }
}

/** Titik pelabuhan energi sebuah stasiun (tengah platform). */
export function stationPort(station: StationDefinition): { x: number; y: number } {
  const box = stationBox(station)
  return { x: station.x, y: box.top + box.height * 0.62 }
}

/* ------------------------------------------------------------------ *
 * Penempatan AI employee (mode live)
 * ------------------------------------------------------------------ */

export interface SceneAgentInput extends AgentIdentityInput {
  name: string
  lifecycleStatus: AgentLifecycleStatus
  createdAt: Date | string
}

export interface PlacedAgent<T extends SceneAgentInput> {
  agent: T
  character: CharacterKey
  stationId: StationId
  slot: number
  /** Titik kaki robot (unit dunia). */
  x: number
  y: number
}

export type StationState = 'active' | 'standby' | 'empty'

export interface SceneStation<T extends SceneAgentInput> {
  definition: StationDefinition
  agents: PlacedAgent<T>[]
  state: StationState
}

export interface OfficeSceneModel<T extends SceneAgentInput> {
  stations: SceneStation<T>[]
  placements: Map<string, PlacedAgent<T>>
  /** Agent non-arsip yang tidak mendapat slot (semua pulau penuh). */
  overflow: T[]
}

function preferredStation(agent: AgentIdentityInput): StationDefinition | undefined {
  const tokens = roleTokens(agent)
  return STATIONS.find((station) => station.keywords.some((keyword) => tokens.has(keyword)))
}

function timeOf(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

/** Titik kaki robot pada slot pulau (unit dunia). */
export function slotPoint(station: StationDefinition, slot: number): { x: number; y: number } {
  const point = station.slots[slot] ?? { x: 0.5, y: 0.66 }
  const box = stationBox(station)
  return { x: box.left + box.width * point.x, y: box.top + box.height * point.y }
}

/**
 * Menempatkan AI employee (non-arsip) ke slot pulau. Diproses menurut urutan
 * pembuatan agar agent baru tidak menggeser penempatan agent lama.
 */
export function buildOfficeScene<T extends SceneAgentInput>(agents: readonly T[]): OfficeSceneModel<T> {
  const ordered = agents
    .filter((agent) => agent.lifecycleStatus !== 'archived')
    .sort((left, right) => timeOf(left.createdAt) - timeOf(right.createdAt) || left.id.localeCompare(right.id))

  const occupancy = new Map<StationId, PlacedAgent<T>[]>(STATIONS.map((station) => [station.id, []]))
  const placements = new Map<string, PlacedAgent<T>>()
  const overflow: T[] = []

  const hasRoom = (station: StationDefinition) => (occupancy.get(station.id)?.length ?? 0) < station.slots.length

  for (const agent of ordered) {
    let station = preferredStation(agent)
    if (!station || !hasRoom(station)) {
      const start = stableHash(agent.id) % STATIONS.length
      station = undefined
      for (let offset = 0; offset < STATIONS.length; offset += 1) {
        const candidate = STATIONS[(start + offset) % STATIONS.length]
        if (candidate && hasRoom(candidate)) {
          station = candidate
          break
        }
      }
    }
    if (!station) {
      overflow.push(agent)
      continue
    }
    const occupants = occupancy.get(station.id) ?? []
    const slot = occupants.length
    const point = slotPoint(station, slot)
    const placed: PlacedAgent<T> = {
      agent,
      character: characterForAgent(agent),
      stationId: station.id,
      slot,
      x: point.x,
      y: point.y,
    }
    occupants.push(placed)
    occupancy.set(station.id, occupants)
    placements.set(agent.id, placed)
  }

  const stations = STATIONS.map((definition) => {
    const placed = occupancy.get(definition.id) ?? []
    const state: StationState = placed.some((item) => item.agent.lifecycleStatus === 'active')
      ? 'active'
      : placed.length > 0
        ? 'standby'
        : 'empty'
    return { definition, agents: placed, state }
  })

  return { stations, placements, overflow }
}

/* ------------------------------------------------------------------ *
 * Jaringan energi (SVG, unit dunia) — digambar DI BELAKANG pulau
 * ------------------------------------------------------------------ */

export type ConnectionKind = 'spoke' | 'mission' | 'link'

export interface EnergyConnection {
  key: string
  kind: ConnectionKind
  from: StationId | 'mission-hub'
  to: StationId
  path: string
  /** Titik tengah kurva (t = 0.5). */
  mid: { x: number; y: number }
  /** Geometri Bézier kuadratik (unit dunia) — dipakai orb teleport. */
  curve: { start: { x: number; y: number }; control: { x: number; y: number }; end: { x: number; y: number } }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function stationById(id: StationId): StationDefinition {
  const station = STATIONS.find((item) => item.id === id)
  if (!station) throw new Error(`Stasiun tidak dikenal: ${id}`)
  return station
}

/**
 * Kurva kuadratik. `away`: melengkung menjauhi pusat Mission Hub (untuk jalur
 * antar stasiun); `clockwise`: selalu ke kanan arah jalur (untuk spoke yang
 * berangkat dari pusat hub — arah "menjauh" di sana tidak terdefinisi dan
 * akan berbeda antara mesin JS server & browser karena pembulatan).
 */
function curve(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bend: number,
  mode: 'away' | 'clockwise',
) {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const dx = end.x - start.x
  const dy = end.y - start.y
  // Hanya operasi dasar + sqrt (dibulatkan tepat oleh IEEE-754) → hasil identik di server & browser.
  const length = Math.sqrt(dx * dx + dy * dy)
  let normal = { x: -dy / length, y: dx / length }
  if (mode === 'away') {
    const away = { x: mid.x - MISSION_HUB.core.x, y: mid.y - MISSION_HUB.core.y }
    // Ambang besar: tanda hanya dipakai bila jelas (tidak sensitif pembulatan).
    if (normal.x * away.x + normal.y * away.y < -1) normal = { x: -normal.x, y: -normal.y }
  }
  const control = { x: mid.x + normal.x * length * bend, y: mid.y + normal.y * length * bend }
  const point = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  }
  return {
    path: `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`,
    mid: { x: round(point.x), y: round(point.y) },
    curve: {
      start: { x: round(start.x), y: round(start.y) },
      control: { x: round(control.x), y: round(control.y) },
      end: { x: round(end.x), y: round(end.y) },
    },
  }
}

/** Rute misi (oranye): kumpulkan data → analisis → finalisasi → laporan. */
export const MISSION_ROUTE: readonly StationId[] = [
  'web-research',
  'data-warehouse',
  'analytics-tool',
  'task-manager',
  'report-builder',
]

const LINKS: ReadonlyArray<readonly [StationId, StationId]> = [
  ['web-research', 'client-brief'],
  ['client-brief', 'knowledge-base'],
  ['knowledge-base', 'report-builder'],
  ['research-lab', 'web-research'],
  ['training-center', 'data-warehouse'],
]

export function energyConnections(): EnergyConnection[] {
  const spokes = STATIONS.map((station) => ({
    key: `spoke:${station.id}`,
    kind: 'spoke' as const,
    from: 'mission-hub' as const,
    to: station.id,
    ...curve(MISSION_HUB.core, stationPort(station), 0.06, 'clockwise'),
  }))
  const mission = MISSION_ROUTE.slice(1).map((id, index) => {
    const from = MISSION_ROUTE[index] ?? id
    return {
      key: `mission:${from}-${id}`,
      kind: 'mission' as const,
      from,
      to: id,
      ...curve(stationPort(stationById(from)), stationPort(stationById(id)), 0.16, 'away'),
    }
  })
  const links = LINKS.map(([from, to]) => ({
    key: `link:${from}-${to}`,
    kind: 'link' as const,
    from,
    to,
    ...curve(stationPort(stationById(from)), stationPort(stationById(to)), 0.12, 'away'),
  }))
  return [...spokes, ...mission, ...links]
}

/* ------------------------------------------------------------------ *
 * Dekorasi lingkungan (unit dunia)
 * ------------------------------------------------------------------ */

export interface TerrainDecor {
  tile: TileKey
  x: number
  y: number
  width: number
  /** Durasi animasi melayang (detik) agar tidak serempak. */
  drift: number
}

export const TERRAIN_DECOR: readonly TerrainDecor[] = [
  { tile: 'purple-forest', x: 318, y: 132, width: 92, drift: 9 },
  { tile: 'evergreen-trees', x: 640, y: 66, width: 52, drift: 11 },
  { tile: 'stone-cluster', x: 1312, y: 96, width: 88, drift: 12 },
  { tile: 'grass', x: 1035, y: 52, width: 56, drift: 10 },
  { tile: 'purple-grass', x: 1392, y: 590, width: 82, drift: 9.5 },
  { tile: 'shrubs', x: 352, y: 778, width: 78, drift: 11.5 },
  { tile: 'purple-forest', x: 1352, y: 812, width: 80, drift: 12.5 },
  { tile: 'grass', x: 598, y: 588, width: 50, drift: 8.5 },
  { tile: 'crystal-rock', x: 1082, y: 600, width: 46, drift: 10.5 },
  { tile: 'stone-cluster', x: 268, y: 560, width: 70, drift: 13 },
  { tile: 'evergreen-trees', x: 1460, y: 300, width: 56, drift: 10 },
]

export interface FxDecor {
  fx: FxKey
  /** Posisi pusat (unit dunia), atau `relay` = titik tengah jalur energi tersebut. */
  x?: number
  y?: number
  relay?: string
  width: number
  motion: 'pulse' | 'float' | 'twinkle'
}

/**
 * Efek di dunia. Portal menandai titik masuk fitur yang belum tersedia
 * (penempatan agent, integrasi alat); relay duduk di tengah jalur energi.
 */
export const WORLD_FX: readonly FxDecor[] = [
  { fx: 'connection-path', x: 842, y: 204, width: 160, motion: 'pulse' },
  { fx: 'portal-cyan', x: 738, y: 712, width: 92, motion: 'pulse' },
  { fx: 'energy-spawn', x: 738, y: 686, width: 52, motion: 'pulse' },
  { fx: 'portal-violet', x: 1046, y: 700, width: 84, motion: 'pulse' },
  { fx: 'hologram-cube', relay: 'spoke:data-warehouse', width: 46, motion: 'float' },
  { fx: 'energy-ring', relay: 'spoke:web-research', width: 44, motion: 'pulse' },
  { fx: 'particles-cyan', x: 668, y: 380, width: 56, motion: 'twinkle' },
  { fx: 'particles-purple', x: 1010, y: 300, width: 56, motion: 'twinkle' },
  { fx: 'particles-cyan', x: 1320, y: 360, width: 48, motion: 'twinkle' },
  { fx: 'particles-purple', x: 380, y: 640, width: 48, motion: 'twinkle' },
  { fx: 'particles-cyan', x: 1030, y: 850, width: 44, motion: 'twinkle' },
]

/** Awan di dunia (di belakang pulau). */
export const WORLD_CLOUDS: ReadonlyArray<{ x: number; y: number; width: number; drift: number }> = [
  { x: 210, y: 390, width: 170, drift: 44 },
  { x: 1500, y: 430, width: 190, drift: 50 },
  { x: 330, y: 880, width: 230, drift: 47 },
  { x: 700, y: 905, width: 200, drift: 53 },
  { x: 1120, y: 900, width: 240, drift: 41 },
  { x: 1460, y: 860, width: 210, drift: 56 },
  { x: 1240, y: 40, width: 150, drift: 59 },
]
