<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Kartu metrik = kartu sumber daya strip HUD /office (.hud-card + ikon
 * bercahaya + angka tebal). Bila `unavailable` diisi, kartu menampilkan
 * "Belum tersedia" beserta alasannya — tidak pernah angka karangan.
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

const ICON_TONES = {
  blue: 'text-[oklch(0.8_0.12_255)] drop-shadow-[0_0_6px_var(--office-blue)]',
  cyan: 'text-office-cyan drop-shadow-[0_0_6px_var(--office-cyan)]',
  violet: 'text-[color-mix(in_oklch,var(--office-purple)_75%,white)] drop-shadow-[0_0_6px_var(--office-purple)]',
  amber: 'text-office-orange drop-shadow-[0_0_6px_var(--office-orange)]',
  emerald: 'text-office-mint drop-shadow-[0_0_6px_var(--office-mint)]',
}
const VALUE_TONES = {
  blue: 'text-white',
  cyan: 'text-office-cyan',
  violet: 'text-[color-mix(in_oklch,var(--office-purple)_75%,white)]',
  amber: 'text-office-orange',
  emerald: 'text-office-mint',
}
</script>

<template>
  <div
    :class="[
      'hud-card h-auto flex-col items-stretch gap-2 px-3.5 py-3',
      props.unavailable ? 'hud-well border-dashed shadow-none' : '',
    ]"
    :aria-disabled="props.unavailable ? 'true' : undefined"
    data-stat-card
  >
    <div class="flex items-center gap-2.5">
      <component
        :is="icon"
        :class="['size-8 shrink-0', props.unavailable ? 'text-blue-300/70' : ICON_TONES[props.tone]]"
        aria-hidden="true"
      />
      <p class="truncate text-xs font-semibold text-blue-100">{{ label }}</p>
    </div>
    <div v-if="props.unavailable" class="space-y-0.5">
      <p class="font-heading text-base font-bold text-blue-200">Belum tersedia</p>
      <p class="text-[11px] text-blue-200/80">{{ props.unavailable }}</p>
    </div>
    <div v-else class="space-y-0.5">
      <p :class="['font-heading text-2xl font-bold leading-none tabular-nums', VALUE_TONES[props.tone]]">{{ value }}</p>
      <p v-if="hint" class="truncate text-[11px] text-blue-200/80">{{ hint }}</p>
    </div>
  </div>
</template>
