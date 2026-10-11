<script setup lang="ts">
import type { AgentLifecycleStatus } from '~~/domains/agents/types'

/**
 * Lencana status bergaya HUD neon (referensi: ui-previews/status-badges.png).
 * Gunakan `lifecycle` untuk status agent dari database, atau `tone` + `label`
 * untuk status lain (stasiun, misi, fitur belum tersedia).
 */
type Tone = 'mint' | 'orange' | 'cyan' | 'purple' | 'muted'

const props = withDefaults(
  defineProps<{
    lifecycle?: AgentLifecycleStatus
    tone?: Tone
    label?: string
  }>(),
  { lifecycle: undefined, tone: 'muted', label: '' },
)

const LIFECYCLE_TONE: Record<AgentLifecycleStatus, Tone> = {
  active: 'mint',
  paused: 'orange',
  draft: 'muted',
  archived: 'muted',
}

const TONES: Record<Tone, string> = {
  mint: 'border-office-mint/45 bg-office-mint/12 text-office-mint',
  orange: 'border-office-orange/45 bg-office-orange/12 text-office-orange',
  cyan: 'border-office-cyan/45 bg-office-cyan/12 text-office-cyan',
  purple: 'border-office-purple/50 bg-office-purple/15 text-[color-mix(in_oklch,var(--office-purple)_70%,white)]',
  muted: 'border-border bg-muted/50 text-muted-foreground',
}

const resolvedTone = computed(() => (props.lifecycle ? LIFECYCLE_TONE[props.lifecycle] : props.tone))
const resolvedLabel = computed(() => (props.lifecycle ? LIFECYCLE_PRESENTATION[props.lifecycle].label : props.label))
</script>

<template>
  <span
    :class="[
      'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight',
      TONES[resolvedTone],
    ]"
  >
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ resolvedLabel }}
  </span>
</template>
