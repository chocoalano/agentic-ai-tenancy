/**
 * Kontrak event realtime Virtual Office.
 *
 * Phase 1 mengirim event ini melalui SSE (`GET /api/v1/realtime/stream`).
 * Gateway WebSocket di masa depan (layanan Bun/Elysia terpisah) wajib memakai
 * kontrak yang sama sehingga konsumen di frontend tidak perlu berubah.
 */
export interface RealtimeReadyEvent {
  event: 'ready'
  data: {
    tenantId: string
    connectionId: string
    serverTime: Date
    heartbeatIntervalMs: number
  }
}

export interface RealtimeHeartbeatEvent {
  event: 'heartbeat'
  data: {
    serverTime: Date
  }
}

export type OfficeRealtimeEvent = RealtimeReadyEvent | RealtimeHeartbeatEvent

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
