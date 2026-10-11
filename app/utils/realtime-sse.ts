import type { NuxtApp } from '#app'
import type { OfficeRealtimeEvent, OfficeRealtimeTransport, RealtimeConnectionState } from '~~/domains/office/realtime'

const MIN_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

function isRealtimeEvent(value: unknown): value is OfficeRealtimeEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'event' in value &&
    'data' in value &&
    (value.event === 'ready' || value.event === 'heartbeat')
  )
}

/**
 * Transport realtime berbasis SSE melalui Eden Treaty (stream bertipe).
 *
 * Siklus hidup:
 * - `subscribe` membuka koneksi dan mengembalikan fungsi `unsubscribe`.
 * - Koneksi yang terputus dicoba ulang dengan exponential backoff.
 * - 401/403 tidak dicoba ulang (sesi/tenant tidak valid).
 * - `unsubscribe` membatalkan request via AbortController (koneksi ditutup).
 *
 * Kelak dapat diganti transport WebSocket dengan antarmuka yang sama.
 */
export function createSseRealtimeTransport(api: NuxtApp['$api']): OfficeRealtimeTransport {
  return {
    kind: 'sse',
    subscribe({ onEvent, onStateChange }) {
      const controller = new AbortController()
      let retryMs = MIN_RETRY_MS
      let retryTimer: ReturnType<typeof setTimeout> | undefined

      const setState = (state: RealtimeConnectionState) => {
        if (!controller.signal.aborted) onStateChange(state)
      }

      const scheduleRetry = () => {
        if (controller.signal.aborted) return
        setState('reconnecting')
        retryTimer = setTimeout(connect, retryMs)
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
      }

      async function connect() {
        setState('connecting')
        try {
          const { data, error } = await api.v1.realtime.stream.get({ fetch: { signal: controller.signal } })
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
            if (isRealtimeEvent(message)) onEvent(message)
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
