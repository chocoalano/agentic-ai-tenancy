<script setup lang="ts">
import { ArrowUpRight, ChevronUp, Crosshair, Eye, Users } from '@lucide/vue'
import { CHARACTERS, CHARACTER_KEYS, ICONS, centeringShift } from '~/utils/game-assets'
import { MISSION_HUB, STATIONS } from '~/utils/office-layout'
import type { RosterEntry } from '~/utils/office-preview'
import type { OfficeSelection } from '~/types/office'

/**
 * HUD roster (kanan) — referensi: ui-previews/agent-roster.png.
 *
 * Mode live: AI employee nyata (nama, peran, status siklus hidup, stasiun).
 * Level/XP/progres belum didukung backend → tidak ditampilkan sebagai angka.
 * Tenant tanpa agent → blok jujur "0 AI employee" + ajakan melihat pratinjau.
 * Mode pratinjau: Nova, Sage, Pixel, Bolt, Echo dengan level/XP contoh (DEMO).
 */
const props = withDefaults(
  defineProps<{
    entries: RosterEntry[]
    preview: boolean
    realCount: number
    activeCount: number
    selection: OfficeSelection | null
    collapsed?: boolean
    variant?: 'floating' | 'sheet'
  }>(),
  { collapsed: false, variant: 'floating' },
)

const emit = defineEmits<{ toggle: []; select: [selection: OfficeSelection]; togglePreview: [] }>()

const contentId = useId()
const displayedEntries = computed(() =>
  props.preview
    ? [...props.entries].sort(
        (first, second) => CHARACTER_KEYS.indexOf(first.character) - CHARACTER_KEYS.indexOf(second.character),
      )
    : props.entries,
)
const stationLabels = new Map<string, string>([
  ...STATIONS.map((station) => [station.id, station.label] as const),
  ['mission-hub', MISSION_HUB.label],
])

const ROLE_TONE: Record<string, string> = {
  nova: 'text-[oklch(0.86_0.03_250)]',
  sage: 'text-office-mint',
  pixel: 'text-[color-mix(in_oklch,var(--office-purple)_65%,white)]',
  bolt: 'text-office-orange',
  echo: 'text-office-cyan',
}

function isSelected(entry: RosterEntry): boolean {
  return props.selection?.kind === 'actor' && props.selection.key === entry.key
}

function stationOf(entry: RosterEntry): string {
  if (entry.lifecycle === 'archived') return 'Tidak di lantai kantor'
  return entry.stationId ? (stationLabels.get(entry.stationId) ?? '') : 'Belum mendapat stasiun'
}
</script>

<template>
  <button
    v-if="variant === 'floating' && collapsed"
    type="button"
    class="hud-panel flex items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-office-cyan"
    :aria-expanded="false"
    :aria-controls="contentId"
    aria-label="Tampilkan daftar agent"
    @click="emit('toggle')"
  >
    <GameImage :asset="ICONS.user" class="w-8 rounded-lg" />
    <span class="leading-tight">
      <span class="block text-[10px] font-semibold uppercase tracking-[0.16em] text-office-cyan">Agent</span>
      <span class="block text-sm font-bold tabular-nums">{{ entries.length }}</span>
    </span>
  </button>

  <section
    v-else
    :id="contentId"
    :class="['agent-roster flex min-h-0 flex-col', variant === 'floating' ? 'hud-panel max-h-full w-full' : '']"
    aria-labelledby="agent-roster-title"
    data-agent-roster
  >
    <header class="roster-heading flex items-center gap-2.5">
      <Users class="size-7 text-office-cyan drop-shadow-[0_0_6px_var(--office-cyan)]" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <h2 id="agent-roster-title" class="font-heading text-lg font-bold leading-tight">
          {{ preview ? 'Agents' : 'AI Employee' }}
        </h2>
        <p class="text-[9px] font-semibold tracking-wide text-blue-200/85">
          <template v-if="preview"> <span class="text-office-orange">SIMULASI</span> · Karakter contoh </template>
          <template v-else>
            <span class="tabular-nums">{{ activeCount }}</span> aktif ·
            <span class="tabular-nums">{{ realCount }}</span> terdaftar
          </template>
        </p>
      </div>
      <span class="shrink-0 text-sm font-semibold tabular-nums text-blue-200">
        {{ preview ? entries.length : activeCount }} / {{ preview ? entries.length : realCount }}
      </span>
      <Button
        v-if="variant === 'floating'"
        variant="ghost"
        size="icon"
        class="size-7 shrink-0 rounded-lg"
        :aria-expanded="true"
        :aria-controls="contentId"
        aria-label="Ciutkan daftar agent"
        @click="emit('toggle')"
      >
        <ChevronUp class="size-5 text-blue-300" aria-hidden="true" />
      </Button>
    </header>

    <ul v-if="entries.length > 0" class="roster-list min-h-0 space-y-1.5 overflow-y-auto">
      <li v-for="entry in displayedEntries" :key="entry.key">
        <div
          :class="[
            'roster-entry group/entry relative flex items-center gap-2.5 rounded-xl border transition-colors',
            isSelected(entry)
              ? 'border-office-cyan bg-office-cyan/15 shadow-[0_0_16px_oklch(0.8_0.14_215/30%)]'
              : 'border-blue-400/35 bg-[linear-gradient(135deg,#112b54,#0a1938)] hover:border-office-cyan/60 hover:bg-office-cyan/8',
          ]"
        >
          <button
            type="button"
            class="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-office-cyan"
            :aria-pressed="isSelected(entry)"
            :aria-label="`${entry.name}${entry.preview ? ' (karakter pratinjau)' : ''}, ${entry.roleTitle}. ${entry.statusLabel}. ${stationOf(entry)}.`"
            @click="emit('select', { kind: 'actor', key: entry.key })"
          />
          <span class="agent-portrait pointer-events-none relative grid shrink-0 place-items-center" aria-hidden="true">
            <AgentSprite
              :character="entry.character"
              :status="entry.lifecycle"
              class="w-full"
              :style="{ transform: `translateX(${centeringShift(CHARACTERS[entry.character])})` }"
            />
          </span>
          <span class="pointer-events-none min-w-0 flex-1">
            <span class="flex items-baseline gap-1.5">
              <span class="truncate font-heading text-[14px] font-bold">{{ entry.name }}</span>
              <span :class="['min-w-0 flex-1 truncate text-[11px] font-semibold', ROLE_TONE[entry.character]]">{{
                entry.roleTitle
              }}</span>
              <span v-if="entry.preview" class="shrink-0 text-[11px] font-semibold tabular-nums text-blue-100"
                >Lv.{{ entry.level }}</span
              >
            </span>
            <template v-if="entry.preview">
              <span class="mt-1 flex items-center gap-2">
                <span class="agent-xp-track h-2.5 min-w-0 flex-1 overflow-hidden rounded-full">
                  <span class="office-bar-mint block h-full rounded-full" :style="{ width: `${entry.xp ?? 0}%` }" />
                </span>
                <span class="shrink-0 text-[10px] font-semibold tabular-nums text-blue-100">
                  {{ entry.xp }} / 100
                </span>
              </span>
              <span class="mt-2 block truncate text-[11px] text-blue-100">{{ entry.statusLabel }}</span>
            </template>
            <template v-else>
              <span class="mt-1 flex items-center gap-1.5">
                <OfficeStatusBadge :lifecycle="entry.lifecycle ?? undefined" />
                <span class="truncate text-[11px] text-muted-foreground">{{ stationOf(entry) }}</span>
              </span>
            </template>
          </span>
          <span v-if="!entry.preview" class="relative flex shrink-0 flex-col gap-1">
            <span
              class="pointer-events-none grid size-6 place-items-center rounded-md border border-white/10 bg-white/5 text-muted-foreground group-hover/entry:text-office-cyan"
              aria-hidden="true"
            >
              <Crosshair class="size-3.5" />
            </span>
            <NuxtLink
              :to="`/agents/${entry.key}`"
              class="grid size-6 place-items-center rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:text-office-cyan"
              :aria-label="`Buka profil ${entry.name}`"
            >
              <ArrowUpRight class="size-3.5" aria-hidden="true" />
            </NuxtLink>
          </span>
        </div>
      </li>
    </ul>

    <div v-else class="m-3 rounded-xl border border-dashed border-office-cyan/35 bg-[oklch(0.16_0.05_266/70%)] p-3">
      <p class="font-heading text-2xl font-bold tabular-nums">0</p>
      <p class="text-sm font-semibold">AI employee direkrut</p>
      <p class="mt-1 text-xs text-muted-foreground">
        Kantor ini belum memiliki AI employee. Lihat pratinjau untuk melihat kantor yang sudah terisi — karakternya
        contoh, bukan agent nyata.
      </p>
      <Button
        size="sm"
        class="mt-2.5 w-full gap-1.5 bg-office-orange text-[oklch(0.2_0.05_70)] hover:bg-office-orange/90"
        @click="emit('togglePreview')"
      >
        <Eye class="size-4" aria-hidden="true" />
        Lihat pratinjau kantor
      </Button>
    </div>

    <p v-if="!preview && entries.length > 0" class="px-3 pb-2 text-[10.5px] leading-relaxed text-blue-200/80">
      Level, XP, dan tugas aktif tampil setelah orchestrator terhubung.
    </p>
    <NuxtLink
      v-if="!preview"
      to="/agents"
      class="inline-flex items-center gap-1 px-3 pb-3 text-xs font-medium text-office-cyan hover:underline"
    >
      Semua AI employee <ArrowUpRight class="size-3" aria-hidden="true" />
    </NuxtLink>
  </section>
</template>

<style scoped>
.agent-roster {
  overflow: hidden;
  color: #f5f8ff;
}
.roster-heading {
  min-height: 54px;
  padding: 10px 12px;
  border-bottom: 1px solid #6288cb5c;
}
.roster-list {
  padding: 7px;
}
.roster-entry {
  min-height: 99px;
  padding: 6px 7px 6px 3px;
  box-shadow: inset 0 1px 0 #72b5ff0d;
}
.agent-portrait {
  width: 71px;
  height: 82px;
  filter: drop-shadow(0 2px 6px #22bbff30);
}
.agent-xp-track {
  border: 1px solid #789ac78c;
  background: #213c62;
  box-shadow: inset 0 2px 3px #050f298c;
}

@media (min-width: 1600px) {
  .roster-entry {
    min-height: 105px;
  }
  .agent-portrait {
    width: 78px;
    height: 88px;
  }
}

@media (max-height: 780px) and (min-width: 1280px) {
  .roster-heading {
    min-height: 46px;
    padding-block: 7px;
  }
  .roster-entry {
    min-height: 82px;
    padding-block: 4px;
  }
  .agent-portrait {
    width: 62px;
    height: 70px;
  }
  .roster-list {
    padding: 6px;
  }
}
</style>
