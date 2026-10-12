<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Tab pusat komando: primitive Tabs shadcn-vue dengan gaya Agentic Game UI
 * (daftar transparan, pemicu aktif bercahaya cyan). Konten tab tetap ditulis
 * pemanggil dengan `<TabsContent value="...">` di slot default.
 */
export interface GameTabItem {
  value: string
  label: string
  icon?: Component
  badge?: string | number
}

defineProps<{ items: GameTabItem[]; modelValue: string; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <Tabs
    :model-value="modelValue"
    class="gap-5"
    @update:model-value="(value) => emit('update:modelValue', String(value))"
  >
    <TabsList class="game-tabs w-full max-w-full flex-wrap justify-start" :aria-label="label" data-game-tabs>
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        class="game-tab flex-none"
        :data-tab="item.value"
      >
        <component :is="item.icon" v-if="item.icon" class="size-4" aria-hidden="true" />
        {{ item.label }}
        <span
          v-if="item.badge !== undefined"
          class="rounded-full bg-game-cyan/15 px-1.5 text-[10px] font-bold tabular-nums text-game-cyan"
          >{{ item.badge }}</span
        >
      </TabsTrigger>
    </TabsList>
    <slot />
  </Tabs>
</template>
