<script setup lang="ts">
import { cn } from '~/lib/utils'
import type { StatusTone } from '~/types/ui'

/**
 * Titik status + label. Warna hanya dari token semantik; `pulse` untuk status
 * yang sedang berlangsung (dimatikan otomatis oleh prefers-reduced-motion).
 */
const props = withDefaults(
  defineProps<{
    tone: StatusTone
    label?: string
    pulse?: boolean
    size?: 'sm' | 'md'
    class?: string
  }>(),
  { label: undefined, pulse: false, size: 'sm', class: undefined },
)

const DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  violet: 'bg-brand-violet',
  neutral: 'bg-muted-foreground',
  offline: 'bg-agent-offline',
}
</script>

<template>
  <span :class="cn('inline-flex items-center gap-2', props.class)">
    <span :class="['relative flex shrink-0', size === 'sm' ? 'size-1.5' : 'size-2']" aria-hidden="true">
      <span
        v-if="pulse"
        :class="['absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping', DOT[tone]]"
      />
      <span :class="['relative inline-flex size-full rounded-full', DOT[tone]]" />
    </span>
    <span v-if="label" class="truncate">{{ label }}</span>
    <slot />
  </span>
</template>
