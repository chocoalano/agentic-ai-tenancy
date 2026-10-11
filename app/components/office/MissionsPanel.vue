<script setup lang="ts">
import { Target } from '@lucide/vue'
import type { MissionView } from '~/types/office'

/** Panel misi perusahaan. `missions` kosong → empty state (modul misi Wave 3). */
withDefaults(defineProps<{ missions?: MissionView[] }>(), { missions: () => [] })
</script>

<template>
  <section class="surface-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5" aria-labelledby="missions-title">
    <SectionHeader
      id="missions-title"
      :icon="Target"
      title="Misi"
      description="Target kerja tim AI dan hadiah XP."
      as="h3"
    />
    <div v-if="missions.length" class="space-y-2.5">
      <MissionCard v-for="mission in missions" :key="mission.id" :mission="mission" />
    </div>
    <EmptyState
      v-else
      size="compact"
      :ghost="3"
      badge="Wave 3"
      title="Belum ada misi"
      description="Misi, XP, dan level aktif bersama modul gamifikasi."
    />
  </section>
</template>
