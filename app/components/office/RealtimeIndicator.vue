<script setup lang="ts">
import type { OfficeRealtimeEvent, RealtimeConnectionState } from '~~/domains/office/realtime'
import type { StatusTone } from '~/types/ui'

/**
 * Status koneksi SSE nyata ke /api/v1/realtime/stream. Presentasional: koneksi
 * dimiliki halaman (satu `useOfficeRealtime()` per halaman) agar beberapa
 * indikator tidak membuka beberapa stream.
 */
const props = withDefaults(
  defineProps<{
    state: RealtimeConnectionState
    lastEvent?: OfficeRealtimeEvent | null
    variant?: 'chip' | 'inline'
  }>(),
  { lastEvent: null, variant: 'chip' },
)

const PRESENTATION: Record<RealtimeConnectionState, { label: string; tone: StatusTone; pulse: boolean }> = {
  idle: { label: 'Realtime belum aktif', tone: 'offline', pulse: false },
  connecting: { label: 'Menghubungkan…', tone: 'warning', pulse: true },
  open: { label: 'Realtime terhubung', tone: 'success', pulse: true },
  reconnecting: { label: 'Menyambung ulang…', tone: 'warning', pulse: true },
  closed: { label: 'Realtime terputus', tone: 'offline', pulse: false },
  error: { label: 'Realtime ditolak', tone: 'danger', pulse: false },
}

const current = computed(() => PRESENTATION[props.state])
const lastBeat = computed(() =>
  props.lastEvent ? new Date(props.lastEvent.data.serverTime).toLocaleTimeString('id-ID') : null,
)
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span
        :class="[
          'inline-flex items-center text-xs',
          variant === 'chip'
            ? 'rounded-full border border-glass-border bg-background/40 px-2.5 py-1 text-muted-foreground'
            : 'text-muted-foreground',
        ]"
        role="status"
        aria-live="polite"
        tabindex="0"
      >
        <StatusIndicator :tone="current.tone" :pulse="current.pulse" :label="current.label" />
      </span>
    </TooltipTrigger>
    <TooltipContent>
      <p>Server-Sent Events · heartbeat terakhir: {{ lastBeat ?? '—' }}</p>
    </TooltipContent>
  </Tooltip>
</template>
