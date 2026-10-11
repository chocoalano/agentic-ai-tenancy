<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import type { IslandId } from '~/game/world'
import { CHARACTERS, centeringShift } from '~/utils/game-assets'
import type { OfficeSelection } from '~/types/office'

/**
 * Robot di sebuah workstation (ada di sini / sedang menuju) + penugasan.
 * Pratinjau: robot berjalan/teleport ke stasiun lalu menjalankan aktivitas
 * stasiun (simulasi). Live: hanya pemindahan posisi tampilan.
 */
defineProps<{
  island: IslandId
  here: OfficeAgentView[]
  incoming: OfficeAgentView[]
  assignable: OfficeAgentView[]
  preview: boolean
}>()

const emit = defineEmits<{ select: [selection: OfficeSelection]; assign: [key: string, island: IslandId] }>()
</script>

<template>
  <div class="mt-3 space-y-2.5">
    <div>
      <p class="text-xs font-semibold">Robot di sini</p>
      <ul v-if="here.length > 0 || incoming.length > 0" class="mt-1.5 flex flex-wrap gap-1.5">
        <li v-for="agent in [...here, ...incoming]" :key="agent.key">
          <button
            type="button"
            class="hud-segment flex items-center gap-2 px-2 py-1 text-xs outline-none hover:border-office-cyan/60 focus-visible:ring-2 focus-visible:ring-office-cyan"
            @click="emit('select', { kind: 'actor', key: agent.key })"
          >
            <span class="block w-5 overflow-hidden">
              <AgentSprite
                :character="agent.character"
                :style="{ transform: `translateX(${centeringShift(CHARACTERS[agent.character])})` }"
              />
            </span>
            <span class="font-semibold">{{ agent.name }}</span>
            <span class="text-muted-foreground">{{ agent.moving ? 'Menuju ke sini…' : agent.label }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="mt-1 text-xs text-muted-foreground">Belum ada robot di workstation ini.</p>
    </div>

    <div v-if="assignable.length > 0">
      <p class="text-xs font-semibold">
        {{ preview ? 'Tugaskan karakter (simulasi)' : 'Pindahkan robot ke sini (visual saja)' }}
      </p>
      <ul class="mt-1.5 flex flex-wrap gap-1.5">
        <li v-for="agent in assignable" :key="agent.key">
          <button
            type="button"
            class="hud-segment flex items-center gap-1.5 px-2 py-1 text-xs outline-none hover:border-office-cyan/60 focus-visible:ring-2 focus-visible:ring-office-cyan"
            :data-assign="agent.key"
            @click="emit('assign', agent.key, island)"
          >
            {{ agent.name }} <ArrowRight class="size-3" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p class="mt-1 text-[10.5px] text-muted-foreground">
        {{
          preview
            ? 'Robot berjalan ke portal, teleport, lalu menjalankan aktivitas stasiun — simulasi frontend.'
            : 'Tidak mengubah penugasan di backend; penugasan nyata butuh modul tugas.'
        }}
      </p>
    </div>
  </div>
</template>
