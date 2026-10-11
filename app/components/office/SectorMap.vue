<script setup lang="ts">
import { MISSION_HUB, MISSION_ROUTE, STATIONS, type StationId, type StationState } from '~/utils/office-layout'
import { ISLANDS } from '~/utils/game-assets'
import type { OfficeSelection } from '~/types/office'

/**
 * Peta sektor mini (referensi: ui-previews/sector-map.png): node per stasiun
 * pada posisi relatif yang sama dengan dunia; rute misi oranye. Klik node =
 * fokus kamera ke stasiun.
 */
const props = defineProps<{
  stationStates: ReadonlyMap<StationId, StationState>
  occupants: ReadonlyMap<StationId, number>
  selection: OfficeSelection | null
}>()

const emit = defineEmits<{ select: [selection: OfficeSelection] }>()

/** Area peta: hanya pita dunia yang berisi pulau (x 250–1420, y 40–880). */
const BOUNDS = { x: 250, y: 40, width: 1170, height: 840 }
const VIEW = { width: 160, height: 100 }

function project(x: number, y: number) {
  return {
    x: 8 + ((x - BOUNDS.x) / BOUNDS.width) * (VIEW.width - 16),
    y: 8 + ((y - BOUNDS.y) / BOUNDS.height) * (VIEW.height - 16),
  }
}

const hub = project(MISSION_HUB.x, MISSION_HUB.y)
const nodes = computed(() =>
  STATIONS.map((station) => ({
    id: station.id,
    label: station.label,
    state: props.stationStates.get(station.id) ?? 'empty',
    count: props.occupants.get(station.id) ?? 0,
    asset: ISLANDS[station.id],
    ...project(station.x, station.y),
  })),
)
const route = computed(() =>
  MISSION_ROUTE.map((id) => nodes.value.find((node) => node.id === id))
    .filter((node) => node !== undefined)
    .map((node) => `${node.x.toFixed(1)},${node.y.toFixed(1)}`)
    .join(' '),
)

const NODE: Record<StationState, string> = {
  active: 'border-office-mint bg-office-mint/30 shadow-[0_0_10px_var(--office-mint)]',
  standby: 'border-office-orange bg-office-orange/25 shadow-[0_0_8px_var(--office-orange)]',
  empty: 'border-white/40 bg-white/10',
}
const LINE: Record<StationState, string> = {
  active: 'var(--office-cyan)',
  standby: 'var(--office-orange)',
  empty: 'oklch(0.68 0.24 300)',
}
const STATE_LABEL: Record<StationState, string> = { active: 'aktif', standby: 'siaga', empty: 'kosong' }

function selected(id: StationId): boolean {
  return props.selection?.kind === 'station' && props.selection.stationId === id
}

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`
}
</script>

<template>
  <div>
    <div class="sector-world relative aspect-[1.95] overflow-hidden rounded-lg border border-blue-400/30">
      <div class="holo-grid absolute inset-0 opacity-20" aria-hidden="true" />
      <span
        v-for="node in nodes"
        :key="`island:${node.id}`"
        class="pointer-events-none absolute w-[18%] -translate-x-1/2 -translate-y-[30%] opacity-45"
        :style="{ left: percent(node.x, VIEW.width), top: percent(node.y, VIEW.height) }"
        aria-hidden="true"
      >
        <GameImage :asset="node.asset" />
      </span>
      <span
        class="pointer-events-none absolute w-[23%] -translate-x-1/2 -translate-y-[40%] opacity-70"
        :style="{ left: percent(hub.x, VIEW.width), top: percent(hub.y, VIEW.height) }"
        aria-hidden="true"
      >
        <GameImage :asset="ISLANDS['mission-hub']" />
      </span>
      <svg
        class="absolute inset-0 size-full"
        :viewBox="`0 0 ${VIEW.width} ${VIEW.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <line
          v-for="node in nodes"
          :key="node.id"
          :x1="hub.x"
          :y1="hub.y"
          :x2="node.x"
          :y2="node.y"
          :style="{ stroke: LINE[node.state] }"
          :stroke-width="node.state === 'empty' ? 0.5 : 0.7"
          :stroke-dasharray="node.state === 'empty' ? '1.5 2' : '4 2'"
          :opacity="node.state === 'empty' ? 0.6 : 0.9"
        />
        <polyline :points="route" fill="none" stroke-width="1" style="stroke: var(--office-orange)" opacity="0.85" />
      </svg>

      <button
        type="button"
        class="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-office-cyan bg-office-cyan/25 shadow-[0_0_12px_var(--office-cyan)] outline-none focus-visible:ring-2 focus-visible:ring-office-cyan"
        :style="{ left: percent(hub.x, VIEW.width), top: percent(hub.y, VIEW.height) }"
        :aria-label="`${MISSION_HUB.label} (pusat)`"
        :aria-pressed="selection?.kind === 'hub'"
        @click="emit('select', { kind: 'hub' })"
      >
        <span class="size-1.5 rounded-full bg-office-cyan" aria-hidden="true" />
      </button>

      <button
        v-for="node in nodes"
        :key="node.id"
        type="button"
        :class="[
          'absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 outline-none transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-office-cyan',
          NODE[node.state],
          selected(node.id) ? 'scale-125 ring-2 ring-office-cyan' : '',
        ]"
        :style="{ left: percent(node.x, VIEW.width), top: percent(node.y, VIEW.height) }"
        :aria-label="`${node.label}: ${STATE_LABEL[node.state]}, ${node.count} robot`"
        :aria-pressed="selected(node.id)"
        @click="emit('select', { kind: 'station', stationId: node.id })"
      >
        <span
          class="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white/90"
          aria-hidden="true"
        />
      </button>
    </div>
    <ul class="sr-only" aria-label="Legenda peta sektor">
      <li class="flex items-center gap-1"><span class="size-2 rounded-full bg-office-cyan" aria-hidden="true" />Hub</li>
      <li class="flex items-center gap-1">
        <span class="size-2 rounded-full bg-office-mint" aria-hidden="true" />Aktif
      </li>
      <li class="flex items-center gap-1">
        <span class="size-2 rounded-full bg-office-orange" aria-hidden="true" />Siaga
      </li>
      <li class="flex items-center gap-1"><span class="size-2 rounded-full bg-white/50" aria-hidden="true" />Kosong</li>
      <li class="flex items-center gap-1">
        <span class="h-0.5 w-3 rounded-full bg-office-orange" aria-hidden="true" />Rute misi
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sector-world {
  background: radial-gradient(ellipse at 50% 54%, #16365a, #07142d 75%);
  box-shadow: inset 0 0 20px #021028c2;
}
</style>
