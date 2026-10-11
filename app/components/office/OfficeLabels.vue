<script setup lang="ts">
import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Database,
  FileText,
  Flag,
  FlaskConical,
  Globe,
  GraduationCap,
} from '@lucide/vue'
import {
  MISSION_HUB,
  STATIONS,
  hubBox,
  pointStyle,
  stationBox,
  type StationId,
  type StationState,
} from '~/utils/office-layout'

defineProps<{
  stationStates: ReadonlyMap<StationId, StationState>
  occupants: ReadonlyMap<StationId, number>
  missionCompleted: number
  missionTotal: number
  selectedStation: StationId | null
  hubSelected: boolean
}>()

const ICONS = {
  'client-brief': FileText,
  'web-research': Globe,
  'data-warehouse': Database,
  'analytics-tool': ChartNoAxesColumnIncreasing,
  'knowledge-base': BookOpen,
  'report-builder': FileText,
  'task-manager': Flag,
  'research-lab': FlaskConical,
  'training-center': GraduationCap,
}
const TONES: Record<StationId, string> = {
  'client-brief': 'var(--office-orange)',
  'web-research': 'var(--office-cyan)',
  'data-warehouse': 'var(--office-blue)',
  'analytics-tool': 'var(--office-purple)',
  'knowledge-base': 'var(--office-blue)',
  'report-builder': 'var(--office-orange)',
  'task-manager': 'var(--office-mint)',
  'research-lab': 'var(--office-cyan)',
  'training-center': 'var(--office-purple)',
}
const plates = computed(() =>
  STATIONS.map((station) => {
    const box = stationBox(station)
    return {
      id: station.id,
      label: station.label,
      far: station.depth === 'far',
      style: {
        ...pointStyle(station.x + (station.id === 'client-brief' ? 50 : -28), box.top + box.height * 0.06),
        '--station-tone': TONES[station.id],
      },
    }
  }),
)
const hub = hubBox()
const hubStyle = pointStyle(MISSION_HUB.x, hub.top + hub.height * 0.58)
</script>

<template>
  <div class="pointer-events-none absolute inset-0" aria-hidden="true">
    <span
      v-for="plate in plates"
      v-show="!plate.far || selectedStation === plate.id"
      :key="plate.id"
      :class="['station-plate', { 'station-plate--selected': selectedStation === plate.id }]"
      :style="plate.style"
    >
      <span class="station-icon"><component :is="ICONS[plate.id]" /></span>
      <span class="station-name">{{ plate.label }}</span>
    </span>
    <span :class="['hub-plate', { 'hub-plate--selected': hubSelected }]" :style="hubStyle">
      <strong>{{ MISSION_HUB.label }}</strong>
      <span>Coordinate · Automate · Deliver</span>
    </span>
  </div>
</template>

<style scoped>
.station-plate {
  position: absolute;
  display: flex;
  align-items: center;
  transform: translate(-50%, -100%);
  color: #f5f8ff;
  font-size: max(10px, calc(var(--s) * 15));
  font-weight: 750;
  white-space: nowrap;
  filter: drop-shadow(0 3px 5px #07133388);
}
.station-name {
  margin-left: calc(var(--s) * -4);
  padding: 0.55em 1.05em 0.55em 0.9em;
  border: 2px solid color-mix(in oklch, var(--station-tone) 60%, #41619d);
  border-radius: 0 99px 99px 0;
  background: linear-gradient(180deg, #163666f5, #071831f5);
  box-shadow: inset 0 2px 0 #769fce30;
}
.station-icon {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: calc(var(--s) * 50);
  height: calc(var(--s) * 52);
  min-width: 30px;
  min-height: 31px;
  border: 2px solid var(--station-tone);
  border-radius: 0.7em;
  background: linear-gradient(150deg, color-mix(in oklch, var(--station-tone) 50%, #163366), #08214b);
  box-shadow:
    inset 0 1px 0 #d2f1ff66,
    0 0 9px color-mix(in oklch, var(--station-tone) 50%, transparent);
}
.station-icon svg {
  width: 65%;
  height: 65%;
  stroke-width: 2;
  filter: drop-shadow(0 0 4px var(--station-tone));
}
.station-plate--selected .station-name {
  border-color: var(--office-cyan);
  color: var(--office-cyan);
}
.hub-plate {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35em;
  transform: translateX(-50%);
  padding: 0.55em 1.6em;
  border: 2px solid #729adb;
  border-radius: 99px;
  color: #f4f8ff;
  background: linear-gradient(#153866f5, #0a1b40f5);
  box-shadow:
    inset 0 2px 0 #aacfff25,
    0 6px 15px #07173588;
  white-space: nowrap;
  font-size: max(10px, calc(var(--s) * 19));
}
.hub-plate strong {
  font-weight: 800;
  line-height: 1.1;
}
.hub-plate > span {
  color: #cad9ff;
  font-size: 0.6em;
  line-height: 1.2;
}
.hub-plate--selected {
  border-color: var(--office-cyan);
}
</style>
