<script setup lang="ts">
import type { AgentLifecycleStatus, AgentRuntimeStatus } from '~~/domains/agents/types'

/**
 * Badge status agent. `kind="lifecycle"` menampilkan status konfigurasi dari
 * database; `kind="runtime"` menampilkan status dari orchestrator — `null`
 * berarti runtime belum terhubung (Phase 1) dan ditampilkan apa adanya.
 */
const props = defineProps<
  { kind: 'lifecycle'; status: AgentLifecycleStatus } | { kind: 'runtime'; status: AgentRuntimeStatus | null }
>()

const presentation = computed(() => {
  if (props.kind === 'lifecycle') return LIFECYCLE_PRESENTATION[props.status]
  return props.status ? RUNTIME_PRESENTATION[props.status] : RUNTIME_DISCONNECTED
})

const animated = computed(() => props.kind === 'runtime' && props.status !== null && props.status !== 'idle')
</script>

<template>
  <Badge variant="outline" :class="['gap-1.5 font-medium', presentation.tone]">
    <span class="relative flex size-1.5" aria-hidden="true">
      <span
        v-if="animated"
        :class="['absolute inline-flex size-full animate-ping rounded-full opacity-60', presentation.dot]"
      />
      <span :class="['relative inline-flex size-1.5 rounded-full', presentation.dot]" />
    </span>
    {{ presentation.label }}
  </Badge>
</template>
