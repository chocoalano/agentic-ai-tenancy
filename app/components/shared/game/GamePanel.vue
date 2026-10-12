<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Panel HUD (pola yang sama persis dengan panel misi/roster /office):
 * bingkai `hud-panel`, kepala `hud-heading` (ikon cyan bercahaya, judul tebal,
 * keterangan kecil, aksi di kanan), isi `text-blue-100`, kaki bergaris.
 *
 * Varian: default (hud-panel) · elevated (gradien kartu HUD) · holo (garis
 * cyan bercahaya, satu per layar) · command (kartu komandan: bingkai ganda +
 * tepi 3D) · warning (oranye) · success (mint) · sunken (sumur putus-putus).
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
  sm: 'px-3 py-3',
  md: 'px-4 py-3.5',
  lg: 'px-5 py-5 sm:px-6',
}
</script>

<template>
  <component
    :is="as"
    :class="['game-panel overflow-hidden', VARIANT[variant]]"
    :data-game-panel="variant"
    :aria-labelledby="headingId"
  >
    <div v-if="title || $slots.header" class="hud-heading">
      <slot name="header">
        <component
          :is="icon"
          v-if="icon"
          class="size-7 shrink-0 text-office-cyan drop-shadow-[0_0_6px_var(--office-cyan)]"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p v-if="eyebrow" class="text-[9px] font-semibold uppercase tracking-[0.16em] text-office-orange">
            {{ eyebrow }}
          </p>
          <component :is="headingLevel" :id="headingId" class="font-heading text-lg font-bold leading-tight">{{
            title
          }}</component>
          <p v-if="description" class="text-[11px] font-semibold tracking-wide text-blue-200/85">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" :class="['text-[14px] leading-[1.45] text-blue-100', PADDING[padding]]">
      <slot />
    </div>
    <div v-if="$slots.footer" class="flex flex-wrap items-center gap-2 border-t border-[#6288cb5c] px-4 py-3">
      <slot name="footer" />
    </div>
  </component>
</template>
