import type { StationId } from '~/utils/office-layout'

/*
 * Model presentasi panel pendukung Virtual Office (misi, leaderboard,
 * aktivitas, persetujuan). Backend untuk data ini BELUM ada pada Phase 1:
 * halaman nyata selalu mengirim daftar kosong (empty state jujur), dan
 * hanya halaman pratinjau desain (/design, khusus dev) yang memakai data
 * contoh berlabel. Saat API tersedia, tipe ini diganti turunan `$api`.
 */
export interface MissionView {
  id: string
  title: string
  description: string
  /** 0–100 */
  progress: number
  rewardXp: number
  dueLabel?: string
  status: 'active' | 'completed' | 'blocked'
}

export interface LeaderboardEntryView {
  agentId: string
  name: string
  roleTitle: string
  level: number
  xp: number
  xpTarget: number
}

export interface ActivityItemView {
  id: string
  actor: string
  summary: string
  timeLabel: string
  tone: 'success' | 'warning' | 'info' | 'neutral'
}

export interface ApprovalRequestView {
  id: string
  agentName: string
  title: string
  requestedLabel: string
  risk: 'low' | 'medium' | 'high'
}

/** Objek yang dipilih di dunia Virtual Office (dibagi dunia, panel HUD, quick-view). */
export type OfficeSelection =
  | { kind: 'hub' }
  | { kind: 'station'; stationId: StationId }
  | { kind: 'actor'; key: string }
  | { kind: 'step'; stepId: string }
