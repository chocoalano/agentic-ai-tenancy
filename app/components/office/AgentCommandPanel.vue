<script setup lang="ts">
import { ArrowUpRight, Lock, MapPin, Send, X } from '@lucide/vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import { AGENT_COMMANDS, type CommandDefinition } from '~/game/commands'
import type { IslandId } from '~/game/world'
import type { AgentSummary } from '~/utils/api-types'
import { CHARACTERS, centeringShift } from '~/utils/game-assets'
import { isWalkableIsland } from '~/game/world'
import { MISSION_HUB, STATIONS } from '~/utils/office-layout'

/**
 * Panel perintah AI employee (klik robot).
 *
 * Membedakan dengan jelas:
 * - perintah VISUAL (pindah, lihat aktivitas, profil) — dijalankan frontend;
 * - perintah BISNIS (tugaskan, chat, jeda/lanjut) — di mode live dinonaktifkan
 *   karena backend belum menyediakan endpoint-nya; di mode pratinjau berjalan
 *   sebagai SIMULASI berlabel. Tidak ada respons AI yang dikarang.
 */
const props = defineProps<{
  agent: OfficeAgentView
  preview: boolean
  /** Data nyata (mode live). */
  liveAgent?: AgentSummary
  roleTitle: string
  feedback: string | null
  /** Mode live: status dikonfirmasi realtime vs status terakhir yang dikonfirmasi. */
  confirmation?: string | null
}>()

const emit = defineEmits<{
  close: []
  move: [island: IslandId]
  instruct: [text: string]
  pauseAgent: []
  resumeAgent: []
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

const SUGGESTIONS: Record<string, string> = {
  nova: 'Nova, lakukan riset pasar untuk Project Atlas.',
  sage: 'Sage, lakukan riset pasar.',
  pixel: 'Pixel, analisis hasil riset Sage.',
  bolt: 'Bolt, buat laporan hasil analisis.',
  echo: 'Echo, jalankan tool yang diperlukan.',
}

function available(command: CommandDefinition): boolean {
  return props.preview ? command.preview : command.live.supported
}

function run(command: CommandDefinition) {
  if (!available(command)) return
  if (command.key === 'assign_task' || command.key === 'chat') {
    instruction.value ||= SUGGESTIONS[props.agent.character] ?? ''
    nextTick(() => input.value?.focus())
  } else if (command.key === 'move') showMove.value = !showMove.value
  else if (command.key === 'inspect') showLog.value = !showLog.value
  else if (command.key === 'pause') emit('pauseAgent')
  else if (command.key === 'resume') emit('resumeAgent')
}

function submit() {
  const text = instruction.value.trim()
  if (!text || !props.preview) return
  emit('instruct', text)
  instruction.value = ''
}
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
        </p>
        <h3 :id="titleId" class="truncate font-heading text-lg font-bold">{{ agent.name }}</h3>
        <p class="truncate text-xs text-office-cyan">{{ roleTitle }}</p>
      </div>
    </div>

    <dl class="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Status</dt>
        <dd class="font-semibold">{{ agent.label }}</dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Runtime</dt>
        <dd class="truncate font-semibold">{{ preview ? 'Simulasi frontend' : RUNTIME_DISCONNECTED.label }}</dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Penugasan</dt>
        <dd class="truncate font-semibold">
          {{ preview ? `${agent.label} · ${stationLabel}` : 'Belum ada (modul tugas belum tersedia)' }}
        </dd>
      </div>
      <div class="hud-segment px-2 py-1">
        <dt class="text-muted-foreground">Model AI</dt>
        <dd class="font-semibold text-muted-foreground">—</dd>
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
            <template v-else>{{ command.live.reason }}</template>
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

    <!-- Persetujuan (pratinjau saja; mode live belum punya modul persetujuan) -->
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

    <!-- Instruksi -->
    <form class="mt-2.5" @submit.prevent="submit">
      <Label :for="inputId" class="text-xs">Instruksi</Label>
      <div class="mt-1 flex gap-1.5">
        <textarea
          :id="inputId"
          ref="input"
          v-model="instruction"
          rows="2"
          :disabled="!preview"
          class="min-h-10 flex-1 resize-none rounded-lg border border-white/15 bg-[oklch(0.14_0.05_266/80%)] px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-office-cyan disabled:cursor-not-allowed disabled:opacity-60"
          :placeholder="preview ? SUGGESTIONS[agent.character] : 'Eksekusi tugas belum tersedia di mode live'"
          data-instruction-input
          @keydown.enter.exact.prevent="submit"
        />
        <Button
          type="submit"
          size="icon"
          class="size-10 shrink-0"
          :disabled="!preview || !instruction.trim()"
          aria-label="Kirim instruksi"
        >
          <Send class="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p class="mt-1 text-[10.5px] text-muted-foreground">
        <template v-if="preview">
          Pratinjau: kata kunci instruksi menggerakkan simulasi frontend (bukan AI). Perintah riset/koordinasi ke Nova
          memulai misi Project Atlas; “minta persetujuan” memicu permintaan persetujuan.
        </template>
        <template v-else>
          Perintah bisnis dinonaktifkan: backend belum menyediakan modul tugas, orchestrator, dan inferensi AI.
        </template>
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
