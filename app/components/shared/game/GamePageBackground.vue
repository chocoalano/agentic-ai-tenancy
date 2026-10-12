<script setup lang="ts">
import { BACKGROUNDS, MISSION_CITY_BACKGROUND, v2Source } from '~/utils/game-assets'

/**
 * Latar halaman manajemen = latar Virtual Office (GameBackdrop): langit
 * `game-sky`, ilustrasi kota Mission Map yang sama (registry aset), vinyet
 * HUD `game-vignette`, lalu peredup agar panel HUD tembus pandang (blur) dan
 * teks tetap terbaca. Tidak ada aset yang diduplikasi.
 */
const failed = ref(false)
const fallback = v2Source(BACKGROUNDS['city-skyline'])
const source = computed(() => (failed.value && fallback ? fallback : MISSION_CITY_BACKGROUND))
</script>

<template>
  <div class="game-sky pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true" data-game-background>
    <img
      :src="source.src"
      :width="source.width"
      :height="source.height"
      alt=""
      class="absolute inset-0 size-full object-cover object-center"
      loading="lazy"
      decoding="async"
      draggable="false"
      data-asset="backgrounds/mission-city"
      @error="failed = true"
    />
    <div class="game-vignette absolute inset-0" />
    <div class="absolute inset-0 bg-[oklch(0.1_0.05_266/58%)]" />
    <div class="office-stars absolute inset-x-0 top-0 h-[36vh] opacity-60" />
  </div>
</template>
