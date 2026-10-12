<script setup lang="ts">
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'

/**
 * Pemilih perusahaan (tenant). Logika ganti tenant — validasi backend lalu
 * pembuangan cache `tenant:*` — ada di `useAuth().switchTenant()`.
 * `variant="hud"` = kartu komandan strip HUD (crest perusahaan, sama dengan
 * GameHUD /office), `variant="header"` = tombol kompak (menu game),
 * `variant="sidebar"` = item menu drawer.
 */
withDefaults(defineProps<{ variant?: 'hud' | 'header' | 'sidebar' }>(), { variant: 'header' })

const auth = useAuth()
const switching = ref<string | null>(null)

const activeName = computed(() => auth.activeMembership.value?.tenant.name ?? 'Pilih perusahaan')
const activeRoles = computed(() => auth.activeTenant.value?.roles.join(', ') ?? 'Belum ada perusahaan aktif')
const commander = computed(() => auth.user.value?.displayName ?? 'Commander')

async function select(tenantId: string) {
  if (tenantId === auth.activeTenantId.value || switching.value) return
  switching.value = tenantId
  let failure: Awaited<ReturnType<typeof auth.switchTenant>>
  try {
    failure = await auth.switchTenant(tenantId)
  } finally {
    switching.value = null
  }
  if (failure) {
    toast.error('Gagal mengganti perusahaan', { description: failure.message })
    return
  }
  toast.success(`Beralih ke ${auth.activeMembership.value?.tenant.name ?? 'perusahaan'}`)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        v-if="variant === 'hud'"
        type="button"
        class="hud-card h-13.25 max-w-[24rem] min-w-0 gap-3 rounded-[12px_12px_25px_12px] pl-1.5 pr-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-office-cyan max-md:h-12 max-md:gap-2 max-md:pl-1"
        aria-label="Ganti perusahaan"
        data-tenant-switcher
      >
        <span
          class="hud-crest h-11.75 w-11.5 text-[15px] max-md:h-9.75 max-md:w-8.75 max-md:text-[11px]"
          aria-hidden="true"
        >
          {{ initialsOf(activeName) }}
        </span>
        <span class="grid min-w-0 flex-1 leading-tight">
          <span class="truncate text-sm font-bold">{{ activeName }}</span>
          <span class="truncate text-[11px] font-semibold text-blue-200">
            Commander · <span class="text-blue-100">{{ commander }}</span>
            <span class="capitalize"> · {{ activeRoles }}</span>
          </span>
        </span>
        <ChevronsUpDown class="size-4 shrink-0 text-blue-300" aria-hidden="true" />
      </button>
      <SidebarMenuButton
        v-else-if="variant === 'sidebar'"
        size="lg"
        class="surface-sunken data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        aria-label="Ganti perusahaan"
      >
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Building2 class="size-4" aria-hidden="true" />
        </span>
        <span class="grid flex-1 text-left leading-tight">
          <span class="truncate text-sm font-medium">{{ activeName }}</span>
          <span class="truncate text-xs capitalize text-muted-foreground">{{ activeRoles }}</span>
        </span>
        <ChevronsUpDown class="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </SidebarMenuButton>
      <Button
        v-else
        variant="ghost"
        class="h-10 max-w-72 gap-2.5 rounded-xl border border-hairline bg-surface-sunken/60 px-2 pr-2.5 hover:bg-accent data-[state=open]:bg-accent"
        aria-label="Ganti perusahaan"
      >
        <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Building2 class="size-4" aria-hidden="true" />
        </span>
        <span class="grid min-w-0 flex-1 text-left leading-tight">
          <span class="truncate text-sm font-medium">{{ activeName }}</span>
          <span class="truncate text-[11px] font-normal capitalize text-muted-foreground">{{ activeRoles }}</span>
        </span>
        <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="game-panel w-(--reka-dropdown-menu-trigger-width) min-w-64 rounded-xl"
      align="start"
      side="bottom"
    >
      <DropdownMenuLabel class="text-[10px] font-semibold uppercase tracking-[0.16em] text-office-cyan"
        >Perusahaan Anda</DropdownMenuLabel
      >
      <DropdownMenuItem
        v-for="membership in auth.memberships.value"
        :key="membership.tenant.id"
        class="gap-2 text-blue-100"
        :disabled="switching !== null"
        @select="select(membership.tenant.id)"
      >
        <span class="hud-tile size-6 text-[10px] font-semibold">{{ initialsOf(membership.tenant.name) }}</span>
        <span class="flex-1 truncate">{{ membership.tenant.name }}</span>
        <Loader2 v-if="switching === membership.tenant.id" class="size-4 animate-spin" aria-hidden="true" />
        <Check
          v-else-if="membership.tenant.id === auth.activeTenantId.value"
          class="size-4 text-office-cyan"
          aria-label="Aktif"
        />
      </DropdownMenuItem>
      <DropdownMenuItem v-if="auth.memberships.value.length === 0" disabled>Belum ada perusahaan</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <NuxtLink to="/settings?tab=company" class="gap-2 text-blue-100">
          <Plus class="size-4" aria-hidden="true" />
          Buat perusahaan
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
