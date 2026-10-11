<script setup lang="ts">
import { TILES, visibleSize, type GameAsset } from '~/utils/game-assets'
import { OFFICE_WORLD, TERRAIN_DECOR, WORLD_CLOUDS } from '~/utils/office-layout'

/**
 * Z1–Z2 di dalam dunia: awan dekat dan pulau-pulau kecil melayang
 * (tiles/*.png). Dekoratif; posisi dari `TERRAIN_DECOR` / `WORLD_CLOUDS`.
 */
function placement(asset: GameAsset, x: number, y: number, width: number, drift: number) {
  const size = visibleSize(asset)
  const height = (width * size.height) / size.width
  return {
    left: `${((x - width / 2) / OFFICE_WORLD.width) * 100}%`,
    top: `${((y - height / 2) / OFFICE_WORLD.height) * 100}%`,
    width: `${(width / OFFICE_WORLD.width) * 100}%`,
    '--office-duration': `${drift}s`,
  }
}

const decor = TERRAIN_DECOR.map((item, index) => ({
  key: `tile-${index}`,
  asset: TILES[item.tile],
  style: placement(TILES[item.tile], item.x, item.y, item.width, item.drift),
}))

const clouds = WORLD_CLOUDS.map((item, index) => ({
  key: `cloud-${index}`,
  style: placement(TILES.cloud, item.x, item.y, item.width, item.drift),
}))
</script>

<template>
  <div class="pointer-events-none absolute inset-0" aria-hidden="true">
    <span
      v-for="cloud in clouds"
      :key="cloud.key"
      class="absolute z-10 opacity-80 motion-safe:animate-cloud-pan"
      :style="cloud.style"
    >
      <GameImage :asset="TILES.cloud" eager />
    </span>
    <span
      v-for="item in decor"
      :key="item.key"
      class="absolute z-20 drop-shadow-[0_10px_14px_oklch(0.12_0.06_270/45%)] motion-safe:animate-office-float"
      :style="item.style"
    >
      <GameImage :asset="item.asset" eager />
    </span>
  </div>
</template>
