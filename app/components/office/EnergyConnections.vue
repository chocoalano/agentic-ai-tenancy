<script setup lang="ts">
import {
  OFFICE_WORLD,
  energyConnections,
  type EnergyConnection,
  type StationId,
  type StationState,
} from '~/utils/office-layout'

/**
 * Z3: jaringan energi SVG di koordinat dunia, DI BELAKANG pulau (ujung jalur
 * tertutup artwork pulau sehingga tampak "masuk" ke stasiun).
 *
 * - spoke (Mission Hub → stasiun): cyan; pulau jauh biru.
 * - mission (rute misi): oranye.
 * - link (antar stasiun): ungu.
 *
 * Mode live: warna/pulsa mengikuti status nyata stasiun (agent aktif →
 * menyala & berdenyut; agent dijeda/draf → redup; kosong → putus-putus).
 * Mode pratinjau: seluruh jaringan menyala sebagai contoh. Pulsa cahaya =
 * animasi stroke-dashoffset (dimatikan prefers-reduced-motion) di SVG terpisah
 * agar tidak memaksa raster ulang halo ber-blur setiap frame (41 → 60 FPS,
 * lihat docs/character-animation-system.md).
 */
const props = defineProps<{
  stationStates: ReadonlyMap<StationId, StationState>
  highlighted?: StationId | null
}>()

const uid = useId()
const glowId = `${uid}-glow`
const FAR: readonly StationId[] = ['research-lab', 'training-center']

const BASE_COLOR = {
  spoke: 'var(--office-cyan)',
  far: 'oklch(0.66 0.2 258)',
  mission: 'var(--office-orange)',
  link: 'oklch(0.68 0.24 300)',
}

function stateOf(id: StationId | 'mission-hub'): StationState {
  return id === 'mission-hub' ? 'active' : (props.stationStates.get(id) ?? 'empty')
}

function presentation(connection: EnergyConnection) {
  const from = stateOf(connection.from)
  const to = stateOf(connection.to)
  const color =
    connection.kind === 'spoke'
      ? FAR.includes(connection.to)
        ? BASE_COLOR.far
        : to === 'standby'
          ? BASE_COLOR.mission
          : to === 'empty'
            ? BASE_COLOR.link
            : BASE_COLOR.spoke
      : BASE_COLOR[connection.kind]
  const state: 'live' | 'dim' | 'idle' =
    from === 'active' && to === 'active' ? 'live' : from === 'empty' || to === 'empty' ? 'idle' : 'dim'
  const width = connection.kind === 'spoke' ? 4 : connection.kind === 'mission' ? 4.5 : 3
  const highlighted = props.highlighted !== null && props.highlighted === connection.to
  return { color, state, width: highlighted ? width + 2 : width }
}

const connections = computed(() =>
  energyConnections().map((connection, index) => ({
    ...connection,
    ...presentation(connection),
    delay: `${-((index * 0.73) % 3.2).toFixed(2)}s`,
    trailDelay: `${-((index * 0.73 + 1.6) % 3.2).toFixed(2)}s`,
    duration: `${connection.kind === 'mission' ? 4.2 : 3.2 + (index % 3) * 0.4}s`,
  })),
)
const liveConnections = computed(() => connections.value.filter((connection) => connection.state === 'live'))
</script>

<template>
  <div class="pointer-events-none absolute inset-0 size-full" aria-hidden="true" data-energy-network>
    <!-- Lapisan statis (halo ber-blur, inti, garis terang): hanya digambar ulang saat status berubah. -->
    <svg
      class="absolute inset-0 size-full overflow-visible"
      :viewBox="`0 0 ${OFFICE_WORLD.width} ${OFFICE_WORLD.height}`"
      preserveAspectRatio="none"
      focusable="false"
    >
      <defs>
        <filter :id="glowId" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <g v-for="connection in connections" :key="connection.key" :data-connection="connection.key">
        <!-- Halo -->
        <path
          :d="connection.path"
          fill="none"
          :style="{ stroke: connection.color }"
          :stroke-width="connection.width * 4"
          stroke-linecap="round"
          :opacity="connection.state === 'live' ? 0.55 : connection.state === 'dim' ? 0.3 : 0.16"
          :filter="`url(#${glowId})`"
        />
        <!-- Inti -->
        <path
          :d="connection.path"
          fill="none"
          :style="{ stroke: connection.color }"
          :stroke-width="connection.width"
          stroke-linecap="round"
          :stroke-dasharray="connection.state === 'idle' ? '10 12' : undefined"
          :opacity="connection.state === 'live' ? 0.95 : connection.state === 'dim' ? 0.6 : 0.45"
        />
        <!-- Garis terang di tengah inti -->
        <path
          v-if="connection.state !== 'idle'"
          :d="connection.path"
          fill="none"
          stroke="white"
          :stroke-width="connection.width * 0.35"
          stroke-linecap="round"
          :opacity="connection.state === 'live' ? 0.7 : 0.3"
        />
      </g>
    </svg>
    <!--
      Lapisan pulsa di compositor layer sendiri: animasi stroke-dashoffset hanya
      me-raster jalur pulsa tipis ini, bukan halo ber-filter blur di lapisan statis.
    -->
    <svg
      class="absolute inset-0 size-full overflow-visible [will-change:transform]"
      :viewBox="`0 0 ${OFFICE_WORLD.width} ${OFFICE_WORLD.height}`"
      preserveAspectRatio="none"
      focusable="false"
      data-energy-pulses
    >
      <g v-for="connection in liveConnections" :key="connection.key">
        <!-- Pulsa cahaya berjalan (dua partikel per jalur) -->
        <path
          :d="connection.path"
          pathLength="100"
          fill="none"
          stroke="white"
          :stroke-width="connection.width * 1.7"
          stroke-linecap="round"
          stroke-dasharray="2.5 97.5"
          class="motion-safe:animate-energy-pulse"
          :style="{ '--pulse-duration': connection.duration, animationDelay: connection.delay }"
        />
        <path
          :d="connection.path"
          pathLength="100"
          fill="none"
          :stroke-width="connection.width * 2.4"
          stroke-linecap="round"
          stroke-dasharray="1.5 98.5"
          opacity="0.9"
          class="motion-safe:animate-energy-pulse"
          :style="{
            stroke: connection.color,
            '--pulse-duration': connection.duration,
            animationDelay: connection.trailDelay,
          }"
        />
      </g>
    </svg>
  </div>
</template>
