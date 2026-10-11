<script setup lang="ts">
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'

/**
 * Pemilih perusahaan (tenant). Logika ganti tenant — validasi backend lalu
 * pembuangan cache `tenant:*` — ada di `useAuth().switchTenant()`.
 * `variant="header"` untuk topbar desktop, `variant="sidebar"` untuk drawer mobile.
 */
withDefaults(defineProps<{ variant?: 'header' | 'sidebar' }>(), { variant: 'header' })

const auth = useAuth()
const switching = ref<string | null>(null)

const activeName = computed(() => auth.activeMembership.value?.tenant.name ?? 'Pilih perusahaan')
const activeRoles = computed(() => auth.activeTenant.value?.roles.join(', ') ?? 'Belum ada perusahaan aktif')

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
      <SidebarMenuButton
        v-if="variant === 'sidebar'"
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
    <DropdownMenuContent class="w-(--reka-dropdown-menu-trigger-width) min-w-64" align="start" side="bottom">
      <DropdownMenuLabel class="text-xs text-muted-foreground">Perusahaan Anda</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="membership in auth.memberships.value"
        :key="membership.tenant.id"
        class="gap-2"
        :disabled="switching !== null"
        @select="select(membership.tenant.id)"
      >
        <span class="grid size-6 place-items-center rounded-md border border-glass-border text-[10px] font-semibold">
          {{ initialsOf(membership.tenant.name) }}
        </span>
        <span class="flex-1 truncate">{{ membership.tenant.name }}</span>
        <Loader2 v-if="switching === membership.tenant.id" class="size-4 animate-spin" aria-hidden="true" />
        <Check
          v-else-if="membership.tenant.id === auth.activeTenantId.value"
          class="size-4 text-primary"
          aria-label="Aktif"
        />
      </DropdownMenuItem>
      <DropdownMenuItem v-if="auth.memberships.value.length === 0" disabled>Belum ada perusahaan</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <NuxtLink to="/settings?tab=company" class="gap-2">
          <Plus class="size-4" aria-hidden="true" />
          Buat perusahaan
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
