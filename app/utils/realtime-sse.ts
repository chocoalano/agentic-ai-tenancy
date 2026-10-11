import type { NuxtApp } from '#app'
import {
  isAgentEventType,
  type OfficeRealtimeEvent,
  type OfficeRealtimeTransport,
  type RealtimeConnectionState,
} from '~~/domains/office/realtime'

const MIN_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

const CONTROL_EVENTS = new Set(['ready', 'heartbeat', 'closed'])

function isRealtimeEvent(value: unknown): value is OfficeRealtimeEvent {
  if (typeof value !== 'object' || value === null || !('event' in value) || !('data' in value)) return false
  const event = value.event
  if (typeof event !== 'string') return false
  if (typeof value.data !== 'object' || value.data === null) return false
  return CONTROL_EVENTS.has(event) || isAgentEventType(event)
}

export interface SseTransportOptions {
  /** Id event bisnis terakhir yang diproses tab (untuk `Last-Event-ID` saat sambung ulang). */
  lastEventId?: () => number | null
}

/**
 * Transport realtime berbasis SSE melalui Eden Treaty (stream bertipe).
 *
 * Siklus hidup:
 * - `subscribe` membuka koneksi dan mengembalikan fungsi `unsubscribe`.
 * - Koneksi yang terputus dicoba ulang dengan exponential backoff, menyertakan
 *   `Last-Event-ID` agar event yang terlewat diputar ulang server (dalam retensi).
 * - 401/403 tidak dicoba ulang (sesi/tenant tidak valid).
 * - Event `closed` dari server (otorisasi tidak lagi valid) menghentikan
 *   percobaan ulang; pemilik koneksi (useOfficeRealtime) memutuskan langkah
 *   berikutnya setelah memuat ulang konteks dari server.
 * - `unsubscribe` membatalkan request via AbortController (koneksi ditutup).
 */
export function createSseRealtimeTransport(
  api: NuxtApp['$api'],
  options: SseTransportOptions = {},
): OfficeRealtimeTransport {
  return {
    kind: 'sse',
    subscribe({ onEvent, onStateChange }) {
      const controller = new AbortController()
      let retryMs = MIN_RETRY_MS
      let retryTimer: ReturnType<typeof setTimeout> | undefined
      let closedByServer = false

      const setState = (state: RealtimeConnectionState) => {
        if (!controller.signal.aborted) onStateChange(state)
      }

      const scheduleRetry = () => {
        if (controller.signal.aborted || closedByServer) return
        setState('reconnecting')
        retryTimer = setTimeout(connect, retryMs)
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
      }

      async function connect() {
        setState('connecting')
        try {
          const lastEventId = options.lastEventId?.() ?? null
          const headers: Record<string, string> = {}
          if (lastEventId !== null && lastEventId > 0) headers['last-event-id'] = String(lastEventId)
          const { data, error } = await api.v1.realtime.stream.get({ headers, fetch: { signal: controller.signal } })
          if (error) {
            if (error.status === 401 || error.status === 403) {
              setState('error')
              return
            }
            scheduleRetry()
            return
          }
          setState('open')
          retryMs = MIN_RETRY_MS
          for await (const message of data) {
            if (!isRealtimeEvent(message)) continue
            onEvent(message)
            if (message.event === 'closed') {
              closedByServer = true
              setState('closed')
              return
            }
          }
          scheduleRetry()
        } catch {
          if (controller.signal.aborted) return
          scheduleRetry()
        }
      }

      void connect()

      return () => {
        if (retryTimer) clearTimeout(retryTimer)
        controller.abort()
        onStateChange('closed')
      }
    },
  }
}
