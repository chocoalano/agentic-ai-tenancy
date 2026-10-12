<script setup lang="ts">
/** Kerangka pemuatan bergaya panel game (`aria-busy`), bukan konten palsu. */
withDefaults(defineProps<{ rows?: number; label?: string }>(), { rows: 3, label: 'Memuat data…' })
</script>

<template>
  <div class="game-panel game-panel-sunken space-y-3 p-4 sm:p-5" aria-busy="true" :aria-label="label" data-game-loading>
    <div v-for="row in rows" :key="row" class="flex items-center gap-3">
      <Skeleton class="size-9 shrink-0 rounded-lg" />
      <div class="flex-1 space-y-2">
        <Skeleton class="h-3 rounded-full" :style="{ maxWidth: `${88 - row * 9}%` }" />
        <Skeleton class="h-2.5 rounded-full" :style="{ maxWidth: `${60 - row * 6}%` }" />
      </div>
    </div>
    <span class="sr-only">{{ label }}</span>
  </div>
</template>
