<script setup lang="ts">
import { CircleCheck, Hourglass, TriangleAlert, Zap } from '@lucide/vue'
import { OFFICE_ENGINE_BRIDGE, type OfficeAgentView } from '~/composables/useOfficeEngine'
import { ACTIVITY_PRESENTATION } from '~/game/agent-state'
import {
  AGENT_ANCHOR,
  AGENT_BODY_HEIGHT,
  AGENT_FRAME,
  AGENT_SHEET,
  agentSheetSource,
  framePosition,
} from '~/game/animation-spec'
import { FX } from '~/utils/game-assets'

/**
 * Z5–Z6: robot animasi (sprite sheet v2 per karakter).
 *
 * Posisi kaki (`--ax/--ay`, unit dunia), frame sheet, arah hadap, kedalaman,
 * dan visibilitas DITULIS LANGSUNG oleh renderer mesin setiap frame — Vue tidak
 * memperbarui apa pun per frame. Vue hanya merender label status, gelembung
 * ucapan, dan efek state ketika snapshot berubah (event diskret).
 */
const props = defineProps<{
  agent: OfficeAgentView
  stationLabel: string
  selected?: boolean
}>()

const emit = defineEmits<{ select: [] }>()

const bridge = inject(OFFICE_ENGINE_BRIDGE, null)
const root = ref<HTMLElement | null>(null)
const sprite = ref<HTMLElement | null>(null)

onMounted(() => {
  if (root.value && sprite.value) bridge?.register(props.agent.key, root.value, sprite.value)
})
onBeforeUnmount(() => bridge?.unregister(props.agent.key))

/** Tinggi tubuh robot di dunia (unit) → skala frame sheet. */
const BODY_UNITS = 101
const scale = BODY_UNITS / AGENT_BODY_HEIGHT
const frameWidth = AGENT_FRAME.width * scale
const frameHeight = AGENT_FRAME.height * scale

/*
 * Posisi & kedalaman awal hanya untuk render pertama (SSR/hidrasi). Sengaja
 * TIDAK reaktif: setelah mount renderer mesin pemiliknya; binding reaktif akan
 * menimpa nilai renderer dengan snapshot event yang sudah basi.
 */
const initialStyle = {
  '--ax': props.agent.x,
  '--ay': props.agent.y,
  zIndex: String(100 + Math.round(props.agent.y)),
}

const sheet = computed(() => agentSheetSource(props.agent.character).src)
const initialFrame = computed(() => {
  const position = framePosition(ACTIVITY_PRESENTATION[props.agent.activity].animation, 0)
  return `${position.x} ${position.y}`
})
const presentation = computed(() => ACTIVITY_PRESENTATION[props.agent.activity])
const glowing = computed(() => props.agent.activity !== 'offline')

const accessibleLabel = computed(
  () =>
    `${props.agent.name}${props.agent.preview ? ' (karakter pratinjau)' : ''}. ${presentation.value.label}. Stasiun ${props.stationLabel}. Buka panel perintah.`,
)

const DOT: Record<string, string> = {
  offline: 'bg-muted-foreground',
  idle: 'bg-office-mint shadow-[0_0_8px_var(--office-mint)]',
  moving: 'bg-office-cyan shadow-[0_0_8px_var(--office-cyan)]',
  waiting_approval: 'bg-office-orange shadow-[0_0_8px_var(--office-orange)]',
  failed: 'bg-destructive',
  completed: 'bg-office-mint shadow-[0_0_8px_var(--office-mint)]',
}
</script>

<template>
  <div
    ref="root"
    class="pointer-events-none absolute left-0 top-0 [transform:translate3d(calc(var(--ax)*var(--s)),calc(var(--ay)*var(--s)),0)]"
    :style="initialStyle"
    :data-actor="agent.key"
    :data-preview="agent.preview ? 'true' : undefined"
    :data-activity="agent.activity"
    :data-selected="selected ? 'true' : undefined"
  >
    <!-- Bayangan kontak di tanah (robot menapak, bukan melayang) -->
    <span
      class="absolute block -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,oklch(0.08_0.04_270/55%),oklch(0.08_0.04_270/25%)_55%,transparent_75%)]"
      :style="{ width: 'calc(var(--s) * 74)', height: 'calc(var(--s) * 24)', left: 0, top: 'calc(var(--s) * 3)' }"
      data-actor-shadow
      aria-hidden="true"
    />
    <!-- Cincin energi di kaki -->
    <span
      v-if="glowing"
      class="absolute block -translate-x-1/2 -translate-y-1/2 scale-y-[0.4] opacity-90 motion-safe:animate-office-pulse"
      :style="{ width: 'calc(var(--s) * 92)', left: 0, top: 'calc(var(--s) * -2)' }"
      aria-hidden="true"
    >
      <GameImage :asset="FX['energy-ring']" />
    </span>
    <!-- Sorotan pilihan -->
    <span
      v-if="selected"
      class="absolute block -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-office-cyan shadow-[0_0_18px_var(--office-cyan)] motion-safe:animate-office-pulse"
      :style="{ width: 'calc(var(--s) * 104)', height: 'calc(var(--s) * 42)', left: 0, top: 0 }"
      data-actor-selection
      aria-hidden="true"
    />
    <!-- Penerimaan perintah: cincin meluas + lencana -->
    <template v-if="agent.acknowledging">
      <span
        class="absolute left-0 top-0 block rounded-[50%] border-2 border-office-orange opacity-0 shadow-[0_0_16px_var(--office-orange)] motion-safe:animate-office-ack"
        :style="{ width: 'calc(var(--s) * 110)', height: 'calc(var(--s) * 44)' }"
        data-actor-ack
        aria-hidden="true"
      />
      <span
        class="absolute grid -translate-x-1/2 place-items-center rounded-full border border-office-orange bg-office-orange/25 text-office-orange shadow-lg motion-safe:animate-office-pulse"
        :style="{
          width: 'calc(var(--s) * 26)',
          height: 'calc(var(--s) * 26)',
          left: 'calc(var(--s) * 34)',
          top: 'calc(var(--s) * -128)',
        }"
        aria-hidden="true"
      >
        <Zap class="size-[60%]" />
      </span>
    </template>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          ref="sprite"
          type="button"
          class="pointer-events-auto absolute rounded-xl bg-no-repeat outline-none [image-rendering:auto] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-office-cyan"
          :class="[
            selected ? 'drop-shadow-[0_0_14px_var(--office-cyan)]' : 'drop-shadow-[0_8px_10px_oklch(0.1_0.06_270/60%)]',
            agent.activity === 'offline' ? 'grayscale-[0.85] brightness-75' : '',
          ]"
          :style="{
            width: `calc(var(--s) * ${frameWidth.toFixed(2)})`,
            height: `calc(var(--s) * ${frameHeight.toFixed(2)})`,
            left: `calc(var(--s) * ${(-AGENT_ANCHOR.x * scale).toFixed(2)})`,
            top: `calc(var(--s) * ${(-AGENT_ANCHOR.y * scale).toFixed(2)})`,
            backgroundImage: `url('${sheet}')`,
            backgroundSize: `${AGENT_SHEET.columns * 100}% ${AGENT_SHEET.rows * 100}%`,
            backgroundPosition: initialFrame,
          }"
          :aria-label="accessibleLabel"
          :aria-pressed="selected"
          :data-asset="`agents/${agent.character}`"
          @click.stop="emit('select')"
        />
      </TooltipTrigger>
      <TooltipContent side="top" class="max-w-64">
        <p class="font-semibold">{{ agent.name }}</p>
        <p class="text-xs opacity-80">{{ presentation.label }} · {{ stationLabel }}</p>
        <p class="mt-1 text-xs">
          {{
            agent.preview
              ? 'Karakter pratinjau — aktivitas simulasi, bukan AI nyata.'
              : 'Status dari backend · runtime belum terhubung.'
          }}
        </p>
      </TooltipContent>
    </Tooltip>

    <!-- Efek state -->
    <span
      v-if="presentation.effect === 'hologram' && !agent.moving"
      class="absolute block motion-safe:animate-office-float"
      :style="{ width: 'calc(var(--s) * 38)', left: 'calc(var(--s) * 26)', top: 'calc(var(--s) * -96)' }"
      aria-hidden="true"
    >
      <GameImage :asset="FX['hologram-cube']" />
    </span>
    <span
      v-if="presentation.effect === 'particles' && !agent.moving"
      class="absolute block -translate-x-1/2 motion-safe:animate-office-twinkle"
      :style="{ width: 'calc(var(--s) * 44)', left: 0, top: 'calc(var(--s) * -150)' }"
      aria-hidden="true"
    >
      <GameImage :asset="FX['particles-cyan']" />
    </span>
    <span
      v-if="presentation.effect === 'approval' || presentation.effect === 'success' || presentation.effect === 'alert'"
      :class="[
        'absolute grid -translate-x-1/2 place-items-center rounded-full border shadow-lg motion-safe:animate-office-pulse',
        presentation.effect === 'approval' ? 'border-office-orange bg-office-orange/25 text-office-orange' : '',
        presentation.effect === 'success' ? 'border-office-mint bg-office-mint/25 text-office-mint' : '',
        presentation.effect === 'alert' ? 'border-destructive bg-destructive/25 text-destructive' : '',
      ]"
      :style="{
        width: 'calc(var(--s) * 26)',
        height: 'calc(var(--s) * 26)',
        left: 'calc(var(--s) * 34)',
        top: 'calc(var(--s) * -128)',
      }"
      aria-hidden="true"
    >
      <Hourglass v-if="presentation.effect === 'approval'" class="size-[60%]" />
      <CircleCheck v-else-if="presentation.effect === 'success'" class="size-[60%]" />
      <TriangleAlert v-else class="size-[60%]" />
    </span>

    <!-- Label nama & status (Z6) -->
    <span
      :class="[
        'absolute flex -translate-x-1/2 items-center gap-[0.4em] whitespace-nowrap rounded-[0.55em] border-2 px-[0.7em] py-[0.35em] leading-none shadow-[0_4px_12px_oklch(0.08_0.05_270/55%)] backdrop-blur-sm',
        'text-[max(9px,calc(var(--s)*13))] font-semibold',
        selected
          ? 'border-office-cyan bg-office-bg/90 text-office-cyan'
          : 'border-office-cyan/40 bg-office-bg/80 text-foreground',
      ]"
      :style="{ left: 0, top: 'calc(var(--s) * 8)' }"
      aria-hidden="true"
    >
      <span
        :class="[
          'size-[0.6em] shrink-0 rounded-full',
          DOT[agent.activity] ?? 'bg-office-cyan shadow-[0_0_8px_var(--office-cyan)]',
        ]"
      />
      {{ agent.name }}
      <span class="font-normal text-office-cyan/90">{{ agent.workstationActivity ?? agent.label }}</span>
    </span>

    <!-- Gelembung ucapan (skrip simulasi / visual) -->
    <span
      v-if="agent.speech"
      class="absolute w-max max-w-[calc(var(--s)*220)] -translate-x-1/2 rounded-xl border border-office-cyan/60 bg-[oklch(0.97_0.02_230)] px-[0.8em] py-[0.45em] text-[max(9px,calc(var(--s)*12))] font-medium leading-snug text-[oklch(0.2_0.05_265)] shadow-[0_6px_18px_oklch(0.1_0.05_265/50%)]"
      :style="{ left: 0, bottom: 'calc(var(--s) * 140)' }"
      role="status"
    >
      <span
        v-if="agent.preview"
        class="mr-1 rounded bg-office-orange/80 px-1 text-[0.75em] font-bold text-[oklch(0.2_0.05_70)]"
        >SIMULASI</span
      >
      {{ agent.speech }}
    </span>
  </div>
</template>
