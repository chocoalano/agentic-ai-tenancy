<script setup lang="ts">
import { Ban, Bot, CircleOff, FileText, History, ScrollText, ShieldCheck } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { isTerminalTaskStatus } from '~~/domains/tasks/types'
import { ACTIVE_TENANT_HEADER } from '~~/domains/tenancy/headers'

/*
 * /tasks/:id — detail misi (tugas nyata): run per percobaan, hasil model
 * (teks, dirender aman tanpa HTML), persetujuan tertunda, pembatalan.
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'Detail Tugas' })

const route = useRoute()
const { $api } = useNuxtApp()
const auth = useAuth()
const taskId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useTenantAsyncData(
  `task:${taskId.value}`,
  async (_tenantId, _signal, request) => {
    const task = await $api.v1.tasks({ id: taskId.value }).get(request)
    if (task.error) throw apiFailure(task.error)
    const canReadApprovals = auth.can('approvals.read')
    const [approvals, output] = await Promise.all([
      canReadApprovals
        ? $api.v1.approvals.get({ query: { status: 'pending' }, headers: request.headers, fetch: request.fetch })
        : Promise.resolve(null),
      task.data.output?.released
        ? $api.v1.runs({ id: task.data.output.runId }).output.get(request)
        : Promise.resolve(null),
    ])
    return {
      task: task.data,
      pendingApproval: approvals?.data?.items.find((item) => item.taskId === task.data.id) ?? null,
      output: output?.data ?? null,
    }
  },
)

useHead({ title: () => data.value?.task.title ?? 'Detail Tugas' })
const event = useRequestEvent()
if (event && error.value?.statusCode === 404) setResponseStatus(event, 404)

const realtime = useOfficeRealtime()
watch(
  () => realtime.lastEvent.value,
  (last) => {
    if (
      last &&
      'data' in last &&
      typeof last.data === 'object' &&
      'taskId' in last.data &&
      last.data.taskId === taskId.value
    ) {
      void refresh()
    }
  },
)

const busy = ref(false)
const requestOptions = () => ({ headers: { [ACTIVE_TENANT_HEADER]: auth.activeTenantId.value ?? '' } })

async function cancelTask() {
  busy.value = true
  try {
    const { error: failure } = await $api.v1.tasks({ id: taskId.value }).cancel.post({}, requestOptions())
    if (failure) toast.error('Gagal membatalkan', { description: toApiErrorInfo(failure).message })
    else toast.success('Pembatalan diminta')
    await refresh()
  } finally {
    busy.value = false
  }
}

async function decide(approvalId: string, decision: 'approve' | 'reject') {
  busy.value = true
  try {
    const { error: failure } = await $api.v1.approvals({ id: approvalId }).decide.post({ decision }, requestOptions())
    if (failure) toast.error('Keputusan ditolak', { description: toApiErrorInfo(failure).message })
    else toast.success(decision === 'approve' ? 'Hasil disetujui dan dirilis' : 'Hasil ditolak')
    await refresh()
  } finally {
    busy.value = false
  }
}

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium' })
const canCancel = computed(
  () => auth.can('tasks.cancel') && data.value && !isTerminalTaskStatus(data.value.task.status),
)
const canDecide = computed(() => auth.can('approvals.decide'))
</script>

<template>
  <div class="space-y-6">
    <GameLoadingState v-if="status === 'pending' && !data" :rows="4" label="Memuat tugas…" />
    <EmptyState
      v-else-if="error?.statusCode === 404"
      :icon="CircleOff"
      title="Tugas tidak ditemukan"
      description="Tugas ini tidak ada di perusahaan aktif Anda."
    >
      <Button variant="outline" size="sm" as-child><NuxtLink to="/tasks">Kembali ke papan misi</NuxtLink></Button>
    </EmptyState>
    <ErrorState v-else-if="error" :error="error" :retry="refresh" />
    <template v-else-if="data">
      <GamePageHeader
        identity="Mission Detail"
        :title="data.task.title"
        :description="`${data.task.agentName} · prioritas ${data.task.priority}`"
        back-to="/tasks"
        back-label="Kembali ke Mission Board"
      >
        <template #meta>
          <TaskStatusBadge :status="data.task.status" />
          <span v-if="data.task.requiresApproval" class="demo-tag">Persetujuan</span>
          <span class="game-chip tabular-nums">run {{ data.task.attempts }}/{{ data.task.maxAttempts }}</span>
        </template>
        <template #actions>
          <Button
            v-if="canCancel"
            variant="destructive"
            size="sm"
            class="gap-1.5"
            :disabled="busy"
            data-task-cancel
            @click="cancelTask"
          >
            <Ban class="size-4" aria-hidden="true" />Batalkan
          </Button>
        </template>
      </GamePageHeader>

      <GamePanel
        v-if="data.task.errorMessage"
        variant="warning"
        :title="data.task.errorCode ?? 'Gagal'"
        :description="data.task.errorMessage"
        padding="sm"
        data-task-error
      />

      <GamePanel
        v-if="data.pendingApproval"
        variant="warning"
        title="Persetujuan dibutuhkan"
        :description="`${data.pendingApproval.actionSummary} · kedaluwarsa ${formatter.format(data.pendingApproval.expiresAt)}`"
        :icon="ShieldCheck"
        data-approval-pending
      >
        <div v-if="canDecide" class="flex gap-2">
          <Button size="sm" :disabled="busy" data-approval-approve @click="decide(data.pendingApproval.id, 'approve')"
            >Setujui</Button
          >
          <Button
            size="sm"
            variant="secondary"
            :disabled="busy"
            data-approval-reject
            @click="decide(data.pendingApproval.id, 'reject')"
            >Tolak</Button
          >
        </div>
        <p v-else class="type-support text-xs">Butuh izin approvals.decide untuk memutuskan.</p>
      </GamePanel>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <GamePanel :variant="data.output ? 'success' : 'holo'" title="Hasil" :icon="FileText">
          <template #header>
            <div class="flex min-w-0 items-start gap-3">
              <span
                class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-game-cyan/12 text-game-cyan ring-1 ring-inset ring-game-cyan/25"
                aria-hidden="true"
              >
                <FileText class="size-4" />
              </span>
              <div class="min-w-0 space-y-0.5">
                <h2 class="type-section-title">Hasil</h2>
                <p class="type-support">
                  <template v-if="data.output"
                    >Keluaran yang dipersistenkan dari run {{ data.output.runId.slice(0, 8) }} ·
                    {{ formatter.format(data.output.createdAt) }}</template
                  >
                  <template v-else-if="data.task.output && !data.task.output.released"
                    >Hasil menunggu persetujuan sebelum dapat dilihat.</template
                  >
                  <template v-else>Belum ada hasil.</template>
                </p>
              </div>
            </div>
          </template>
          <pre
            v-if="data.output"
            class="game-panel game-panel-sunken game-scrollbar max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed"
            data-task-output
            >{{ data.output.content }}</pre>
          <p v-else class="type-support">Tidak ada konten untuk ditampilkan.</p>
        </GamePanel>

        <div class="space-y-6">
          <GamePanel title="Instruksi" :icon="ScrollText">
            <p class="whitespace-pre-line text-sm leading-relaxed" data-task-instruction>
              {{ data.task.instruction }}
            </p>
            <Separator class="my-4" />
            <dl>
              <GameInfoRow label="AI employee">
                <NuxtLink
                  :to="`/agents/${data.task.agentId}`"
                  class="inline-flex items-center gap-1 text-game-cyan hover:underline"
                >
                  <Bot class="size-3.5" aria-hidden="true" />{{ data.task.agentName }}
                </NuxtLink>
              </GameInfoRow>
              <GameInfoRow label="Dibuat">{{ formatter.format(data.task.createdAt) }}</GameInfoRow>
              <GameInfoRow label="Mulai">{{
                data.task.startedAt ? formatter.format(data.task.startedAt) : '—'
              }}</GameInfoRow>
              <GameInfoRow label="Selesai">{{
                data.task.completedAt ? formatter.format(data.task.completedAt) : '—'
              }}</GameInfoRow>
              <GameInfoRow label="Percobaan">{{ data.task.attempts }} / {{ data.task.maxAttempts }}</GameInfoRow>
            </dl>
          </GamePanel>

          <GamePanel
            title="Run"
            description="Setiap percobaan eksekusi: provider, model, status, dan pemakaian token bila dilaporkan penyedia."
            :icon="History"
          >
            <ol class="space-y-2 text-sm" data-task-runs>
              <li v-for="run in data.task.runs" :key="run.id" class="game-panel game-panel-sunken p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">Percobaan {{ run.attempt }}</span>
                  <span class="text-xs text-game-text-muted">{{ RUN_STATUS_LABELS[run.status] }}</span>
                </div>
                <p class="text-xs text-game-text-muted">{{ run.runtimeProvider }} · {{ run.runtimeModel || '—' }}</p>
                <p v-if="run.usage" class="text-xs text-game-text-muted">
                  token: {{ run.usage.inputTokens ?? '—' }} masuk · {{ run.usage.outputTokens ?? '—' }} keluar
                </p>
                <p v-if="run.errorMessage" class="text-xs text-destructive">
                  {{ run.errorCode }} · {{ run.errorMessage }}
                </p>
              </li>
            </ol>
          </GamePanel>
        </div>
      </div>
    </template>
  </div>
</template>
