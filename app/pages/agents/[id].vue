<script setup lang="ts">
import { ArrowLeft, CircleOff, FlaskConical } from '@lucide/vue'
import { isAgentAssignable } from '~~/domains/agents/types'

definePageMeta({ layout: 'app', middleware: 'auth', title: 'Detail AI Employee' })

const route = useRoute()
const { $api } = useNuxtApp()
const agentId = computed(() => String(route.params.id))

const {
  data: agent,
  status,
  error,
  refresh,
} = await useTenantAsyncData(`agent:${agentId.value}`, async (_tenantId, signal) => {
  const { data, error } = await $api.v1.agents({ id: agentId.value }).get({ fetch: { signal } })
  if (error) throw apiFailure(error)
  return data
})

useHead({ title: () => agent.value?.name ?? 'Detail AI Employee' })

// Agent di luar tenant aktif diperlakukan sebagai tidak ada: SSR merespons HTTP 404.
const event = useRequestEvent()
if (event && error.value?.statusCode === 404) setResponseStatus(event, 404)

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-6">
    <Button variant="ghost" size="sm" as-child class="-ml-2">
      <NuxtLink to="/agents"><ArrowLeft class="size-4" aria-hidden="true" />Kembali ke daftar</NuxtLink>
    </Button>

    <div v-if="status === 'pending' && !agent" class="space-y-4" aria-busy="true">
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>
    <EmptyState
      v-else-if="error?.statusCode === 404"
      :icon="CircleOff"
      title="AI employee tidak ditemukan"
      description="Agent ini tidak ada di perusahaan aktif Anda."
    />
    <ErrorState v-else-if="error" :error="error" :retry="refresh" />
    <template v-else-if="agent">
      <PageHeader eyebrow="AI employee" :title="agent.name" :description="agent.roleTitle">
        <template #actions>
          <AgentStatusBadge kind="lifecycle" :status="agent.lifecycleStatus" />
          <AgentStatusBadge kind="runtime" :status="agent.runtimeStatus" />
        </template>
      </PageHeader>

      <Alert class="glass">
        <CircleOff class="size-4" aria-hidden="true" />
        <AlertTitle>Runtime AI belum terhubung</AlertTitle>
        <AlertDescription>
          Agent ini belum dapat menjalankan tugas karena Agent Orchestrator dan adapter AI Runtime dibangun pada fase
          berikutnya.
          {{
            isAgentAssignable(agent.lifecycleStatus)
              ? 'Konfigurasinya sudah aktif dan siap ditugaskan setelah runtime tersedia.'
              : 'Aktifkan konfigurasinya terlebih dahulu sebelum dapat ditugaskan.'
          }}
        </AlertDescription>
      </Alert>

      <div class="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card class="glass">
          <CardHeader>
            <CardTitle class="font-heading">Instruksi utama</CardTitle>
            <CardDescription>Main instruction yang menjadi pedoman kerja agent.</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="whitespace-pre-line text-sm leading-relaxed">
              {{ agent.mainInstruction || 'Belum ada instruksi.' }}
            </p>
            <Separator class="my-4" />
            <p class="text-sm text-muted-foreground">{{ agent.description }}</p>
          </CardContent>
        </Card>
        <Card class="glass">
          <CardHeader>
            <CardTitle class="font-heading">Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <dl class="space-y-3 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground">Kunci peran</dt>
                <dd class="font-mono text-xs">{{ agent.roleKey }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground">Slug</dt>
                <dd class="font-mono text-xs">{{ agent.slug }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground">Dibuat</dt>
                <dd>{{ formatter.format(agent.createdAt) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground">Diperbarui</dt>
                <dd>{{ formatter.format(agent.updatedAt) }}</dd>
              </div>
              <div v-if="agent.isSeedData" class="flex justify-between gap-4">
                <dt class="text-muted-foreground">Sumber</dt>
                <dd>
                  <Badge variant="outline" class="gap-1 border-dashed"
                    ><FlaskConical class="size-3" aria-hidden="true" />Seed dev</Badge
                  >
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
