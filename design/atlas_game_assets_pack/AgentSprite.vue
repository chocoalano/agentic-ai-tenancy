<script setup lang="ts">
import { computed } from 'vue'
type AgentName = 'nova' | 'sage' | 'pixel' | 'bolt' | 'echo'
const props = withDefaults(defineProps<{ agent: AgentName; size?: number; label?: string }>(), { size: 92 })
const spriteUrl = computed(() => `/game-assets/characters/${props.agent}.png`)
</script>
<template>
  <img :src="spriteUrl" :alt="label ?? `Robot AI ${agent}`" :width="size" :style="{ width: `${size}px`, height: 'auto' }" class="pointer-events-none select-none object-contain drop-shadow-[0_8px_18px_rgba(0,208,255,0.25)]" loading="lazy" draggable="false">
</template>
