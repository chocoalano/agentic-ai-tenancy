/**
 * Kontrak domain tugas & run AI employee (murni; dipakai backend dan frontend).
 *
 * State tingkat TUGAS terpisah dari state tiap PERCOBAAN eksekusi (run):
 * satu tugas dapat memiliki beberapa run (percobaan ulang setelah kegagalan
 * infrastruktur). State terminal tidak pernah ditimpa oleh event yang
 * datang terlambat (dijaga transisi di sini + compare-and-swap di database).
 */

export const TASK_STATUSES = [
  'created',
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'canceled',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const RUN_STATUSES = [
  'queued',
  'claimed',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'canceled',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'canceled'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const OUTPUT_TYPES = ['text', 'markdown'] as const
export type OutputType = (typeof OUTPUT_TYPES)[number]

/** Satu-satunya aksi yang dilindungi persetujuan pada Phase 5: merilis hasil ke pengguna. */
export const APPROVAL_ACTION_TYPES = ['release_result'] as const
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number]

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  created: ['queued', 'canceled', 'failed'],
  queued: ['running', 'canceled', 'failed'],
  running: ['completed', 'failed', 'waiting_approval', 'canceled', 'queued'],
  waiting_approval: ['completed', 'failed', 'canceled'],
  completed: [],
  failed: [],
  canceled: [],
}

export const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['claimed', 'canceled', 'failed'],
  claimed: ['running', 'queued', 'failed', 'canceled'],
  running: ['completed', 'failed', 'waiting_approval', 'canceled'],
  waiting_approval: ['completed', 'failed', 'canceled'],
  completed: [],
  failed: [],
  canceled: [],
}

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'canceled']
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ['completed', 'failed', 'canceled']
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['queued', 'claimed', 'running', 'waiting_approval']

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to)
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to)
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status)
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status)
}

/** Kode error run yang aman ditampilkan (bukan pesan mentah provider/driver). */
export const RUN_ERROR_CODES = [
  'RUNTIME_NOT_CONFIGURED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_REJECTED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_INVALID_RESPONSE',
  'OUTPUT_TOO_LARGE',
  'LEASE_EXPIRED',
  'CANCELED',
  'APPROVAL_REJECTED',
  'APPROVAL_EXPIRED',
  'ATTEMPTS_EXHAUSTED',
  'INTERNAL_ERROR',
] as const
export type RunErrorCode = (typeof RUN_ERROR_CODES)[number]

export const RUN_ERROR_MESSAGES: Record<RunErrorCode, string> = {
  RUNTIME_NOT_CONFIGURED: 'Runtime AI belum dikonfigurasi di server.',
  PROVIDER_TIMEOUT: 'Penyedia AI tidak menjawab dalam batas waktu.',
  PROVIDER_UNAVAILABLE: 'Penyedia AI sedang tidak tersedia.',
  PROVIDER_REJECTED: 'Penyedia AI menolak permintaan ini.',
  PROVIDER_RATE_LIMITED: 'Penyedia AI membatasi laju permintaan.',
  PROVIDER_INVALID_RESPONSE: 'Jawaban penyedia AI tidak dapat diproses.',
  OUTPUT_TOO_LARGE: 'Hasil melebihi batas ukuran yang diizinkan.',
  LEASE_EXPIRED: 'Worker eksekusi terputus; tugas dipulihkan.',
  CANCELED: 'Dibatalkan oleh pengguna.',
  APPROVAL_REJECTED: 'Hasil ditolak oleh pengambil keputusan.',
  APPROVAL_EXPIRED: 'Persetujuan kedaluwarsa sebelum diputuskan.',
  ATTEMPTS_EXHAUSTED: 'Percobaan ulang sudah habis.',
  INTERNAL_ERROR: 'Terjadi kesalahan internal saat eksekusi.',
}

/** Status runtime agent yang diturunkan dari run aktif terbaru (untuk UI & game). */
export function runtimeStatusOfRun(status: RunStatus | null): 'thinking' | 'working' | 'waiting_approval' | null {
  switch (status) {
    case 'queued':
    case 'claimed':
      return 'thinking'
    case 'running':
      return 'working'
    case 'waiting_approval':
      return 'waiting_approval'
    default:
      return null
  }
}
