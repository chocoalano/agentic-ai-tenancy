<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Kompatibilitas: header halaman lama kini dirender oleh GamePageHeader
 * (Agentic Game UI). Bila `eyebrow` kosong, identitas area diambil dari
 * navigasi (mis. "AI Employee Headquarters").
 */
const props = withDefaults(defineProps<{ title: string; description?: string; eyebrow?: string; icon?: Component }>(), {
  description: undefined,
  eyebrow: undefined,
  icon: undefined,
})
const route = useRoute()
const identity = computed(() => props.eyebrow ?? activeNavigation(route.path)?.identity)
</script>

<template>
  <GamePageHeader :title="title" :description="description" :identity="identity" :icon="icon">
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </GamePageHeader>
</template>
