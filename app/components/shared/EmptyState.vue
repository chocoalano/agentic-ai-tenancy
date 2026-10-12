<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Empty state jujur bergaya blok kosong roster /office (sumur putus-putus
 * cyan, judul tebal, keterangan kecil). `badge` menandai modul yang belum
 * tersedia (mis. "Wave 2"); `ghost` menampilkan baris kerangka dekoratif —
 * bentuk konten kelak, tanpa data karangan.
 */
withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: Component
    badge?: string
    size?: 'default' | 'compact'
    ghost?: number
  }>(),
  { description: undefined, icon: undefined, badge: undefined, size: 'default', ghost: 0 },
)
</script>

<template>
  <div
    :class="[
      'hud-well relative flex flex-col items-center justify-center overflow-hidden text-center text-[#f5f8ff]',
      size === 'compact' ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10',
    ]"
  >
    <div v-if="ghost > 0" class="absolute inset-x-4 top-4 space-y-2.5 opacity-40" aria-hidden="true">
      <div v-for="row in ghost" :key="row" class="flex items-center gap-3">
        <span class="size-7 shrink-0 rounded-lg bg-white/10" />
        <span class="h-2 flex-1 rounded-full bg-white/10" :style="{ maxWidth: `${88 - row * 14}%` }" />
      </div>
      <div class="absolute inset-0 bg-linear-to-b from-transparent via-[#0a1938]/40 to-[#0a1938]" />
    </div>
    <div
      v-if="icon"
      :class="['hud-tile relative text-office-cyan', size === 'compact' ? 'size-9' : 'size-11']"
      aria-hidden="true"
    >
      <component :is="icon" :class="size === 'compact' ? 'size-4' : 'size-5'" />
    </div>
    <div class="relative space-y-1">
      <p class="flex items-center justify-center gap-2 font-heading text-base font-bold">
        {{ title }}
        <OfficeStatusBadge v-if="badge" tone="purple" :label="badge" />
      </p>
      <p v-if="description" class="mx-auto max-w-sm text-xs text-blue-200/85">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="relative">
      <slot />
    </div>
  </div>
</template>
