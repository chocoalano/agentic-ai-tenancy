<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import type { Component } from 'vue'

/**
 * Header halaman Agentic Game UI: crest ikon, identitas area (eyebrow, mis.
 * "Commander Control Center"), judul (h1), deskripsi, chip meta (slot `meta`),
 * aksi (slot `actions`), dan tautan kembali opsional.
 */
withDefaults(
  defineProps<{
    title: string
    identity?: string
    description?: string
    icon?: Component
    backTo?: string
    backLabel?: string
  }>(),
  { identity: undefined, description: undefined, icon: undefined, backTo: undefined, backLabel: 'Kembali' },
)
</script>

<template>
  <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" data-game-page-header>
    <div class="flex min-w-0 items-start gap-4">
      <span v-if="icon" class="game-crest-glow mt-1 hidden shrink-0 sm:inline-grid" aria-hidden="true">
        <span class="game-crest size-14">
          <component :is="icon" class="size-6" />
        </span>
      </span>
      <div class="min-w-0 space-y-1.5">
        <NuxtLink
          v-if="backTo"
          :to="backTo"
          class="type-label inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" />
          {{ backLabel }}
        </NuxtLink>
        <p v-if="identity" class="type-eyebrow" data-game-identity>{{ identity }}</p>
        <h1 class="type-page-title">{{ title }}</h1>
        <p v-if="description" class="type-support max-w-3xl">{{ description }}</p>
        <div v-if="$slots.meta" class="flex flex-wrap items-center gap-2 pt-1">
          <slot name="meta" />
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
