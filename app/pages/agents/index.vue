<script setup lang="ts">
import { Activity, Bot, Building2, CirclePause, LayoutGrid, Rows3, Search, Users } from '@lucide/vue'
import { AGENT_LIFECYCLE_STATUSES, type AgentLifecycleStatus } from '~~/domains/agents/types'

/*
 * /agents — AI Employee Headquarters: direktori AI employee nyata tenant aktif
 * (database, RLS). Angka ringkasan dihitung dari data yang sama; tidak ada
 * robot demo yang dirender sebagai karyawan nyata.
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'AI Employees' })
useHead({ title: 'AI Employees' })

const { $api } = useNuxtApp()
const auth = useAuth()

const { data, status, error, refresh } = await useTenantAsyncData('agents', async (_tenantId, _signal, request) => {
  const { data, error } = await $api.v1.agents.get(request)
  if (error) throw apiFailure(error)
  return data.items
})

const search = ref('')
const lifecycle = ref<'all' | AgentLifecycleStatus>('all')
const hideSeed = ref(false)

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (data.value ?? []).filter((agent) => {
    if (lifecycle.value !== 'all' && agent.lifecycleStatus !== lifecycle.value) return false
    if (hideSeed.value && agent.isSeedData) return false
    if (!query) return true
    return [agent.name, agent.roleTitle, agent.description].some((field) => field.toLowerCase().includes(query))
  })
})

const summary = computed(() => {
  const items = data.value ?? []
  return {
    total: items.length,
    active: items.filter((agent) => agent.lifecycleStatus === 'active').length,
    busy: items.filter((agent) => agent.runtimeStatus !== null).length,
    paused: items.filter((agent) => agent.lifecycleStatus !== 'active').length,
  }
})

function onLifecycleChange(value: unknown) {
  lifecycle.value = AGENT_LIFECYCLE_STATUSES.find((status) => status === value) ?? 'all'
}

function onHideSeedChange(value: boolean | 'indeterminate') {
  hideSeed.value = value === true
}
</script>

<template>
  <div class="space-y-6">
    <GamePageHeader
      identity="AI Employee Headquarters"
      title="AI Employees"
      description="Direktori AI digital employee milik perusahaan aktif — identitas, peran, status konfigurasi, dan status runtime nyata."
      :icon="Bot"
    >
      <template #meta>
        <span class="game-chip">
          <Building2 class="size-3.5 text-game-cyan" aria-hidden="true" />
          {{ auth.activeMembership.value?.tenant.name ?? 'Belum ada perusahaan aktif' }}
        </span>
      </template>
      <template #actions>
        <Button variant="outline" as-child class="gap-1.5">
          <NuxtLink to="/office"><Building2 class="size-4" aria-hidden="true" />Buka Virtual Office</NuxtLink>
        </Button>
      </template>
    </GamePageHeader>

    <NoTenantState v-if="!auth.activeTenantId.value" />
    <template v-else>
      <div v-if="data" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-agent-summary>
        <StatCard label="AI employee terdaftar" :value="summary.total" :icon="Users" tone="blue" />
        <StatCard label="Aktif (siap ditugaskan)" :value="summary.active" :icon="Bot" tone="cyan" />
        <StatCard
          label="Sedang mengerjakan tugas"
          :value="summary.busy"
          :icon="Activity"
          tone="emerald"
          hint="Dari status runtime nyata"
        />
        <StatCard label="Draf / dijeda / diarsipkan" :value="summary.paused" :icon="CirclePause" tone="amber" />
      </div>

      <GamePanel padding="sm" as="div" data-agent-toolbar>
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div class="relative flex-1">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-game-text-muted"
              aria-hidden="true"
            />
            <Label for="agent-search" class="sr-only">Cari AI employee</Label>
            <Input id="agent-search" v-model="search" class="pl-9" placeholder="Cari nama, peran, atau deskripsi" />
          </div>
          <Select :model-value="lifecycle" @update:model-value="onLifecycleChange">
            <SelectTrigger class="w-full lg:w-48" aria-label="Filter status">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem v-for="option in AGENT_LIFECYCLE_STATUSES" :key="option" :value="option">
                {{ LIFECYCLE_PRESENTATION[option].label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="flex items-center gap-2 px-1">
            <Checkbox id="hide-seed" :model-value="hideSeed" @update:model-value="onHideSeedChange" />
            <Label for="hide-seed" class="text-sm font-normal">Sembunyikan data seed</Label>
          </div>
        </div>
      </GamePanel>

      <GameLoadingState v-if="status === 'pending' && !data" :rows="4" label="Memuat AI employee…" />
      <ErrorState v-else-if="error" :error="error" :retry="refresh" />
      <EmptyState
        v-else-if="(data?.length ?? 0) === 0"
        :icon="Bot"
        title="Belum ada AI employee"
        description="Perusahaan ini belum memiliki AI employee. Robot Marketplace hadir di Wave 2."
        badge="Wave 2"
      />
      <Tabs v-else default-value="cards" class="gap-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-game-text-muted" aria-live="polite" data-agent-count>
            {{ filtered.length }} dari {{ data?.length ?? 0 }} AI employee
          </p>
          <TabsList class="game-tabs">
            <TabsTrigger value="cards" class="game-tab" aria-label="Tampilan kartu"
              ><LayoutGrid class="size-4" aria-hidden="true" />Kartu</TabsTrigger
            >
            <TabsTrigger value="table" class="game-tab" aria-label="Tampilan tabel"
              ><Rows3 class="size-4" aria-hidden="true" />Tabel</TabsTrigger
            >
          </TabsList>
        </div>
        <TabsContent value="cards">
          <div v-if="filtered.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-agent-grid>
            <AgentCard v-for="agent in filtered" :key="agent.id" :agent="agent" />
          </div>
          <EmptyState v-else :icon="Search" title="Tidak ada hasil" description="Ubah kata kunci atau filter." />
        </TabsContent>
        <TabsContent value="table">
          <GamePanel padding="none" as="div" class="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead class="hidden md:table-cell">Runtime</TableHead>
                  <TableHead class="text-right"><span class="sr-only">Aksi</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="agent in filtered" :key="agent.id">
                  <TableCell class="font-medium">
                    <span class="flex items-center gap-2.5">
                      <AgentAvatar
                        :seed="agent.id"
                        :role-key="agent.roleKey"
                        :role-title="agent.roleTitle"
                        :status="agent.lifecycleStatus"
                        size="xs"
                      />
                      {{ agent.name }}
                    </span>
                  </TableCell>
                  <TableCell class="text-game-text-muted">{{ agent.roleTitle }}</TableCell>
                  <TableCell><AgentStatusBadge kind="lifecycle" :status="agent.lifecycleStatus" /></TableCell>
                  <TableCell class="hidden md:table-cell"
                    ><AgentStatusBadge kind="runtime" :status="agent.runtimeStatus"
                  /></TableCell>
                  <TableCell class="text-right">
                    <Button variant="ghost" size="sm" as-child>
                      <NuxtLink :to="`/agents/${agent.id}`">Detail</NuxtLink>
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow v-if="filtered.length === 0">
                  <TableCell colspan="5" class="py-8 text-center text-game-text-muted">Tidak ada hasil.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </GamePanel>
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>
