<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Building2, KeyRound, Loader2, LogOut, Palette, Plus, UserRound } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import * as z from 'zod'

definePageMeta({ layout: 'app', middleware: 'auth', title: 'Pengaturan' })
useHead({ title: 'Pengaturan' })

const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const auth = useAuth()
const colorMode = useColorMode()

const TABS = ['profile', 'company', 'appearance', 'session'] as const
type SettingsTab = (typeof TABS)[number]
const tab = computed<SettingsTab>({
  get: () => TABS.find((value) => value === route.query.tab) ?? 'profile',
  set: (value) => router.replace({ query: { ...route.query, tab: value } }),
})
function onTabChange(value: string | number) {
  const next = TABS.find((item) => item === value)
  if (next) tab.value = next
}

const { data: tenant, error: tenantError } = await useTenantAsyncData(
  'settings-tenant',
  async (tenantId, _signal, request) => {
    const { data, error } = await $api.v1.tenants({ id: tenantId }).get(request)
    if (error) throw apiFailure(error)
    return data
  },
)

const loggingOut = ref(false)
async function logout() {
  loggingOut.value = true
  try {
    const failure = await auth.logout()
    if (failure) {
      toast.error('Gagal keluar', { description: `${failure.message} Sesi Anda masih aktif — coba lagi.` })
    }
  } finally {
    loggingOut.value = false
  }
}

const createOpen = ref(false)
const companyForm = useForm({
  validationSchema: toTypedSchema(
    z.object({ name: z.string({ required_error: 'Nama wajib diisi' }).trim().min(2, 'Minimal 2 karakter').max(120) }),
  ),
})
const createCompany = companyForm.handleSubmit(async (values) => {
  const { data, error } = await $api.v1.tenants.post({ name: values.name })
  if (error) {
    toast.error('Gagal membuat perusahaan', { description: toApiErrorInfo(error).message })
    return
  }
  createOpen.value = false
  companyForm.resetForm()
  const failure = await auth.switchTenant(data.id)
  if (failure) toast.error('Perusahaan dibuat, tetapi gagal diaktifkan', { description: failure.message })
  else toast.success(`${data.name} dibuat dan diaktifkan`)
})

const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' })

const colorModeOptions = [
  { value: 'dark', label: 'Gelap (default)' },
  { value: 'light', label: 'Terang' },
  { value: 'system', label: 'Ikuti sistem' },
] as const
function onColorModeChange(value: unknown) {
  const option = colorModeOptions.find((item) => item.value === value)
  if (option) colorMode.preference = option.value
}

const swatches = [
  { label: 'Primary', className: 'bg-primary' },
  { label: 'Brand cyan', className: 'bg-brand-cyan' },
  { label: 'Brand purple', className: 'bg-brand-purple' },
  { label: 'Brand orange', className: 'bg-brand-orange' },
  { label: 'Success', className: 'bg-success' },
  { label: 'Warning', className: 'bg-warning' },
  { label: 'Destructive', className: 'bg-destructive' },
  { label: 'XP', className: 'bg-xp' },
]
const agentTokens = [
  { label: 'Idle', className: 'bg-agent-idle' },
  { label: 'Working', className: 'bg-agent-working' },
  { label: 'Thinking', className: 'bg-agent-thinking' },
  { label: 'Using tool', className: 'bg-agent-tool' },
  { label: 'Waiting approval', className: 'bg-agent-approval' },
  { label: 'Failed', className: 'bg-agent-failed' },
  { label: 'Offline', className: 'bg-agent-offline' },
]
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      eyebrow="Akun & perusahaan"
      title="Pengaturan"
      description="Profil, perusahaan aktif, tampilan, dan sesi Anda."
    />

    <Tabs :model-value="tab" class="gap-6" @update:model-value="onTabChange">
      <TabsList class="flex-wrap">
        <TabsTrigger value="profile"><UserRound class="size-4" aria-hidden="true" />Profil</TabsTrigger>
        <TabsTrigger value="company"><Building2 class="size-4" aria-hidden="true" />Perusahaan</TabsTrigger>
        <TabsTrigger value="appearance"><Palette class="size-4" aria-hidden="true" />Tampilan</TabsTrigger>
        <TabsTrigger value="session"><KeyRound class="size-4" aria-hidden="true" />Sesi</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <Card class="glass max-w-2xl">
          <CardHeader>
            <CardTitle class="font-heading">Profil</CardTitle>
            <CardDescription>Data akun Anda. Pengubahan profil hadir pada iterasi berikutnya.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="profile-name">Nama</Label>
              <Input id="profile-name" :model-value="auth.user.value?.displayName" readonly />
            </div>
            <div class="space-y-2">
              <Label for="profile-email">Email</Label>
              <Input id="profile-email" :model-value="auth.user.value?.email" readonly />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="company" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">Peran dan izin diambil dari database untuk perusahaan aktif.</p>
          <Dialog v-model:open="createOpen">
            <DialogTrigger as-child>
              <Button size="sm"><Plus class="size-4" aria-hidden="true" />Buat perusahaan</Button>
            </DialogTrigger>
            <DialogContent class="glass-strong sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Buat perusahaan</DialogTitle>
                <DialogDescription
                  >Anda akan menjadi pemilik (owner). Perusahaan baru langsung diaktifkan.</DialogDescription
                >
              </DialogHeader>
              <form class="space-y-4" novalidate @submit="createCompany">
                <FormField v-slot="{ componentField }" name="name">
                  <FormItem>
                    <FormLabel>Nama perusahaan</FormLabel>
                    <FormControl><Input autocomplete="organization" v-bind="componentField" /></FormControl>
                    <FormMessage />
                  </FormItem>
                </FormField>
                <DialogFooter>
                  <Button type="submit" :disabled="companyForm.isSubmitting.value">
                    <Loader2 v-if="companyForm.isSubmitting.value" class="size-4 animate-spin" aria-hidden="true" />
                    Buat
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <NoTenantState v-if="!auth.activeTenantId.value" />
        <ErrorState v-else-if="tenantError" :error="tenantError" />
        <Card v-else-if="tenant" class="glass">
          <CardHeader>
            <CardTitle class="font-heading">{{ tenant.tenant.name }}</CardTitle>
            <CardDescription
              >Slug: {{ tenant.tenant.slug }} · {{ tenant.activeMemberCount }} anggota aktif</CardDescription
            >
          </CardHeader>
          <CardContent class="space-y-4">
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Peran Anda</p>
              <div class="flex flex-wrap gap-2">
                <Badge v-for="role in tenant.membership.roles" :key="role" variant="secondary" class="capitalize">{{
                  role
                }}</Badge>
              </div>
            </div>
            <Separator />
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Izin efektif</p>
              <div class="flex flex-wrap gap-2">
                <Badge
                  v-for="permission in tenant.membership.permissions"
                  :key="permission"
                  variant="outline"
                  class="font-mono text-xs"
                >
                  {{ permission }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance" class="space-y-4">
        <Card class="glass max-w-3xl">
          <CardHeader>
            <CardTitle class="font-heading">Tema</CardTitle>
            <CardDescription>Tema gelap premium adalah default.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <div class="max-w-xs space-y-2">
              <Label for="color-mode">Mode warna</Label>
              <Select :model-value="colorMode.preference" @update:model-value="onColorModeChange">
                <SelectTrigger id="color-mode" class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in colorModeOptions" :key="option.value" :value="option.value">{{
                    option.label
                  }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-3">
              <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Token semantik</p>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div v-for="swatch in swatches" :key="swatch.label" class="flex items-center gap-2 text-sm">
                  <span
                    :class="['size-6 rounded-md border border-glass-border', swatch.className]"
                    aria-hidden="true"
                  />
                  {{ swatch.label }}
                </div>
              </div>
            </div>
            <div class="space-y-3">
              <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Token status agent (untuk orchestrator)
              </p>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div v-for="token in agentTokens" :key="token.label" class="flex items-center gap-2 text-sm">
                  <span :class="['size-6 rounded-md border border-glass-border', token.className]" aria-hidden="true" />
                  {{ token.label }}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="session">
        <Card class="glass max-w-2xl">
          <CardHeader>
            <CardTitle class="font-heading">Sesi saat ini</CardTitle>
            <CardDescription>Sesi disimpan di server dan dikirim sebagai cookie HttpOnly.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-1 text-sm">
            <p>
              Berlaku hingga:
              <strong>{{
                auth.state.value.sessionExpiresAt ? formatter.format(auth.state.value.sessionExpiresAt) : '—'
              }}</strong>
            </p>
            <p class="text-muted-foreground">Keluar akan mencabut sesi ini di database.</p>
          </CardContent>
          <CardFooter>
            <Button variant="destructive" :disabled="loggingOut" @click="logout"
              ><LogOut class="size-4" aria-hidden="true" />Keluar</Button
            >
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
