/**
 * useAsyncData untuk data tenant-scoped.
 *
 * - Kunci cache memuat ID tenant aktif (`tenant:<id>:<nama>`), sehingga data
 *   tenant A tidak pernah dipakai ulang di bawah tenant B.
 * - Kunci reaktif: saat tenant berganti, Nuxt otomatis mengambil data baru.
 * - `signal` diteruskan ke Eden agar request lama dibatalkan saat kunci berubah.
 * - Bila belum ada tenant aktif, handler tidak dipanggil dan hasilnya `null`.
 */
export function useTenantAsyncData<T>(name: string, handler: (tenantId: string, signal: AbortSignal) => Promise<T>) {
  const auth = useAuth()
  return useAsyncData<T | null>(
    () => tenantDataKey(auth.activeTenantId.value, name),
    (_nuxtApp, { signal }) => {
      const tenantId = auth.activeTenantId.value
      return tenantId ? handler(tenantId, signal) : Promise.resolve(null)
    },
  )
}
