<script setup lang="ts">
import { BACKGROUNDS, MISSION_CITY_BACKGROUND, v2Source } from '~/utils/game-assets'

/**
 * Latar bersama semua halaman terautentikasi (Agentic Game UI): gradien navy
 * berlapis (varian terang: biru pucat), kota Mission Map yang diredupkan &
 * diburamkan di tepi bawah (aset yang sama dengan /office → kontinuitas
 * visual), grid holografik halus, dan bintang (hanya tema gelap).
 *
 * Ilustrasi sengaja sangat redup dan dimask agar tidak pernah berada "di
 * belakang" teks padat: panel konten memakai permukaan hampir opak.
 */
const failed = ref(false)
const fallback = v2Source(BACKGROUNDS['city-skyline'])
const skyline = computed(() => (failed.value && fallback ? fallback : MISSION_CITY_BACKGROUND))
</script>

<template>
  <div
    class="game-chrome-bg pointer-events-none fixed inset-0 z-0 overflow-hidden"
    aria-hidden="true"
    data-game-background
  >
    <img
      :src="skyline.src"
      :width="skyline.width"
      :height="skyline.height"
      alt=""
      class="absolute inset-x-0 bottom-0 h-[46vh] w-full object-cover object-top opacity-[0.12] blur-[1.5px] [mask-image:linear-gradient(180deg,transparent,black_60%)] dark:opacity-[0.2]"
      loading="lazy"
      decoding="async"
      draggable="false"
      data-asset="backgrounds/mission-city"
      @error="failed = true"
    />
    <div class="holo-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]" />
    <div class="office-stars absolute inset-x-0 top-0 h-[38vh] opacity-0 dark:opacity-60" />
    <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-game-bg-deep/60" />
  </div>
</template>
