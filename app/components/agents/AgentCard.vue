<script setup lang="ts">
import { Activity, ArrowUpRight, FlaskConical } from '@lucide/vue'
import type { AgentSummary } from '~/utils/api-types'

/** Kartu AI employee = entri roster /office (.roster-entry): portret, nama + peran cyan, badge status, aksi kotak. */
defineProps<{ agent: AgentSummary }>()
</script>

<template>
  <Card
    class="hud-row group relative gap-0 overflow-hidden border-0 bg-transparent py-0 text-[#f5f8ff] shadow-none"
    data-agent-card
  >
    <CardHeader class="flex flex-row items-center gap-3 px-3 pt-3 pb-0">
      <AgentAvatar
        :seed="agent.id"
        :role-key="agent.roleKey"
        :role-title="agent.roleTitle"
        :status="agent.lifecycleStatus"
        size="lg"
        class="drop-shadow-[0_2px_6px_#22bbff30]"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-1.5">
          <CardTitle class="truncate font-heading text-[15px] font-bold">{{ agent.name }}</CardTitle>
          <CardDescription class="min-w-0 flex-1 truncate text-[11px] font-semibold text-office-cyan">
            {{ agent.roleTitle }}
          </CardDescription>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <AgentStatusBadge kind="lifecycle" :status="agent.lifecycleStatus" />
          <AgentStatusBadge kind="runtime" :status="agent.runtimeStatus" />
        </div>
      </div>
      <span class="flex shrink-0 flex-col gap-1">
        <NuxtLink
          v-if="agent.currentTaskId"
          :to="`/tasks/${agent.currentTaskId}`"
          class="grid size-6 place-items-center rounded-md border border-white/10 bg-white/5 text-office-mint hover:text-office-cyan"
          :aria-label="`Tugas aktif ${agent.name}`"
        >
          <Activity class="size-3.5" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink
          :to="`/agents/${agent.id}`"
          class="grid size-6 place-items-center rounded-md border border-white/10 bg-white/5 text-blue-200 hover:text-office-cyan"
          :aria-label="`Lihat detail ${agent.name}`"
        >
          <ArrowUpRight class="size-3.5" aria-hidden="true" />
        </NuxtLink>
      </span>
    </CardHeader>
    <CardContent class="px-3 pt-2.5 pb-3">
      <p class="line-clamp-2 min-h-9 text-[13px] leading-[1.4] text-blue-100">
        {{ agent.description || 'Belum ada deskripsi.' }}
      </p>
      <div class="mt-2 flex items-center justify-between gap-2">
        <Tooltip v-if="agent.isSeedData">
          <TooltipTrigger as-child>
            <Badge variant="outline" class="gap-1 border-dashed text-blue-200">
              <FlaskConical class="size-3" aria-hidden="true" />
              Seed dev
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Data contoh pengembangan lokal</TooltipContent>
        </Tooltip>
        <span v-else />
        <NuxtLink
          :to="`/agents/${agent.id}`"
          class="inline-flex items-center gap-1 text-xs font-semibold text-office-cyan hover:underline"
        >
          Detail <ArrowUpRight class="size-3" aria-hidden="true" />
        </NuxtLink>
      </div>
    </CardContent>
  </Card>
</template>
