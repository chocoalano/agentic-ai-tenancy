<script setup lang="ts">
import type { Component } from 'vue'

/** Header halaman: eyebrow, judul (h1), deskripsi, dan slot aksi. */
withDefaults(defineProps<{ title: string; description?: string; eyebrow?: string; icon?: Component }>(), {
  description: undefined,
  eyebrow: undefined,
  icon: undefined,
})
</script>

<template>
  <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div class="flex min-w-0 items-start gap-4">
      <span
        v-if="icon"
        class="hidden size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-blue/20 to-brand-violet/10 text-brand-cyan ring-1 ring-inset ring-glass-border sm:grid"
        aria-hidden="true"
      >
        <component :is="icon" class="size-6" />
      </span>
      <div class="min-w-0 space-y-1.5">
        <p v-if="eyebrow" class="type-eyebrow">{{ eyebrow }}</p>
        <h1 class="type-page-title">{{ title }}</h1>
        <p v-if="description" class="type-support max-w-2xl text-sm">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
