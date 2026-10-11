<script setup lang="ts">
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import type { IslandId } from '~/game/world'
import type { WorkstationVisual } from '~/game/workstations'
import { MISSION_HUB, OFFICE_WORLD, STATIONS, type StationId, type StationState } from '~/utils/office-layout'
import type { OfficeSelection } from '~/types/office'

/**
 * Dunia isometrik Virtual Office + kamera.
 *
 * Lapisan (bawah → atas, satu koordinat dunia 1672 × 941):
 *   Z1 awan dekat · Z2 terrain melayang · Z3 jaringan energi SVG ·
 *   Z4 Mission Hub & pulau · Z5 efek, portal & robot animasi · Z6 label.
 *
 * Robot & orb teleport digerakkan oleh mesin (useOfficeEngine) — komponen ini
 * hanya merender elemennya sekali dan meneruskan event pilihan.
 *
 * Skala dasar dihitung CSS (`.game-stage`, `--s`) sehingga SSR identik dengan
 * browser. Kamera klien hanya menambah zoom/geser (state awal 1 / 0,0):
 * roda mouse & tombol = zoom, seret = geser, memilih objek = fokus ke objek,
 * melepas pilihan = kembali ke peta penuh.
 */
const props = defineProps<{
  agents: OfficeAgentView[]
  stationStates: ReadonlyMap<StationId, StationState>
  occupants: ReadonlyMap<StationId, number>
  activeStations: readonly IslandId[]
  targetedStations: readonly IslandId[]
  portalFlashes: readonly IslandId[]
  /** Efek workstation aktif (diturunkan dari state agent) dan hologram pulau ambient. */
  workstations?: readonly WorkstationVisual[]
  ambientIslands?: readonly IslandId[]
  missionCompleted: number
  missionTotal: number
  preview: boolean
  selection: OfficeSelection | null
  /** Posisi kaki terkini dari mesin (untuk fokus kamera saat robot bergerak). */
  locate: (key: string) => { x: number; y: number } | null
  /** Overlay kalibrasi geometri (hanya pengembangan). */
  debugGeometry?: boolean
}>()

const emit = defineEmits<{ select: [selection: OfficeSelection | null] }>()

const MIN_ZOOM = 0.8
const MAX_ZOOM = 2.2

const viewport = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const zoom = ref(1)
const pan = reactive({ x: 0, y: 0 })
const dragging = ref(false)

// prefers-reduced-motion dibaca setelah mount (SSR tidak tahu preferensi pengguna) → transisi kamera dimatikan.
const reduceMotion = ref(false)
let motionQuery: MediaQueryList | null = null
const onMotionChange = (event: MediaQueryListEvent) => {
  reduceMotion.value = event.matches
}
onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduceMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)
})
onBeforeUnmount(() => motionQuery?.removeEventListener('change', onMotionChange))

const cameraStyle = computed(() => ({
  transform: `translate3d(${pan.x.toFixed(1)}px, ${pan.y.toFixed(1)}px, 0) scale(${zoom.value.toFixed(3)})`,
  transition: dragging.value || reduceMotion.value ? 'none' : 'transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)',
}))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampPan() {
  const view = viewport.value
  const world = stage.value
  if (!view || !world) return
  const maxX = Math.max(0, (world.offsetWidth * zoom.value - view.clientWidth) / 2) + view.clientWidth * 0.2
  const maxY = Math.max(0, (world.offsetHeight * zoom.value - view.clientHeight) / 2) + view.clientHeight * 0.15
  pan.x = clamp(pan.x, -maxX, maxX)
  pan.y = clamp(pan.y, -maxY, maxY)
}

function setZoom(next: number) {
  const previous = zoom.value
  zoom.value = clamp(next, MIN_ZOOM, MAX_ZOOM)
  // Pertahankan titik tengah layar saat zoom.
  const ratio = zoom.value / previous
  pan.x *= ratio
  pan.y *= ratio
  clampPan()
}

function reset() {
  zoom.value = 1
  pan.x = 0
  pan.y = 0
}

/** Pusatkan titik dunia di layar (sedikit di atas tengah agar tidak tertutup quick-view). */
function focusOn(point: { x: number; y: number }, targetZoom: number) {
  const view = viewport.value
  const world = stage.value
  if (!view || !world) return
  zoom.value = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM)
  const width = world.offsetWidth
  const height = world.offsetHeight
  const centerX = world.offsetLeft + width / 2
  const centerY = world.offsetTop + height / 2
  const dx = (point.x / OFFICE_WORLD.width - 0.5) * width * zoom.value
  const dy = (point.y / OFFICE_WORLD.height - 0.5) * height * zoom.value
  pan.x = view.clientWidth / 2 - centerX - dx
  pan.y = view.clientHeight * 0.4 - centerY - dy
  clampPan()
}

watch(
  () => props.selection,
  (current, previous) => {
    if (!current) {
      if (previous && previous.kind !== 'step') reset()
      return
    }
    if (current.kind === 'hub') focusOn({ x: MISSION_HUB.x, y: MISSION_HUB.y }, Math.max(zoom.value, 1.1))
    if (current.kind === 'station') {
      const station = STATIONS.find((item) => item.id === current.stationId)
      if (station) focusOn({ x: station.x, y: station.y }, Math.max(zoom.value, 1.35))
    }
    if (current.kind === 'actor') {
      const point = props.locate(current.key)
      if (point) focusOn({ x: point.x, y: point.y - 50 }, Math.max(zoom.value, 1.4))
    }
  },
)

// Seret untuk menggeser kamera; klik tanpa seret pada area kosong = lepas pilihan.
let gesture: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  if (event.target instanceof Element && event.target.closest('button, a')) return
  gesture = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false }
  viewport.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!gesture) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!gesture.moved && Math.hypot(dx, dy) < 5) return
  gesture.moved = true
  dragging.value = true
  pan.x = gesture.panX + dx
  pan.y = gesture.panY + dy
  clampPan()
}

function onPointerUp(event: PointerEvent) {
  if (!gesture) return
  if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId)
  const wasClick = !gesture.moved
  gesture = null
  dragging.value = false
  if (wasClick && props.selection) emit('select', null)
}

function onWheel(event: WheelEvent) {
  setZoom(zoom.value * (event.deltaY > 0 ? 0.9 : 1.1))
}

const stationLabels = new Map<IslandId, string>([
  ...STATIONS.map((station) => [station.id, station.label] as const),
  ['mission-hub', MISSION_HUB.label],
])

function isStationSelected(id: StationId): boolean {
  return props.selection?.kind === 'station' && props.selection.stationId === id
}

function isActorSelected(key: string): boolean {
  return props.selection?.kind === 'actor' && props.selection.key === key
}

const highlighted = computed<StationId | null>(() => {
  const current = props.selection
  if (current?.kind === 'station') return current.stationId
  if (current?.kind === 'actor') {
    const island = props.agents.find((agent) => agent.key === current.key)?.island
    return island && island !== 'mission-hub' ? island : null
  }
  return null
})

const summary = computed(
  () =>
    `Peta kantor ${props.preview ? '(mode pratinjau, karakter contoh)' : ''}: ${MISSION_HUB.label} di tengah, ${STATIONS.length} stasiun kerja, ${props.agents.length} robot.`,
)

defineExpose({
  zoomIn: () => setZoom(zoom.value * 1.2),
  zoomOut: () => setZoom(zoom.value / 1.2),
  reset,
  zoomLevel: zoom,
  stageElement: stage,
})
</script>

<template>
  <div
    id="game-world"
    ref="viewport"
    :class="['game-viewport absolute inset-0 overflow-hidden', dragging ? 'cursor-grabbing' : 'cursor-grab']"
    role="region"
    aria-label="Peta dunia Virtual Office"
    tabindex="-1"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel.prevent="onWheel"
  >
    <p class="sr-only">{{ summary }}</p>
    <div ref="stage" class="game-stage" :style="cameraStyle" data-office-stage>
      <OfficeTerrain />
      <EnergyConnections class="z-30" :station-states="stationStates" :highlighted="highlighted" />

      <div role="group" aria-label="Stasiun kerja" class="contents">
        <OfficeIsland
          v-for="(station, index) in STATIONS"
          :key="station.id"
          :definition="station"
          :state="stationStates.get(station.id) ?? 'empty'"
          :occupants="occupants.get(station.id) ?? 0"
          :selected="isStationSelected(station.id)"
          :active="activeStations.includes(station.id)"
          :targeted="targetedStations.includes(station.id)"
          :ambient="(ambientIslands ?? []).includes(station.id)"
          :index="index"
          @select="emit('select', { kind: 'station', stationId: station.id })"
        />
      </div>

      <MissionHub
        :completed="missionCompleted"
        :total="missionTotal"
        :preview="preview"
        :selected="selection?.kind === 'hub'"
        :active="activeStations.includes('mission-hub')"
        :targeted="targetedStations.includes('mission-hub')"
        :ambient="(ambientIslands ?? []).includes('mission-hub')"
        @select="emit('select', { kind: 'hub' })"
      />

      <OfficeEffects class="z-50" :portal-flashes="portalFlashes" />
      <!-- Efek workstation & hologram ambient: anak langsung panggung agar kedalamannya berbaur dengan robot. -->
      <OfficeWorkstationEffects :visuals="workstations ?? []" :ambient-islands="ambientIslands ?? []" />
      <!-- Overlay kalibrasi geometri: hanya `nuxt dev` + ?debug=geometry (tidak ada di production). -->
      <OfficeGeometryDebug v-if="debugGeometry" />

      <div role="group" :aria-label="preview ? 'Karakter pratinjau' : 'AI employee di lantai kantor'" class="contents">
        <OfficeActor
          v-for="agent in agents"
          :key="agent.key"
          :agent="agent"
          :station-label="stationLabels.get(agent.island) ?? ''"
          :selected="isActorSelected(agent.key)"
          @select="emit('select', { kind: 'actor', key: agent.key })"
        />
      </div>
      <OfficeTeleportOrb v-for="agent in agents" :key="`orb-${agent.key}`" :agent-key="agent.key" />

      <OfficeLabels
        class="z-[70]"
        :station-states="stationStates"
        :occupants="occupants"
        :mission-completed="missionCompleted"
        :mission-total="missionTotal"
        :selected-station="selection?.kind === 'station' ? selection.stationId : null"
        :hub-selected="selection?.kind === 'hub'"
      />
    </div>
  </div>
</template>
