<script setup lang="ts">
import { ArrowUpRight, Ban, FileText, Lock, MapPin, Send, X } from '@lucide/vue'
import { isTerminalTaskStatus } from '~~/domains/tasks/types'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import { AGENT_COMMANDS, type CommandDefinition } from '~/game/commands'
import type { IslandId } from '~/game/world'
import type { AgentSummary, ApprovalItem, RunOutput, TaskCapabilities, TaskItem } from '~/utils/api-types'
import { CHARACTERS, centeringShift } from '~/utils/game-assets'
import { isWalkableIsland } from '~/game/world'
import { MISSION_HUB, STATIONS } from '~/utils/office-layout'

/**
 * Panel perintah AI employee (klik robot).
 *
 * Membedakan dengan jelas:
 * - perintah VISUAL (pindah, lihat aktivitas, profil) — dijalankan frontend;
 * - perintah BISNIS: di mode LIVE "Tugaskan" membuat tugas NYATA lewat
 *   `POST /v1/tasks` (hanya bila runtime tersedia & pengguna berizin); status,
 *   hasil, dan persetujuan ditampilkan dari backend. Chat/jeda/lanjut tetap
 *   nonaktif (belum ada endpoint). Di mode pratinjau semua berjalan sebagai
 *   SIMULASI berlabel. Tidak ada respons AI yang dikarang.
 */
export interface LivePanelState {
  capabilities: TaskCapabilities | null
  tasks: TaskItem[]
  currentTask: TaskItem | null
  pendingApproval: ApprovalItem | null
  result: RunOutput | null
  resultError: string | null
  submitting: boolean
  error: string | null
  loading: boolean
  canDecide: boolean
  canCancel: boolean
}

const props = defineProps<{
  agent: OfficeAgentView
  preview: boolean
  /** Data nyata (mode live). */
  liveAgent?: AgentSummary
  roleTitle: string
  feedback: string | null
  /** Mode live: status dikonfirmasi realtime vs status terakhir yang dikonfirmasi. */
  confirmation?: string | null
  /** Mode live: tugas, kemampuan runtime, persetujuan, dan hasil dari backend. */
  live?: LivePanelState | null
}>()

const emit = defineEmits<{
  close: []
  move: [island: IslandId]
  instruct: [text: string]
  assign: [text: string, options: { requiresApproval: boolean }]
  cancelTask: [taskId: string]
  viewResult: [runId: string]
  decide: [approvalId: string, decision: 'approve' | 'reject']
  pauseAgent: []
  resumeAgent: []
  runAtlas: []
  resetSimulation: []
  approve: []
  reject: []
}>()

const titleId = useId()
const inputId = useId()
const instruction = ref('')
const showMove = ref(false)
const showLog = ref(true)
const input = ref<HTMLTextAreaElement | null>(null)

// Hanya pulau yang bisa dijalani (pulau dekoratif tanpa permukaan jalan tidak ditawarkan).
const destinations = computed(() => [
  { id: 'mission-hub' as const, label: MISSION_HUB.label },
  ...STATIONS.filter((station) => isWalkableIsland(station.id)).map((station) => ({
    id: station.id,
    label: station.label,
  })),
])
const stationLabel = computed(() => destinations.value.find((item) => item.id === props.agent.island)?.label ?? '')
const destinationLabel = computed(
  () => destinations.value.find((item) => item.id === props.agent.destination)?.label ?? '…',
)

const SUGGESTIONS: Record<string, string> = {
  nova: 'Nova, lakukan riset pasar untuk Project Atlas.',
  sage: 'Sage, lakukan riset pasar.',
  pixel: 'Pixel, analisis hasil riset Sage.',
  bolt: 'Bolt, buat laporan hasil analisis.',
  echo: 'Echo, jalankan tool yang diperlukan.',
}

/* ---------- Mode live: prasyarat penugasan nyata ---------- */
const live = computed(() => (props.preview ? null : (props.live ?? null)))
const runtimeAvailable = computed(() => live.value?.capabilities?.runtime.available ?? false)
const runtimeLabel = computed(() => {
  const runtime = live.value?.capabilities?.runtime
  if (!runtime) return RUNTIME_DISCONNECTED.label
  if (!runtime.available) return 'Runtime AI belum dikonfigurasi'
  return runtime.kind === 'fixture' ? `Fixture (bukan AI) · ${runtime.model}` : `${runtime.provider} · ${runtime.model}`
})
const agentAssignable = computed(() => props.liveAgent?.lifecycleStatus === 'active')
const currentTask = computed(() => live.value?.currentTask ?? null)
const taskActive = computed(() => currentTask.value !== null && !isTerminalTaskStatus(currentTask.value.status))
/** "Tugaskan" aktif hanya bila: live, runtime tersedia, pengguna berizin, agent aktif, tidak sedang mengerjakan tugas. */
const canAssign = computed(
  () =>
    live.value !== null &&
    runtimeAvailable.value &&
    (live.value.capabilities?.canCreate ?? false) &&
    agentAssignable.value &&
    !taskActive.value,
)
const assignBlockedReason = computed(() => {
  if (!live.value) return null
  if (!live.value.capabilities)
    return live.value.loading ? 'Memeriksa kemampuan runtime…' : 'Kemampuan runtime tidak dapat dibaca.'
  if (!runtimeAvailable.value) return 'Runtime AI belum dikonfigurasi di server (AI_RUNTIME_PROVIDER).'
  if (!live.value.capabilities.canCreate) return 'Peran Anda tidak memiliki izin tasks.create.'
  if (!agentAssignable.value) return 'AI employee ini belum aktif.'
  if (taskActive.value) return 'Agent sedang mengerjakan tugas; tunggu selesai atau batalkan.'
  return null
})
const inputEnabled = computed(() => props.preview || canAssign.value)
/** Opsi tugas nyata: hasil ditahan sampai disetujui manusia (persetujuan dicatat di backend). */
const requiresApproval = ref(false)
const maxChars = computed(() => live.value?.capabilities?.limits.maxInstructionChars ?? 4000)

function available(command: CommandDefinition): boolean {
  if (props.preview) return command.preview
  if (command.key === 'assign_task') return canAssign.value
  return command.live.supported
}

function liveReason(command: CommandDefinition): string {
  if (command.key === 'assign_task') return assignBlockedReason.value ?? 'Membuat tugas nyata untuk AI employee ini.'
  return command.live.reason
}

function run(command: CommandDefinition) {
  if (!available(command)) return
  if (command.key === 'assign_task' || command.key === 'chat') {
    if (props.preview) instruction.value ||= SUGGESTIONS[props.agent.character] ?? ''
    nextTick(() => input.value?.focus())
  } else if (command.key === 'move') showMove.value = !showMove.value
  else if (command.key === 'inspect') showLog.value = !showLog.value
  else if (command.key === 'pause') emit('pauseAgent')
  else if (command.key === 'resume') emit('resumeAgent')
  else if (command.key === 'run_atlas') emit('runAtlas')
  else if (command.key === 'reset_simulation') emit('resetSimulation')
}

function submit() {
  const text = instruction.value.trim()
  if (!text) return
  if (props.preview) {
    emit('instruct', text)
    instruction.value = ''
    return
  }
  if (!canAssign.value || live.value?.submitting) return
  emit('assign', text, { requiresApproval: requiresApproval.value })
}

// Kosongkan kolom hanya setelah tugas nyata benar-benar tercatat (bukan saat gagal).
watch(
  () => live.value?.tasks.length ?? 0,
  (count, previous) => {
    if (!props.preview && count > previous && !live.value?.error) instruction.value = ''
  },
)

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <section class="hud-panel relative p-3.5 pr-11" :aria-labelledby="titleId" data-command-panel>
    <Button
      variant="ghost"
      size="icon"
      class="absolute right-2 top-2 size-7 rounded-lg"
      aria-label="Tutup panel perintah"
      @click="emit('close')"
    >
      <X class="size-4" aria-hidden="true" />
    </Button>

    <!-- Identitas -->
    <div class="flex items-start gap-3">
      <span
        class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-office-cyan/40 bg-[radial-gradient(circle_at_50%_40%,oklch(0.8_0.14_215/35%),oklch(0.2_0.07_266/85%)_72%)]"
      >
        <AgentSprite
          :character="agent.character"
          :status="liveAgent?.lifecycleStatus ?? null"
          class="w-12"
          :style="{ transform: `translateX(${centeringShift(CHARACTERS[agent.character])}) translateY(8%)` }"
        />
      </span>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-office-cyan">
          {{ preview ? 'Karakter pratinjau' : 'AI employee' }}
          <span v-if="preview" class="demo-tag">SIMULASI</span>
          <span v-else-if="live?.capabilities?.runtime.kind === 'fixture'" class="demo-tag" data-runtime-fixture-tag>
            FIXTURE · BUKAN AI
          </span>
        </p>
        <h3 :id="titleId" class="truncate font-heading text-lg font-bold">{{ agent.name }}</h3>
        <p class="truncate text-xs text-office-cyan">{{ roleTitle }}</p>
      </div>
    </div>

    <dl class="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-5">
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Status</dt>
        <dd class="font-semibold">{{ agent.label }}</dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Runtime</dt>
        <dd class="truncate font-semibold" data-agent-runtime>{{ preview ? 'Simulasi frontend' : runtimeLabel }}</dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Workstation</dt>
        <dd class="truncate font-semibold" data-agent-workstation>
          {{ agent.moving ? `Menuju ${destinationLabel}` : stationLabel }}
        </dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Penugasan</dt>
        <dd class="truncate font-semibold" data-agent-assignment>
          <template v-if="preview">
            {{ agent.workstationActivity ?? (agent.acknowledging ? 'Menerima perintah…' : agent.label) }}
          </template>
          <template v-else-if="currentTask"
            >{{ TASK_STATUS_LABELS[currentTask.status] }} · {{ currentTask.title }}</template
          >
          <template v-else>Tidak ada tugas aktif</template>
        </dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Model AI</dt>
        <dd class="truncate font-semibold text-muted-foreground">
          {{ !preview && live?.capabilities?.runtime.available ? live.capabilities.runtime.model : '—' }}
        </dd>
      </div>
    </dl>
    <p v-if="!preview && confirmation" class="mt-1 text-[10.5px] text-muted-foreground" data-live-confirmation>
      {{ confirmation }}
    </p>

    <!-- Perintah -->
    <ul class="mt-2.5 flex flex-wrap gap-1.5" aria-label="Perintah">
      <li v-for="command in AGENT_COMMANDS" :key="command.key">
        <Tooltip>
          <TooltipTrigger as-child>
            <NuxtLink
              v-if="command.key === 'profile' && !preview && liveAgent"
              :to="`/agents/${liveAgent.id}`"
              class="hud-segment inline-flex h-8 items-center gap-1 px-2.5 text-xs font-semibold hover:border-office-cyan/70"
            >
              {{ command.label }} <ArrowUpRight class="size-3" aria-hidden="true" />
            </NuxtLink>
            <button
              v-else-if="command.key !== 'profile'"
              type="button"
              :class="[
                'hud-segment inline-flex h-8 items-center gap-1 px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-office-cyan',
                available(command) ? 'hover:border-office-cyan/70' : 'cursor-not-allowed opacity-55',
              ]"
              :aria-disabled="!available(command)"
              :data-command-key="command.key"
              @click="run(command)"
            >
              <Lock v-if="!available(command)" class="size-3" aria-hidden="true" />
              {{ command.label }}
              <span
                v-if="preview && command.kind === 'business'"
                class="rounded bg-office-orange/80 px-1 text-[9px] font-bold text-[oklch(0.2_0.05_70)]"
              >
                SIM
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent class="max-w-64">
            <template v-if="preview">
              {{
                command.kind === 'business' ? 'Simulasi pratinjau — tidak ada eksekusi nyata.' : 'Aksi visual frontend.'
              }}
            </template>
            <template v-else>{{ liveReason(command) }}</template>
          </TooltipContent>
        </Tooltip>
      </li>
    </ul>

    <!-- Pindah ke workstation -->
    <div v-if="showMove" class="mt-2 flex flex-wrap gap-1" role="group" aria-label="Pilih workstation tujuan">
      <button
        v-for="destination in destinations"
        :key="destination.id"
        type="button"
        :disabled="destination.id === agent.island && !agent.moving"
        class="hud-segment inline-flex h-7 items-center gap-1 px-2 text-[11px] outline-none hover:border-office-cyan/70 focus-visible:ring-2 focus-visible:ring-office-cyan disabled:opacity-40"
        :data-move-target="destination.id"
        @click="emit('move', destination.id)"
      >
        <MapPin class="size-3" aria-hidden="true" />{{ destination.label }}
      </button>
      <p v-if="!preview" class="w-full text-[10.5px] text-muted-foreground">
        Hanya posisi tampilan — tidak mengubah penugasan di backend.
      </p>
    </div>

    <!-- Persetujuan simulasi (pratinjau saja) -->
    <div
      v-if="preview && agent.activity === 'waiting_approval'"
      class="mt-2.5 rounded-lg border border-office-orange/60 bg-office-orange/10 p-2"
      role="group"
      aria-label="Permintaan persetujuan simulasi"
      data-approval-request
    >
      <p class="flex items-center gap-1.5 text-xs font-semibold">
        Persetujuan dibutuhkan <span class="demo-tag">SIMULASI</span>
      </p>
      <p class="mt-0.5 text-[11px] text-muted-foreground">
        {{ agent.name }} meminta izin menjalankan alat. Tidak ada tool nyata yang dijalankan.
      </p>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <Button size="sm" class="h-7 rounded-lg px-2.5 text-[11px]" data-approve @click="emit('approve')">
          Setujui (simulasi)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          class="h-7 rounded-lg px-2.5 text-[11px]"
          data-reject
          @click="emit('reject')"
        >
          Tolak (simulasi)
        </Button>
      </div>
    </div>

    <!-- Mode live: tugas saat ini (data backend) -->
    <div
      v-if="live && currentTask"
      class="mt-2.5 rounded-lg border border-office-cyan/40 bg-office-cyan/5 p-2"
      :data-live-task="currentTask.id"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-xs font-semibold">{{ currentTask.title }}</p>
        <span
          class="shrink-0 rounded bg-office-cyan/20 px-1.5 text-[10px] font-bold"
          :data-live-task-status="currentTask.status"
        >
          {{ TASK_STATUS_LABELS[currentTask.status] }}
        </span>
      </div>
      <p class="mt-0.5 text-[10.5px] text-muted-foreground">
        Percobaan {{ currentTask.attempts }}/{{ currentTask.maxAttempts }} ·
        {{ currentTask.latestRun ? RUN_STATUS_LABELS[currentTask.latestRun.status] : '—' }} ·
        {{ formatter.format(currentTask.createdAt) }}
      </p>
      <p v-if="currentTask.errorMessage" class="mt-0.5 text-[10.5px] text-destructive" data-live-task-error>
        {{ currentTask.errorCode }} · {{ currentTask.errorMessage }}
      </p>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <Button
          v-if="live.canCancel && !isTerminalTaskStatus(currentTask.status)"
          size="sm"
          variant="secondary"
          class="h-7 gap-1 rounded-lg px-2.5 text-[11px]"
          data-live-cancel
          @click="emit('cancelTask', currentTask.id)"
        >
          <Ban class="size-3" aria-hidden="true" />Batalkan
        </Button>
        <Button
          v-if="currentTask.status === 'completed' && currentTask.latestRun"
          size="sm"
          class="h-7 gap-1 rounded-lg px-2.5 text-[11px]"
          data-live-view-result
          @click="emit('viewResult', currentTask.latestRun.id)"
        >
          <FileText class="size-3" aria-hidden="true" />Lihat hasil
        </Button>
        <NuxtLink
          :to="`/tasks/${currentTask.id}`"
          class="hud-segment inline-flex h-7 items-center gap-1 px-2 text-[11px]"
        >
          Detail <ArrowUpRight class="size-3" aria-hidden="true" />
        </NuxtLink>
      </div>
      <div
        v-if="live.pendingApproval"
        class="mt-2 rounded-md border border-office-orange/60 bg-office-orange/10 p-2"
        data-live-approval
      >
        <p class="text-[11px] font-semibold">Persetujuan dibutuhkan</p>
        <p class="text-[10.5px] text-muted-foreground">{{ live.pendingApproval.actionSummary }}</p>
        <div v-if="live.canDecide" class="mt-1 flex gap-1.5">
          <Button
            size="sm"
            class="h-6 rounded-md px-2 text-[10.5px]"
            data-live-approve
            @click="emit('decide', live.pendingApproval.id, 'approve')"
            >Setujui</Button
          >
          <Button
            size="sm"
            variant="secondary"
            class="h-6 rounded-md px-2 text-[10.5px]"
            data-live-reject
            @click="emit('decide', live.pendingApproval.id, 'reject')"
            >Tolak</Button
          >
        </div>
        <p v-else class="text-[10.5px] text-muted-foreground">Butuh izin approvals.decide.</p>
      </div>
      <p v-if="live.resultError" class="mt-1 text-[10.5px] text-destructive" data-live-result-error>
        {{ live.resultError }}
      </p>
      <pre
        v-if="live.result && live.result.taskId === currentTask.id"
        class="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-office-bg/70 p-2 text-[11px] leading-snug"
        data-live-result
        >{{ live.result.content }}</pre>
    </div>

    <!-- Instruksi -->
    <form class="mt-2.5" @submit.prevent="submit">
      <Label :for="inputId" class="text-xs">Instruksi</Label>
      <div class="mt-1 flex gap-1.5">
        <textarea
          :id="inputId"
          ref="input"
          v-model="instruction"
          rows="2"
          :disabled="!inputEnabled"
          :maxlength="preview ? undefined : maxChars"
          class="min-h-10 flex-1 resize-none rounded-lg border border-white/15 bg-[oklch(0.14_0.05_266/80%)] px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-office-cyan disabled:cursor-not-allowed disabled:opacity-60"
          :placeholder="
            preview
              ? SUGGESTIONS[agent.character]
              : canAssign
                ? 'Tulis tugas nyata untuk AI employee ini…'
                : (assignBlockedReason ?? 'Eksekusi tugas belum tersedia di mode live')
          "
          data-instruction-input
          @keydown.enter.exact.prevent="submit"
        />
        <Button
          type="submit"
          size="icon"
          class="size-10 shrink-0"
          :disabled="!inputEnabled || !instruction.trim() || (live?.submitting ?? false)"
          aria-label="Kirim instruksi"
          data-instruction-submit
        >
          <Send class="size-4" aria-hidden="true" />
        </Button>
      </div>
      <label
        v-if="!preview"
        class="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[10.5px] text-muted-foreground"
        data-live-approval-toggle
      >
        <Checkbox
          :model-value="requiresApproval"
          :disabled="!canAssign"
          aria-label="Hasil perlu persetujuan manusia sebelum dirilis"
          data-live-requires-approval
          @update:model-value="(value) => (requiresApproval = value === true)"
        />
        Hasil perlu persetujuan manusia sebelum dirilis
      </label>
      <p class="mt-1 text-[10.5px] text-muted-foreground">
        <template v-if="preview">
          Pratinjau: kata kunci instruksi menggerakkan simulasi frontend (bukan AI). Perintah riset/koordinasi ke Nova
          memulai misi Project Atlas; “minta persetujuan” memicu permintaan persetujuan.
        </template>
        <template v-else-if="live?.submitting">Mengirim tugas ke server…</template>
        <template v-else-if="canAssign">
          Tugas nyata: dieksekusi worker lewat runtime yang dikonfigurasi server; status dan hasil datang dari backend.
        </template>
        <template v-else>{{ assignBlockedReason ?? 'Perintah bisnis dinonaktifkan.' }}</template>
      </p>
      <p
        v-if="live?.error"
        class="mt-1 rounded-md bg-destructive/15 px-2 py-1 text-[11px] text-destructive"
        role="alert"
        data-live-error
      >
        {{ live.error }}
      </p>
      <p
        v-if="feedback"
        class="mt-1 rounded-md bg-office-cyan/10 px-2 py-1 text-[11px] text-office-cyan"
        role="status"
        data-command-feedback
      >
        {{ feedback }}
      </p>
    </form>

    <!-- Riwayat tugas (live) -->
    <div v-if="live && live.tasks.length > 0" class="mt-2.5">
      <p class="text-xs font-semibold">Riwayat tugas</p>
      <ol class="mt-1 space-y-0.5 text-[11px] text-muted-foreground" data-live-task-history>
        <li v-for="task in live.tasks.slice(0, 5)" :key="task.id" class="flex items-center justify-between gap-2">
          <NuxtLink :to="`/tasks/${task.id}`" class="truncate hover:text-foreground">{{ task.title }}</NuxtLink>
          <span class="shrink-0" :data-history-status="task.status">{{ TASK_STATUS_LABELS[task.status] }}</span>
        </li>
      </ol>
    </div>

    <!-- Aktivitas -->
    <div v-if="showLog" class="mt-2.5">
      <p class="text-xs font-semibold">Aktivitas</p>
      <ol v-if="agent.log.length > 0" class="mt-1 space-y-0.5 text-[11px] text-muted-foreground" data-activity-log>
        <li v-for="(entry, index) in agent.log" :key="index">{{ entry }}</li>
      </ol>
      <p v-else class="mt-1 text-[11px] text-muted-foreground">
        {{ preview ? 'Belum ada aktivitas simulasi.' : 'Status terakhir dikonfirmasi backend: ' + agent.label + '.' }}
      </p>
    </div>
  </section>
</template>
