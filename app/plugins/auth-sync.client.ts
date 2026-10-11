import { onAuthSync } from '~/utils/auth-sync'

/** Revalidasi saat tab kembali fokus paling cepat setiap 5 detik. */
const FOCUS_REVALIDATE_MS = 5_000

/**
 * Menjaga semua tab konvergen ke tenant aktif yang otoritatif di server:
 * - pesan BroadcastChannel dari tab lain (login/ganti tenant/logout) memicu
 *   pemuatan ulang konteks dari backend dan pembuangan cache data tenant;
 * - tab yang kembali terlihat/fokus memvalidasi ulang sesinya (menangkap kasus
 *   BroadcastChannel tidak tersedia atau pesan terlewat).
 * Hanya di browser; SSR selalu membaca konteks dari cookie request.
 */
export default defineNuxtPlugin(() => {
  const auth = useAuth()
  let lastRevalidatedAt = Date.now()

  const revalidate = () => {
    lastRevalidatedAt = Date.now()
    void auth.revalidate()
  }

  onAuthSync((message) => {
    if (message.type === 'logged-out') {
      revalidate()
      return
    }
    // Hanya memuat ulang bila konteks tab ini memang berbeda (menghindari refresh beruntun).
    if (message.activeTenantId !== auth.activeTenantId.value || message.userId !== (auth.user.value?.id ?? null)) {
      revalidate()
    }
  })

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    if (!auth.state.value.loaded || !auth.isAuthenticated.value) return
    if (Date.now() - lastRevalidatedAt < FOCUS_REVALIDATE_MS) return
    revalidate()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
})
