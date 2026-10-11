<script setup lang="ts">
import { ISLANDS } from '~/utils/game-assets'
import { MISSION_HUB, boxStyle, hubBox } from '~/utils/office-layout'

/**
 * Z4: pulau pusat (islands/mission-hub.png, varian HD turunan) — elemen paling
 * dominan di dunia. Klik → ringkasan misi & status orchestrator.
 */
const props = defineProps<{
  completed: number
  total: number
  preview: boolean
  selected?: boolean
  active?: boolean
  targeted?: boolean
  /** Hologram kristal menyala sebentar secara ambient (pratinjau). */
  ambient?: boolean
}>()

const emit = defineEmits<{ select: [] }>()

const style = { ...boxStyle(hubBox()), zIndex: '44' }
const accessibleLabel = computed(
  () =>
    `${MISSION_HUB.label}: ${props.preview ? 'misi contoh' : 'misi persiapan'} ${props.completed} dari ${props.total} langkah selesai. Lihat ringkasan misi.`,
)
</script>

<template>
  <button
    type="button"
    class="group/hub absolute rounded-[30%] outline-none after:absolute after:inset-x-[32%] after:top-full after:h-[10%] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-office-cyan"
    :style="style"
    :aria-label="accessibleLabel"
    :aria-pressed="selected"
    data-station="mission-hub"
    @click.stop="emit('select')"
  >
    <span
      v-if="targeted"
      class="pointer-events-none absolute left-1/2 top-[70%] block aspect-[2/1] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-office-cyan shadow-[0_0_28px_var(--office-cyan)] motion-safe:animate-office-pulse"
      aria-hidden="true"
    />
    <!-- Cahaya kristal -->
    <span
      :class="[
        'pointer-events-none absolute left-1/2 top-[22%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.85_0.15_210/55%),oklch(0.7_0.18_230/18%)_45%,transparent_70%)] motion-safe:animate-glow-breathe',
        active ? 'w-[95%]' : ambient ? 'w-[84%]' : 'w-[70%]',
      ]"
      aria-hidden="true"
    />
    <span class="relative block">
      <GameImage
        :asset="ISLANDS['mission-hub']"
        eager
        :class="[
          'transition-[filter] duration-300',
          selected
            ? 'drop-shadow-[0_0_34px_color-mix(in_oklch,var(--office-cyan)_80%,transparent)]'
            : 'drop-shadow-[0_0_24px_color-mix(in_oklch,var(--office-cyan)_40%,transparent)] group-hover/hub:drop-shadow-[0_0_32px_color-mix(in_oklch,var(--office-cyan)_65%,transparent)]',
        ]"
      />
    </span>
  </button>
</template>
