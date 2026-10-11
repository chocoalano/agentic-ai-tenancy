<script setup lang="ts">
import { ArrowLeft, Ban, CircleOff, FileText } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { isTerminalTaskStatus } from '~~/domains/tasks/types'
import { ACTIVE_TENANT_HEADER } from '~~/domains/tenancy/headers'

/*
 * /tasks/:id — detail tugas nyata: run per percobaan, jejak event, hasil model
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
    <Button variant="ghost" size="sm" as-child class="-ml-2">
      <NuxtLink to="/tasks"><ArrowLeft class="size-4" aria-hidden="true" />Kembali ke riwayat</NuxtLink>
    </Button>

    <div v-if="status === 'pending' && !data" class="space-y-4" aria-busy="true">
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>
    <EmptyState
      v-else-if="error?.statusCode === 404"
      :icon="CircleOff"
      title="Tugas tidak ditemukan"
      description="Tugas ini tidak ada di perusahaan aktif Anda."
    />
    <ErrorState v-else-if="error" :error="error" :retry="refresh" />
    <template v-else-if="data">
      <PageHeader
        eyebrow="Tugas"
        :title="data.task.title"
        :description="`${data.task.agentName} · ${data.task.priority}`"
      >
        <template #actions>
          <TaskStatusBadge :status="data.task.status" />
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
      </PageHeader>

      <Alert v-if="data.task.errorMessage" variant="destructive" data-task-error>
        <AlertTitle>{{ data.task.errorCode }}</AlertTitle>
        <AlertDescription>{{ data.task.errorMessage }}</AlertDescription>
      </Alert>

      <div
        v-if="data.pendingApproval"
        class="glass rounded-xl border border-office-orange/50 p-4"
        data-approval-pending
      >
        <p class="font-semibold">Persetujuan dibutuhkan</p>
        <p class="text-sm text-muted-foreground">
          {{ data.pendingApproval.actionSummary }} · kedaluwarsa {{ formatter.format(data.pendingApproval.expiresAt) }}
        </p>
        <div v-if="canDecide" class="mt-3 flex gap-2">
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
        <p v-else class="mt-2 text-xs text-muted-foreground">Butuh izin approvals.decide untuk memutuskan.</p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card class="glass">
          <CardHeader>
            <CardTitle class="font-heading">Hasil</CardTitle>
            <CardDescription>
              <template v-if="data.output"
                >Keluaran yang dipersistenkan dari run {{ data.output.runId.slice(0, 8) }} ·
                {{ formatter.format(data.output.createdAt) }}</template
              >
              <template v-else-if="data.task.output && !data.task.output.released"
                >Hasil menunggu persetujuan sebelum dapat dilihat.</template
              >
              <template v-else>Belum ada hasil.</template>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre
              v-if="data.output"
              class="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm leading-relaxed"
              data-task-output
              >{{ data.output.content }}</pre>
            <p v-else class="text-sm text-muted-foreground">
              <FileText class="mr-1 inline size-4" aria-hidden="true" />Tidak ada konten untuk ditampilkan.
            </p>
          </CardContent>
        </Card>

        <div class="space-y-6">
          <Card class="glass">
            <CardHeader>
              <CardTitle class="font-heading">Instruksi</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="whitespace-pre-line text-sm leading-relaxed" data-task-instruction>
                {{ data.task.instruction }}
              </p>
              <Separator class="my-4" />
              <dl class="grid grid-cols-2 gap-2 text-xs">
                <dt class="text-muted-foreground">Dibuat</dt>
                <dd>{{ formatter.format(data.task.createdAt) }}</dd>
                <dt class="text-muted-foreground">Mulai</dt>
                <dd>{{ data.task.startedAt ? formatter.format(data.task.startedAt) : '—' }}</dd>
                <dt class="text-muted-foreground">Selesai</dt>
                <dd>{{ data.task.completedAt ? formatter.format(data.task.completedAt) : '—' }}</dd>
                <dt class="text-muted-foreground">Percobaan</dt>
                <dd>{{ data.task.attempts }} / {{ data.task.maxAttempts }}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card class="glass">
            <CardHeader>
              <CardTitle class="font-heading">Run</CardTitle>
              <CardDescription
                >Setiap percobaan eksekusi (provider, model, status, pemakaian token bila dilaporkan).</CardDescription
              >
            </CardHeader>
            <CardContent>
              <ol class="space-y-2 text-sm" data-task-runs>
                <li v-for="run in data.task.runs" :key="run.id" class="rounded-lg border border-border/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium">Percobaan {{ run.attempt }}</span>
                    <span class="text-xs text-muted-foreground">{{ run.status }}</span>
                  </div>
                  <p class="text-xs text-muted-foreground">{{ run.runtimeProvider }} · {{ run.runtimeModel || '—' }}</p>
                  <p v-if="run.usage" class="text-xs text-muted-foreground">
                    token: {{ run.usage.inputTokens ?? '—' }} masuk · {{ run.usage.outputTokens ?? '—' }} keluar
                  </p>
                  <p v-if="run.errorMessage" class="text-xs text-destructive">
                    {{ run.errorCode }} · {{ run.errorMessage }}
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>
