<script setup lang="ts">
import { buildWorld, type IslandId } from '~/game/world'
import { FX, visibleSize } from '~/utils/game-assets'
import { OFFICE_WORLD, WORLD_FX, energyConnections } from '~/utils/office-layout'

/**
 * Z5-: portal, relay hologram, partikel (fx/*.png v2 dengan alpha sungguhan),
 * dan pad portal di setiap pulau — titik masuk/keluar teleport robot. Pad
 * berkilat saat dipakai (`portalFlashes` dari mesin).
 */
const props = defineProps<{ portalFlashes: readonly IslandId[] }>()

const MOTION = {
  pulse: 'motion-safe:animate-office-pulse',
  float: 'motion-safe:animate-office-float',
  twinkle: 'motion-safe:animate-office-twinkle',
} as const

const midpoints = new Map(energyConnections().map((connection) => [connection.key, connection.mid]))

function placement(x: number, y: number, width: number, height: number) {
  return {
    left: `${((x - width / 2) / OFFICE_WORLD.width) * 100}%`,
    top: `${((y - height / 2) / OFFICE_WORLD.height) * 100}%`,
    width: `${(width / OFFICE_WORLD.width) * 100}%`,
  }
}

const effects = WORLD_FX.map((item, index) => {
  const asset = FX[item.fx]
  const size = visibleSize(asset)
  const center = item.relay ? midpoints.get(item.relay) : { x: item.x ?? 0, y: item.y ?? 0 }
  const height = (item.width * size.height) / size.width
  return {
    key: `${item.fx}-${index}`,
    asset,
    motion: MOTION[item.motion],
    style: { ...placement(center?.x ?? 0, center?.y ?? 0, item.width, height), animationDelay: `${-index * 0.7}s` },
  }
})

const PAD_WIDTH = 50
const padSize = visibleSize(FX['portal-cyan'])
const pads = [...buildWorld().islands.values()].map((island) => ({
  island: island.id,
  style: placement(
    island.portal.point.x,
    island.portal.point.y,
    PAD_WIDTH,
    (PAD_WIDTH * padSize.height) / padSize.width,
  ),
}))
</script>

<template>
  <div class="pointer-events-none absolute inset-0" aria-hidden="true">
    <span v-for="effect in effects" :key="effect.key" :class="['absolute', effect.motion]" :style="effect.style">
      <GameImage :asset="effect.asset" />
    </span>
    <span
      v-for="pad in pads"
      :key="`pad-${pad.island}`"
      :class="[
        'absolute transition-[transform,opacity,filter] duration-300',
        props.portalFlashes.includes(pad.island)
          ? 'scale-150 opacity-100 brightness-150 drop-shadow-[0_0_16px_var(--office-cyan)]'
          : 'opacity-70',
      ]"
      :style="pad.style"
      :data-portal="pad.island"
    >
      <GameImage :asset="FX['portal-cyan']" />
    </span>
  </div>
</template>
