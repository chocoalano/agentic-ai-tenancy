import type { CurrentUser, ActiveTenantContext, MembershipItem } from '~/utils/api-types'
import type { ApiErrorInfo } from '~/utils/api-error'
import { postAuthSync } from '~/utils/auth-sync'

interface AuthState {
  loaded: boolean
  user: CurrentUser | null
  sessionExpiresAt: Date | null
  activeTenant: ActiveTenantContext | null
  memberships: MembershipItem[]
}

const EMPTY_STATE: AuthState = {
  loaded: false,
  user: null,
  sessionExpiresAt: null,
  activeTenant: null,
  memberships: [],
}

/**
 * State autentikasi frontend. Sumber kebenaran tetap backend: state ini hanya
 * cermin dari `GET /api/v1/auth/me` dan `GET /api/v1/memberships`, dan selalu
 * dimuat ulang setelah login, logout, ganti tenant, atau ketika ada indikasi
 * perubahan dari luar tab ini (tab lain, SSE, tab kembali fokus).
 */
export function useAuth() {
  const { $api } = useNuxtApp()
  const router = useRouter()
  const state = useState<AuthState>('auth-state', () => ({ ...EMPTY_STATE }))
  /** Kegagalan memuat konteks (backend/database tidak tersedia) — bukan "belum login". */
  const loadFailure = useState<ApiErrorInfo | null>('auth-load-failure', () => null)

  const user = computed(() => state.value.user)
  const isAuthenticated = computed(() => state.value.user !== null)
  const activeTenant = computed(() => state.value.activeTenant)
  const activeTenantId = computed(() => state.value.activeTenant?.tenantId ?? null)
  const memberships = computed(() => state.value.memberships)
  const activeMembership = computed(
    () => state.value.memberships.find((membership) => membership.tenant.id === activeTenantId.value) ?? null,
  )

  /** Membaca konteks otoritatif dari server. 401 = tidak ada sesi; error lain dilempar (bukan "keluar"). */
  async function fetchContext(): Promise<AuthState> {
    const [me, membershipList] = await Promise.all([$api.v1.auth.me.get(), $api.v1.memberships.get()])
    if (me.error) {
      if (me.error.status !== 401) throw apiFailure(me.error)
      return { ...EMPTY_STATE, loaded: true }
    }
    if (membershipList.error) {
      if (membershipList.error.status !== 401) throw apiFailure(membershipList.error)
      return { ...EMPTY_STATE, loaded: true }
    }
    return {
      loaded: true,
      user: me.data.user,
      sessionExpiresAt: me.data.session.expiresAt,
      activeTenant: me.data.activeTenant,
      memberships: membershipList.data.items,
    }
  }

  async function refresh(): Promise<void> {
    state.value = await fetchContext()
    loadFailure.value = null
  }

  /**
   * Memuat konteks sekali per kunjungan. Backend yang tidak tersedia TIDAK
   * menggagalkan render halaman publik: kegagalannya dicatat di `loadFailure`
   * (halaman terlindungi menampilkannya sebagai 503, lihat middleware/auth.ts).
   */
  async function ensureLoaded(): Promise<void> {
    if (state.value.loaded) return
    try {
      await refresh()
    } catch (error) {
      loadFailure.value = apiErrorInfoOf(error) ?? {
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
      }
    }
  }

  /** Membuang seluruh data tenant-scoped dari cache Nuxt. */
  function clearTenantData(): void {
    clearNuxtData((key) => isTenantScopedKey(key))
  }

  function announce(): void {
    postAuthSync({ type: 'session-changed', activeTenantId: activeTenantId.value, userId: user.value?.id ?? null })
  }

  /**
   * Memuat ulang konteks karena ada indikasi perubahan di luar tab ini. Bila
   * pengguna/tenant ternyata berbeda, cache data tenant dibuang SEBELUM state
   * baru dipasang (kunci `useTenantAsyncData` lalu berubah dan data diambil
   * ulang). Sesi yang ternyata sudah berakhir mengarahkan ke /login. Kegagalan
   * jaringan mempertahankan state terakhir yang terkonfirmasi.
   */
  async function revalidate(): Promise<void> {
    const before = { userId: state.value.user?.id ?? null, tenantId: activeTenantId.value }
    let next: AuthState
    try {
      next = await fetchContext()
    } catch {
      return
    }
    const after = { userId: next.user?.id ?? null, tenantId: next.activeTenant?.tenantId ?? null }
    const changed = before.userId !== after.userId || before.tenantId !== after.tenantId
    if (changed) clearTenantData()
    state.value = next
    if (changed && before.userId !== null && after.userId === null) {
      await navigateTo({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
    }
  }

  async function login(input: { email: string; password: string }) {
    const { error } = await $api.v1.auth.login.post(input)
    if (error) return toApiErrorInfo(error)
    clearTenantData()
    await refresh()
    announce()
    return null
  }

  async function register(input: { email: string; password: string; displayName: string; companyName?: string }) {
    const { error } = await $api.v1.auth.register.post(input)
    if (error) return toApiErrorInfo(error)
    clearTenantData()
    await refresh()
    announce()
    return null
  }

  /**
   * Keluar. Kebijakan: state klien dikosongkan hanya bila server mengonfirmasi
   * pencabutan sesi (200) atau menyatakan sesi memang sudah tidak valid (401).
   * Bila jaringan/server gagal, sesi di server mungkin masih hidup — jangan
   * berpura-pura sudah keluar; kembalikan error agar UI menawarkan coba lagi.
   * Konten yang tetap tampil saat itu memang masih diotorisasi sesi tersebut.
   */
  async function logout(): Promise<ApiErrorInfo | null> {
    let outcome: { error: { status: unknown; value: unknown } | null }
    try {
      outcome = await $api.v1.auth.logout.post()
    } catch {
      return { status: 0, code: 'NETWORK_ERROR', message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.' }
    }
    if (outcome.error && outcome.error.status !== 401) return toApiErrorInfo(outcome.error)
    clearTenantData()
    state.value = { ...EMPTY_STATE, loaded: true }
    postAuthSync({ type: 'logged-out' })
    await navigateTo('/login')
    return null
  }

  /**
   * Ganti tenant: backend memvalidasi keanggotaan, lalu frontend membuang
   * cache data tenant lama, memuat ulang keanggotaan serta izin, dan memberi
   * tahu tab lain.
   */
  async function switchTenant(tenantId: string) {
    const { error } = await $api.v1.tenants({ id: tenantId }).switch.post()
    if (error) return toApiErrorInfo(error)
    clearTenantData()
    await refresh()
    announce()
    return null
  }

  function can(permission: ActiveTenantContext['permissions'][number]): boolean {
    return state.value.activeTenant?.permissions.includes(permission) ?? false
  }

  return {
    state: readonly(state),
    loadFailure: readonly(loadFailure),
    user,
    isAuthenticated,
    activeTenant,
    activeTenantId,
    activeMembership,
    memberships,
    refresh,
    revalidate,
    ensureLoaded,
    login,
    register,
    logout,
    switchTenant,
    clearTenantData,
    can,
  }
}
