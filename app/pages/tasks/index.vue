<script setup lang="ts">
import { Activity, Building2, CircleCheck, CircleX, Hourglass, ListChecks, RotateCcw, Target } from '@lucide/vue'
import { TASK_STATUSES, type TaskStatus } from '~~/domains/tasks/types'

/*
 * /tasks — Mission Board: riwayat tugas AI employee tenant aktif (data
 * otoritatif dari backend, bertahan setelah refresh/login ulang). Hanya tugas
 * tenant aktif yang pernah dikembalikan API (RLS).
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'Tugas', colorMode: 'dark' })
useHead({ title: 'Tugas' })

const { $api } = useNuxtApp()
const auth = useAuth()

const { data, status, error, refresh } = await useTenantAsyncData('tasks', async (_tenantId, _signal, request) => {
  const [tasks, capabilities] = await Promise.all([
    $api.v1.tasks.get({ query: { limit: 100 }, headers: request.headers, fetch: request.fetch }),
    $api.v1.tasks.capabilities.get(request),
  ])
  if (tasks.error) throw apiFailure(tasks.error)
  if (capabilities.error) throw apiFailure(capabilities.error)
  return { tasks: tasks.data.items, capabilities: capabilities.data }
})

const statusFilter = ref<'all' | TaskStatus>('all')
const filtered = computed(() =>
  (data.value?.tasks ?? []).filter((task) => statusFilter.value === 'all' || task.status === statusFilter.value),
)
function onStatusChange(value: unknown) {
  statusFilter.value = TASK_STATUSES.find((item) => item === value) ?? 'all'
}

const summary = computed(() => {
  const tasks = data.value?.tasks ?? []
  return {
    total: tasks.length,
    active: tasks.filter((task) => ['created', 'queued', 'running'].includes(task.status)).length,
    waiting: tasks.filter((task) => task.status === 'waiting_approval').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed' || task.status === 'canceled').length,
  }
})

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-6">
    <GamePageHeader
      identity="Mission Board"
      title="Tugas AI employee"
      description="Riwayat penugasan nyata: status, run, hasil, dan persetujuan — semuanya dari backend."
      :icon="ListChecks"
    >
      <template #meta>
        <span class="game-chip">
          <Building2 class="size-3.5 text-game-cyan" aria-hidden="true" />
          {{ auth.activeMembership.value?.tenant.name ?? 'Belum ada perusahaan aktif' }}
        </span>
        <span v-if="data" class="game-chip" :data-runtime-kind="data.capabilities.runtime.kind">
          <Activity class="size-3.5 text-game-cyan" aria-hidden="true" />
          Runtime:
          {{ data.capabilities.runtime.available ? data.capabilities.runtime.provider : 'belum dikonfigurasi' }}
        </span>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" class="gap-1.5" @click="refresh()">
          <RotateCcw class="size-4" aria-hidden="true" />Muat ulang
        </Button>
        <Button as-child size="sm" class="gap-1.5">
          <NuxtLink to="/office"><Building2 class="size-4" aria-hidden="true" />Beri tugas di Virtual Office</NuxtLink>
        </Button>
      </template>
    </GamePageHeader>

    <GamePanel
      v-if="data && !data.capabilities.runtime.available"
      variant="warning"
      title="Runtime AI belum dikonfigurasi"
      description="Tugas baru tidak dapat dieksekusi sampai server dikonfigurasi (AI_RUNTIME_PROVIDER). Riwayat tetap dapat dibaca."
      padding="sm"
      data-runtime-unavailable
    />
    <GamePanel
      v-else-if="data && data.capabilities.runtime.kind === 'fixture'"
      variant="warning"
      title="Runtime fixture (bukan AI)"
      description="Server memakai adapter deterministik untuk pengujian; hasil tugas BUKAN keluaran model AI."
      padding="sm"
      data-runtime-fixture
    />

    <div v-if="data" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-task-summary>
      <StatCard label="Total tugas" :value="summary.total" :icon="Target" tone="blue" />
      <StatCard label="Antre / berjalan" :value="summary.active" :icon="Activity" tone="cyan" />
      <StatCard label="Menunggu persetujuan" :value="summary.waiting" :icon="Hourglass" tone="amber" />
      <StatCard
        label="Selesai"
        :value="summary.completed"
        :icon="CircleCheck"
        tone="emerald"
        :hint="`${summary.failed} gagal/dibatalkan`"
      />
    </div>

    <GamePanel padding="sm" as="div">
      <div class="flex flex-wrap items-center gap-3">
        <Select :model-value="statusFilter" @update:model-value="onStatusChange">
          <SelectTrigger class="w-52" aria-label="Filter status">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem v-for="item in TASK_STATUSES" :key="item" :value="item">{{
              TASK_STATUS_LABELS[item]
            }}</SelectItem>
          </SelectContent>
        </Select>
        <p class="text-sm text-game-text-muted" data-task-count>{{ filtered.length }} tugas</p>
      </div>
    </GamePanel>

    <GameLoadingState v-if="status === 'pending' && !data" :rows="3" label="Memuat tugas…" />
    <ErrorState v-else-if="error" :error="error" :retry="refresh" />
    <EmptyState
      v-else-if="filtered.length === 0"
      :icon="ListChecks"
      title="Belum ada tugas"
      description="Beri tugas kepada AI employee dari Virtual Office (pilih robot → Tugaskan)."
    >
      <Button size="sm" as-child><NuxtLink to="/office">Buka Virtual Office</NuxtLink></Button>
    </EmptyState>
    <ul v-else class="space-y-2" data-task-list>
      <li v-for="task in filtered" :key="task.id">
        <NuxtLink
          :to="`/tasks/${task.id}`"
          class="hud-row flex flex-col gap-2 p-4 text-[#f5f8ff] sm:flex-row sm:items-center sm:justify-between"
          :data-task-id="task.id"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ task.title }}</p>
            <p class="truncate text-xs text-game-text-muted">
              {{ task.agentName }} · dibuat {{ formatter.format(task.createdAt) }}
              <template v-if="task.completedAt"> · selesai {{ formatter.format(task.completedAt) }}</template>
            </p>
            <p v-if="task.errorMessage" class="truncate text-xs text-destructive">{{ task.errorMessage }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <TaskStatusBadge :status="task.status" />
            <span v-if="task.requiresApproval" class="demo-tag">Persetujuan</span>
            <span class="text-xs text-game-text-muted tabular-nums"
              >run {{ task.attempts }}/{{ task.maxAttempts }}</span
            >
          </div>
        </NuxtLink>
      </li>
    </ul>
    <p v-if="data && summary.failed > 0" class="type-support flex items-center gap-1 text-xs">
      <CircleX class="size-3.5" aria-hidden="true" />{{ summary.failed }} tugas gagal atau dibatalkan tercatat dalam
      riwayat.
    </p>
  </div>
</template>
