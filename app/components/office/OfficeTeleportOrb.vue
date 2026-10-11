<script setup lang="ts">
import { OFFICE_ENGINE_BRIDGE } from '~/composables/useOfficeEngine'
import { FX } from '~/utils/game-assets'

/**
 * Orb energi yang menempuh jalur energi saat robot transit teleport
 * (fx/particles-cyan v2). Posisi (`--ox/--oy`) & tampilannya ditulis langsung
 * oleh renderer mesin; tersembunyi di luar fase transit.
 */
const props = defineProps<{ agentKey: string }>()

const bridge = inject(OFFICE_ENGINE_BRIDGE, null)
const element = ref<HTMLElement | null>(null)

onMounted(() => {
  if (element.value) bridge?.registerOrb(props.agentKey, element.value)
})
onBeforeUnmount(() => bridge?.unregisterOrb(props.agentKey))
</script>

<template>
  <span
    ref="element"
    class="pointer-events-none absolute left-0 top-0 z-[90] hidden [transform:translate3d(calc(var(--ox)*var(--s)),calc(var(--oy)*var(--s)),0)]"
    :data-orb="agentKey"
    aria-hidden="true"
  >
    <span
      class="absolute block -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_12px_var(--office-cyan)]"
      :style="{ width: 'calc(var(--s) * 40)' }"
    >
      <GameImage :asset="FX['particles-cyan']" eager />
    </span>
    <span
      class="absolute block size-[calc(var(--s)*14)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_18px_6px_var(--office-cyan)]"
    />
  </span>
</template>
