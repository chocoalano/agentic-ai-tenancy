<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Empty state jujur. `badge` menandai modul yang belum tersedia (mis.
 * "Wave 2"); `ghost` menampilkan baris kerangka dekoratif — bentuk konten
 * kelak, tanpa data karangan.
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
      'game-panel game-panel-sunken relative flex flex-col items-center justify-center overflow-hidden border-dashed text-center',
      size === 'compact' ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10',
    ]"
  >
    <div v-if="ghost > 0" class="absolute inset-x-4 top-4 space-y-2.5 opacity-40" aria-hidden="true">
      <div v-for="row in ghost" :key="row" class="flex items-center gap-3">
        <span class="size-7 shrink-0 rounded-lg bg-muted" />
        <span class="h-2 flex-1 rounded-full bg-muted" :style="{ maxWidth: `${88 - row * 14}%` }" />
      </div>
      <div class="absolute inset-0 bg-linear-to-b from-transparent via-background/40 to-card" />
    </div>
    <div
      v-if="icon"
      :class="[
        'relative grid place-items-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-hairline',
        size === 'compact' ? 'size-9' : 'size-11',
      ]"
      aria-hidden="true"
    >
      <component :is="icon" :class="size === 'compact' ? 'size-4' : 'size-5'" />
    </div>
    <div class="relative space-y-1">
      <p class="type-card-title flex items-center justify-center gap-2">
        {{ title }}
        <Badge v-if="badge" variant="outline" class="border-brand-cyan/30 text-[10px] font-medium text-brand-cyan">{{
          badge
        }}</Badge>
      </p>
      <p v-if="description" class="type-support mx-auto max-w-sm">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="relative">
      <slot />
    </div>
  </div>
</template>
