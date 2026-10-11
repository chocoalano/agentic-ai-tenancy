import type { AgentLifecycleStatus } from '../../domains/agents/types'

/*
 * Misi persiapan kantor — DITURUNKAN dari data nyata perusahaan (tenant,
 * anggota aktif, AI employee). Bukan modul misi/gamifikasi (belum ada di
 * backend): tidak ada XP, hadiah, atau progres karangan. Langkah yang
 * bergantung pada fitur belum tersedia ditandai `locked`.
 */

export type MissionStepStatus = 'done' | 'todo' | 'locked'

export interface MissionStep {
  id: 'company' | 'recruit' | 'activate' | 'team' | 'runtime'
  title: string
  description: string
  status: MissionStepStatus
  /** Sumber data yang menentukan status langkah (ditampilkan apa adanya). */
  evidence: string
  link?: { to: string; label: string }
}

export interface SetupMission {
  title: string
  description: string
  steps: MissionStep[]
  completed: number
  total: number
  /** 0–100, dibulatkan. */
  progress: number
}

export interface SetupMissionInput {
  tenantName: string
  activeMemberCount: number
  agents: ReadonlyArray<{ lifecycleStatus: AgentLifecycleStatus }>
}

export function deriveSetupMission(input: SetupMissionInput): SetupMission {
  const employed = input.agents.filter((agent) => agent.lifecycleStatus !== 'archived').length
  const active = input.agents.filter((agent) => agent.lifecycleStatus === 'active').length

  const steps: MissionStep[] = [
    {
      id: 'company',
      title: 'Daftarkan perusahaan',
      description: 'Ruang kerja perusahaan dibuat dan terisolasi per tenant.',
      status: 'done',
      evidence: `Tenant aktif: ${input.tenantName}`,
    },
    {
      id: 'recruit',
      title: 'Rekrut AI employee pertama',
      description: 'Minimal satu AI employee terdaftar di kantor (selain yang diarsipkan).',
      status: employed > 0 ? 'done' : 'todo',
      evidence: `${employed} AI employee terdaftar`,
      link: { to: '/agents', label: 'Lihat AI employee' },
    },
    {
      id: 'activate',
      title: 'Aktifkan AI employee',
      description: 'Minimal satu konfigurasi AI employee berstatus aktif dan siap ditugaskan.',
      status: active > 0 ? 'done' : 'todo',
      evidence: `${active} AI employee aktif`,
      link: { to: '/agents', label: 'Kelola status' },
    },
    {
      id: 'team',
      title: 'Bentuk tim manusia',
      description: 'Undang minimal satu anggota tim lain untuk mengawasi AI employee.',
      status: input.activeMemberCount >= 2 ? 'done' : 'todo',
      evidence: `${input.activeMemberCount} anggota aktif`,
      link: { to: '/settings?tab=company', label: 'Lihat perusahaan' },
    },
    {
      id: 'runtime',
      title: 'Hubungkan runtime AI',
      description: 'Agent Orchestrator dan adapter AI Runtime belum tersedia pada Phase 1.',
      status: 'locked',
      evidence: 'Orchestrator belum terhubung',
    },
  ]

  const completed = steps.filter((step) => step.status === 'done').length
  return {
    title: 'Siapkan Kantor Virtual',
    description: 'Progres dihitung langsung dari data perusahaan Anda. Misi kerja AI hadir bersama orchestrator.',
    steps,
    completed,
    total: steps.length,
    progress: Math.round((completed / steps.length) * 100),
  }
}
