import { ACTIVE_TENANT_HEADER, TENANT_MISMATCH_CODE } from '~~/domains/tenancy/headers'

/** Opsi request Eden untuk data tenant: header konsistensi tenant + sinyal pembatalan. */
export interface TenantRequestOptions {
  headers: Record<string, string>
  fetch: { signal: AbortSignal }
}

/**
 * useAsyncData untuk data tenant-scoped.
 *
 * - Kunci cache memuat ID tenant aktif (`tenant:<id>:<nama>`), sehingga data
 *   tenant A tidak pernah dipakai ulang di bawah tenant B.
 * - Kunci reaktif: saat tenant berganti, Nuxt otomatis mengambil data baru dan
 *   membatalkan request lama lewat `signal`.
 * - `request` membawa header `x-active-tenant`: server menolak 409 bila tenant
 *   aktif sesi (dibagi semua tab) sudah berbeda — respons tenant lain tidak
 *   pernah tersimpan di bawah kunci tenant ini. Pada 409, konteks tab dimuat
 *   ulang dari server (`useAuth().revalidate()`), kunci berubah, data diambil
 *   ulang. Teruskan `request` ke setiap pemanggilan `$api`.
 * - Bila belum ada tenant aktif, handler tidak dipanggil dan hasilnya `null`.
 */
export function useTenantAsyncData<T>(
  name: string,
  handler: (tenantId: string, signal: AbortSignal, request: TenantRequestOptions) => Promise<T>,
) {
  const auth = useAuth()
  return useAsyncData<T | null>(
    () => tenantDataKey(auth.activeTenantId.value, name),
    async (_nuxtApp, { signal }) => {
      const tenantId = auth.activeTenantId.value
      if (!tenantId) return null
      try {
        return await handler(tenantId, signal, { headers: { [ACTIVE_TENANT_HEADER]: tenantId }, fetch: { signal } })
      } catch (error) {
        if (apiErrorCodeOf(error) === TENANT_MISMATCH_CODE) void auth.revalidate()
        throw error
      }
    },
  )
}
