<script setup lang="ts">
import {
  Bot,
  Check,
  ChevronsUp,
  Database,
  Ellipsis,
  FileText,
  Globe,
  Info,
  Link2,
  Maximize,
  Minus,
  Network,
  Pause,
  Play,
  Plus,
  Sheet,
  Zap,
} from '@lucide/vue'
import type { Component } from 'vue'
import { toast } from 'vue-sonner'
import { ATLAS_PHASES, type SimulationSnapshot } from '~/game/simulation'

const props = defineProps<{
  zoomLevel: number
  preview?: boolean
  simulation?: SimulationSnapshot | null
}>()
const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  resetCamera: []
  startSimulation: []
  pauseSimulation: []
  resumeSimulation: []
}>()

interface GameCommand {
  key: string
  label: string
  shortcut: string
  alias: string
  icon: Component
  tone: string
  reason: string
}

const COMMANDS: GameCommand[] = [
  {
    key: 'deploy',
    label: 'Deploy Agent',
    shortcut: 'Q',
    alias: '1',
    icon: Plus,
    tone: 'cyan',
    reason: 'Perekrutan AI employee hadir bersama Robot Marketplace (Wave 2).',
  },
  {
    key: 'connect',
    label: 'Connect Tool',
    shortcut: 'W',
    alias: '2',
    icon: Link2,
    tone: 'blue',
    reason: 'Integrasi alat membutuhkan AI Runtime Interface yang belum tersedia.',
  },
  {
    key: 'approve',
    label: 'Approve Task',
    shortcut: 'E',
    alias: '3',
    icon: Check,
    tone: 'green',
    reason: 'Alur persetujuan tugas hadir bersama Agent Orchestrator.',
  },
  {
    key: 'automate',
    label: 'Automate',
    shortcut: 'R',
    alias: '4',
    icon: Zap,
    tone: 'purple',
    reason: 'Otomasi alur kerja hadir setelah modul tugas & run tersedia.',
  },
  {
    key: 'upgrade',
    label: 'Upgrade',
    shortcut: 'T',
    alias: '5',
    icon: ChevronsUp,
    tone: 'steel',
    reason: 'Peningkatan lisensi robot hadir bersama Robot Marketplace.',
  },
  {
    key: 'pause',
    label: 'Pause',
    shortcut: 'Space',
    alias: '6',
    icon: Pause,
    tone: 'indigo',
    reason: 'Mengubah status AI employee belum didukung API (Phase 1 read-only).',
  },
]

const TOOLS = [
  { label: 'Web', icon: Globe, tone: 'text-blue-400' },
  { label: 'Docs', icon: FileText, tone: 'text-sky-300' },
  { label: 'Sheets', icon: Sheet, tone: 'text-emerald-300' },
  { label: 'DB', icon: Database, tone: 'text-violet-200' },
  { label: 'API', icon: Network, tone: 'text-fuchsia-400' },
  { label: 'More', icon: Ellipsis, tone: 'text-blue-300' },
]

const simulationActive = computed(() => props.preview && props.simulation)
const paused = computed(() => props.simulation?.status === 'paused')
const progress = computed(() => {
  if (!simulationActive.value || !props.simulation) return 0
  if (props.simulation.status === 'completed') return 100
  return Math.round((Math.max(0, props.simulation.phaseIndex) / ATLAS_PHASES.length) * 100)
})

function available(command: GameCommand) {
  if (!simulationActive.value) return false
  if (command.key === 'automate') return true
  return command.key === 'pause' && ['running', 'paused'].includes(props.simulation?.status ?? '')
}

function explanation(command: GameCommand) {
  if (simulationActive.value && command.key === 'pause') {
    return available(command)
      ? 'Jeda atau lanjutkan simulasi. Tidak mengubah status AI employee nyata.'
      : 'Mulai simulasi Project Atlas sebelum menjeda.'
  }
  if (available(command)) {
    return 'Mulai atau lanjutkan simulasi Project Atlas. Tidak menjalankan pekerjaan nyata.'
  }
  return command.reason
}

function activate(command: GameCommand) {
  if (!available(command)) {
    toast.info(`${command.label} belum tersedia`, { description: explanation(command) })
    return
  }
  if (props.simulation?.status === 'running') {
    if (command.key === 'pause') emit('pauseSimulation')
    else toast.info('Simulasi Project Atlas sedang berjalan')
  } else if (props.simulation?.status === 'paused') {
    emit('resumeSimulation')
  } else {
    emit('startSimulation')
  }
}

function onShortcut(key: string) {
  const normalized = key === ' ' ? 'SPACE' : key.toUpperCase()
  const command = COMMANDS.find((item) => item.shortcut.toUpperCase() === normalized || item.alias === key)
  if (command) activate(command)
}

defineExpose({ onShortcut })
</script>

<template>
  <footer class="command-dock" aria-label="Kontrol kantor" data-command-dock>
    <section class="dock-tools" aria-label="Tools & Integrations">
      <h2>Tools &amp; Integrations</h2>
      <ul class="tool-list">
        <li v-for="tool in TOOLS" :key="tool.label">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                class="tool-shortcut"
                type="button"
                aria-disabled="true"
                :aria-label="`${tool.label}: integrasi belum terhubung`"
                @click="
                  toast.info('Integrasi belum terhubung', {
                    description: 'Koneksi alat hadir bersama AI Runtime Interface.',
                  })
                "
              >
                <span class="tool-tile"><component :is="tool.icon" :class="tool.tone" aria-hidden="true" /></span>
                <span>{{ tool.label }}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{{ tool.label }} · integrasi belum terhubung</TooltipContent>
          </Tooltip>
        </li>
      </ul>
    </section>

    <nav class="dock-actions" aria-label="Aksi kantor">
      <ul>
        <li v-for="command in COMMANDS" :key="command.key">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                :class="['dock-command', `dock-command--${command.tone}`]"
                :aria-disabled="!available(command)"
                :aria-keyshortcuts="`${command.shortcut} ${command.alias}`"
                :aria-describedby="`command-reason-${command.key}`"
                :data-command="command.key"
                @click="activate(command)"
              >
                <component
                  :is="command.key === 'pause' && paused ? Play : command.icon"
                  class="command-icon"
                  aria-hidden="true"
                />
                <span class="command-label">{{ command.key === 'pause' && paused ? 'Resume' : command.label }}</span>
                <span v-if="available(command)" class="command-mode">SIMULASI</span>
                <kbd>{{ command.shortcut }}</kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" class="max-w-64">{{ explanation(command) }}</TooltipContent>
          </Tooltip>
          <span :id="`command-reason-${command.key}`" class="sr-only">{{ explanation(command) }}</span>
        </li>
      </ul>
    </nav>

    <section class="dock-meter" aria-label="Status dan kamera">
      <div class="meter-heading">
        <h2>{{ simulationActive ? 'Simulation Progress' : 'Automation Meter' }}</h2>
        <Tooltip>
          <TooltipTrigger as-child>
            <Info class="size-4 text-blue-300" tabindex="0" aria-label="Informasi status" />
          </TooltipTrigger>
          <TooltipContent side="top" class="max-w-60">
            {{
              simulationActive
                ? 'Kemajuan timeline simulasi, bukan pekerjaan nyata.'
                : 'Automation Meter menunggu integrasi Agent Orchestrator.'
            }}
          </TooltipContent>
        </Tooltip>
      </div>
      <div class="meter-body">
        <Bot class="meter-bot" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <div class="meter-row">
            <div
              class="meter-track"
              role="progressbar"
              :aria-valuenow="progress"
              :aria-valuemin="0"
              :aria-valuemax="100"
              :aria-label="simulationActive ? 'Kemajuan simulasi' : 'Otomasi belum terhubung'"
            >
              <span :style="{ width: `${progress}%` }" />
            </div>
            <strong>{{ simulationActive ? `${progress}%` : '—' }}</strong>
          </div>
          <p>{{ simulationActive ? 'SIMULASI · Project Atlas' : 'Orchestrator belum terhubung' }}</p>
        </div>
      </div>
      <div class="camera-controls" role="group" aria-label="Kamera">
        <Button
          variant="ghost"
          size="icon"
          class="size-6 rounded-md"
          aria-label="Perkecil peta"
          aria-keyshortcuts="-"
          @click="emit('zoomOut')"
        >
          <Minus class="size-3" aria-hidden="true" />
        </Button>
        <span class="text-[10px] tabular-nums" aria-live="polite">{{ Math.round(props.zoomLevel * 100) }}%</span>
        <Button
          variant="ghost"
          size="icon"
          class="size-6 rounded-md"
          aria-label="Perbesar peta"
          aria-keyshortcuts="+"
          @click="emit('zoomIn')"
        >
          <Plus class="size-3" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-6 rounded-md"
          aria-label="Kembali ke peta penuh"
          aria-keyshortcuts="0"
          @click="emit('resetCamera')"
        >
          <Maximize class="size-3" aria-hidden="true" />
        </Button>
      </div>
    </section>
  </footer>
</template>

<style scoped>
.command-dock {
  position: absolute;
  inset: auto 0 0;
  z-index: 90;
  display: grid;
  grid-template-columns: minmax(220px, 23%) minmax(0, 1fr) minmax(220px, 22%);
  gap: 12px;
  height: 132px;
  padding: 9px 12px 10px;
  color: #edf4ff;
  background: linear-gradient(180deg, #122d5bef, #071630fa);
  border-top: 2px solid #68a6e9;
  box-shadow:
    0 -4px 25px #04133d8f,
    inset 0 2px 0 #142958;
}
.dock-tools,
.dock-meter {
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #456aaf;
  border-radius: 15px;
  background: linear-gradient(155deg, #0b2447, #08172feb);
  box-shadow: inset 0 0 0 1px #2f529344;
}
.dock-tools h2,
.dock-meter h2 {
  color: #91dcff;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 700;
}
.tool-list {
  display: flex;
  justify-content: space-between;
  gap: 7px;
  margin-top: 11px;
}
.tool-shortcut {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  cursor: help;
}
.tool-tile {
  display: grid;
  place-items: center;
  width: 37px;
  height: 38px;
  border: 1px solid #436bb0;
  border-radius: 8px;
  background: linear-gradient(135deg, #18386b, #0a1a39);
  box-shadow:
    inset 0 1px 1px #5c8aca40,
    0 2px 3px #030e28;
}
.tool-tile svg {
  width: 22px;
  height: 22px;
  filter: drop-shadow(0 0 5px #288bf8a3);
}
.dock-actions {
  min-width: 0;
  padding: 6px 6px 17px;
  border: 1px solid #315887;
  border-radius: 15px;
  background: #061b39ba;
}
.dock-actions ul {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 9px;
  height: 100%;
}
.dock-command {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid #8cbbf6;
  border-radius: 9px;
  background: linear-gradient(180deg, var(--command-top), var(--command-bottom));
  box-shadow:
    inset 0 0 0 2px #ffffff12,
    inset 0 2px 0 #ffffff40,
    0 3px 0 #020c23,
    0 0 9px #2375cb44;
  text-shadow: 0 2px 3px #032867;
  transition:
    filter 150ms,
    transform 150ms;
  cursor: pointer;
}
.dock-command:hover {
  filter: brightness(1.15);
}
.dock-command:active {
  transform: translateY(1px);
}
.dock-command:focus-visible,
.tool-shortcut:focus-visible {
  outline: 2px solid #a5efff;
  outline-offset: 3px;
}
.dock-command--cyan {
  --command-top: #29c5ed;
  --command-bottom: #0566e3;
}
.dock-command--blue {
  --command-top: #328fdd;
  --command-bottom: #0964cb;
}
.dock-command--green {
  --command-top: #52d719;
  --command-bottom: #039434;
  border-color: #79e667;
}
.dock-command--purple {
  --command-top: #7544ed;
  --command-bottom: #3b1dcb;
  border-color: #ae82ff;
}
.dock-command--steel {
  --command-top: #348bba;
  --command-bottom: #124b85;
}
.dock-command--indigo {
  --command-top: #447dd7;
  --command-bottom: #253d8e;
}
.command-icon {
  width: 31px;
  height: 31px;
  stroke-width: 3;
  filter: drop-shadow(0 2px 2px #07337655);
}
.command-label {
  font-size: clamp(10px, 0.85vw, 14px);
  line-height: 1.1;
  font-weight: 700;
  white-space: nowrap;
}
.command-mode {
  position: absolute;
  top: 4px;
  font-size: 6px;
  letter-spacing: 0.12em;
  opacity: 0.85;
}
.dock-command kbd {
  position: absolute;
  bottom: -14px;
  min-width: 20px;
  padding: 2px 4px;
  border: 1px solid #315388;
  border-radius: 5px;
  background: #10274b;
  color: #badbff;
  font-size: 10px;
  font-family: inherit;
  line-height: 1;
  text-shadow: none;
}
.dock-meter {
  position: relative;
  padding-bottom: 22px;
}
.meter-heading,
.meter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.meter-heading {
  padding-bottom: 7px;
  border-bottom: 1px solid #2565906b;
}
.meter-body {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.meter-bot {
  width: 35px;
  height: 35px;
  flex-shrink: 0;
  color: #11ddd6;
  filter: drop-shadow(0 0 6px #0ee9d480);
}
.meter-track {
  height: 14px;
  flex: 1;
  overflow: hidden;
  border: 1px solid #567bb4;
  border-radius: 6px;
  background: repeating-linear-gradient(90deg, #20385c 0 10%, #071a37 10% 11%);
}
.meter-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: repeating-linear-gradient(90deg, #2cf0c3 0 20px, #00b7d7 20px 22px);
  box-shadow: 0 0 8px #18efcf;
  transition: width 250ms;
}
.meter-row strong {
  font-size: 16px;
  line-height: 1;
}
.meter-body p {
  margin-top: 5px;
  color: #a7c5ec;
  font-size: 10px;
  white-space: nowrap;
}
.camera-controls {
  position: absolute;
  right: 7px;
  bottom: 1px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #9ac9fa;
}
@media (max-width: 1199px) {
  .command-dock {
    grid-template-columns: minmax(0, 1fr) 240px;
    height: 112px;
  }
  .dock-tools {
    display: none;
  }
  .command-label {
    font-size: 11px;
  }
}
@media (max-width: 767px) {
  .command-dock {
    grid-template-columns: minmax(0, 1fr);
    height: 90px;
    padding: 5px 5px 7px;
  }
  .dock-meter {
    display: none;
  }
  .dock-actions {
    padding: 3px 3px 14px;
    border-radius: 10px;
  }
  .dock-actions ul {
    gap: 5px;
  }
  .dock-command {
    gap: 5px;
    border-radius: 7px;
  }
  .command-icon {
    width: 23px;
    height: 23px;
  }
  .command-label {
    font-size: 8px;
  }
  .command-mode {
    font-size: 5px;
    top: 2px;
  }
  .dock-command kbd {
    bottom: -12px;
    font-size: 8px;
  }
}
</style>
