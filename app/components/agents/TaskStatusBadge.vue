<script setup lang="ts">
import type { TaskStatus } from '~~/domains/tasks/types'
import type { StatusTone } from '~/types/ui'

/** Badge status tugas (label Bahasa Indonesia; warna lewat token status). */
const props = defineProps<{ status: TaskStatus }>()

const PRESENTATION: Record<TaskStatus, { tone: StatusTone; pulse: boolean }> = {
  created: { tone: 'neutral', pulse: false },
  queued: { tone: 'warning', pulse: true },
  running: { tone: 'info', pulse: true },
  waiting_approval: { tone: 'warning', pulse: true },
  completed: { tone: 'success', pulse: false },
  failed: { tone: 'danger', pulse: false },
  canceled: { tone: 'offline', pulse: false },
}
const current = computed(() => PRESENTATION[props.status])
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border border-glass-border bg-background/40 px-2.5 py-1 text-xs"
    :data-task-status="status"
  >
    <StatusIndicator :tone="current.tone" :pulse="current.pulse" :label="TASK_STATUS_LABELS[status]" />
  </span>
</template>
