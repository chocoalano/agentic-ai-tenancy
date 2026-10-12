<script setup lang="ts">
/**
 * Baris informasi hanya-baca (label + nilai) bergaya daftar panel HUD;
 * dipakai di dalam `<dl>`. Jujur untuk data yang belum dapat diubah — bukan
 * input yang menyamar.
 */
withDefaults(defineProps<{ label: string; hint?: string; mono?: boolean }>(), { hint: undefined, mono: false })
</script>

<template>
  <div
    class="flex flex-col gap-1 border-b border-[#6288cb5c] py-2.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
    data-game-info-row
  >
    <dt class="shrink-0 text-[11px] font-semibold tracking-wide text-blue-200/85 sm:w-44 sm:pt-0.5">{{ label }}</dt>
    <dd
      :class="[
        'min-w-0 flex-1 text-[14px] font-semibold wrap-break-word text-[#f5f8ff] sm:text-right',
        mono ? 'font-mono text-xs' : '',
      ]"
    >
      <slot />
      <p v-if="hint" class="mt-0.5 text-[11px] font-normal text-blue-200/80">{{ hint }}</p>
    </dd>
  </div>
</template>
