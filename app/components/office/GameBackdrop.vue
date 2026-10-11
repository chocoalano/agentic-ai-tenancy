<script setup lang="ts">
import { BACKGROUNDS, MISSION_CITY_BACKGROUND, v2Source } from '~/utils/game-assets'

/** Latar ilustrasi bersih; panel, pulau, jalur, dan karakter dirender terpisah. */
const failed = ref(false)
const fallback = v2Source(BACKGROUNDS['city-skyline'])
const source = computed(() => (failed.value && fallback ? fallback : MISSION_CITY_BACKGROUND))
</script>

<template>
  <div class="game-sky pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <img
      :src="source.src"
      :width="source.width"
      :height="source.height"
      alt=""
      data-asset="backgrounds/mission-city"
      class="absolute inset-0 size-full object-cover"
      fetchpriority="high"
      decoding="async"
      draggable="false"
      @error="failed = true"
    />
    <div class="absolute inset-0 bg-office-bg/5" />
  </div>
</template>
