<script setup lang="ts">
import { Trophy } from '@lucide/vue'
import type { LeaderboardEntryView } from '~/types/office'

/** Peringkat AI employee berdasarkan XP. `entries` kosong → empty state. */
withDefaults(defineProps<{ entries?: LeaderboardEntryView[] }>(), { entries: () => [] })

const RANK_TONE = ['text-brand-amber', 'text-foreground/80', 'text-brand-amber/70']
</script>

<template>
  <section class="surface-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5" aria-labelledby="leaderboard-title">
    <SectionHeader
      id="leaderboard-title"
      :icon="Trophy"
      title="Leaderboard"
      description="AI employee dengan kontribusi XP tertinggi."
      as="h3"
    />
    <ol v-if="entries.length" class="space-y-2">
      <li
        v-for="(entry, index) in entries"
        :key="entry.agentId"
        class="surface-sunken flex items-center gap-3 rounded-xl p-2.5"
      >
        <span
          :class="[
            'w-5 text-center font-heading text-sm font-semibold tabular-nums',
            RANK_TONE[index] ?? 'text-muted-foreground',
          ]"
        >
          {{ index + 1 }}
        </span>
        <AgentAvatar :seed="entry.agentId" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ entry.name }}</p>
          <AgentXPBar :level="entry.level" :xp="entry.xp" :target="entry.xpTarget" compact />
        </div>
      </li>
    </ol>
    <EmptyState
      v-else
      size="compact"
      :ghost="3"
      badge="Wave 3"
      title="Belum ada peringkat"
      description="Peringkat dihitung dari XP misi yang diselesaikan AI employee."
    />
  </section>
</template>
