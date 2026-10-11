import type { OfficeRealtimeEvent, OfficeRealtimeTransport, RealtimeConnectionState } from '~~/domains/office/realtime'

/**
 * Konsumen SSE Virtual Office untuk komponen.
 *
 * Hanya berjalan di browser. Koneksi dibuka saat komponen di-mount, ditutup
 * saat unmount (AbortController), dan dibuka ulang ketika tenant aktif
 * berganti sehingga stream selalu milik tenant yang sedang dipilih. Event
 * `ready` membawa tenant aktif di SESI SERVER; bila berbeda dari tab ini
 * (tab lain sudah berganti), konteks tab dimuat ulang agar konvergen.
 */
export function useOfficeRealtime(options: { transport?: OfficeRealtimeTransport } = {}) {
  const { $api } = useNuxtApp()
  const auth = useAuth()
  const state = ref<RealtimeConnectionState>('idle')
  const lastEvent = shallowRef<OfficeRealtimeEvent | null>(null)
  const connectedTenantId = ref<string | null>(null)
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
    const transport = options.transport ?? createSseRealtimeTransport($api)
    unsubscribe = transport.subscribe({
      onEvent(event) {
        lastEvent.value = event
        if (event.event === 'ready') {
          connectedTenantId.value = event.data.tenantId
          if (event.data.tenantId !== auth.activeTenantId.value) void auth.revalidate()
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
    if (import.meta.client) start()
  })

  return { state, lastEvent, connectedTenantId, reconnect: start, disconnect: stop }
}
