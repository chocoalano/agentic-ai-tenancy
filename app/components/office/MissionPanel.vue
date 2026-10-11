<script setup lang="ts">
import { ChevronUp, CircleCheck, Circle, Lock, Map as MapIcon, Maximize2 } from '@lucide/vue'
import { ICONS } from '~/utils/game-assets'
import type { StationId, StationState } from '~/utils/office-layout'
import type { MissionStepView, MissionViewModel } from '~/utils/office-preview'
import type { MissionStepStatus } from '~/utils/office-mission'
import type { OfficeSelection } from '~/types/office'

/**
 * HUD misi (kiri): ikon, judul, deskripsi, sasaran, progres, checklist, dan
 * peta sektor. Referensi gaya: ui-previews/mission-panel.png & mission-and-map.png.
 *
 * Mode live: misi persiapan yang dihitung dari data perusahaan. Mode
 * pratinjau: misi contoh "Project Atlas" berlabel DEMO.
 * `variant="floating"` = panel melayang di atas dunia (desktop, dapat
 * diciutkan); `variant="sheet"` = isi drawer (tablet/ponsel).
 */
const props = withDefaults(
  defineProps<{
    mission: MissionViewModel
    stationStates: ReadonlyMap<StationId, StationState>
    occupants: ReadonlyMap<StationId, number>
    selection: OfficeSelection | null
    collapsed?: boolean
    variant?: 'floating' | 'sheet'
  }>(),
  { collapsed: false, variant: 'floating' },
)

const emit = defineEmits<{ toggle: []; select: [selection: OfficeSelection] }>()

const contentId = useId()

const STEP_ICON: Record<MissionStepStatus, typeof CircleCheck> = { done: CircleCheck, todo: Circle, locked: Lock }
const STEP_TONE: Record<MissionStepStatus, string> = {
  done: 'text-office-mint drop-shadow-[0_0_5px_var(--office-mint)]',
  todo: 'text-office-cyan',
  locked: 'text-muted-foreground',
}
const STEP_LABEL: Record<MissionStepStatus, string> = { done: 'selesai', todo: 'belum selesai', locked: 'terkunci' }

const remaining = computed(() => props.mission.steps.filter((step) => step.status !== 'done').length)
const missionTitle = computed(() => (props.mission.preview ? props.mission.title.split(' — ')[0] : props.mission.title))
const missionDescription = computed(() =>
  props.mission.preview
    ? props.mission.description.replace(/^Simulasi:\s*/u, '').split('. ')[0] + '.'
    : props.mission.description,
)

function isSelected(step: MissionStepView): boolean {
  return props.selection?.kind === 'step' && props.selection.stepId === step.id
}
</script>

<template>
  <!-- Diciutkan: tombol ikon melayang -->
  <button
    v-if="variant === 'floating' && collapsed"
    type="button"
    class="hud-panel flex items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-office-cyan"
    :aria-expanded="false"
    :aria-controls="contentId"
    aria-label="Tampilkan panel misi"
    @click="emit('toggle')"
  >
    <GameImage :asset="ICONS.task" class="w-8 rounded-lg" />
    <span class="leading-tight">
      <span class="block text-[10px] font-semibold uppercase tracking-[0.16em] text-office-orange">Misi</span>
      <span class="block text-sm font-bold tabular-nums">{{ mission.completed }}/{{ mission.total }}</span>
    </span>
  </button>

  <section
    v-else
    :id="contentId"
    :class="[
      'mission-rail flex min-h-0 flex-col gap-4',
      variant === 'floating' ? 'mission-rail-floating h-full w-full' : '',
    ]"
    aria-labelledby="mission-panel-title"
    data-mission-panel
  >
    <div :class="['mission-card flex min-h-0 flex-col', variant === 'floating' ? 'hud-panel' : '']">
      <header class="mission-heading flex items-center gap-2.5">
        <GameImage :asset="ICONS.task" class="w-10 shrink-0 rounded-lg" />
        <h2
          id="mission-panel-title"
          class="min-w-0 flex-1 font-heading text-lg font-bold leading-tight"
          :title="mission.title"
        >
          Mission: {{ missionTitle }}
        </h2>
        <Button
          v-if="variant === 'floating'"
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 rounded-lg text-blue-300"
          :aria-expanded="true"
          :aria-controls="contentId"
          aria-label="Ciutkan panel misi"
          @click="emit('toggle')"
        >
          <ChevronUp class="size-5" aria-hidden="true" />
        </Button>
      </header>

      <div class="mission-body">
        <p class="text-[14px] leading-[1.45] text-blue-100">{{ missionDescription }}</p>
        <span v-if="mission.preview" class="mission-mode mt-2 inline-flex">SIMULASI · Misi contoh</span>
        <ul class="mt-3 min-h-0 space-y-0.5 overflow-y-auto" aria-label="Sasaran misi">
          <li v-for="step in mission.steps" :key="step.id">
            <button
              type="button"
              :class="[
                'flex w-full items-center gap-3 rounded-lg py-1.5 text-left text-[14px] outline-none transition-colors hover:bg-office-cyan/10 focus-visible:ring-2 focus-visible:ring-office-cyan',
                isSelected(step) ? 'bg-office-cyan/15 ring-1 ring-office-cyan/60' : '',
              ]"
              :aria-pressed="isSelected(step)"
              @click="emit('select', { kind: 'step', stepId: step.id })"
            >
              <component
                :is="STEP_ICON[step.status]"
                :class="['size-[21px] shrink-0', STEP_TONE[step.status]]"
                aria-hidden="true"
              />
              <span :class="['flex-1', step.status === 'locked' ? 'text-blue-200/65' : 'text-blue-100']">{{
                step.title
              }}</span>
              <span class="sr-only">({{ STEP_LABEL[step.status] }})</span>
              <OfficeStatusBadge v-if="step.status === 'locked'" tone="purple" label="Segera" />
            </button>
          </li>
        </ul>
        <div class="mt-3 flex items-center gap-3">
          <div
            class="mission-track h-1.5 flex-1 overflow-hidden rounded-full"
            role="progressbar"
            :aria-label="mission.preview ? 'Progres misi contoh' : 'Progres misi persiapan'"
            :aria-valuenow="mission.progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="office-bar-mint h-full rounded-full" :style="{ width: `${mission.progress}%` }" />
          </div>
          <span class="text-[10px] font-semibold tabular-nums text-blue-200"
            >{{ mission.completed }}/{{ mission.total }}</span
          >
          <span class="sr-only">{{ remaining }} sasaran tersisa</span>
        </div>
      </div>
    </div>

    <div :class="['sector-card', variant === 'floating' ? 'hud-panel mt-auto' : '']">
      <header class="sector-heading flex items-center gap-2">
        <MapIcon class="size-5 text-office-cyan" aria-hidden="true" />
        <h3 class="flex-1 text-[13px] font-bold">Sector Map</h3>
        <span class="text-blue-200" aria-hidden="true"><Maximize2 class="size-3.5" /></span>
      </header>
      <div class="sector-body">
        <SectorMap
          :station-states="stationStates"
          :occupants="occupants"
          :selection="selection"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.mission-card,
.sector-card {
  overflow: hidden;
  color: #f5f8ff;
}

.mission-card {
  flex-shrink: 0;
}
.mission-heading {
  min-height: 55px;
  padding: 9px 12px;
  border-bottom: 1px solid #6288cb5c;
}
.mission-body {
  padding: 12px 17px 15px;
}
.mission-track {
  background: #223e65;
}
.mission-mode {
  padding: 2px 6px;
  border: 1px solid #b7883b66;
  border-radius: 4px;
  color: #ffd48c;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.sector-heading {
  padding: 9px 11px;
  border-bottom: 1px solid #6288cb5c;
  background: #071a3d80;
}
.sector-body {
  padding: 7px;
}

@media (max-height: 780px) and (min-width: 1280px) {
  .mission-heading {
    min-height: 47px;
    padding: 7px 10px;
  }
  .mission-body {
    padding: 9px 13px 11px;
  }
  .mission-body > p {
    font-size: 13px;
  }
  .mission-body ul {
    margin-top: 7px;
  }
  .mission-body li button {
    padding-block: 5px;
    font-size: 13px;
  }
  .mission-mode {
    margin-top: 5px;
  }
}
</style>
