<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Panel Agentic Game UI — pengganti kartu putih generik. Varian:
 * - default   : permukaan game + garis tepi tipis (konten umum)
 * - elevated  : permukaan terangkat (ringkasan, rail samping)
 * - holo      : garis cyan + aksen sudut (konten utama/sorotan)
 * - command   : hero pusat komando (profil komandan, identitas agent)
 * - warning   : perhatian (persetujuan tertunda, runtime belum siap)
 * - success   : hasil/selesai
 * - sunken    : sumur bersarang (daftar, kode, pratinjau)
 *
 * Header opsional lewat prop `title`/`description`/`icon`/`eyebrow` atau slot
 * `header`; slot `actions` di kanan header; slot `footer` di bawah.
 */
type PanelVariant = 'default' | 'elevated' | 'holo' | 'command' | 'warning' | 'success' | 'sunken'
type PanelPadding = 'none' | 'sm' | 'md' | 'lg'

withDefaults(
  defineProps<{
    variant?: PanelVariant
    as?: string
    title?: string
    description?: string
    eyebrow?: string
    icon?: Component
    headingLevel?: 'h2' | 'h3'
    headingId?: string
    padding?: PanelPadding
  }>(),
  {
    variant: 'default',
    as: 'section',
    title: undefined,
    description: undefined,
    eyebrow: undefined,
    icon: undefined,
    headingLevel: 'h2',
    headingId: undefined,
    padding: 'md',
  },
)

const VARIANT: Record<PanelVariant, string> = {
  default: '',
  elevated: 'game-panel-elevated',
  holo: 'game-panel-holo',
  command: 'game-panel-command',
  warning: 'game-panel-warning',
  success: 'game-panel-success',
  sunken: 'game-panel-sunken',
}
const PADDING: Record<PanelPadding, string> = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-7',
}
</script>

<template>
  <component
    :is="as"
    :class="['game-panel', VARIANT[variant], PADDING[padding]]"
    :data-game-panel="variant"
    :aria-labelledby="headingId"
  >
    <div v-if="title || $slots.header" class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <slot name="header">
        <div class="flex min-w-0 items-start gap-3">
          <span
            v-if="icon"
            class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-game-cyan/12 text-game-cyan ring-1 ring-inset ring-game-cyan/25"
            aria-hidden="true"
          >
            <component :is="icon" class="size-4" />
          </span>
          <div class="min-w-0 space-y-0.5">
            <p v-if="eyebrow" class="type-eyebrow">{{ eyebrow }}</p>
            <component :is="headingLevel" :id="headingId" class="type-section-title">{{ title }}</component>
            <p v-if="description" class="type-support">{{ description }}</p>
          </div>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
    <div v-if="$slots.footer" class="mt-4 flex flex-wrap items-center gap-2 border-t border-game-border/70 pt-4">
      <slot name="footer" />
    </div>
  </component>
</template>
