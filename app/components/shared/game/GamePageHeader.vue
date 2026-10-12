<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import type { Component } from 'vue'

/**
 * Header halaman = kartu panel HUD dengan kepala `hud-heading` (pola panel
 * misi/roster /office): crest ikon, identitas area (uppercase cyan), judul
 * h1, aksi di kanan; baris kedua: deskripsi + chip meta.
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
  <header class="game-panel overflow-hidden" data-game-page-header>
    <div class="hud-heading flex-wrap gap-y-2">
      <span v-if="icon" class="game-crest-glow shrink-0" aria-hidden="true">
        <span class="game-crest size-11">
          <component :is="icon" class="size-5" />
        </span>
      </span>
      <div class="min-w-0 flex-1">
        <NuxtLink
          v-if="backTo"
          :to="backTo"
          class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-200 hover:text-office-cyan"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" />
          {{ backLabel }}
        </NuxtLink>
        <p
          v-if="identity"
          class="text-[10px] font-semibold uppercase tracking-[0.16em] text-office-cyan"
          data-game-identity
        >
          {{ identity }}
        </p>
        <h1 class="wrap-break-word font-heading text-xl font-bold leading-tight md:text-2xl">{{ title }}</h1>
      </div>
      <div v-if="$slots.actions" class="flex basis-full flex-wrap items-center gap-2 sm:basis-auto sm:shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="description || $slots.meta" class="px-4 py-3">
      <p v-if="description" class="text-[14px] leading-[1.45] text-blue-100">{{ description }}</p>
      <div v-if="$slots.meta" :class="['flex flex-wrap items-center gap-2', description ? 'mt-2.5' : '']">
        <slot name="meta" />
      </div>
    </div>
  </header>
</template>
