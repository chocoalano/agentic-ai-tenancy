import type { ApprovalStatus, RunStatus, TaskStatus } from '~~/domains/tasks/types'

/** Label status tugas/run/persetujuan (Bahasa Indonesia) untuk UI. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  created: 'Dibuat',
  queued: 'Antre',
  running: 'Berjalan',
  waiting_approval: 'Menunggu persetujuan',
  completed: 'Selesai',
  failed: 'Gagal',
  canceled: 'Dibatalkan',
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Antre',
  claimed: 'Diklaim worker',
  running: 'Berjalan',
  waiting_approval: 'Menunggu persetujuan',
  completed: 'Selesai',
  failed: 'Gagal',
  canceled: 'Dibatalkan',
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  expired: 'Kedaluwarsa',
  canceled: 'Dibatalkan',
}

/** Alasan server menutup stream realtime → pesan untuk pengguna. */
export const REALTIME_CLOSED_LABELS: Record<string, string> = {
  SESSION_INVALID: 'Sesi tidak lagi valid. Silakan masuk kembali.',
  TENANT_CHANGED: 'Perusahaan aktif berubah di tab lain.',
  ACCESS_REVOKED: 'Akses ke perusahaan ini dicabut.',
  PERMISSION_REVOKED: 'Izin Anda berubah; koneksi realtime ditutup.',
  SERVER_SHUTDOWN: 'Server sedang dimulai ulang.',
}
