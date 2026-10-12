<script setup lang="ts">
import { Activity, Bot, Building2, CircleOff, FlaskConical, ListChecks, ScrollText, Target } from '@lucide/vue'
import { isAgentAssignable } from '~~/domains/agents/types'

/*
 * /agents/:id — AI Employee Control Center: identitas karakter, mandat
 * (instruksi utama), status runtime & tugas saat ini, riwayat tugas nyata,
 * dan aksi yang benar-benar didukung backend (penugasan lewat Virtual Office
 * bila runtime tersedia). Tidak ada metrik/kemampuan karangan.
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'Detail AI Employee', colorMode: 'dark' })

const route = useRoute()
const { $api } = useNuxtApp()
const auth = useAuth()
const agentId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useTenantAsyncData(
  `agent:${agentId.value}`,
  async (_tenantId, _signal, request) => {
    const agent = await $api.v1.agents({ id: agentId.value }).get(request)
    if (agent.error) throw apiFailure(agent.error)
    const canReadTasks = auth.can('tasks.read')
    const [capabilities, tasks] = await Promise.all([
      canReadTasks ? $api.v1.tasks.capabilities.get(request) : Promise.resolve(null),
      canReadTasks
        ? $api.v1.tasks.get({
            query: { agentId: agentId.value, limit: 8 },
            headers: request.headers,
            fetch: request.fetch,
          })
        : Promise.resolve(null),
    ])
    return {
      agent: agent.data,
      capabilities: capabilities?.data ?? null,
      tasks: tasks?.data?.items ?? [],
      canReadTasks,
    }
  },
)

const agent = computed(() => data.value?.agent ?? null)
useHead({ title: () => agent.value?.name ?? 'Detail AI Employee' })

// Agent di luar tenant aktif diperlakukan sebagai tidak ada: SSR merespons HTTP 404.
const event = useRequestEvent()
if (event && error.value?.statusCode === 404) setResponseStatus(event, 404)

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

const assignable = computed(() => (agent.value ? isAgentAssignable(agent.value.lifecycleStatus) : false))
const runtime = computed(() => data.value?.capabilities?.runtime ?? null)
const canAssign = computed(
  () => assignable.value && runtime.value?.available === true && (data.value?.capabilities?.canCreate ?? false),
)
const assignBlockedReason = computed(() => {
  if (!data.value?.canReadTasks) return 'Peran Anda tidak memiliki izin tasks.read.'
  if (!runtime.value) return 'Kemampuan runtime tidak dapat dibaca.'
  if (!runtime.value.available) return 'Runtime AI belum dikonfigurasi di server (AI_RUNTIME_PROVIDER).'
  if (!data.value.capabilities?.canCreate) return 'Peran Anda tidak memiliki izin tasks.create.'
  if (!assignable.value) return 'AI employee ini belum aktif.'
  return null
})
const currentTask = computed(() => {
  const id = agent.value?.currentTaskId
  return id ? (data.value?.tasks.find((task) => task.id === id) ?? null) : null
})
</script>

<template>
  <div class="space-y-6">
    <GameLoadingState v-if="status === 'pending' && !data" :rows="4" label="Memuat AI employee…" />
    <EmptyState
      v-else-if="error?.statusCode === 404"
      :icon="CircleOff"
      title="AI employee tidak ditemukan"
      description="Agent ini tidak ada di perusahaan aktif Anda."
    >
      <Button variant="outline" size="sm" as-child><NuxtLink to="/agents">Kembali ke direktori</NuxtLink></Button>
    </EmptyState>
    <ErrorState v-else-if="error" :error="error" :retry="refresh" />
    <template v-else-if="agent">
      <GamePageHeader
        identity="AI Employee Control Center"
        :title="agent.name"
        :description="agent.roleTitle"
        back-to="/agents"
        back-label="Kembali ke AI Employee Headquarters"
      >
        <template #meta>
          <AgentStatusBadge kind="lifecycle" :status="agent.lifecycleStatus" />
          <AgentStatusBadge kind="runtime" :status="agent.runtimeStatus" />
          <Badge v-if="agent.isSeedData" variant="outline" class="gap-1 border-dashed">
            <FlaskConical class="size-3" aria-hidden="true" />Seed dev
          </Badge>
        </template>
        <template #actions>
          <Button variant="outline" as-child class="gap-1.5">
            <NuxtLink to="/office"><Building2 class="size-4" aria-hidden="true" />Lihat di Virtual Office</NuxtLink>
          </Button>
        </template>
      </GamePageHeader>

      <!-- Identitas karakter -->
      <GamePanel variant="command" padding="lg" as="section" aria-label="Identitas AI employee" data-agent-hero>
        <div class="flex flex-col gap-6 md:flex-row md:items-center">
          <AgentAvatar
            :seed="agent.id"
            :role-key="agent.roleKey"
            :role-title="agent.roleTitle"
            :status="agent.lifecycleStatus"
            size="xl"
            :label="`Karakter ${agent.name}`"
            class="shrink-0 ring-2 ring-game-cyan/40"
          />
          <div class="min-w-0 flex-1 space-y-2">
            <p class="type-eyebrow">AI employee</p>
            <h2 class="font-heading text-2xl font-semibold leading-tight md:text-3xl">{{ agent.name }}</h2>
            <p class="text-sm text-game-text-muted">{{ agent.description || 'Belum ada deskripsi.' }}</p>
            <div class="flex flex-wrap gap-2 pt-1">
              <span class="game-chip"
                ><Bot class="size-3.5 text-game-cyan" aria-hidden="true" />{{ agent.roleTitle }}</span
              >
              <span class="game-chip font-mono text-[11px]">{{ agent.roleKey }}</span>
            </div>
          </div>
          <dl class="grid grid-cols-2 gap-3 md:w-96">
            <div class="game-panel game-panel-sunken p-3">
              <dt class="type-label">Status runtime</dt>
              <dd class="mt-1"><AgentStatusBadge kind="runtime" :status="agent.runtimeStatus" /></dd>
            </div>
            <div class="game-panel game-panel-sunken p-3">
              <dt class="type-label">Tugas selesai</dt>
              <dd class="type-metric text-xl" data-agent-completed>
                {{ data?.canReadTasks ? data.tasks.filter((task) => task.status === 'completed').length : '—' }}
              </dd>
            </div>
          </dl>
        </div>
      </GamePanel>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div class="space-y-6">
          <GamePanel
            variant="holo"
            title="Mandat & kemampuan"
            description="Instruksi utama yang menjadi pedoman kerja agent di setiap tugas."
            :icon="ScrollText"
          >
            <p class="whitespace-pre-line text-sm leading-relaxed" data-agent-instruction>
              {{ agent.mainInstruction || 'Belum ada instruksi.' }}
            </p>
          </GamePanel>

          <GamePanel title="Riwayat tugas" :icon="ListChecks" data-agent-tasks>
            <template #actions>
              <Button variant="ghost" size="sm" as-child><NuxtLink to="/tasks">Papan misi</NuxtLink></Button>
            </template>
            <p v-if="!data?.canReadTasks" class="type-support">Peran Anda tidak memiliki izin melihat tugas.</p>
            <EmptyState
              v-else-if="data.tasks.length === 0"
              size="compact"
              :icon="Target"
              title="Belum ada tugas"
              description="Tugas nyata yang diberikan kepada agent ini akan tercatat di sini."
            />
            <ul v-else class="divide-y divide-game-border/60">
              <li v-for="task in data.tasks" :key="task.id">
                <NuxtLink :to="`/tasks/${task.id}`" class="hud-row my-1.5 flex items-center gap-3 px-3 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{{ task.title }}</p>
                    <p class="truncate text-xs text-game-text-muted">
                      {{ formatter.format(task.createdAt) }} · run {{ task.attempts }}/{{ task.maxAttempts }}
                    </p>
                  </div>
                  <TaskStatusBadge :status="task.status" />
                </NuxtLink>
              </li>
            </ul>
          </GamePanel>
        </div>

        <div class="space-y-6">
          <GamePanel
            :variant="currentTask ? 'success' : 'default'"
            title="Tugas saat ini"
            :icon="Activity"
            data-agent-current-task
          >
            <template v-if="currentTask">
              <p class="text-sm font-medium">{{ currentTask.title }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <TaskStatusBadge :status="currentTask.status" />
                <span class="text-xs text-game-text-muted"
                  >run {{ currentTask.attempts }}/{{ currentTask.maxAttempts }}</span
                >
              </div>
              <Button variant="outline" size="sm" class="mt-3" as-child>
                <NuxtLink :to="`/tasks/${currentTask.id}`">Buka detail tugas</NuxtLink>
              </Button>
            </template>
            <p v-else class="type-support">Tidak ada tugas yang sedang dikerjakan.</p>
          </GamePanel>

          <GamePanel title="Perintah" :icon="Target" data-agent-commands>
            <div class="space-y-3">
              <Button v-if="canAssign" class="w-full gap-1.5" as-child>
                <NuxtLink to="/office"
                  ><Building2 class="size-4" aria-hidden="true" />Tugaskan dari Virtual Office</NuxtLink
                >
              </Button>
              <Button v-else class="w-full" disabled aria-disabled="true" data-agent-assign-disabled>Tugaskan</Button>
              <p v-if="assignBlockedReason" class="type-support text-xs" data-agent-assign-reason>
                {{ assignBlockedReason }}
              </p>
              <p v-else class="type-support text-xs">
                Instruksi dikirim lewat panel perintah di Virtual Office dan dieksekusi worker server
                <template v-if="runtime?.kind === 'fixture'"> (runtime fixture — bukan AI)</template>.
              </p>
              <div class="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled aria-disabled="true">Chat</Button>
                <Button variant="outline" size="sm" disabled aria-disabled="true">Jeda</Button>
              </div>
              <p class="type-support text-xs">
                Chat dan jeda/lanjutkan belum memiliki endpoint; tombol sengaja nonaktif.
              </p>
            </div>
          </GamePanel>

          <GamePanel title="Profil" :icon="Bot">
            <dl>
              <GameInfoRow label="Kunci peran" mono>{{ agent.roleKey }}</GameInfoRow>
              <GameInfoRow label="Slug" mono>{{ agent.slug }}</GameInfoRow>
              <GameInfoRow label="Dibuat">{{ formatter.format(agent.createdAt) }}</GameInfoRow>
              <GameInfoRow label="Diperbarui">{{ formatter.format(agent.updatedAt) }}</GameInfoRow>
            </dl>
          </GamePanel>
        </div>
      </div>
    </template>
  </div>
</template>
