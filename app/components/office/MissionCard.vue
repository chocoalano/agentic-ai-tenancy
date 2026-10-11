<script setup lang="ts">
import { CircleCheck, Flag, OctagonAlert } from '@lucide/vue'
import type { MissionView } from '~/types/office'

/** Kartu misi (target kerja dengan hadiah XP). Data dari modul misi (Wave 3). */
defineProps<{ mission: MissionView }>()

const STATUS = {
  active: { label: 'Berjalan', icon: Flag, tone: 'text-mission' },
  completed: { label: 'Selesai', icon: CircleCheck, tone: 'text-success' },
  blocked: { label: 'Terhambat', icon: OctagonAlert, tone: 'text-destructive' },
} as const
</script>

<template>
  <article class="surface-sunken space-y-2.5 rounded-xl p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="type-card-title truncate text-sm">{{ mission.title }}</p>
        <p class="type-support line-clamp-1 text-xs">{{ mission.description }}</p>
      </div>
      <Badge variant="outline" class="shrink-0 border-mission/30 bg-mission/10 text-[10px] text-mission tabular-nums">
        +{{ mission.rewardXp }} XP
      </Badge>
    </div>
    <Progress
      :model-value="mission.progress"
      :aria-label="`Progres misi ${mission.progress}%`"
      class="h-1.5 bg-xp-track [&>[data-slot=progress-indicator]]:bg-mission"
    />
    <div class="flex items-center justify-between text-[11px] text-muted-foreground">
      <span :class="['inline-flex items-center gap-1 font-medium', STATUS[mission.status].tone]">
        <component :is="STATUS[mission.status].icon" class="size-3.5" aria-hidden="true" />
        {{ STATUS[mission.status].label }}
      </span>
      <span class="tabular-nums"
        >{{ mission.progress }}%<template v-if="mission.dueLabel"> · {{ mission.dueLabel }}</template></span
      >
    </div>
  </article>
</template>
