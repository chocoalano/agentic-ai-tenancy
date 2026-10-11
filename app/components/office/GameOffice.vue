<script setup lang="ts">
import { Eye, Target, Users } from '@lucide/vue'
import { onKeyStroke } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { ACTIVITY_PRESENTATION } from '~/game/agent-state'
import { STATION_ACTIVITY, parsePreviewInstruction } from '~/game/commands'
import { defaultWorkstationActivity, workstationActivity } from '~/game/workstations'
import { confirmationLabel, liveAgentSpecs, mapRealtimeEvent } from '~/game/live-adapter'
import { PREVIEW_CAST_BY_CHARACTER } from '~/game/preview-cast'
import type { IslandId } from '~/game/world'
import type { AgentSummary, TenantDetail } from '~/utils/api-types'
import { CHARACTERS, centeringShift } from '~/utils/game-assets'
import { MISSION_HUB, STATIONS, buildOfficeScene, characterForAgent, type StationId } from '~/utils/office-layout'
import { deriveSetupMission } from '~/utils/office-mission'
import {
  liveRoster,
  missionFromSetup,
  previewMission,
  stationStatesFor,
  type RosterEntry,
} from '~/utils/office-preview'
import type { OfficeSelection } from '~/types/office'

/**
 * Virtual Office sebagai game manajemen AI layar penuh dengan robot animasi.
 *
 *   Z0–Z1 GameBackdrop · Z1–Z6 GameWorld (dunia + kamera + robot animasi) ·
 *   Z7 simulasi/pemberitahuan mode · Z8 GameHUD · Z9 panel misi/roster,
 *   panel perintah & quick-view · Z10 command bar · Z11 overlay portal.
 *
 * Dua mode presentasi:
 * - LIVE: hanya AI employee nyata (nama, peran, status, ID). Robot berdiri di
 *   workstation hasil pemetaan presentasi; status = data otoritatif terakhir.
 *   Perintah bisnis dinonaktifkan (backend belum punya endpoint-nya).
 * - PRATINJAU/SIMULASI: lima karakter asset pack yang bergerak, teleport, dan
 *   bekerja menurut simulasi frontend berlabel (Project Atlas). Tidak ada yang
 *   ditulis ke backend.
 */
const props = defineProps<{
  tenant: TenantDetail
  agents: AgentSummary[]
  userName: string
}>()

const emit = defineEmits<{ resync: [] }>()

const realtime = useOfficeRealtime()

const preview = ref(props.agents.length === 0)
const selection = ref<OfficeSelection | null>(null)
const missionCollapsed = ref(false)
const rosterCollapsed = ref(false)
const menuOpen = ref(false)
const missionSheet = ref(false)
const rosterSheet = ref(false)
const feedback = ref<string | null>(null)
const lastConfirmed = ref<Date | null>(null)
/** Mode live: tanpa event realtime, tampilkan status terakhir yang dikonfirmasi (bukan aktivitas karangan). */
const liveConfirmation = computed(() => {
  const label = confirmationLabel(realtime.state.value, lastConfirmed.value)
  // `new Date(...)` juga menormalkan string ISO bila stream belum mengubahnya menjadi Date.
  return lastConfirmed.value ? `${label} · ${new Date(lastConfirmed.value).toLocaleTimeString('id-ID')}` : label
})

const world = useTemplateRef('world')
const commands = useTemplateRef('commands')

const statusLabel = (status: AgentSummary['lifecycleStatus']) => LIFECYCLE_PRESENTATION[status].label
const counts = computed(() => countByLifecycle(props.agents))
const employed = computed(() => props.agents.length - counts.value.archived)
const scene = computed(() => buildOfficeScene(props.agents))

const liveSpecs = computed(() =>
  liveAgentSpecs(
    props.agents,
    new Map(
      [...scene.value.placements.values()].map((placed) => [
        placed.agent.id,
        { character: placed.character, stationId: placed.stationId, slot: placed.slot },
      ]),
    ),
  ),
)

const office = useOfficeEngine({ preview, liveSpecs })
const snapshot = office.snapshot

watch(
  () => props.tenant.tenant.id,
  () => {
    preview.value = props.agents.length === 0
    selection.value = null
  },
)

// Mode live: event SSE nyata → sinkron ulang snapshot / konfirmasi status.
watch(
  () => realtime.lastEvent.value,
  (event) => {
    if (!event) return
    for (const action of mapRealtimeEvent(event)) {
      if (action.type === 'confirm') lastConfirmed.value = action.serverTime
      else if (action.type === 'resync' && !preview.value) emit('resync')
    }
  },
)

const mission = computed(() =>
  preview.value
    ? previewMission(snapshot.value.simulation?.completedObjectives ?? [])
    : missionFromSetup(
        deriveSetupMission({
          tenantName: props.tenant.tenant.name,
          activeMemberCount: props.tenant.activeMemberCount,
          agents: props.agents,
        }),
      ),
)

const roster = computed<RosterEntry[]>(() =>
  preview.value
    ? snapshot.value.agents.map((agent) => {
        const cast = PREVIEW_CAST_BY_CHARACTER[agent.character]
        return {
          key: agent.key,
          preview: true,
          name: agent.name,
          roleTitle: cast.roleTitle,
          character: agent.character,
          lifecycle: null,
          statusLabel: agent.moving ? 'Berpindah…' : (agent.workstationActivity ?? agent.label),
          stationId: agent.island,
          level: cast.level,
          xp: cast.xp,
        }
      })
    : liveRoster(sortByLifecycle(props.agents), scene.value, characterForAgent, statusLabel),
)

const stationStates = computed(() => stationStatesFor(scene.value, preview.value))
const occupants = computed(() => {
  const map = new Map<StationId, number>()
  for (const agent of snapshot.value.agents) {
    if (agent.moving || agent.island === 'mission-hub') continue
    map.set(agent.island, (map.get(agent.island) ?? 0) + 1)
  }
  return map
})
const roleLabel = computed(() => props.tenant.membership.roles.join(', ') || 'anggota')

const selectedAgent = computed(() => {
  const current = selection.value
  return current?.kind === 'actor' ? snapshot.value.agents.find((agent) => agent.key === current.key) : undefined
})
const selectedLive = computed(() =>
  selectedAgent.value && !selectedAgent.value.preview
    ? props.agents.find((agent) => agent.id === selectedAgent.value?.key)
    : undefined,
)
const selectedRole = computed(() => {
  if (!selectedAgent.value) return ''
  if (selectedLive.value) return selectedLive.value.roleTitle
  return PREVIEW_CAST_BY_CHARACTER[selectedAgent.value.character].roleTitle
})

function islandLabel(id: IslandId): string {
  return id === 'mission-hub' ? MISSION_HUB.label : (STATIONS.find((station) => station.id === id)?.label ?? id)
}

function select(next: OfficeSelection | null) {
  selection.value = next
  feedback.value = null
  if (next && (next.kind === 'actor' || next.kind === 'station')) rosterSheet.value = false
  if (next && next.kind !== 'step') missionSheet.value = false
}

function togglePreview() {
  preview.value = !preview.value
  selection.value = null
  feedback.value = null
}

/** Jeda penerimaan perintah (robot "menerima" dulu, lalu berangkat) — hanya pratinjau. */
const ackOptions = () => ({ acknowledgeSeconds: preview.value ? COMMAND_ACK_SECONDS : 0 })

/** Pindahkan robot (pratinjau: terima perintah → jalan → aktivitas stasiun; live: visual saja). */
function moveAgent(key: string, island: IslandId) {
  const agent = snapshot.value.agents.find((item) => item.key === key)
  if (!agent) return
  const plan = preview.value ? { state: STATION_ACTIVITY[island] } : undefined
  if (!office.moveTo(key, island, plan, ackOptions())) {
    feedback.value = `${agent.name} tidak dapat dipindahkan (${agent.label}).`
    return
  }
  office.say(
    key,
    preview.value ? `Siap, menuju ${islandLabel(island)}.` : `Pindah ke ${islandLabel(island)} (visual).`,
    2.5,
  )
  const activityLabel =
    defaultWorkstationActivity(island)?.label ?? ACTIVITY_PRESENTATION[STATION_ACTIVITY[island]].label
  feedback.value = preview.value
    ? `Simulasi: ${agent.name} menerima perintah → ${islandLabel(island)} (${activityLabel.toLowerCase()}).`
    : `${agent.name} dipindahkan secara visual ke ${islandLabel(island)} — penugasan di backend tidak berubah.`
}

/** Instruksi bahasa alami (pratinjau saja — pencocokan kata kunci, bukan AI). */
function instruct(text: string) {
  const current = selectedAgent.value
  if (!preview.value || !current) return
  const parsed = parsePreviewInstruction(text, current.character)
  const targetKey = parsed.target ? `preview:${parsed.target}` : current.key
  const target = snapshot.value.agents.find((agent) => agent.key === targetKey)
  if (!target) return
  if (parsed.startsMission) {
    office.setActivity(targetKey, { state: 'communicating', seconds: 1.5, next: 'idle' })
    office.startSimulation(text)
    feedback.value = null
    // Tutup panel agar dunia terlihat selama simulasi; log tetap ada di panel robot.
    selection.value = null
    toast('Simulasi Project Atlas dimulai', {
      description: `"${text}" — Nova membagi tugas ke tim. Simulasi frontend, bukan AI nyata.`,
    })
    return
  }
  if (parsed.intent === 'approval') {
    if (!office.setActivity(targetKey, { state: 'waiting_approval' })) {
      feedback.value = `${target.name} tidak dapat meminta persetujuan saat ${target.label.toLowerCase()}.`
      return
    }
    office.say(targetKey, 'Butuh persetujuan sebelum menjalankan alat.', 4)
    selection.value = { kind: 'actor', key: targetKey }
    feedback.value = `Simulasi: ${target.name} menunggu persetujuan — pilih Setujui atau Tolak.`
    toast.warning('Persetujuan dibutuhkan (simulasi)', {
      description: `${target.name} meminta izin menjalankan alat. Tidak ada tool nyata yang dijalankan.`,
    })
    return
  }
  if (!parsed.island) {
    office.say(targetKey, 'Instruksi tidak dikenali dalam simulasi.', 3)
    feedback.value =
      'Simulasi hanya mengenali riset, analisis, laporan, alat, pengetahuan, brief, koordinasi, dan permintaan persetujuan.'
    return
  }
  const activityLabel =
    workstationActivity(parsed.island, parsed.activity)?.label ?? ACTIVITY_PRESENTATION[parsed.activity].label
  office.say(targetKey, `Siap! ${activityLabel} di ${islandLabel(parsed.island)}.`, 3)
  if (target.island === parsed.island && !target.moving) office.setActivity(targetKey, { state: parsed.activity })
  else office.moveTo(targetKey, parsed.island, { state: parsed.activity }, ackOptions())
  feedback.value = `Simulasi: ${target.name} menerima perintah → ${islandLabel(parsed.island)} (${activityLabel.toLowerCase()}).`
}

/** Jeda satu robot: gerak/aktivitas berhenti; rencana fasenya ditahan, bukan dibuang. */
function pauseAgent() {
  const current = selectedAgent.value
  if (!current || !preview.value) return
  office.pauseActor(current.key)
  feedback.value = `Simulasi: ${current.name} dijeda — tekan Lanjutkan agent untuk meneruskan rencananya.`
}

/** Lanjutkan: rencana fase diterbitkan ulang; tanpa rencana, kembali ke aktivitas stasiunnya. */
function resumeAgent() {
  const current = selectedAgent.value
  if (!current || !preview.value) return
  if (!office.resumeActor(current.key)) office.setActivity(current.key, { state: STATION_ACTIVITY[current.island] })
  feedback.value = `Simulasi: ${current.name} melanjutkan aktivitas.`
}

/** Keputusan persetujuan simulasi: setujui → bekerja → selesai; tolak → gagal (reaksi error) → siaga. */
function decideApproval(approved: boolean) {
  const current = selectedAgent.value
  if (!current || !preview.value || current.activity !== 'waiting_approval') return
  if (approved) {
    office.setActivity(current.key, { state: 'working', seconds: 3, next: 'completed' })
    office.say(current.key, 'Disetujui! Menjalankan alat…', 2.5)
    feedback.value = `Simulasi: persetujuan diberikan — ${current.name} bekerja lalu selesai.`
  } else {
    office.setActivity(current.key, { state: 'failed', seconds: 2.5, next: 'idle' })
    office.say(current.key, 'Ditolak. Tugas dibatalkan.', 2.5)
    feedback.value = `Simulasi: persetujuan ditolak — ${current.name} membatalkan tugas.`
  }
}

function startSimulation() {
  office.startSimulation('Lakukan riset pasar Project Atlas')
}

/** Dari panel robot: jalankan skenario (dunia dibiarkan terlihat) atau reset posisi simulasi. */
function runAtlasFromPanel() {
  if (!preview.value) return
  startSimulation()
  selection.value = null
  toast('Simulasi Project Atlas dimulai', {
    description: 'Skenario misi contoh berjalan — simulasi frontend, bukan AI nyata.',
  })
}

function resetFromPanel() {
  if (!preview.value) return
  office.resetSimulation()
  feedback.value = 'Simulasi direset: kelima karakter kembali ke posisi awal.'
}

watch(
  () => snapshot.value.simulation?.status,
  (status, previous) => {
    if (status === 'completed' && previous !== 'completed') {
      toast.success('Simulasi Project Atlas selesai', {
        description: 'Ini hasil simulasi pratinjau — tidak ada tugas, run, biaya, atau XP nyata yang dibuat.',
      })
    }
  },
)

function typingTarget(event: KeyboardEvent): boolean {
  const target = event.target
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

const overlayOpen = computed(() => menuOpen.value || missionSheet.value || rosterSheet.value)

onKeyStroke((event) => {
  // Escape menutup panel mengambang juga saat fokus di kolom instruksi.
  if (event.key === 'Escape' && !event.defaultPrevented && selection.value && !overlayOpen.value) {
    selection.value = null
    return
  }
  if (
    event.defaultPrevented ||
    typingTarget(event) ||
    overlayOpen.value ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return
  if (event.key === ' ' && event.target instanceof Element && event.target.closest('button, a, [role="button"]')) return
  if (event.key === '+' || event.key === '=') world.value?.zoomIn()
  else if (event.key === '-') world.value?.zoomOut()
  else if (event.key === '0') world.value?.reset()
  else if (/^[1-6qwert ]$/i.test(event.key)) {
    if (event.key === ' ') event.preventDefault()
    commands.value?.onShortcut(event.key)
  }
})

onMounted(() => {
  office.stage.value = world.value?.stageElement ?? null
})

/** Overlay kalibrasi geometri: hanya `nuxt dev` dan ?debug=geometry (tidak pernah di production). */
const debugGeometry = computed(() => import.meta.dev && useRoute().query.debug === 'geometry')

function locate(key: string) {
  const agent = office.engine.agents.get(key)
  return agent ? { ...agent.position } : null
}

const zoomLevel = computed(() => world.value?.zoomLevel ?? 1)
</script>

<template>
  <div
    class="relative size-full [--hud-bottom:10rem] [--hud-top:4rem] [--portrait-zoom:2.2] md:[--hud-bottom:7.25rem] md:[--portrait-zoom:1.6] xl:[--hud-bottom:8.5rem]"
    data-virtual-office
    :data-mode="preview ? 'preview' : 'live'"
  >
    <GameBackdrop />

    <GameWorld
      ref="world"
      :agents="snapshot.agents"
      :station-states="stationStates"
      :occupants="occupants"
      :active-stations="snapshot.activeStations"
      :targeted-stations="snapshot.targetedStations"
      :portal-flashes="snapshot.portalFlashes"
      :workstations="snapshot.workstations"
      :ambient-islands="snapshot.ambientIslands"
      :mission-completed="mission.completed"
      :mission-total="mission.total"
      :preview="preview"
      :selection="selection"
      :locate="locate"
      :debug-geometry="debugGeometry"
      @select="select"
    />

    <!-- Z7: pemberitahuan mode -->
    <div
      class="pointer-events-none absolute left-1/2 top-[calc(var(--hud-top)+1.65rem)] z-[82] w-max max-w-[calc(100%-1rem)] -translate-x-1/2 xl:top-auto xl:bottom-[calc(var(--hud-bottom)+0.5rem)]"
    >
      <SimulationBar
        v-if="preview && snapshot.simulation"
        :simulation="snapshot.simulation"
        :real-count="agents.length"
        @start="startSimulation"
        @pause="office.pauseSimulation()"
        @resume="office.resumeSimulation()"
        @reset="office.resetSimulation()"
        @speed="office.setSpeed($event)"
        @exit="togglePreview"
      />
      <div
        v-else-if="agents.length === 0"
        class="pointer-events-auto flex items-center gap-2 rounded-full border border-office-cyan/40 bg-office-bg/85 py-1 pl-3 pr-1 text-xs backdrop-blur"
        role="status"
      >
        <span class="font-semibold">Mode live</span>
        <span class="text-muted-foreground">Belum ada AI employee (0)</span>
        <Button
          size="sm"
          variant="ghost"
          class="h-6 gap-1 rounded-full px-2 text-[11px] text-office-orange"
          @click="togglePreview"
        >
          <Eye class="size-3.5" aria-hidden="true" />Lihat pratinjau
        </Button>
      </div>
    </div>

    <GameHUD
      :tenant-name="tenant.tenant.name"
      :user-name="userName"
      :role-label="roleLabel"
      :preview="preview"
      :active-agents="counts.active"
      :employed-agents="employed"
      :mission="mission"
      :realtime-state="realtime.state.value"
      :realtime-last-event="realtime.lastEvent.value"
      @toggle-preview="togglePreview"
      @open-menu="menuOpen = true"
    />

    <!-- Z9: panel melayang (desktop) -->
    <div
      class="pointer-events-none absolute inset-x-3 bottom-[calc(var(--hud-bottom)+0.25rem)] top-[calc(var(--hud-top)+0.5rem)] z-[85] hidden items-start justify-between gap-4 xl:flex"
    >
      <div class="pointer-events-auto flex h-full w-[clamp(19rem,22vw,23rem)] min-h-0 flex-col items-start">
        <MissionPanel
          :mission="mission"
          :station-states="stationStates"
          :occupants="occupants"
          :selection="selection"
          :collapsed="missionCollapsed"
          @toggle="missionCollapsed = !missionCollapsed"
          @select="select"
        />
      </div>
      <div class="pointer-events-auto flex max-h-full w-[clamp(18rem,19vw,21rem)] min-h-0 flex-col items-end">
        <AgentRoster
          :entries="roster"
          :preview="preview"
          :real-count="agents.length"
          :active-count="counts.active"
          :selection="selection"
          :collapsed="rosterCollapsed"
          @toggle="rosterCollapsed = !rosterCollapsed"
          @select="select"
          @toggle-preview="togglePreview"
        />
      </div>
    </div>

    <!-- Tablet/ponsel: tab drawer melayang -->
    <div class="absolute left-2 top-[calc(var(--hud-top)+2.75rem)] z-[85] xl:hidden">
      <button
        type="button"
        class="hud-panel flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-office-cyan"
        aria-label="Buka panel misi"
        @click="missionSheet = true"
      >
        <Target class="size-4 text-office-mint" aria-hidden="true" />
        <span class="tabular-nums">{{ mission.completed }}/{{ mission.total }}</span>
      </button>
    </div>
    <div class="absolute right-2 top-[calc(var(--hud-top)+2.75rem)] z-[85] xl:hidden">
      <button
        type="button"
        class="hud-panel flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-office-cyan"
        aria-label="Buka daftar agent"
        @click="rosterSheet = true"
      >
        <Users class="size-4 text-office-cyan" aria-hidden="true" />
        <span class="tabular-nums">{{ roster.length }}</span>
      </button>
    </div>

    <Sheet v-model:open="missionSheet">
      <SheetContent
        side="left"
        class="dark w-[min(22rem,90vw)] gap-0 overflow-y-auto border-office-border/60 bg-office-bg/95 p-4 text-foreground backdrop-blur-xl"
      >
        <SheetHeader class="p-0 pb-3">
          <SheetTitle>Panel misi</SheetTitle>
          <SheetDescription class="sr-only">Sasaran, progres, dan peta sektor.</SheetDescription>
        </SheetHeader>
        <MissionPanel
          variant="sheet"
          :mission="mission"
          :station-states="stationStates"
          :occupants="occupants"
          :selection="selection"
          @select="select"
        />
      </SheetContent>
    </Sheet>
    <Sheet v-model:open="rosterSheet">
      <SheetContent
        side="right"
        class="dark w-[min(22rem,90vw)] gap-0 overflow-y-auto border-office-border/60 bg-office-bg/95 p-4 text-foreground backdrop-blur-xl"
      >
        <SheetHeader class="p-0 pb-3">
          <SheetTitle>Daftar agent</SheetTitle>
          <SheetDescription class="sr-only">AI employee atau karakter pratinjau.</SheetDescription>
        </SheetHeader>
        <AgentRoster
          variant="sheet"
          :entries="roster"
          :preview="preview"
          :real-count="agents.length"
          :active-count="counts.active"
          :selection="selection"
          @select="select"
          @toggle-preview="togglePreview"
        />
      </SheetContent>
    </Sheet>

    <!-- Z9: quick-view -->
    <div
      v-if="selection"
      class="absolute bottom-[calc(var(--hud-bottom)+0.5rem)] left-1/2 z-[95] max-h-[calc(100%-var(--hud-top)-var(--hud-bottom)-4rem)] w-[min(32rem,calc(100%-1rem))] -translate-x-1/2 overflow-y-auto"
    >
      <AgentCommandPanel
        v-if="selectedAgent"
        :agent="selectedAgent"
        :preview="preview"
        :live-agent="selectedLive"
        :role-title="selectedRole"
        :feedback="feedback"
        :confirmation="preview ? null : liveConfirmation"
        @close="select(null)"
        @move="moveAgent(selectedAgent.key, $event)"
        @instruct="instruct"
        @pause-agent="pauseAgent"
        @resume-agent="resumeAgent"
        @run-atlas="runAtlasFromPanel"
        @reset-simulation="resetFromPanel"
        @approve="decideApproval(true)"
        @reject="decideApproval(false)"
      />
      <GameQuickView
        v-else-if="selection.kind !== 'actor'"
        :selection="selection"
        :agents="snapshot.agents"
        :mission="mission"
        :preview="preview"
        :real-count="agents.length"
        @select="select"
        @close="select(null)"
        @assign="moveAgent"
      />
    </div>

    <!-- Ponsel: strip pemilih robot -->
    <div
      v-if="roster.length > 0"
      class="absolute inset-x-2 bottom-[5.9rem] z-[88] md:hidden"
      role="group"
      :aria-label="preview ? 'Pilih karakter pratinjau' : 'Pilih AI employee'"
    >
      <ul class="hud-panel flex gap-1.5 overflow-x-auto p-1.5">
        <li v-for="entry in roster" :key="entry.key" class="shrink-0">
          <button
            type="button"
            :class="[
              'flex w-16 flex-col items-center gap-0.5 rounded-lg border px-1 py-1 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-office-cyan',
              selection?.kind === 'actor' && selection.key === entry.key
                ? 'border-office-cyan bg-office-cyan/15'
                : 'border-white/10 bg-white/5',
            ]"
            :aria-pressed="selection?.kind === 'actor' && selection.key === entry.key"
            @click="select({ kind: 'actor', key: entry.key })"
          >
            <span class="block w-8 overflow-hidden">
              <AgentSprite
                :character="entry.character"
                :status="entry.lifecycle"
                :style="{ transform: `translateX(${centeringShift(CHARACTERS[entry.character])})` }"
              />
            </span>
            <span class="w-full truncate text-center">{{ entry.name }}</span>
          </button>
        </li>
      </ul>
    </div>

    <GameCommandBar
      ref="commands"
      :zoom-level="zoomLevel"
      :preview="preview"
      :simulation="snapshot.simulation"
      @zoom-in="world?.zoomIn()"
      @zoom-out="world?.zoomOut()"
      @reset-camera="world?.reset()"
      @start-simulation="startSimulation"
      @pause-simulation="office.pauseSimulation()"
      @resume-simulation="office.resumeSimulation()"
    />

    <GameMenu v-model:open="menuOpen" />
  </div>
</template>
