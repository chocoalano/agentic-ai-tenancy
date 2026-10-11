<script setup lang="ts">
import { BadgeCheck, Hourglass, TriangleAlert } from '@lucide/vue'
import { buildWorld, type IslandId } from '~/game/world'
import type { WorkstationEffect, WorkstationVisual } from '~/game/workstations'
import { FX } from '~/utils/game-assets'

/**
 * Efek visual workstation (Z5+, interleaved dengan robot menurut kedalaman).
 *
 * Diturunkan dari `snapshot.workstations` (state agent yang sudah ada) — hanya
 * dirender saat snapshot berubah (event diskret), tidak per frame. Setiap efek
 * ditambatkan ke anchor interaksi (titik slot geometri artwork) robot yang
 * sedang beraktivitas, dalam koordinat dunia yang sama dengan robot, sehingga
 * tetap benar saat zoom/geser dan ukuran viewport berubah.
 *
 * Artwork efek = fx/* dari asset pack (v2, alpha sungguhan); panel hologram
 * (grafik, dokumen, terminal) adalah glyph UI prosedural berlabel — bukan
 * pengganti artwork pulau/robot. Semua animasi hanya transform/opacity dan
 * dimatikan oleh prefers-reduced-motion (`motion-safe:`).
 */
const props = defineProps<{
  visuals: readonly WorkstationVisual[]
  ambientIslands: readonly IslandId[]
}>()

const world = buildWorld()

interface Placed {
  key: string
  island: IslandId
  effect: WorkstationEffect
  x: number
  y: number
  depth: number
  index: number
}

/** Efek yang ditambatkan ke tiap anchor robot (bukan per pulau) agar mengikuti slot yang dipakai. */
const PER_ANCHOR: ReadonlySet<WorkstationEffect> = new Set([
  'document-holograms',
  'search-rings',
  'chart-hologram',
  'data-particles',
  'typing-glow',
  'document-assembly',
  'terminal-lines',
  'tool-controls',
  'brief-bubble',
  'knowledge-shelf',
  'quality-seal',
  'approval-beacon',
  'completion-burst',
  'error-flicker',
])

const placed = computed<Placed[]>(() => {
  const items: Placed[] = []
  for (const visual of props.visuals) {
    const island = world.islands.get(visual.island)
    if (!island) continue
    visual.effects.forEach((effect, index) => {
      if (PER_ANCHOR.has(effect)) {
        for (const anchor of visual.anchors) {
          const point = island.workstations[anchor.slot]?.point ?? island.hub
          items.push({
            key: `${visual.island}:${effect}:${anchor.key}`,
            island: visual.island,
            effect,
            x: point.x,
            y: point.y,
            // Tepat di depan robot pada anchor yang sama (robot: 100 + y).
            depth: 100 + Math.round(point.y) + 1,
            index,
          })
        }
      } else {
        items.push({
          key: `${visual.island}:${effect}`,
          island: visual.island,
          effect,
          x: island.hub.x,
          y: island.hub.y,
          depth: 100 + Math.round(island.hub.y) - 2,
          index,
        })
      }
    })
  }
  return items
})

const ambient = computed(() =>
  props.ambientIslands.flatMap((id) => {
    const island = world.islands.get(id)
    return island ? [{ id, x: island.hub.x, y: island.hub.y, depth: 60 }] : []
  }),
)

function anchorStyle(item: { x: number; y: number; depth: number }) {
  return { '--ax': item.x.toFixed(1), '--ay': item.y.toFixed(1), zIndex: String(item.depth) }
}

const LABEL: Record<WorkstationEffect, string> = {
  'mission-hologram': 'Hologram misi aktif',
  'signal-pulse': 'Sinyal tugas dikirim',
  'document-holograms': 'Dokumen hologram',
  'search-rings': 'Pencarian sumber',
  'chart-hologram': 'Grafik analisis',
  'data-particles': 'Partikel data',
  'typing-glow': 'Mengetik',
  'document-assembly': 'Menyusun dokumen',
  'terminal-lines': 'Terminal operasi',
  'tool-controls': 'Kontrol alat hologram',
  'brief-bubble': 'Brief klien',
  'knowledge-shelf': 'Rak pengetahuan',
  'quality-seal': 'Segel kualitas',
  'approval-beacon': 'Menunggu persetujuan',
  'completion-burst': 'Selesai',
  'error-flicker': 'Gagal',
}
</script>

<template>
  <div class="contents" aria-hidden="true">
    <!-- Hologram pulau ambient (pratinjau): menyala lalu memudar -->
    <span
      v-for="glow in ambient"
      :key="`ambient-${glow.id}`"
      class="pointer-events-none absolute left-0 top-0 [transform:translate3d(calc(var(--ax)*var(--s)),calc(var(--ay)*var(--s)),0)]"
      :style="anchorStyle(glow)"
      :data-ambient-island="glow.id"
    >
      <span
        class="absolute block -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(circle,oklch(0.85_0.15_210/45%),oklch(0.7_0.18_230/14%)_50%,transparent_72%)] motion-safe:animate-ambient-glow"
        :style="{ width: 'calc(var(--s) * 180)', height: 'calc(var(--s) * 90)' }"
      />
    </span>

    <span
      v-for="item in placed"
      :key="item.key"
      class="pointer-events-none absolute left-0 top-0 [transform:translate3d(calc(var(--ax)*var(--s)),calc(var(--ay)*var(--s)),0)]"
      :style="anchorStyle(item)"
      :data-workstation-effect="item.effect"
      :data-workstation-island="item.island"
      :title="LABEL[item.effect]"
    >
      <!-- Mission Hub: hologram misi besar + cincin energi di pusat -->
      <template v-if="item.effect === 'mission-hologram'">
        <span
          class="absolute block -translate-x-1/2 motion-safe:animate-office-float"
          :style="{ width: 'calc(var(--s) * 56)', left: 0, top: 'calc(var(--s) * -150)' }"
        >
          <GameImage :asset="FX['hologram-cube']" />
        </span>
        <span
          class="absolute block -translate-x-1/2 -translate-y-1/2 scale-y-[0.42] opacity-80 motion-safe:animate-office-pulse"
          :style="{ width: 'calc(var(--s) * 150)', left: 0, top: 0 }"
        >
          <GameImage :asset="FX['energy-ring']" />
        </span>
      </template>

      <!-- Sinyal tugas: cincin meluas dari pusat hub -->
      <span
        v-else-if="item.effect === 'signal-pulse'"
        class="absolute left-0 top-0 block rounded-[50%] border-2 border-office-cyan/80 opacity-0 shadow-[0_0_14px_var(--office-cyan)] motion-safe:animate-office-signal"
        :style="{ width: 'calc(var(--s) * 120)', height: 'calc(var(--s) * 60)' }"
      />

      <!-- Web Research: tiga dokumen hologram melayang bergantian + cincin pencarian -->
      <template v-else-if="item.effect === 'document-holograms'">
        <span
          v-for="n in 3"
          :key="n"
          class="holo-card absolute block motion-safe:animate-holo-rise"
          :style="{
            width: 'calc(var(--s) * 26)',
            height: 'calc(var(--s) * 32)',
            left: `calc(var(--s) * ${44 + (n - 1) * 26})`,
            top: `calc(var(--s) * ${-114 + (n - 1) * 4})`,
            animationDelay: `${(n - 1) * 0.9}s`,
          }"
        >
          <i v-for="line in 3" :key="line" class="holo-line" :style="{ width: `${80 - line * 15}%` }" />
        </span>
      </template>
      <span
        v-else-if="item.effect === 'search-rings'"
        class="absolute block -translate-x-1/2 opacity-90 motion-safe:animate-office-pulse"
        :style="{ width: 'calc(var(--s) * 34)', left: 'calc(var(--s) * 64)', top: 'calc(var(--s) * -74)' }"
      >
        <GameImage :asset="FX['energy-ring']" />
      </span>

      <!-- Analytics: panel grafik batang hologram + partikel data -->
      <span
        v-else-if="item.effect === 'chart-hologram'"
        class="holo-panel absolute flex items-end gap-[6%] px-[8%] pb-[8%]"
        :style="{
          width: 'calc(var(--s) * 52)',
          height: 'calc(var(--s) * 38)',
          left: 'calc(var(--s) * 46)',
          top: 'calc(var(--s) * -112)',
        }"
      >
        <i
          v-for="bar in 4"
          :key="bar"
          class="holo-bar motion-safe:animate-holo-bars"
          :style="{ height: `${40 + bar * 14}%`, animationDelay: `${bar * 0.18}s` }"
        />
      </span>
      <span
        v-else-if="item.effect === 'data-particles'"
        class="absolute block -translate-x-1/2 motion-safe:animate-office-twinkle"
        :style="{ width: 'calc(var(--s) * 44)', left: 'calc(var(--s) * -44)', top: 'calc(var(--s) * -116)' }"
      >
        <GameImage :asset="FX['particles-purple']" />
      </span>

      <!-- Report Builder: kilau mengetik di tangan + dokumen tersusun -->
      <span
        v-else-if="item.effect === 'typing-glow'"
        class="absolute block rounded-full bg-office-cyan/80 shadow-[0_0_10px_var(--office-cyan)] motion-safe:animate-type-blink"
        :style="{
          width: 'calc(var(--s) * 34)',
          height: 'calc(var(--s) * 4)',
          left: 'calc(var(--s) * -17)',
          top: 'calc(var(--s) * -52)',
        }"
      />
      <template v-else-if="item.effect === 'document-assembly'">
        <span
          v-for="n in 2"
          :key="n"
          class="holo-card absolute block motion-safe:animate-holo-rise"
          :style="{
            width: 'calc(var(--s) * 24)',
            height: 'calc(var(--s) * 30)',
            left: `calc(var(--s) * ${46 + (n - 1) * 10})`,
            top: `calc(var(--s) * ${-110 - (n - 1) * 6})`,
            animationDelay: `${(n - 1) * 1.2}s`,
          }"
        >
          <i v-for="line in 4" :key="line" class="holo-line" :style="{ width: `${85 - line * 12}%` }" />
        </span>
      </template>

      <!-- Data Warehouse: terminal dengan baris yang "diketik" + kontrol alat hologram -->
      <span
        v-else-if="item.effect === 'terminal-lines'"
        class="holo-panel holo-terminal absolute flex flex-col justify-center gap-[9%] px-[9%]"
        :style="{
          width: 'calc(var(--s) * 52)',
          height: 'calc(var(--s) * 34)',
          left: 'calc(var(--s) * 46)',
          top: 'calc(var(--s) * -108)',
        }"
      >
        <i
          v-for="line in 3"
          :key="line"
          class="holo-line origin-left motion-safe:animate-term-line"
          :style="{ width: `${90 - line * 18}%`, animationDelay: `${line * 0.5}s` }"
        />
      </span>
      <span
        v-else-if="item.effect === 'tool-controls'"
        class="absolute block -translate-x-1/2 motion-safe:animate-office-float"
        :style="{ width: 'calc(var(--s) * 32)', left: 'calc(var(--s) * -48)', top: 'calc(var(--s) * -98)' }"
      >
        <GameImage :asset="FX['hologram-cube']" />
      </span>

      <!-- Client Brief: gelembung brief hologram -->
      <span
        v-else-if="item.effect === 'brief-bubble'"
        class="holo-panel absolute flex flex-col justify-center gap-[10%] rounded-[30%_30%_30%_6%] px-[10%]"
        :style="{
          width: 'calc(var(--s) * 46)',
          height: 'calc(var(--s) * 30)',
          left: 'calc(var(--s) * 46)',
          top: 'calc(var(--s) * -114)',
        }"
      >
        <i v-for="line in 2" :key="line" class="holo-line" :style="{ width: `${90 - line * 25}%` }" />
      </span>

      <!-- Knowledge Base: rak buku hologram -->
      <span
        v-else-if="item.effect === 'knowledge-shelf'"
        class="absolute flex items-end gap-[6%]"
        :style="{
          width: 'calc(var(--s) * 50)',
          height: 'calc(var(--s) * 30)',
          left: 'calc(var(--s) * 44)',
          top: 'calc(var(--s) * -108)',
        }"
      >
        <i
          v-for="book in 4"
          :key="book"
          class="holo-book motion-safe:animate-office-float"
          :style="{ height: `${60 + (book % 3) * 15}%`, animationDelay: `${book * 0.35}s` }"
        />
      </span>

      <!-- Final Report: segel kualitas -->
      <span
        v-else-if="item.effect === 'quality-seal'"
        class="absolute grid -translate-x-1/2 place-items-center rounded-full border border-office-mint/70 bg-office-mint/15 text-office-mint shadow-[0_0_14px_var(--office-mint)] motion-safe:animate-office-pulse"
        :style="{
          width: 'calc(var(--s) * 30)',
          height: 'calc(var(--s) * 30)',
          left: 'calc(var(--s) * 62)',
          top: 'calc(var(--s) * -104)',
        }"
      >
        <BadgeCheck class="size-[62%]" />
      </span>

      <!-- Reaksi: persetujuan / selesai / gagal di anchor robot -->
      <span
        v-else-if="item.effect === 'approval-beacon'"
        class="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[50%] border-2 border-office-orange/80 text-office-orange shadow-[0_0_16px_var(--office-orange)] motion-safe:animate-office-pulse"
        :style="{ width: 'calc(var(--s) * 110)', height: 'calc(var(--s) * 44)', left: 0, top: 'calc(var(--s) * 4)' }"
      >
        <Hourglass class="size-[26%] opacity-80" />
      </span>
      <span
        v-else-if="item.effect === 'completion-burst'"
        class="absolute left-0 top-0 block opacity-0 drop-shadow-[0_0_18px_var(--office-mint)] motion-safe:animate-office-burst"
        :style="{ width: 'calc(var(--s) * 120)' }"
      >
        <GameImage :asset="FX['energy-spawn']" />
      </span>
      <span
        v-else-if="item.effect === 'error-flicker'"
        class="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[50%] border-2 border-destructive text-destructive shadow-[0_0_16px_var(--destructive)] motion-safe:animate-error-flicker"
        :style="{ width: 'calc(var(--s) * 100)', height: 'calc(var(--s) * 40)', left: 0, top: 'calc(var(--s) * 4)' }"
      >
        <TriangleAlert class="size-[26%]" />
      </span>
    </span>
  </div>
</template>

<style scoped>
/* Glyph hologram prosedural (bukan artwork pulau/robot): panel, kartu dokumen, batang grafik, buku. */
.holo-panel {
  border: 1px solid color-mix(in oklch, var(--office-cyan) 70%, transparent);
  border-radius: 12%;
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--office-cyan) 22%, transparent), transparent 70%),
    color-mix(in oklch, var(--office-bg) 55%, transparent);
  box-shadow:
    0 0 14px color-mix(in oklch, var(--office-cyan) 45%, transparent),
    inset 0 0 10px color-mix(in oklch, var(--office-cyan) 25%, transparent);
  backdrop-filter: none;
}
.holo-terminal {
  border-color: color-mix(in oklch, var(--office-mint) 70%, transparent);
  box-shadow:
    0 0 14px color-mix(in oklch, var(--office-mint) 40%, transparent),
    inset 0 0 10px color-mix(in oklch, var(--office-mint) 22%, transparent);
}
.holo-terminal .holo-line {
  background: color-mix(in oklch, var(--office-mint) 85%, white);
}
.holo-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10%;
  padding: 0 12%;
  border: 1px solid color-mix(in oklch, var(--office-cyan) 65%, transparent);
  border-radius: 10%;
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--office-cyan) 30%, transparent),
    color-mix(in oklch, var(--office-cyan) 8%, transparent)
  );
  box-shadow: 0 0 12px color-mix(in oklch, var(--office-cyan) 45%, transparent);
  opacity: 0;
}
.holo-line {
  display: block;
  height: 8%;
  min-height: 1px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--office-cyan) 85%, white);
}
.holo-bar {
  display: block;
  flex: 1;
  transform-origin: bottom;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg, var(--office-cyan), color-mix(in oklch, var(--office-purple) 70%, transparent));
  box-shadow: 0 0 8px color-mix(in oklch, var(--office-cyan) 60%, transparent);
}
.holo-book {
  display: block;
  flex: 1;
  border: 1px solid color-mix(in oklch, var(--office-cyan) 60%, transparent);
  border-radius: 8%;
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--office-purple) 60%, transparent),
    color-mix(in oklch, var(--office-cyan) 25%, transparent)
  );
  box-shadow: 0 0 10px color-mix(in oklch, var(--office-purple) 50%, transparent);
}
</style>
