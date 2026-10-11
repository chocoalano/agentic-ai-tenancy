<script setup lang="ts">
import { ArrowUpRight, CircleCheck, Circle, Lock, X } from '@lucide/vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import type { IslandId } from '~/game/world'
import { CHARACTER_STATES, ISLANDS } from '~/utils/game-assets'
import { MISSION_HUB, STATIONS } from '~/utils/office-layout'
import type { MissionViewModel } from '~/utils/office-preview'
import type { MissionStepStatus } from '~/utils/office-mission'
import type { OfficeSelection } from '~/types/office'

/**
 * Quick-view melayang (Z9) untuk stasiun, Mission Hub, atau sasaran misi
 * (robot memakai AgentCommandPanel). Workstation dapat diberi robot:
 * mode pratinjau = simulasi aktivitas stasiun; mode live = pemindahan visual
 * saja (penugasan nyata belum didukung backend).
 */
const props = defineProps<{
  selection: OfficeSelection
  agents: OfficeAgentView[]
  mission: MissionViewModel
  preview: boolean
  realCount: number
}>()

const emit = defineEmits<{ select: [selection: OfficeSelection]; close: []; assign: [key: string, island: IslandId] }>()

const titleId = useId()

const station = computed(() => {
  const current = props.selection
  return current.kind === 'station' ? STATIONS.find((item) => item.id === current.stationId) : undefined
})
const islandId = computed<IslandId | null>(() =>
  props.selection.kind === 'hub' ? 'mission-hub' : (station.value?.id ?? null),
)
const here = computed(() =>
  islandId.value ? props.agents.filter((agent) => agent.island === islandId.value && !agent.moving) : [],
)
const incoming = computed(() =>
  islandId.value ? props.agents.filter((agent) => agent.destination === islandId.value) : [],
)
const assignable = computed(() =>
  props.agents.filter(
    (agent) => agent.activity !== 'offline' && agent.island !== islandId.value && agent.destination !== islandId.value,
  ),
)

const step = computed(() => {
  const current = props.selection
  return current.kind === 'step' ? props.mission.steps.find((item) => item.id === current.stepId) : undefined
})

const staffed = computed(
  () => STATIONS.filter((item) => props.agents.some((agent) => agent.island === item.id && !agent.moving)).length,
)

const STEP_ICON: Record<MissionStepStatus, typeof CircleCheck> = { done: CircleCheck, todo: Circle, locked: Lock }
const STEP_STATUS: Record<MissionStepStatus, { tone: 'mint' | 'cyan' | 'purple'; label: string }> = {
  done: { tone: 'mint', label: 'Selesai' },
  todo: { tone: 'cyan', label: 'Belum selesai' },
  locked: { tone: 'purple', label: 'Segera hadir' },
}
</script>

<template>
  <section
    class="hud-panel quick-view relative p-4 pr-11"
    :aria-labelledby="titleId"
    aria-live="polite"
    data-quick-view
  >
    <Button
      variant="ghost"
      size="icon"
      class="absolute right-2 top-2 size-7 rounded-lg"
      aria-label="Tutup detail dan kembali ke peta penuh"
      @click="emit('close')"
    >
      <X class="size-4" aria-hidden="true" />
    </Button>

    <!-- Stasiun -->
    <template v-if="station">
      <div class="flex items-start gap-3">
        <GameImage :asset="ISLANDS[station.id]" class="quick-view-art w-22 shrink-0" />
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-office-cyan">Workstation</p>
          <h3 :id="titleId" class="font-heading text-xl font-bold">{{ station.label }}</h3>
          <p class="mt-0.5 text-xs text-muted-foreground">{{ station.purpose }}</p>
        </div>
      </div>
      <OfficeStationCrew
        :here="here"
        :incoming="incoming"
        :assignable="assignable"
        :preview="preview"
        :island="station.id"
        @select="emit('select', $event)"
        @assign="(key, island) => emit('assign', key, island)"
      />
    </template>

    <!-- Mission Hub -->
    <template v-else-if="selection.kind === 'hub'">
      <div class="flex items-start gap-3">
        <GameImage :asset="ISLANDS['mission-hub']" class="quick-view-art w-22 shrink-0" />
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-office-cyan">Pusat komando</p>
          <h3 :id="titleId" class="font-heading text-xl font-bold">{{ MISSION_HUB.label }}</h3>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ preview ? 'Misi contoh' : 'Misi aktif' }}: <span class="text-foreground">{{ mission.title }}</span>
          </p>
        </div>
      </div>
      <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
        <div class="hud-segment px-2 py-1.5">
          <dt class="text-[10px] text-muted-foreground">Stasiun berawak</dt>
          <dd class="font-heading text-lg font-bold tabular-nums">{{ staffed }}/{{ STATIONS.length }}</dd>
        </div>
        <div class="hud-segment px-2 py-1.5">
          <dt class="text-[10px] text-muted-foreground">{{ preview ? 'Karakter simulasi' : 'Robot di lantai' }}</dt>
          <dd class="font-heading text-lg font-bold tabular-nums">{{ agents.length }}</dd>
        </div>
        <div class="hud-segment px-2 py-1.5">
          <dt class="text-[10px] text-muted-foreground">Sasaran</dt>
          <dd class="font-heading text-lg font-bold tabular-nums">{{ mission.completed }}/{{ mission.total }}</dd>
        </div>
      </dl>
      <div class="mt-3 flex items-center gap-2.5 rounded-lg border border-dashed border-white/20 px-2.5 py-2">
        <GameImage :asset="CHARACTER_STATES.thinking" class="w-9 shrink-0" />
        <p class="text-xs text-muted-foreground">
          <OfficeStatusBadge tone="muted" label="Orchestrator belum terhubung" />
          <span class="mt-1 block"
            >Penugasan & eksekusi otomatis aktif bersama Agent Orchestrator (fase berikutnya).</span
          >
        </p>
      </div>
      <OfficeStationCrew
        :here="here"
        :incoming="incoming"
        :assignable="assignable"
        :preview="preview"
        island="mission-hub"
        @select="emit('select', $event)"
        @assign="(key, island) => emit('assign', key, island)"
      />
    </template>

    <!-- Sasaran misi -->
    <template v-else-if="step">
      <div class="flex items-start gap-2.5">
        <component
          :is="STEP_ICON[step.status]"
          :class="[
            'mt-0.5 size-5 shrink-0',
            step.status === 'done'
              ? 'text-office-mint'
              : step.status === 'todo'
                ? 'text-office-cyan'
                : 'text-muted-foreground',
          ]"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <p class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-office-orange">
            Sasaran misi <span v-if="mission.preview" class="demo-tag">SIMULASI</span>
          </p>
          <h3 :id="titleId" class="font-heading text-lg font-bold">{{ step.title }}</h3>
          <OfficeStatusBadge
            :tone="STEP_STATUS[step.status].tone"
            :label="STEP_STATUS[step.status].label"
            class="mt-1"
          />
        </div>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">{{ step.description }}</p>
      <p class="hud-segment mt-2 px-2.5 py-1.5 text-xs">
        <span class="text-muted-foreground">Data:</span> {{ step.evidence }}
      </p>
      <Button v-if="step.link" as-child size="sm" variant="secondary" class="mt-3 w-full">
        <NuxtLink :to="step.link.to">
          {{ step.link.label }}
          <ArrowUpRight class="size-3.5" aria-hidden="true" />
        </NuxtLink>
      </Button>
    </template>
  </section>
</template>

<style scoped>
.quick-view {
  overflow: hidden;
  border: 1px solid #75acfa;
  border-radius: 16px;
  background: linear-gradient(145deg, #173c6cf5, #0a1c3bf5 65%);
  box-shadow:
    inset 0 0 0 2px #1c589a6b,
    0 12px 32px #020e36b3,
    0 0 20px #2d86e533;
  backdrop-filter: blur(16px);
}
.quick-view::before {
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  content: '';
  background: linear-gradient(90deg, transparent, #64d7ff99, transparent);
}
.quick-view-art {
  filter: drop-shadow(0 3px 7px #28bdff4d);
}
</style>
