<script setup lang="ts">
import { ListChecks, RotateCcw } from '@lucide/vue'
import { TASK_STATUSES, type TaskStatus } from '~~/domains/tasks/types'

/*
 * /tasks — riwayat tugas AI employee tenant aktif (data otoritatif dari
 * backend, bertahan setelah refresh/login ulang). Hanya tugas tenant aktif
 * yang pernah dikembalikan API (RLS).
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'Tugas' })
useHead({ title: 'Tugas' })

const { $api } = useNuxtApp()

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

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      eyebrow="Operasional"
      title="Tugas AI employee"
      description="Riwayat penugasan nyata: status, run, hasil, dan persetujuan — semuanya dari backend."
    >
      <template #actions>
        <Button variant="secondary" size="sm" class="gap-1.5" @click="refresh()">
          <RotateCcw class="size-4" aria-hidden="true" />Muat ulang
        </Button>
      </template>
    </PageHeader>

    <Alert v-if="data && !data.capabilities.runtime.available" class="glass" data-runtime-unavailable>
      <AlertTitle>Runtime AI belum dikonfigurasi</AlertTitle>
      <AlertDescription>
        Tugas baru tidak dapat dieksekusi sampai server dikonfigurasi (AI_RUNTIME_PROVIDER). Riwayat tetap dapat dibaca.
      </AlertDescription>
    </Alert>
    <Alert v-else-if="data && data.capabilities.runtime.kind === 'fixture'" class="glass" data-runtime-fixture>
      <AlertTitle>Runtime fixture (bukan AI)</AlertTitle>
      <AlertDescription>
        Server memakai adapter deterministik untuk pengujian; hasil tugas BUKAN keluaran model AI.
      </AlertDescription>
    </Alert>

    <div class="flex flex-wrap items-center gap-3">
      <Select :model-value="statusFilter" @update:model-value="onStatusChange">
        <SelectTrigger class="w-48" aria-label="Filter status">
          <SelectValue placeholder="Semua status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua status</SelectItem>
          <SelectItem v-for="item in TASK_STATUSES" :key="item" :value="item">{{
            TASK_STATUS_LABELS[item]
          }}</SelectItem>
        </SelectContent>
      </Select>
      <p class="text-sm text-muted-foreground" data-task-count>{{ filtered.length }} tugas</p>
    </div>

    <div v-if="status === 'pending' && !data" class="space-y-3" aria-busy="true">
      <Skeleton v-for="n in 3" :key="n" class="h-20 w-full rounded-xl" />
    </div>
    <ErrorState v-else-if="error" :error="error" :retry="refresh" />
    <EmptyState
      v-else-if="filtered.length === 0"
      :icon="ListChecks"
      title="Belum ada tugas"
      description="Beri tugas kepada AI employee dari Virtual Office (pilih robot → Tugaskan)."
    />
    <ul v-else class="space-y-2" data-task-list>
      <li v-for="task in filtered" :key="task.id">
        <NuxtLink
          :to="`/tasks/${task.id}`"
          class="glass flex flex-col gap-2 rounded-xl border border-border/60 p-4 transition hover:border-primary/60 sm:flex-row sm:items-center sm:justify-between"
          :data-task-id="task.id"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ task.title }}</p>
            <p class="truncate text-xs text-muted-foreground">
              {{ task.agentName }} · dibuat {{ formatter.format(task.createdAt) }}
              <template v-if="task.completedAt"> · selesai {{ formatter.format(task.completedAt) }}</template>
            </p>
            <p v-if="task.errorMessage" class="truncate text-xs text-destructive">{{ task.errorMessage }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <TaskStatusBadge :status="task.status" />
            <span v-if="task.requiresApproval" class="demo-tag">Persetujuan</span>
            <span class="text-xs text-muted-foreground tabular-nums"
              >run {{ task.attempts }}/{{ task.maxAttempts }}</span
            >
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
