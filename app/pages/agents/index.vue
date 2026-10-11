<script setup lang="ts">
import { Bot, LayoutGrid, Rows3, Search } from '@lucide/vue'
import { AGENT_LIFECYCLE_STATUSES, type AgentLifecycleStatus } from '~~/domains/agents/types'

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

function onLifecycleChange(value: unknown) {
  lifecycle.value = AGENT_LIFECYCLE_STATUSES.find((status) => status === value) ?? 'all'
}

function onHideSeedChange(value: boolean | 'indeterminate') {
  hideSeed.value = value === true
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      eyebrow="Tim digital"
      title="AI Employees"
      description="Daftar AI digital employee milik perusahaan aktif. Data diambil dari database dengan isolasi per tenant."
    />

    <NoTenantState v-if="!auth.activeTenantId.value" />
    <template v-else>
      <div class="glass flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Label for="agent-search" class="sr-only">Cari AI employee</Label>
          <Input id="agent-search" v-model="search" class="pl-9" placeholder="Cari nama, peran, atau deskripsi" />
        </div>
        <Select :model-value="lifecycle" @update:model-value="onLifecycleChange">
          <SelectTrigger class="w-full sm:w-44" aria-label="Filter status">
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

      <div v-if="status === 'pending' && !data" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        <Skeleton v-for="index in 6" :key="index" class="h-48 rounded-xl" />
      </div>
      <ErrorState v-else-if="error" :error="error" :retry="refresh" />
      <EmptyState
        v-else-if="(data?.length ?? 0) === 0"
        :icon="Bot"
        title="Belum ada AI employee"
        description="Perusahaan ini belum memiliki AI employee. Robot Marketplace hadir di Wave 2."
      />
      <Tabs v-else default-value="cards" class="gap-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-muted-foreground" aria-live="polite">
            {{ filtered.length }} dari {{ data?.length ?? 0 }} AI employee
          </p>
          <TabsList>
            <TabsTrigger value="cards" aria-label="Tampilan kartu"
              ><LayoutGrid class="size-4" aria-hidden="true" />Kartu</TabsTrigger
            >
            <TabsTrigger value="table" aria-label="Tampilan tabel"
              ><Rows3 class="size-4" aria-hidden="true" />Tabel</TabsTrigger
            >
          </TabsList>
        </div>
        <TabsContent value="cards">
          <div v-if="filtered.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AgentCard v-for="agent in filtered" :key="agent.id" :agent="agent" />
          </div>
          <EmptyState v-else :icon="Search" title="Tidak ada hasil" description="Ubah kata kunci atau filter." />
        </TabsContent>
        <TabsContent value="table">
          <div class="glass overflow-hidden rounded-xl">
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
                  <TableCell class="font-medium">{{ agent.name }}</TableCell>
                  <TableCell class="text-muted-foreground">{{ agent.roleTitle }}</TableCell>
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
                  <TableCell colspan="5" class="py-8 text-center text-muted-foreground">Tidak ada hasil.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>
