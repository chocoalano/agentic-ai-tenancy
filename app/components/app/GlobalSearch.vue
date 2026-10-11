<script setup lang="ts">
import { Bot, Loader2, Lock, Search } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import type { AgentSummary } from '~/utils/api-types'

/**
 * Pencarian global (⌘K / Ctrl+K): halaman yang tersedia dan AI employee milik
 * tenant aktif. Data agent diambil saat palet dibuka melalui Eden (`$api`) dan
 * dibuang ketika tenant berganti — hasil tenant lain tidak pernah ditampilkan.
 */
const { $api } = useNuxtApp()
const auth = useAuth()
const open = ref(false)
const isMac = ref(true)

const pages = availableNavigation()
const upcoming = NAVIGATION.flatMap((group) => group.items).filter((item) => item.status === 'soon')

const agentState = shallowRef<{ tenantId: string; items: AgentSummary[] } | null>(null)
const loadingAgents = ref(false)
const agentsFailed = ref(false)
const canReadAgents = computed(() => auth.can('agents.read'))
const agents = computed(() =>
  agentState.value && agentState.value.tenantId === auth.activeTenantId.value ? agentState.value.items : [],
)

async function loadAgents() {
  const tenantId = auth.activeTenantId.value
  if (!tenantId || !canReadAgents.value || agentState.value?.tenantId === tenantId) return
  loadingAgents.value = true
  agentsFailed.value = false
  const { data, error } = await $api.v1.agents.get()
  loadingAgents.value = false
  // Abaikan respons bila tenant sudah berganti selama request berjalan.
  if (tenantId !== auth.activeTenantId.value) return
  if (error) {
    agentsFailed.value = true
    return
  }
  agentState.value = { tenantId, items: data.items }
}

watch(open, (value) => {
  if (value) void loadAgents()
})
watch(auth.activeTenantId, () => {
  agentState.value = null
  agentsFailed.value = false
})

useEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    open.value = !open.value
  }
})

onMounted(() => {
  isMac.value = /mac|iphone|ipad/i.test(navigator.userAgent)
})

async function go(path: string) {
  open.value = false
  await navigateTo(path)
}
</script>

<template>
  <div class="contents">
    <Button
      variant="ghost"
      class="hidden h-10 w-full max-w-md justify-start gap-2.5 rounded-xl border border-hairline bg-surface-sunken/60 px-3 font-normal text-muted-foreground hover:bg-accent lg:flex"
      aria-label="Cari AI employee atau halaman"
      aria-keyshortcuts="Meta+K Control+K"
      @click="open = true"
    >
      <Search class="size-4" aria-hidden="true" />
      <span class="flex-1 truncate text-left text-sm">Cari AI employee atau halaman…</span>
      <KbdGroup aria-hidden="true">
        <Kbd>{{ isMac ? '⌘' : 'Ctrl' }}</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-10 rounded-xl md:size-9 lg:hidden"
      aria-label="Cari AI employee atau halaman"
      @click="open = true"
    >
      <Search class="size-4" aria-hidden="true" />
    </Button>

    <CommandDialog v-model:open="open" title="Pencarian global" description="Cari halaman atau AI employee">
      <CommandInput placeholder="Ketik nama AI employee, peran, atau halaman…" />
      <CommandList class="max-h-[min(60vh,420px)]">
        <CommandEmpty>Tidak ada hasil.</CommandEmpty>
        <CommandGroup heading="Halaman">
          <CommandItem v-for="page in pages" :key="page.key" :value="`page:${page.key}`" @select="go(page.to ?? '/')">
            <component :is="page.icon" aria-hidden="true" />
            <span class="flex-1">{{ page.label }}</span>
            <span class="hidden text-xs text-muted-foreground sm:inline">{{ page.description }}</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="AI employee">
          <div v-if="loadingAgents" class="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" aria-hidden="true" />
            Memuat AI employee…
          </div>
          <p v-else-if="!auth.activeTenantId.value" class="px-2 py-2 text-sm text-muted-foreground">
            Pilih perusahaan untuk mencari AI employee.
          </p>
          <p v-else-if="!canReadAgents" class="px-2 py-2 text-sm text-muted-foreground">
            Peran Anda tidak memiliki izin melihat AI employee.
          </p>
          <p v-else-if="agentsFailed" class="px-2 py-2 text-sm text-destructive">Gagal memuat AI employee.</p>
          <template v-else>
            <CommandItem
              v-for="agent in agents"
              :key="agent.id"
              :value="`agent:${agent.id}`"
              @select="go(`/agents/${agent.id}`)"
            >
              <AgentAvatar
                :seed="agent.id"
                :role-key="agent.roleKey"
                :role-title="agent.roleTitle"
                :status="agent.lifecycleStatus"
                size="xs"
              />
              <span class="flex-1 truncate">{{ agent.name }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ agent.roleTitle }}</span>
            </CommandItem>
            <p v-if="agents.length === 0" class="px-2 py-2 text-sm text-muted-foreground">
              <Bot class="mr-1 inline size-4" aria-hidden="true" />Belum ada AI employee.
            </p>
          </template>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Segera hadir">
          <CommandItem v-for="item in upcoming" :key="item.key" :value="`soon:${item.key}`" disabled>
            <Lock aria-hidden="true" />
            <span class="flex-1">{{ item.label }}</span>
            <span class="text-xs text-muted-foreground">{{ item.release }}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  </div>
</template>
