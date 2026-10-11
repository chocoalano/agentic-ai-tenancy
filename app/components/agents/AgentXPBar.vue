<script setup lang="ts">
/**
 * Level & progres XP AI employee. Tanpa data (Phase 1: modul misi belum ada)
 * komponen menampilkan status "belum aktif" — bukan angka karangan.
 */
const props = withDefaults(
  defineProps<{ level?: number | null; xp?: number | null; target?: number | null; compact?: boolean }>(),
  { level: null, xp: null, target: null, compact: false },
)

const available = computed(() => props.level !== null && props.xp !== null && props.target !== null && props.target > 0)
const percent = computed(() =>
  available.value && props.target ? Math.min(100, Math.round(((props.xp ?? 0) / props.target) * 100)) : 0,
)
</script>

<template>
  <div class="flex items-center gap-3">
    <span
      :class="[
        'grid shrink-0 place-items-center font-heading font-semibold [clip-path:polygon(25%_4%,75%_4%,100%_50%,75%_96%,25%_96%,0_50%)]',
        compact ? 'h-7 w-8 text-[10px]' : 'h-9 w-10 text-xs',
        available ? 'bg-level text-level-foreground' : 'bg-muted text-muted-foreground',
      ]"
      :aria-label="available ? `Level ${level}` : 'Level belum aktif'"
    >
      {{ available ? `Lv ${level}` : 'Lv –' }}
    </span>
    <div class="min-w-0 flex-1 space-y-1.5">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="font-medium">{{ available ? 'Progres XP' : 'XP & level belum aktif' }}</span>
        <span v-if="available" class="tabular-nums text-muted-foreground">{{ xp }} / {{ target }} XP</span>
        <span v-else class="text-muted-foreground">Modul misi · Wave 3</span>
      </div>
      <Progress
        v-if="available"
        :model-value="percent"
        :aria-label="`Progres XP ${percent}%`"
        class="h-1.5 bg-xp-track [&>[data-slot=progress-indicator]]:bar-xp"
      />
      <div v-else class="h-1.5 w-full rounded-full border border-dashed border-glass-border" aria-hidden="true" />
    </div>
  </div>
</template>
