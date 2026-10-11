<script setup lang="ts">
import { Box, Eye, EyeOff, Hexagon, Menu, Plus, Settings, Target, Zap } from '@lucide/vue'
import type { OfficeRealtimeEvent, RealtimeConnectionState } from '~~/domains/office/realtime'
import { PREVIEW_HUD, type MissionViewModel } from '~/utils/office-preview'

/**
 * Z8: HUD atas bergaya game (referensi: ui-previews/top-status-hud.png).
 *
 * Kiri: identitas game, perusahaan & commander, level/XP. Tengah: kapasitas,
 * kredit, compute. Kanan: mode pratinjau, progres misi, notifikasi,
 * pengaturan, menu game.
 *
 * Mode live hanya memakai data nyata; yang belum didukung backend (level, XP,
 * kredit, compute) tampil "—". Mode pratinjau memakai angka contoh lembar
 * konsep dengan label DEMO.
 */
const props = defineProps<{
  tenantName: string
  userName: string
  roleLabel: string
  preview: boolean
  activeAgents: number
  employedAgents: number
  mission: MissionViewModel
  realtimeState: RealtimeConnectionState
  realtimeLastEvent: OfficeRealtimeEvent | null
}>()

const emit = defineEmits<{ togglePreview: []; openMenu: [] }>()

const number = new Intl.NumberFormat('id-ID')
const companyInitials = computed(() => initialsOf(props.tenantName))
const xpPercent = computed(() => (props.preview ? Math.round((PREVIEW_HUD.xp / PREVIEW_HUD.xpTarget) * 100) : 0))
const capacityPercent = computed(() => {
  if (props.preview) return Math.round((PREVIEW_HUD.energy / PREVIEW_HUD.energyMax) * 100)
  return props.employedAgents === 0 ? 0 : Math.round((props.activeAgents / props.employedAgents) * 100)
})

const resources = computed(() => [
  {
    key: 'capacity',
    icon: Zap,
    tone: 'text-office-cyan drop-shadow-[0_0_6px_var(--office-cyan)]',
    label: props.preview ? 'Energi' : 'AI aktif',
    value: props.preview
      ? `${PREVIEW_HUD.energy}/${PREVIEW_HUD.energyMax}`
      : `${props.activeAgents}/${props.employedAgents}`,
    hint: props.preview ? 'Nilai contoh pratinjau' : 'AI employee aktif / terdaftar (data nyata)',
    bar: true,
  },
  {
    key: 'credits',
    icon: Hexagon,
    tone: 'text-office-orange drop-shadow-[0_0_6px_var(--office-orange)]',
    label: 'Kredit',
    value: props.preview ? number.format(PREVIEW_HUD.credits) : '—',
    hint: props.preview ? 'Nilai contoh pratinjau' : 'Belum tersedia — modul tagihan hadir di Wave 2',
    bar: false,
  },
  {
    key: 'compute',
    icon: Box,
    tone: 'text-[color-mix(in_oklch,var(--office-purple)_75%,white)] drop-shadow-[0_0_6px_var(--office-purple)]',
    label: 'Compute',
    value: props.preview ? number.format(PREVIEW_HUD.compute) : '—',
    hint: props.preview ? 'Nilai contoh pratinjau' : 'Belum tersedia — kuota compute hadir bersama runtime AI',
    bar: false,
  },
])
</script>

<template>
  <header class="office-hud pointer-events-none absolute inset-x-0 top-0 z-[80]" aria-label="HUD Virtual Office">
    <div class="hud-strip pointer-events-auto">
      <div class="hud-card commander-card">
        <span class="commander-crest" aria-hidden="true">{{ companyInitials }}</span>
        <span
          class="shrink-0 font-heading text-lg font-bold tabular-nums md:text-xl"
          :title="preview ? 'Level contoh simulasi' : 'Level belum tersedia'"
        >
          Lv. {{ preview ? PREVIEW_HUD.level : '—' }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate text-sm font-bold" :title="`${tenantName} · ${userName}`">Commander</p>
            <span class="hidden shrink-0 text-xs font-semibold tabular-nums text-blue-200 md:inline">
              {{ preview ? `${number.format(PREVIEW_HUD.xp)} / ${number.format(PREVIEW_HUD.xpTarget)} XP` : 'XP —' }}
            </span>
          </div>
          <div :class="['commander-track mt-1.5', !preview ? 'border-dashed' : '']" aria-hidden="true">
            <div v-if="preview" class="office-bar h-full rounded-full" :style="{ width: `${xpPercent}%` }" />
          </div>
          <p class="sr-only">
            {{ tenantName }} · {{ userName }}.
            {{
              preview
                ? `Simulasi: level ${PREVIEW_HUD.level}, XP contoh`
                : `Peran ${roleLabel}. Level dan XP belum tersedia.`
            }}
          </p>
        </div>
      </div>

      <Tooltip v-for="resource in resources" :key="resource.key">
        <TooltipTrigger as-child>
          <div class="hud-card resource-card hidden lg:flex" tabindex="0">
            <component :is="resource.icon" :class="['size-8 shrink-0', resource.tone]" aria-hidden="true" />
            <div class="min-w-0 flex-1 leading-tight">
              <p class="text-xs font-semibold text-blue-100">{{ resource.label }}</p>
              <p
                :class="[
                  'font-heading text-lg font-bold tabular-nums',
                  resource.key === 'capacity' ? 'text-office-cyan' : 'text-white',
                ]"
              >
                {{ resource.value }}
              </p>
              <span v-if="resource.bar" class="sr-only">Kapasitas {{ capacityPercent }}%</span>
            </div>
            <span class="resource-plus hidden 2xl:grid" aria-hidden="true"><Plus class="size-5" /></span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{{ resource.hint }}</TooltipContent>
      </Tooltip>

      <div class="hud-card mission-progress hidden md:flex" aria-label="Progres misi">
        <Target class="size-8 shrink-0 text-office-cyan drop-shadow-[0_0_8px_var(--office-cyan)]" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center justify-between gap-2 text-xs font-semibold text-blue-100">
            <span>Progres misi</span>
            <span class="tabular-nums">{{ mission.completed }} / {{ mission.total }}</span>
          </p>
          <div class="commander-track mt-1.5" aria-hidden="true">
            <div class="office-bar-mint h-full rounded-full" :style="{ width: `${mission.progress}%` }" />
          </div>
          <span v-if="mission.preview" class="sr-only">Progres simulasi</span>
        </div>
      </div>

      <div class="hud-actions flex shrink-0 items-center gap-1 md:gap-2">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              size="icon"
              :variant="preview ? 'default' : 'ghost'"
              :class="[
                'mode-button size-9 rounded-lg',
                preview ? 'bg-office-orange/15 text-office-orange hover:bg-office-orange/25' : 'text-blue-200',
              ]"
              :aria-pressed="preview"
              :aria-label="preview ? 'Keluar pratinjau' : 'Pratinjau desain'"
              data-preview-toggle
              @click="emit('togglePreview')"
            >
              <component :is="preview ? EyeOff : Eye" class="size-5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ preview ? 'SIMULASI · Keluar pratinjau' : 'Pratinjau desain kantor' }}</TooltipContent>
        </Tooltip>
        <NotificationTrigger />
        <Button
          variant="ghost"
          size="icon"
          class="hidden size-10 rounded-lg text-blue-300 hover:text-office-cyan xl:inline-flex"
          as-child
        >
          <NuxtLink to="/settings" aria-label="Pengaturan"><Settings class="size-7" aria-hidden="true" /></NuxtLink>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-10 rounded-lg text-blue-300 hover:text-office-cyan"
          aria-label="Buka menu game"
          data-game-menu
          @click="emit('openMenu')"
        >
          <Menu class="size-7" aria-hidden="true" />
        </Button>
      </div>
    </div>
    <span v-if="preview" class="hud-simulation-label">SIMULASI</span>
    <div v-else class="absolute right-3 top-[68px] pointer-events-auto">
      <RealtimeIndicator :state="realtimeState" :last-event="realtimeLastEvent" variant="inline" />
    </div>
  </header>
</template>

<style scoped>
.office-hud {
  padding: 4px 10px 0;
  color: #f5f8ff;
  background: linear-gradient(180deg, #081d4dde, #123771a8 82%, transparent);
  border-bottom: 2px solid #567cff94;
}

.hud-strip {
  display: flex;
  gap: 7px;
  align-items: center;
  height: 59px;
}

.hud-card {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 53px;
  min-width: 0;
  padding: 7px 12px;
  border: 1px solid #658cdb8a;
  border-radius: 14px;
  background: linear-gradient(160deg, #102b60, #061738 76%);
  box-shadow:
    inset 0 0 0 3px #1d3a675c,
    0 3px 0 #03102b8c;
}

.commander-card {
  flex: 1.7;
  gap: 12px;
  padding-left: 5px;
  border-radius: 12px 12px 25px 12px;
}

.commander-crest {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 46px;
  height: 47px;
  color: white;
  font-size: 15px;
  font-weight: 800;
  background: radial-gradient(circle, #8539b5 12%, #102757 64%);
  border: 2px solid #76f3ff;
  clip-path: polygon(50% 0, 91% 20%, 100% 68%, 65% 100%, 21% 91%, 0 50%, 13% 13%);
  filter: drop-shadow(0 0 8px #2ae9ff);
}

.commander-track {
  height: 12px;
  overflow: hidden;
  border: 1px solid #779dd08c;
  border-radius: 99px;
  background: #1d3154;
  box-shadow: inset 0 2px 3px #030d29b3;
}

.resource-card {
  flex: 0.72;
  min-width: 125px;
}

.resource-plus {
  place-items: center;
  width: 31px;
  height: 33px;
  flex-shrink: 0;
  border: 1px solid #366ac2;
  border-radius: 7px;
  color: #53ecff;
  background: linear-gradient(#1d4e87, #16498f);
}

.mission-progress {
  flex: 1.15;
  min-width: 165px;
}

.hud-simulation-label {
  position: absolute;
  top: 65px;
  left: 50%;
  transform: translateX(-50%);
  border: 1px solid #dca94899;
  border-radius: 0 0 6px 6px;
  padding: 2px 9px;
  color: #ffe0a1;
  background: #0d214bed;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

@media (max-width: 1023px) {
  .hud-card.resource-card {
    display: none;
  }
}

@media (max-width: 767px) {
  .office-hud {
    padding: 3px 5px 0;
  }
  .hud-strip {
    height: 55px;
    gap: 4px;
  }
  .hud-card {
    height: 48px;
    padding: 5px 7px;
  }
  .commander-card {
    gap: 7px;
  }
  .commander-crest {
    width: 35px;
    height: 39px;
    font-size: 11px;
  }
  .mission-progress {
    display: none;
  }
  .commander-track {
    height: 9px;
  }
  .hud-simulation-label {
    top: 59px;
  }
}
</style>
