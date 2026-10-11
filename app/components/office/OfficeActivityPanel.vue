<script setup lang="ts">
import { Activity } from '@lucide/vue'
import type { ActivityItemView } from '~/types/office'

/** Umpan aktivitas agent & tim. `items` kosong → empty state (audit/run belum ada). */
withDefaults(defineProps<{ items?: ActivityItemView[] }>(), { items: () => [] })
</script>

<template>
  <section class="surface-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5" aria-labelledby="activity-title">
    <SectionHeader
      id="activity-title"
      :icon="Activity"
      title="Aktivitas terbaru"
      description="Jejak kerja AI employee dan anggota tim."
      as="h3"
    />
    <ol
      v-if="items.length"
      class="relative space-y-3 before:absolute before:inset-y-1 before:left-[3px] before:w-px before:bg-hairline"
    >
      <li v-for="item in items" :key="item.id" class="relative flex gap-3 pl-5">
        <StatusIndicator :tone="item.tone" class="absolute left-0 top-1.5" />
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            <span class="font-medium">{{ item.actor }}</span> {{ item.summary }}
          </p>
          <p class="text-[11px] text-muted-foreground">{{ item.timeLabel }}</p>
        </div>
      </li>
    </ol>
    <EmptyState
      v-else
      size="compact"
      :ghost="3"
      badge="Wave 2"
      title="Belum ada aktivitas"
      description="Log aktivitas muncul setelah modul tugas, run, dan audit aktif."
    />
  </section>
</template>
