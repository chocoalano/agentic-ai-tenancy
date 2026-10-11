import type {
  OfficeRealtimeEvent,
  OfficeRealtimeTransport,
  RealtimeClosedEvent,
  RealtimeConnectionState,
} from '~~/domains/office/realtime'

/**
 * Konsumen SSE Virtual Office untuk komponen.
 *
 * Hanya berjalan di browser. Koneksi dibuka saat komponen di-mount, ditutup
 * saat unmount (AbortController), dan dibuka ulang ketika tenant aktif
 * berganti sehingga stream selalu milik tenant yang sedang dipilih.
 *
 * - `ready` membawa tenant aktif di SESI SERVER; bila berbeda dari tab ini
 *   (tab lain sudah berganti), konteks tab dimuat ulang agar konvergen.
 * - Event bisnis membawa `eventId` monoton: id terakhir disimpan dan dikirim
 *   sebagai `Last-Event-ID` saat sambung ulang (replay oleh server). Bila
 *   server menjawab `replayed: false` (celah terlalu besar), pemanggil harus
 *   sinkron ulang dari snapshot (`resyncNeeded`).
 * - `closed` (otorisasi tidak lagi valid) → konteks dimuat ulang dari server;
 *   koneksi hanya dibuka lagi bila tenant aktif masih ada.
 */
export function useOfficeRealtime(options: { transport?: OfficeRealtimeTransport } = {}) {
  const { $api } = useNuxtApp()
  const auth = useAuth()
  const state = ref<RealtimeConnectionState>('idle')
  const lastEvent = shallowRef<OfficeRealtimeEvent | null>(null)
  const connectedTenantId = ref<string | null>(null)
  const lastEventId = ref<number | null>(null)
  const lastClosedReason = ref<RealtimeClosedEvent['data']['reason'] | null>(null)
  /** Naik setiap kali klien harus memuat ulang snapshot otoritatif (celah replay / koneksi baru). */
  const resyncNeeded = ref(0)
  let unsubscribe: (() => void) | null = null

  function stop() {
    unsubscribe?.()
    unsubscribe = null
  }

  function start() {
    stop()
    if (!auth.activeTenantId.value) {
      state.value = 'idle'
      return
    }
    const transport = options.transport ?? createSseRealtimeTransport($api, { lastEventId: () => lastEventId.value })
    unsubscribe = transport.subscribe({
      onEvent(event) {
        lastEvent.value = event
        if (event.event === 'ready') {
          connectedTenantId.value = event.data.tenantId
          if (event.data.tenantId !== auth.activeTenantId.value) {
            void auth.revalidate()
            return
          }
          if (!event.data.replayed) resyncNeeded.value += 1
          if (lastEventId.value === null || lastEventId.value < event.data.lastEventId) {
            lastEventId.value = event.data.lastEventId
          }
          return
        }
        if (event.event === 'closed') {
          lastClosedReason.value = event.data.reason
          void auth.revalidate().then(() => {
            if (auth.activeTenantId.value && import.meta.client) start()
          })
          return
        }
        if (event.event !== 'heartbeat' && typeof event.data.eventId === 'number') {
          lastEventId.value = Math.max(lastEventId.value ?? 0, event.data.eventId)
        }
      },
      onStateChange(next) {
        state.value = next
      },
    })
  }

  onMounted(start)
  onBeforeUnmount(stop)
  watch(auth.activeTenantId, () => {
    lastEventId.value = null
    if (import.meta.client) start()
  })

  return {
    state,
    lastEvent,
    connectedTenantId,
    lastEventId,
    lastClosedReason,
    resyncNeeded,
    reconnect: start,
    disconnect: stop,
  }
}
