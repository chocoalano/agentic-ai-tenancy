<script setup lang="ts">
import { Pause, Play, RotateCcw } from '@lucide/vue'
import type { SimulationSnapshot } from '~/game/simulation'
import { ATLAS_PHASES } from '~/game/simulation'

/**
 * Kontrol simulasi pratinjau "Project Atlas — Market Research Mission":
 * mulai, jeda, lanjut, reset, kecepatan, dan fase aktif. Selalu berlabel
 * SIMULASI; jumlah AI employee nyata tetap ditampilkan.
 */
defineProps<{ simulation: SimulationSnapshot; realCount: number }>()
const emit = defineEmits<{ start: []; pause: []; resume: []; reset: []; speed: [value: number]; exit: [] }>()

const SPEEDS = [0.5, 1, 2]
</script>

<template>
  <div
    class="simulation-strip pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs"
    role="region"
    aria-label="Kontrol simulasi pratinjau"
    data-simulation-bar
    :data-status="simulation.status"
  >
    <span class="demo-tag">SIMULASI</span>
    <span class="hidden font-semibold xl:inline">Project Atlas</span>
    <!-- Ponsel: ringkas satu baris; teks lengkap mulai sm. -->
    <span class="text-muted-foreground" aria-live="polite">
      <template v-if="simulation.status === 'idle'">
        <span class="sm:hidden">Siap</span>
        <span class="hidden sm:inline">Siap · mulai misi contoh</span>
      </template>
      <template v-else-if="simulation.status === 'completed'">
        Selesai<span class="hidden sm:inline"> (simulasi, bukan hasil nyata)</span>
      </template>
      <template v-else>
        Fase {{ simulation.phaseIndex + 1 }}/{{ ATLAS_PHASES.length
        }}<span class="hidden sm:inline">: {{ simulation.phaseLabel }}</span>
        <template v-if="simulation.status === 'paused'"> · dijeda</template>
      </template>
    </span>
    <span class="flex items-center gap-1">
      <Button
        v-if="simulation.status === 'idle' || simulation.status === 'completed'"
        size="sm"
        class="h-7 gap-1 rounded-lg bg-office-orange px-2 text-[11px] text-[oklch(0.2_0.05_70)] hover:bg-office-orange/90"
        data-sim-start
        :aria-label="simulation.status === 'completed' ? 'Ulangi simulasi' : 'Mulai simulasi'"
        @click="emit('start')"
      >
        <Play class="size-3.5" aria-hidden="true" />
        <span class="hidden sm:inline">{{ simulation.status === 'completed' ? 'Ulangi' : 'Mulai' }}</span>
      </Button>
      <Button
        v-else-if="simulation.status === 'running'"
        size="sm"
        variant="secondary"
        class="h-7 gap-1 rounded-lg px-2 text-[11px]"
        data-sim-pause
        aria-label="Jeda simulasi"
        @click="emit('pause')"
      >
        <Pause class="size-3.5" aria-hidden="true" /><span class="hidden sm:inline">Jeda</span>
      </Button>
      <Button
        v-else
        size="sm"
        variant="secondary"
        class="h-7 gap-1 rounded-lg px-2 text-[11px]"
        data-sim-resume
        aria-label="Lanjutkan simulasi"
        @click="emit('resume')"
      >
        <Play class="size-3.5" aria-hidden="true" /><span class="hidden sm:inline">Lanjut</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        class="h-7 gap-1 rounded-lg px-2 text-[11px]"
        data-sim-reset
        aria-label="Reset simulasi"
        @click="emit('reset')"
      >
        <RotateCcw class="size-3.5" aria-hidden="true" /><span class="hidden sm:inline">Reset</span>
      </Button>
    </span>
    <span class="flex items-center gap-0.5" role="group" aria-label="Kecepatan simulasi">
      <button
        v-for="value in SPEEDS"
        :key="value"
        type="button"
        :class="[
          'rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-office-cyan',
          simulation.speed === value
            ? 'bg-office-orange text-[oklch(0.2_0.05_70)]'
            : 'text-muted-foreground hover:text-foreground',
        ]"
        :aria-pressed="simulation.speed === value"
        :data-sim-speed="value"
        @click="emit('speed', value)"
      >
        {{ value }}×
      </button>
    </span>
    <span class="text-muted-foreground"
      >nyata: <strong class="text-foreground">{{ realCount }}</strong></span
    >
    <!-- Ponsel: keluar pratinjau lewat tombol mata di HUD. -->
    <Button
      size="sm"
      variant="ghost"
      class="hidden h-6 rounded-full px-2 text-[11px] sm:inline-flex"
      @click="emit('exit')"
    >
      Lihat live
    </Button>
  </div>
</template>

<style scoped>
.simulation-strip {
  border: 1px solid #6093d3;
  border-radius: 12px;
  background: linear-gradient(180deg, #102c57f5, #081931f5);
  box-shadow:
    inset 0 1px 0 #91c9ff26,
    0 3px 15px #05134080;
  backdrop-filter: blur(12px);
}
.simulation-strip :deep(.demo-tag) {
  border-color: #ffba5566;
  background: #ffb65019;
  color: #ffd894;
  font-size: 8px;
  letter-spacing: 0.06em;
}
@media (max-width: 767px) {
  .simulation-strip {
    gap: 4px;
    border-radius: 10px;
    padding: 4px 6px;
    font-size: 10px;
  }
}
</style>
