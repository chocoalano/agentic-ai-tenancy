<script setup lang="ts">
import { ArrowUpRight, FlaskConical } from '@lucide/vue'
import type { AgentSummary } from '~/utils/api-types'

/** Kartu AI employee bergaya panel game (Agentic Game UI); data nyata dari API. */
defineProps<{ agent: AgentSummary }>()
</script>

<template>
  <Card
    class="game-panel group relative gap-4 overflow-hidden border-0 bg-transparent py-5 shadow-none transition-shadow hover:game-panel-holo"
    data-agent-card
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-game-cyan/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      aria-hidden="true"
    />
    <CardHeader class="flex flex-row items-start gap-3 px-5">
      <AgentAvatar
        :seed="agent.id"
        :role-key="agent.roleKey"
        :role-title="agent.roleTitle"
        :status="agent.lifecycleStatus"
        size="lg"
      />
      <div class="min-w-0 flex-1">
        <CardTitle class="truncate font-heading text-base">{{ agent.name }}</CardTitle>
        <CardDescription class="truncate">{{ agent.roleTitle }}</CardDescription>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <AgentStatusBadge kind="lifecycle" :status="agent.lifecycleStatus" />
          <AgentStatusBadge kind="runtime" :status="agent.runtimeStatus" />
        </div>
      </div>
    </CardHeader>
    <CardContent class="px-5">
      <p class="line-clamp-2 min-h-10 text-sm text-game-text-muted">
        {{ agent.description || 'Belum ada deskripsi.' }}
      </p>
    </CardContent>
    <CardFooter class="flex items-center justify-between gap-2 px-5">
      <div class="flex flex-wrap items-center gap-1.5">
        <NuxtLink
          v-if="agent.currentTaskId"
          :to="`/tasks/${agent.currentTaskId}`"
          class="game-chip text-game-cyan hover:bg-game-cyan/10"
          >Tugas aktif</NuxtLink
        >
        <Tooltip v-if="agent.isSeedData">
          <TooltipTrigger as-child>
            <Badge variant="outline" class="gap-1 border-dashed text-game-text-muted">
              <FlaskConical class="size-3" aria-hidden="true" />
              Seed dev
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Data contoh pengembangan lokal</TooltipContent>
        </Tooltip>
      </div>
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/agents/${agent.id}`" :aria-label="`Lihat detail ${agent.name}`">
          Detail
          <ArrowUpRight class="size-3.5" aria-hidden="true" />
        </NuxtLink>
      </Button>
    </CardFooter>
  </Card>
</template>
