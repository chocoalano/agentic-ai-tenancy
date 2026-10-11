import type { ApprovalStatus, RunStatus, TaskStatus } from '../tasks/types'

/**
 * Kontrak event realtime Virtual Office (versi skema 1).
 *
 * Dikirim melalui SSE (`GET /api/v1/realtime/stream`) hanya kepada koneksi
 * yang terautentikasi, keanggotaannya divalidasi ulang berkala, dan memiliki
 * izin `tasks.read` untuk event bisnis. Payload kecil, tersanitasi (tanpa
 * prompt, penalaran model, kredensial, atau pesan error mentah), dan selalu
 * membawa `eventId` monoton (id outbox) untuk deduplikasi/urutan serta replay
 * `Last-Event-ID` di dalam retensi outbox.
 */
export const REALTIME_SCHEMA_VERSION = 1

export interface RealtimeReadyEvent {
  event: 'ready'
  data: {
    tenantId: string
    connectionId: string
    serverTime: Date
    heartbeatIntervalMs: number
    /** Id event outbox terakhir yang diketahui server saat koneksi dibuka (titik awal replay). */
    lastEventId: number
    /** true bila klien mengirim Last-Event-ID dan event yang terlewat berhasil diputar ulang. */
    replayed: boolean
  }
}

export interface RealtimeHeartbeatEvent {
  event: 'heartbeat'
  data: {
    serverTime: Date
  }
}

/** Server menutup stream karena otorisasi tidak lagi valid; klien tidak boleh menyambung ulang membabi buta. */
export interface RealtimeClosedEvent {
  event: 'closed'
  data: {
    reason: 'SESSION_INVALID' | 'TENANT_CHANGED' | 'ACCESS_REVOKED' | 'PERMISSION_REVOKED' | 'SERVER_SHUTDOWN'
    serverTime: Date
  }
}

export const AGENT_EVENT_TYPES = [
  'agent.task.created',
  'agent.task.queued',
  'agent.run.started',
  'agent.run.activity',
  'agent.run.waiting_approval',
  'agent.run.completed',
  'agent.run.failed',
  'agent.run.canceled',
  'approval.requested',
  'approval.decided',
] as const
export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number]

/** Payload umum semua event bisnis. */
export interface AgentEventBase {
  eventId: number
  schemaVersion: number
  tenantId: string
  agentId: string
  taskId: string
  runId: string | null
  taskStatus: TaskStatus
  runStatus: RunStatus | null
  occurredAt: Date
}

export interface AgentTaskEventData extends AgentEventBase {
  title: string
}

export interface AgentRunActivityData extends AgentEventBase {
  /** Deskripsi aktivitas tingkat tinggi yang aman (bukan penalaran model). */
  activity: string
}

export interface AgentRunCompletedData extends AgentEventBase {
  /** Hasil dirilis ke pengguna (false bila menunggu persetujuan). */
  released: boolean
  outputType: 'text' | 'markdown' | null
}

export interface AgentRunFailedData extends AgentEventBase {
  errorCode: string
  errorMessage: string
  retryScheduled: boolean
}

export interface ApprovalEventData extends AgentEventBase {
  approvalId: string
  actionType: string
  actionSummary: string
  approvalStatus: ApprovalStatus
}

export type AgentRealtimeEvent =
  | { event: 'agent.task.created'; data: AgentTaskEventData }
  | { event: 'agent.task.queued'; data: AgentTaskEventData }
  | { event: 'agent.run.started'; data: AgentRunActivityData }
  | { event: 'agent.run.activity'; data: AgentRunActivityData }
  | { event: 'agent.run.waiting_approval'; data: ApprovalEventData }
  | { event: 'agent.run.completed'; data: AgentRunCompletedData }
  | { event: 'agent.run.failed'; data: AgentRunFailedData }
  | { event: 'agent.run.canceled'; data: AgentEventBase }
  | { event: 'approval.requested'; data: ApprovalEventData }
  | { event: 'approval.decided'; data: ApprovalEventData }

export type OfficeRealtimeEvent = RealtimeReadyEvent | RealtimeHeartbeatEvent | RealtimeClosedEvent | AgentRealtimeEvent

export function isAgentEventType(value: string): value is AgentEventType {
  return (AGENT_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * Antarmuka transport realtime. Implementasi saat ini: SSE di dalam proses
 * Nuxt/Nitro. Implementasi berikutnya: gateway WebSocket Bun/Elysia mandiri.
 */
export interface OfficeRealtimeTransport {
  readonly kind: 'sse' | 'websocket'
  subscribe(handlers: {
    onEvent: (event: OfficeRealtimeEvent) => void
    onStateChange: (state: RealtimeConnectionState) => void
  }): () => void
}

export type RealtimeConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'
