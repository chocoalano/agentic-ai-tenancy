<script setup lang="ts">
/**
 * Baris informasi hanya-baca (label + nilai) untuk panel profil/identitas.
 * Dipakai di dalam `<dl>`; jujur untuk data yang belum dapat diubah — tidak
 * menyamar sebagai input.
 */
withDefaults(defineProps<{ label: string; hint?: string; mono?: boolean }>(), { hint: undefined, mono: false })
</script>

<template>
  <div
    class="flex flex-col gap-1 border-b border-game-border/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
    data-game-info-row
  >
    <dt class="type-label shrink-0 sm:w-44 sm:pt-0.5">{{ label }}</dt>
    <dd :class="['min-w-0 flex-1 text-sm font-medium break-words sm:text-right', mono ? 'font-mono text-xs' : '']">
      <slot />
      <p v-if="hint" class="type-support mt-0.5 text-xs font-normal">{{ hint }}</p>
    </dd>
  </div>
</template>
