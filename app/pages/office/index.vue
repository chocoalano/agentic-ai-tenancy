<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'

/*
 * /office — Virtual Office sebagai game manajemen AI layar penuh.
 * Layout `game` (tanpa sidebar/topbar aplikasi); mode warna dipaksa gelap
 * hanya di halaman ini (preferensi pengguna tidak diubah). Autentikasi tetap
 * lewat middleware `auth`; data tenant lewat Eden + `useTenantAsyncData`.
 */
definePageMeta({ layout: 'game', middleware: 'auth', title: 'Virtual Office', colorMode: 'dark' })
useHead({ title: 'Virtual Office' })

const { $api } = useNuxtApp()
const auth = useAuth()

/*
 * Data fetching SSR melalui Eden Treaty: saat render server, `$api` memanggil
 * aplikasi Elysia in-process dengan cookie pengguna; di browser, request yang
 * sama dikirim ke /api/v1/*. Kunci cache memuat ID tenant.
 */
const { data, status, error, refresh } = await useTenantAsyncData('office-overview', async (tenantId, signal) => {
  const [tenant, agents] = await Promise.all([
    $api.v1.tenants({ id: tenantId }).get({ fetch: { signal } }),
    $api.v1.agents.get({ fetch: { signal } }),
  ])
  if (tenant.error) throw apiFailure(tenant.error)
  if (agents.error) throw apiFailure(agents.error)
  return { tenant: tenant.data, agents: agents.data.items }
})
</script>

<template>
  <GameOffice
    v-if="auth.activeTenantId.value && data"
    :tenant="data.tenant"
    :agents="data.agents"
    :user-name="auth.user.value?.displayName ?? ''"
    @resync="refresh()"
  />
  <div v-else class="relative grid size-full place-items-center p-4">
    <GameBackdrop />
    <div class="hud-panel relative z-10 w-full max-w-md p-5">
      <NoTenantState v-if="!auth.activeTenantId.value" />
      <div v-else-if="status === 'pending'" class="space-y-3" aria-busy="true" aria-label="Memuat Virtual Office">
        <p class="font-heading text-lg font-bold">Memuat Virtual Office…</p>
        <Skeleton class="h-3 w-full rounded-full bg-white/10" />
        <Skeleton class="h-3 w-2/3 rounded-full bg-white/10" />
      </div>
      <div v-else-if="error" class="space-y-3">
        <ErrorState :error="error" :retry="refresh" />
      </div>
      <div v-else class="space-y-3 text-center">
        <p class="font-heading text-lg font-bold">Virtual Office tidak dapat dimuat</p>
        <Button variant="secondary" class="gap-1.5" @click="refresh()">
          <RotateCcw class="size-4" aria-hidden="true" />Muat ulang
        </Button>
      </div>
    </div>
  </div>
</template>
