<script setup lang="ts">
defineProps<{ compact?: boolean }>()
const config = useRuntimeConfig()
</script>

<template>
  <span class="flex items-center gap-2.5">
    <span
      class="relative grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-cyan via-brand-blue to-brand-violet shadow-[0_0_24px_-6px_var(--glow)]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" class="size-4.5 text-white" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 18 12 4l8 14" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M8 13h8" stroke-linecap="round" />
        <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </span>
    <span v-if="!compact" class="flex flex-col leading-tight">
      <span class="font-heading text-sm font-semibold">Agentic AI</span>
      <span class="text-[11px] text-muted-foreground">Virtual Office</span>
    </span>
    <span class="sr-only">{{ config.public.appName }}</span>
  </span>
</template>
