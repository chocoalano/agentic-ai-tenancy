<script setup lang="ts">
import type { Component } from 'vue'

/** Judul section di dalam halaman/panel, dengan slot aksi di kanan. */
withDefaults(
  defineProps<{
    title: string
    description?: string
    eyebrow?: string
    icon?: Component
    as?: 'h2' | 'h3'
    id?: string
  }>(),
  { description: undefined, eyebrow: undefined, icon: undefined, as: 'h2', id: undefined },
)
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="flex min-w-0 items-start gap-3">
      <span
        v-if="icon"
        class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
        aria-hidden="true"
      >
        <component :is="icon" class="size-4" />
      </span>
      <div class="min-w-0 space-y-0.5">
        <p v-if="eyebrow" class="type-eyebrow">{{ eyebrow }}</p>
        <component :is="as" :id="id" class="type-section-title">{{ title }}</component>
        <p v-if="description" class="type-support">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
