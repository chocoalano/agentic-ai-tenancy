<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Kartu metrik. Bila `unavailable` diisi, kartu menampilkan "Belum tersedia"
 * beserta alasannya — tidak pernah angka karangan.
 */
const props = withDefaults(
  defineProps<{
    label: string
    value?: string | number
    hint?: string
    icon: Component
    tone?: 'blue' | 'cyan' | 'violet' | 'amber' | 'emerald'
    unavailable?: string
  }>(),
  { value: undefined, hint: undefined, tone: 'blue', unavailable: undefined },
)

const TONES = {
  blue: 'bg-brand-blue/12 text-brand-blue ring-brand-blue/20',
  cyan: 'bg-brand-cyan/12 text-brand-cyan ring-brand-cyan/20',
  violet: 'bg-brand-violet/12 text-brand-violet ring-brand-violet/20',
  amber: 'bg-brand-amber/12 text-brand-amber ring-brand-amber/20',
  emerald: 'bg-success/12 text-success ring-success/20',
}
</script>

<template>
  <div
    :class="[
      'game-panel relative flex min-w-0 flex-col gap-3 p-4',
      props.unavailable ? 'game-panel-sunken border-dashed' : '',
    ]"
    :aria-disabled="props.unavailable ? 'true' : undefined"
  >
    <div class="flex items-center gap-2.5">
      <span
        :class="[
          'grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
          props.unavailable ? 'bg-muted text-muted-foreground ring-hairline' : TONES[props.tone],
        ]"
        aria-hidden="true"
      >
        <component :is="icon" class="size-4" />
      </span>
      <p class="type-label truncate">{{ label }}</p>
    </div>
    <div v-if="props.unavailable" class="space-y-0.5">
      <p class="type-card-title text-muted-foreground">Belum tersedia</p>
      <p class="type-support text-xs">{{ props.unavailable }}</p>
    </div>
    <div v-else class="space-y-0.5">
      <p class="type-metric tabular-nums">{{ value }}</p>
      <p v-if="hint" class="type-support truncate text-xs">{{ hint }}</p>
    </div>
  </div>
</template>
