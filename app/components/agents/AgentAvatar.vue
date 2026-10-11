<script setup lang="ts">
import type { AgentLifecycleStatus } from '~~/domains/agents/types'
import { cn } from '~/lib/utils'
import { CHARACTERS } from '~/utils/game-assets'
import { characterForAgent } from '~/utils/office-layout'

/**
 * Avatar AI employee: primitive Avatar shadcn-vue berisi sprite robot PNG dari
 * asset pack. Karakter dipilih deterministik dari peran (lihat
 * `characterForAgent`) sehingga sama di semua halaman. Dekoratif secara
 * default (nama agent selalu tampil di dekatnya); isi `label` bila avatar
 * berdiri sendiri.
 */
const props = withDefaults(
  defineProps<{
    seed: string
    roleKey?: string
    roleTitle?: string
    status?: AgentLifecycleStatus | null
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    label?: string
    class?: string
  }>(),
  { roleKey: '', roleTitle: '', status: null, size: 'md', label: undefined, class: undefined },
)

const SIZES = {
  xs: 'size-7 rounded-lg',
  sm: 'size-9 rounded-lg',
  md: 'size-11 rounded-xl',
  lg: 'size-16 rounded-2xl',
  xl: 'size-28 rounded-3xl',
}

const character = computed(() =>
  characterForAgent({ id: props.seed, roleKey: props.roleKey, roleTitle: props.roleTitle }),
)
/** Lebar sprite (fraksi avatar); posisi kiri memusatkan badan robot (anchorX). */
const SPRITE_WIDTH = 0.76
const spriteStyle = computed(() => {
  const anchor = CHARACTERS[character.value].anchorX ?? 0.5
  return { width: `${SPRITE_WIDTH * 100}%`, left: `${(0.5 - anchor * SPRITE_WIDTH) * 100}%` }
})
</script>

<template>
  <Avatar
    :class="
      cn(
        'bg-[radial-gradient(70%_60%_at_50%_35%,color-mix(in_oklch,var(--office-cyan)_22%,transparent),transparent_75%),linear-gradient(170deg,var(--office-surface),var(--office-bg))] ring-1 ring-inset ring-glass-border',
        SIZES[props.size],
        props.class,
      )
    "
    :role="props.label ? 'img' : undefined"
    :aria-label="props.label"
    :aria-hidden="props.label ? undefined : 'true'"
  >
    <span class="absolute top-[9%]" :style="spriteStyle">
      <AgentSprite :character="character" :status="props.status" />
    </span>
  </Avatar>
</template>
