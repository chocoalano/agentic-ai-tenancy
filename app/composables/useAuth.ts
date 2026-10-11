import type { CurrentUser, ActiveTenantContext, MembershipItem } from '~/utils/api-types'

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
 * dimuat ulang setelah login, logout, atau ganti tenant.
 */
export function useAuth() {
  const { $api } = useNuxtApp()
  const state = useState<AuthState>('auth-state', () => ({ ...EMPTY_STATE }))

  const user = computed(() => state.value.user)
  const isAuthenticated = computed(() => state.value.user !== null)
  const activeTenant = computed(() => state.value.activeTenant)
  const activeTenantId = computed(() => state.value.activeTenant?.tenantId ?? null)
  const memberships = computed(() => state.value.memberships)
  const activeMembership = computed(
    () => state.value.memberships.find((membership) => membership.tenant.id === activeTenantId.value) ?? null,
  )

  async function refresh(): Promise<void> {
    const [me, membershipList] = await Promise.all([$api.v1.auth.me.get(), $api.v1.memberships.get()])
    if (me.error || membershipList.error) {
      if (me.error && me.error.status !== 401) throw apiFailure(me.error)
      state.value = { ...EMPTY_STATE, loaded: true }
      return
    }
    state.value = {
      loaded: true,
      user: me.data.user,
      sessionExpiresAt: me.data.session.expiresAt,
      activeTenant: me.data.activeTenant,
      memberships: membershipList.data.items,
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!state.value.loaded) await refresh()
  }

  /** Membuang seluruh data tenant-scoped dari cache Nuxt. */
  function clearTenantData(): void {
    clearNuxtData((key) => isTenantScopedKey(key))
  }

  async function login(input: { email: string; password: string }) {
    const { error } = await $api.v1.auth.login.post(input)
    if (error) return toApiErrorInfo(error)
    clearTenantData()
    await refresh()
    return null
  }

  async function register(input: { email: string; password: string; displayName: string; companyName?: string }) {
    const { error } = await $api.v1.auth.register.post(input)
    if (error) return toApiErrorInfo(error)
    clearTenantData()
    await refresh()
    return null
  }

  async function logout(): Promise<void> {
    await $api.v1.auth.logout.post()
    clearTenantData()
    state.value = { ...EMPTY_STATE, loaded: true }
    await navigateTo('/login')
  }

  /**
   * Ganti tenant: backend memvalidasi keanggotaan, lalu frontend membuang
   * cache data tenant lama dan memuat ulang keanggotaan serta izin.
   */
  async function switchTenant(tenantId: string) {
    const { error } = await $api.v1.tenants({ id: tenantId }).switch.post()
    if (error) return toApiErrorInfo(error)
    clearTenantData()
    await refresh()
    return null
  }

  function can(permission: ActiveTenantContext['permissions'][number]): boolean {
    return state.value.activeTenant?.permissions.includes(permission) ?? false
  }

  return {
    state: readonly(state),
    user,
    isAuthenticated,
    activeTenant,
    activeTenantId,
    activeMembership,
    memberships,
    refresh,
    ensureLoaded,
    login,
    register,
    logout,
    switchTenant,
    clearTenantData,
    can,
  }
}
