<script setup lang="ts">
import { OFFICE_WORLD } from '~/utils/office-layout'
import { buildWorld } from '~/game/world'
import { ISLAND_ART_GEOMETRY } from '~/game/island-geometry'

/**
 * Overlay kalibrasi geometri (HANYA pengembangan: dirender bila `import.meta.dev`
 * dan query `?debug=geometry`). Menggambar, dalam koordinat dunia:
 * kotak terlihat artwork, poligon area jalan, simpul navigasi, spawn, portal
 * masuk/keluar, slot workstation, dan posisi kaki setiap robot (dibaca dari
 * `--ax/--ay` yang ditulis renderer, diperbarui tiap frame).
 */
const world = buildWorld()
const islands = [...world.islands.values()].map((island) => {
  const geometry = ISLAND_ART_GEOMETRY[island.id]
  const vb = geometry.visibleBounds
  return {
    id: island.id,
    label: island.label,
    bounds: {
      x: island.box.left + vb.x * island.box.width,
      y: island.box.top + vb.y * island.box.height,
      width: vb.width * island.box.width,
      height: vb.height * island.box.height,
    },
    polygon: island.walkable.map((p) => `${p.x},${p.y}`).join(' '),
    hub: island.hub,
    spawn: island.spawn,
    portal: island.portal,
    workstations: island.workstations,
  }
})

const feet = ref<Array<{ key: string; x: number; y: number }>>([])
let frame = 0
function sample() {
  const next: Array<{ key: string; x: number; y: number }> = []
  for (const element of document.querySelectorAll<HTMLElement>('[data-actor]')) {
    const x = Number(element.style.getPropertyValue('--ax'))
    const y = Number(element.style.getPropertyValue('--ay'))
    if (Number.isFinite(x) && Number.isFinite(y)) next.push({ key: element.dataset.actor ?? '', x, y })
  }
  feet.value = next
  frame = requestAnimationFrame(sample)
}
onMounted(() => {
  frame = requestAnimationFrame(sample)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <svg
    class="pointer-events-none absolute inset-0 z-[90] size-full overflow-visible"
    :viewBox="`0 0 ${OFFICE_WORLD.width} ${OFFICE_WORLD.height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
    data-geometry-debug
  >
    <g v-for="island in islands" :key="island.id" :data-geometry-island="island.id">
      <rect
        :x="island.bounds.x"
        :y="island.bounds.y"
        :width="island.bounds.width"
        :height="island.bounds.height"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        stroke-width="1"
        stroke-dasharray="4 3"
      />
      <polygon :points="island.polygon" fill="rgba(0,255,255,0.18)" stroke="#22d3ee" stroke-width="1.5" />
      <circle :cx="island.hub.x" :cy="island.hub.y" r="3.5" fill="#84cc16" stroke="black" stroke-width="0.8" />
      <circle :cx="island.spawn.x" :cy="island.spawn.y" r="2.5" fill="white" stroke="black" stroke-width="0.8" />
      <circle
        :cx="island.portal.entry.x"
        :cy="island.portal.entry.y"
        r="4.5"
        fill="#facc15"
        stroke="black"
        stroke-width="0.8"
      />
      <circle
        :cx="island.portal.exit.x"
        :cy="island.portal.exit.y"
        r="3"
        fill="none"
        stroke="#facc15"
        stroke-width="1.5"
      />
      <circle
        v-for="station in island.workstations"
        :key="station.slot"
        :cx="station.point.x"
        :cy="station.point.y"
        r="4.5"
        fill="#ef4444"
        stroke="black"
        stroke-width="0.8"
      />
      <text
        :x="island.bounds.x + 4"
        :y="island.bounds.y + 12"
        font-size="11"
        fill="white"
        stroke="black"
        stroke-width="0.4"
      >
        {{ island.label }}
      </text>
    </g>
    <g v-for="foot in feet" :key="foot.key" :data-geometry-foot="foot.key">
      <line :x1="foot.x - 8" :y1="foot.y" :x2="foot.x + 8" :y2="foot.y" stroke="#f472b6" stroke-width="2" />
      <line :x1="foot.x" :y1="foot.y - 8" :x2="foot.x" :y2="foot.y + 8" stroke="#f472b6" stroke-width="2" />
    </g>
  </svg>
</template>
