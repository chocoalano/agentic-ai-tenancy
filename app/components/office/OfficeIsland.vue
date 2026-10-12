<script setup lang="ts">
import { ISLANDS } from '~/utils/game-assets'
import { boxStyle, stationBox, type StationDefinition, type StationState } from '~/utils/office-layout'

/**
 * Z4: satu pulau workstation (islands/*.png, varian HD turunan) sebagai tombol.
 * Klik/Enter → informasi stasiun. Area klik diperluas ke bawah agar papan nama
 * (OfficeLabels) ikut dapat diklik.
 */
const props = defineProps<{
  definition: StationDefinition
  state: StationState
  occupants: number
  selected?: boolean
  /** Ada robot yang sedang bekerja di stasiun ini (lampu workstation menyala). */
  active?: boolean
  /** Tujuan robot yang sedang bergerak (sorotan). */
  targeted?: boolean
  /** Hologram pulau menyala sebentar secara ambient (pratinjau, tanpa robot). */
  ambient?: boolean
  index: number
}>()

const emit = defineEmits<{ select: [] }>()

const style = computed(() => ({
  ...boxStyle(stationBox(props.definition)),
  zIndex: String(40 + Math.round(props.definition.y / 100)),
}))
const accessibleLabel = computed(
  () =>
    `Stasiun ${props.definition.label}: ${props.occupants > 0 ? `${props.occupants} robot` : 'belum ada robot'}. Lihat informasi stasiun.`,
)
</script>

<template>
  <button
    type="button"
    class="group/island absolute rounded-[20%] outline-none before:absolute before:inset-x-[15%] before:bottom-[92%] before:h-[calc(var(--s)*60)] before:content-[''] after:absolute after:inset-x-[15%] after:top-full after:h-[16%] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-office-cyan"
    :style="style"
    :aria-label="accessibleLabel"
    :aria-pressed="selected"
    :data-station="definition.id"
    @click.stop="emit('select')"
  >
    <!-- Sorotan tujuan -->
    <span
      v-if="targeted"
      class="pointer-events-none absolute left-1/2 top-[66%] block aspect-2/1 w-[96%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-office-cyan shadow-[0_0_24px_var(--office-cyan)] motion-safe:animate-office-pulse"
      aria-hidden="true"
    />
    <!-- Pulau diam: robot berdiri di atasnya dengan kaki tertambat ke koordinat dunia. -->
    <span class="block">
      <GameImage
        :asset="ISLANDS[definition.id]"
        eager
        :class="[
          'transition-[transform,filter] duration-300 group-hover/island:translate-y-[-3%] group-focus-visible/island:translate-y-[-3%]',
          selected
            ? 'drop-shadow-[0_0_22px_color-mix(in_oklch,var(--office-cyan)_85%,transparent)]'
            : 'drop-shadow-[0_14px_22px_oklch(0.12_0.07_270/55%)] group-hover/island:drop-shadow-[0_0_18px_color-mix(in_oklch,var(--office-cyan)_60%,transparent)]',
          definition.depth === 'far' && !selected && !active ? 'brightness-90 saturate-90' : '',
          active
            ? 'brightness-110 saturate-125 drop-shadow-[0_0_20px_color-mix(in_oklch,var(--office-mint)_70%,transparent)]'
            : '',
          ambient && !active && !selected
            ? 'brightness-105 drop-shadow-[0_0_18px_color-mix(in_oklch,var(--office-cyan)_55%,transparent)]'
            : '',
          state === 'empty' && !selected ? 'saturate-[0.85]' : '',
        ]"
      />
    </span>
  </button>
</template>
