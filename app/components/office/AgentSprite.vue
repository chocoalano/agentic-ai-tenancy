<script setup lang="ts">
import type { AgentLifecycleStatus } from '~~/domains/agents/types'
import { CHARACTER_STATES, CHARACTERS, type CharacterKey, type CharacterStateKey } from '~/utils/game-assets'

/**
 * Sprite robot AI dari asset pack (characters/*.png atau character-states/*.png).
 *
 * Tampilan mengikuti status siklus hidup NYATA dari database: aktif = penuh
 * warna, dijeda = redup, draf/arsip = abu-abu. Pose aktivitas (`state`)
 * hanya dipakai bila pemanggil benar-benar punya alasan (ilustrasi fungsi
 * stasiun, galeri desain, atau kelak status runtime dari orchestrator).
 */
const props = withDefaults(
  defineProps<{
    character: CharacterKey
    state?: CharacterStateKey
    status?: AgentLifecycleStatus | null
    alt?: string
    eager?: boolean
  }>(),
  { state: undefined, status: null, alt: '', eager: false },
)

const asset = computed(() => (props.state ? CHARACTER_STATES[props.state] : CHARACTERS[props.character]))

const TONE: Record<AgentLifecycleStatus, string> = {
  active: 'drop-shadow-[0_6px_14px_color-mix(in_oklch,var(--office-cyan)_35%,transparent)]',
  paused: 'saturate-[0.45] brightness-90',
  draft: 'grayscale opacity-75',
  archived: 'grayscale opacity-50',
}
</script>

<template>
  <GameImage :asset="asset" :alt="alt" :eager="eager" :class="status ? TONE[status] : undefined" />
</template>
