import type { CharacterKey } from '../utils/game-assets'
import type { ActivityState } from './agent-state'
import { STATION_DEFAULT_ACTIVITY } from './workstations'
import type { IslandId } from './world'

/*
 * Arsitektur perintah: VISUAL (frontend saja) vs BISNIS (butuh operasi backend
 * terautentikasi). Status dukungan di bawah mencerminkan API yang BENAR-BENAR
 * ada pada Phase 1 — backend saat ini hanya menyediakan baca agent/tenant dan
 * SSE `ready`/`heartbeat`. Kode simulasi pratinjau tidak pernah menjadi jalur
 * eksekusi aksi AI nyata.
 */

export type CommandKind = 'visual' | 'business'

export interface CommandDefinition {
  key: string
  label: string
  kind: CommandKind
  /** Mode live: didukung backend saat ini? */
  live: { supported: boolean; reason: string }
  /** Mode pratinjau: tersedia sebagai simulasi berlabel? */
  preview: boolean
}

export const AGENT_COMMANDS: readonly CommandDefinition[] = [
  {
    key: 'assign_task',
    label: 'Tugaskan',
    kind: 'business',
    live: { supported: false, reason: 'Butuh modul tugas & Agent Orchestrator (belum ada endpoint).' },
    preview: true,
  },
  {
    key: 'chat',
    label: 'Chat',
    kind: 'business',
    live: { supported: false, reason: 'Butuh AI Runtime Interface; tidak ada inferensi AI di Phase 1.' },
    preview: true,
  },
  {
    key: 'move',
    label: 'Pindah ke workstation',
    kind: 'visual',
    live: { supported: true, reason: 'Hanya posisi tampilan — tidak mengubah penugasan di backend.' },
    preview: true,
  },
  {
    key: 'inspect',
    label: 'Lihat aktivitas',
    kind: 'visual',
    live: { supported: true, reason: 'Menampilkan status terakhir yang dikonfirmasi backend.' },
    preview: true,
  },
  {
    key: 'profile',
    label: 'Profil',
    kind: 'visual',
    live: { supported: true, reason: 'Membuka /agents/:id.' },
    preview: false,
  },
  {
    key: 'pause',
    label: 'Jeda agent',
    kind: 'business',
    live: { supported: false, reason: 'API mengubah status agent belum tersedia (Phase 1 read-only).' },
    preview: true,
  },
  {
    key: 'resume',
    label: 'Lanjutkan agent',
    kind: 'business',
    live: { supported: false, reason: 'API mengubah status agent belum tersedia (Phase 1 read-only).' },
    preview: true,
  },
  {
    key: 'run_atlas',
    label: 'Jalankan Project Atlas',
    kind: 'business',
    live: {
      supported: false,
      reason: 'Skenario misi hanya simulasi pratinjau; eksekusi nyata butuh Agent Orchestrator.',
    },
    preview: true,
  },
  {
    key: 'reset_simulation',
    label: 'Reset simulasi',
    kind: 'business',
    live: { supported: false, reason: 'Tidak ada simulasi di mode live; posisi robot mengikuti data backend.' },
    preview: true,
  },
]

export type InstructionIntent =
  'approval' | 'research' | 'analyze' | 'report' | 'coordinate' | 'tool' | 'knowledge' | 'brief'

export interface ParsedInstruction {
  /** Karakter yang dituju (disebut namanya di teks, atau yang sedang dipilih). */
  target: CharacterKey | null
  intent: InstructionIntent | null
  /** Workstation tujuan; null = tetap di tempat (mis. permintaan persetujuan). */
  island: IslandId | null
  activity: ActivityState
  /** Mulai skenario Project Atlas penuh (perintah riset/koordinasi untuk Nova). */
  startsMission: boolean
}

const NAMES: ReadonlyArray<readonly [CharacterKey, RegExp]> = [
  ['nova', /\bnova\b/i],
  ['sage', /\bsage\b/i],
  ['pixel', /\bpixel\b/i],
  ['bolt', /\bbolt\b/i],
  ['echo', /\becho\b/i],
]

const INTENTS: ReadonlyArray<readonly [InstructionIntent, RegExp, IslandId | null, ActivityState]> = [
  // Diperiksa pertama: "minta persetujuan sebelum menjalankan tool" = persetujuan, bukan tool.
  ['approval', /persetujuan|approval|setujui|minta izin/i, null, 'waiting_approval'],
  ['coordinate', /koordinasi|koordinir|orkestrasi|coordinate|seluruh tim|semua tim/i, 'mission-hub', 'communicating'],
  ['report', /laporan|report|rangkum|dokumen/i, 'report-builder', 'working'],
  ['analyze', /analisis|analisa|analyz|analys|tren|metrik/i, 'analytics-tool', 'working'],
  ['tool', /\btool\b|alat|jalankan|operasi|data warehouse|dataset/i, 'data-warehouse', 'using_tool'],
  ['knowledge', /pengetahuan|knowledge|sop|kebijakan/i, 'knowledge-base', 'reading'],
  ['research', /riset|research|cari|sumber|pasar/i, 'web-research', 'researching'],
  ['brief', /brief|klien|client|pelanggan/i, 'client-brief', 'communicating'],
]

/**
 * Pengurai instruksi PRATINJAU (pencocokan kata kunci, bukan AI): menentukan
 * karakter tujuan dan aktivitas yang akan disimulasikan.
 */
export function parsePreviewInstruction(text: string, selected: CharacterKey | null): ParsedInstruction {
  // Yang dituju = nama karakter yang disebut PERTAMA ("Pixel, analisis hasil riset Sage").
  let named: CharacterKey | null = null
  let firstIndex = Infinity
  for (const [character, pattern] of NAMES) {
    const index = text.search(pattern)
    if (index >= 0 && index < firstIndex) {
      firstIndex = index
      named = character
    }
  }
  const target = named ?? selected
  const match = INTENTS.find(([, pattern]) => pattern.test(text))
  const intent = match?.[0] ?? null
  const startsMission = target === 'nova' && (intent === 'research' || intent === 'coordinate')
  return {
    target,
    intent,
    island: match?.[2] ?? null,
    activity: match?.[3] ?? 'thinking',
    startsMission,
  }
}

/**
 * Aktivitas yang dijalankan robot saat tiba di workstation (simulasi pratinjau) =
 * aktivitas default stasiun dari sistem workstation (`app/game/workstations.ts`).
 */
export const STATION_ACTIVITY: Record<IslandId, ActivityState> = STATION_DEFAULT_ACTIVITY
