<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import type { ApprovalRequestView } from '~/types/office'

/**
 * Permintaan persetujuan manusia (human-in-the-loop). Tombol keputusan sengaja
 * nonaktif sampai API persetujuan tersedia — tidak ada aksi palsu.
 */
withDefaults(defineProps<{ requests?: ApprovalRequestView[] }>(), { requests: () => [] })

const RISK = {
  low: { label: 'Risiko rendah', tone: 'border-success/30 bg-success/10 text-success' },
  medium: { label: 'Risiko sedang', tone: 'border-warning/30 bg-warning/10 text-warning' },
  high: { label: 'Risiko tinggi', tone: 'border-destructive/30 bg-destructive/10 text-destructive' },
} as const
</script>

<template>
  <section class="surface-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5" aria-labelledby="approvals-title">
    <SectionHeader
      id="approvals-title"
      :icon="ShieldCheck"
      title="Menunggu persetujuan"
      description="Keputusan penting AI employee selalu menunggu persetujuan manusia."
      as="h3"
    />
    <ul v-if="requests.length" class="space-y-2.5">
      <li v-for="request in requests" :key="request.id" class="surface-sunken space-y-2 rounded-xl p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ request.title }}</p>
            <p class="text-[11px] text-muted-foreground">{{ request.agentName }} · {{ request.requestedLabel }}</p>
          </div>
          <Badge variant="outline" :class="['shrink-0 text-[10px]', RISK[request.risk].tone]">{{
            RISK[request.risk].label
          }}</Badge>
        </div>
        <div class="flex gap-2">
          <Button size="sm" variant="secondary" class="h-7 flex-1" disabled>Tinjau</Button>
          <Button size="sm" class="h-7 flex-1" disabled>Setujui</Button>
        </div>
      </li>
    </ul>
    <EmptyState
      v-else
      size="compact"
      :ghost="2"
      badge="Wave 2"
      title="Tidak ada permintaan"
      description="Persetujuan aktif bersama orchestrator: agent meminta izin sebelum tindakan berisiko."
    />
  </section>
</template>
