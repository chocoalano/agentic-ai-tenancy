<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import {
  Bot,
  Building2,
  Check,
  Gauge,
  KeyRound,
  ListChecks,
  Loader2,
  LogOut,
  Moon,
  Palette,
  Plus,
  ShieldCheck,
  UserRound,
  Zap,
  ZapOff,
} from '@lucide/vue'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import * as z from 'zod'
import type { GameTabItem } from '~/components/shared/game/GameTabs.vue'

/*
 * /settings — Commander Control Center (referensi implementasi Agentic Game UI
 * untuk halaman non-office). Semua data dari sesi/API; kontrol yang belum
 * didukung backend ditampilkan nonaktif dengan alasan, bukan input palsu.
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'Pengaturan', colorMode: 'dark' })
useHead({ title: 'Pengaturan' })

const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const auth = useAuth()
const uiPreferences = useUiPreferences()

const TABS = ['profile', 'company', 'appearance', 'session'] as const
type SettingsTab = (typeof TABS)[number]
const tab = computed<SettingsTab>({
  get: () => TABS.find((value) => value === route.query.tab) ?? 'profile',
  set: (value) => router.replace({ query: { ...route.query, tab: value } }),
})
const tabItems: GameTabItem[] = [
  { value: 'profile', label: 'Profil', icon: UserRound },
  { value: 'company', label: 'Perusahaan', icon: Building2 },
  { value: 'appearance', label: 'Tampilan', icon: Palette },
  { value: 'session', label: 'Sesi', icon: KeyRound },
]
function onTabChange(value: string) {
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

const user = computed(() => auth.user.value)
const initials = computed(() => initialsOf(user.value?.displayName ?? '?'))
const activeCompany = computed(() => auth.activeMembership.value?.tenant ?? null)
const roles = computed(() => auth.activeTenant.value?.roles ?? [])
const permissions = computed(() => auth.activeTenant.value?.permissions ?? [])
const permissionGroups = computed(() => {
  const groups = new Map<string, string[]>()
  for (const key of permissions.value) {
    const [module = key] = key.split('.')
    groups.set(module, [...(groups.get(module) ?? []), key])
  }
  return [...groups.entries()].map(([module, keys]) => ({ module, keys }))
})
const sessionExpiresAt = computed(() => auth.state.value.sessionExpiresAt ?? null)

const longFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' })
const shortFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

// --- Sesi -------------------------------------------------------------------
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

// --- Perusahaan -------------------------------------------------------------
const switching = ref<string | null>(null)
async function activateCompany(tenantId: string) {
  if (tenantId === auth.activeTenantId.value || switching.value) return
  switching.value = tenantId
  try {
    const failure = await auth.switchTenant(tenantId)
    if (failure) toast.error('Gagal mengganti perusahaan', { description: failure.message })
    else toast.success(`Beralih ke ${auth.activeMembership.value?.tenant.name ?? 'perusahaan'}`)
  } finally {
    switching.value = null
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

// --- Tampilan ---------------------------------------------------------------
const MOTION_OPTIONS = [
  {
    value: 'system',
    label: 'Ikuti sistem',
    description: 'Animasi aktif kecuali sistem operasi meminta dikurangi.',
    icon: Zap,
  },
  {
    value: 'reduced',
    label: 'Kurangi gerakan',
    description: 'Matikan animasi ambient & transisi di seluruh aplikasi, termasuk Virtual Office.',
    icon: ZapOff,
  },
] as const
function setMotion(value: string) {
  if (isMotionPreference(value)) uiPreferences.setMotion(value)
}

const swatches = [
  { label: 'Primary', className: 'bg-game-primary' },
  { label: 'Cyan', className: 'bg-game-cyan' },
  { label: 'Purple', className: 'bg-game-purple' },
  { label: 'Orange', className: 'bg-game-orange' },
  { label: 'Success', className: 'bg-game-success' },
  { label: 'Destructive', className: 'bg-destructive' },
]

const quickLinks = computed(() =>
  NAVIGATION.flatMap((group) => group.items).filter((item) => item.status === 'available' && item.to),
)
</script>

<template>
  <div class="space-y-6">
    <GamePageHeader
      identity="Commander Control Center"
      title="Pengaturan"
      description="Akun & perusahaan: profil komandan, perusahaan aktif, tampilan, dan sesi Anda."
      :icon="ShieldCheck"
    >
      <template #meta>
        <span class="game-chip" data-settings-company-chip>
          <Building2 class="size-3.5 text-game-cyan" aria-hidden="true" />
          {{ activeCompany?.name ?? 'Belum ada perusahaan aktif' }}
        </span>
        <span v-if="roles.length" class="game-chip capitalize">
          <ShieldCheck class="size-3.5 text-game-success" aria-hidden="true" />
          {{ roles.join(', ') }}
        </span>
      </template>
      <template #actions>
        <Button variant="outline" as-child class="gap-1.5">
          <NuxtLink to="/office"><Building2 class="size-4" aria-hidden="true" />Kembali ke Virtual Office</NuxtLink>
        </Button>
      </template>
    </GamePageHeader>

    <!-- Profil komandan -->
    <GamePanel variant="command" padding="lg" as="section" aria-label="Profil komandan" data-commander-profile>
      <div class="flex flex-col gap-6 md:flex-row md:items-center">
        <span class="game-crest-glow shrink-0" aria-hidden="true">
          <span class="game-crest size-20 text-2xl md:size-24 md:text-3xl">{{ initials }}</span>
        </span>
        <div class="min-w-0 flex-1 space-y-1.5">
          <p class="type-eyebrow">Commander</p>
          <h2 class="font-heading text-2xl font-semibold leading-tight md:text-3xl" data-commander-name>
            {{ user?.displayName }}
          </h2>
          <p class="text-sm text-game-text-muted" data-commander-email>{{ user?.email }}</p>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <Badge v-for="role in roles" :key="role" class="capitalize">{{ role }}</Badge>
            <Badge v-if="activeCompany" variant="outline" class="gap-1">
              <Building2 class="size-3" aria-hidden="true" />{{ activeCompany.name }}
            </Badge>
            <Badge variant="outline" class="gap-1 text-game-success">
              <Check class="size-3" aria-hidden="true" />Sesi aktif
            </Badge>
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-3 md:w-80">
          <div class="game-panel game-panel-sunken p-3">
            <dt class="type-label">Perusahaan</dt>
            <dd class="type-metric text-xl">{{ auth.memberships.value.length }}</dd>
          </div>
          <div class="game-panel game-panel-sunken p-3">
            <dt class="type-label">Izin aktif</dt>
            <dd class="type-metric text-xl">{{ permissions.length }}</dd>
          </div>
          <div class="game-panel game-panel-sunken col-span-2 p-3">
            <dt class="type-label">Sesi berlaku hingga</dt>
            <dd class="text-sm font-semibold tabular-nums">
              {{ sessionExpiresAt ? shortFormatter.format(sessionExpiresAt) : '—' }}
            </dd>
          </div>
        </dl>
      </div>
    </GamePanel>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <GameTabs :items="tabItems" :model-value="tab" label="Bagian pengaturan" @update:model-value="onTabChange">
        <!-- Profil -->
        <TabsContent value="profile" class="space-y-4" data-settings-tab="profile">
          <GamePanel
            variant="holo"
            title="Profil komandan"
            description="Data akun dari sesi terautentikasi."
            :icon="UserRound"
            heading-id="profil-judul"
          >
            <dl>
              <GameInfoRow label="Nama tampilan">{{ user?.displayName }}</GameInfoRow>
              <GameInfoRow label="Email">{{ user?.email }}</GameInfoRow>
              <GameInfoRow label="ID akun" mono>{{ user?.id }}</GameInfoRow>
              <GameInfoRow label="Bergabung">{{ user ? longFormatter.format(user.createdAt) : '—' }}</GameInfoRow>
              <GameInfoRow label="Perusahaan aktif">{{ activeCompany?.name ?? '—' }}</GameInfoRow>
              <GameInfoRow label="Peran di perusahaan aktif">
                <span class="capitalize">{{ roles.join(', ') || '—' }}</span>
              </GameInfoRow>
            </dl>
            <template #footer>
              <Button disabled aria-disabled="true" data-profile-edit>Ubah profil</Button>
              <p class="type-support text-xs">
                Pengubahan nama/email belum tersedia di API (hadir pada iterasi berikutnya); data di atas hanya-baca.
              </p>
            </template>
          </GamePanel>
        </TabsContent>

        <!-- Perusahaan -->
        <TabsContent value="company" class="space-y-4" data-settings-tab="company">
          <NoTenantState v-if="!auth.activeTenantId.value" />
          <ErrorState v-else-if="tenantError" :error="tenantError" />
          <GamePanel
            v-else-if="tenant"
            variant="holo"
            :title="tenant.tenant.name"
            :description="`Slug ${tenant.tenant.slug} · ${tenant.activeMemberCount} anggota aktif`"
            :icon="Building2"
            eyebrow="Perusahaan aktif"
            data-company-panel
          >
            <template #actions>
              <Dialog v-model:open="createOpen">
                <DialogTrigger as-child>
                  <Button size="sm" variant="outline"><Plus class="size-4" aria-hidden="true" />Buat perusahaan</Button>
                </DialogTrigger>
                <DialogContent class="game-panel game-panel-elevated sm:max-w-md">
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
            </template>
            <div class="grid gap-5 md:grid-cols-2">
              <div>
                <p class="type-label mb-2">Peran Anda</p>
                <div class="flex flex-wrap gap-2">
                  <Badge v-for="role in tenant.membership.roles" :key="role" class="capitalize">{{ role }}</Badge>
                </div>
              </div>
              <div>
                <p class="type-label mb-2">Identitas tenant</p>
                <p class="font-mono text-xs break-all">{{ tenant.tenant.id }}</p>
              </div>
            </div>
            <Separator class="my-4" />
            <p class="type-label mb-2">Izin efektif (dari database, per modul)</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <div
                v-for="group in permissionGroups"
                :key="group.module"
                class="game-panel game-panel-sunken p-3"
                :data-permission-module="group.module"
              >
                <p class="mb-1.5 text-xs font-semibold capitalize text-game-cyan">{{ group.module }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="permission in group.keys"
                    :key="permission"
                    variant="outline"
                    class="font-mono text-[11px]"
                  >
                    {{ permission }}
                  </Badge>
                </div>
              </div>
            </div>
          </GamePanel>

          <GamePanel
            title="Perusahaan Anda"
            description="Tenant aktif melekat pada sesi dan berlaku untuk semua tab."
            :icon="Building2"
            data-memberships-panel
          >
            <ul class="divide-y divide-game-border/60">
              <li
                v-for="membership in auth.memberships.value"
                :key="membership.tenant.id"
                class="hud-row my-1.5 flex items-center gap-3 px-3 py-2.5"
              >
                <span
                  class="grid size-9 shrink-0 place-items-center rounded-lg bg-game-primary/15 text-xs font-bold text-game-cyan ring-1 ring-inset ring-game-border"
                  aria-hidden="true"
                >
                  {{ initialsOf(membership.tenant.name) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{{ membership.tenant.name }}</p>
                  <p class="truncate text-xs capitalize text-game-text-muted">{{ membership.roles.join(', ') }}</p>
                </div>
                <Badge v-if="membership.tenant.id === auth.activeTenantId.value" class="gap-1">
                  <Check class="size-3" aria-hidden="true" />Aktif
                </Badge>
                <Button
                  v-else
                  size="sm"
                  variant="outline"
                  :disabled="switching !== null"
                  :data-activate-tenant="membership.tenant.id"
                  @click="activateCompany(membership.tenant.id)"
                >
                  <Loader2 v-if="switching === membership.tenant.id" class="size-4 animate-spin" aria-hidden="true" />
                  Aktifkan
                </Button>
              </li>
              <li v-if="auth.memberships.value.length === 0" class="py-3 text-sm text-game-text-muted">
                Belum ada perusahaan.
              </li>
            </ul>
          </GamePanel>
        </TabsContent>

        <!-- Tampilan -->
        <TabsContent value="appearance" class="space-y-4" data-settings-tab="appearance">
          <GamePanel
            variant="holo"
            title="Tema"
            description="Satu identitas visual untuk seluruh aplikasi — sama dengan Virtual Office."
            :icon="Palette"
            data-theme-panel
          >
            <div class="flex flex-wrap items-center gap-3">
              <span class="game-chip"
                ><Moon class="size-3.5 text-office-cyan" aria-hidden="true" />Gelap · identitas game</span
              >
              <p class="text-[13px] text-blue-100">
                Navy neon seperti HUD Virtual Office dipakai di semua halaman; tidak ada mode terang terpisah agar tidak
                ada dua bahasa visual.
              </p>
            </div>
          </GamePanel>

          <GamePanel title="Gerakan" description="Berlaku untuk animasi ambient, transisi, dan mesin game." :icon="Zap">
            <fieldset>
              <legend class="sr-only">Preferensi gerakan</legend>
              <div class="grid gap-3 sm:grid-cols-2">
                <label
                  v-for="option in MOTION_OPTIONS"
                  :key="option.value"
                  class="game-panel relative flex cursor-pointer flex-col gap-2 p-4 transition has-checked:game-panel-holo has-focus-visible:ring-2 has-focus-visible:ring-ring"
                  :data-motion-option="option.value"
                >
                  <input
                    type="radio"
                    name="motion"
                    class="sr-only"
                    :value="option.value"
                    :checked="uiPreferences.motion.value === option.value"
                    @change="setMotion(option.value)"
                  />
                  <span class="flex items-center gap-2 text-sm font-semibold">
                    <component :is="option.icon" class="size-4 text-game-cyan" aria-hidden="true" />
                    {{ option.label }}
                    <Check
                      v-if="uiPreferences.motion.value === option.value"
                      class="ml-auto size-4 text-game-cyan"
                      aria-hidden="true"
                    />
                  </span>
                  <span class="type-support">{{ option.description }}</span>
                </label>
              </div>
            </fieldset>
          </GamePanel>

          <GamePanel title="Kualitas visual game" :icon="Gauge" variant="sunken">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="type-support">
                Pengaturan kualitas rendering (efek, partikel, resolusi sprite) belum tersedia; mesin game memakai
                profil tunggal yang sudah dioptimalkan.
              </p>
              <Button variant="outline" size="sm" disabled aria-disabled="true">Belum tersedia</Button>
            </div>
          </GamePanel>

          <GamePanel
            title="Palet Agentic Game UI"
            description="Token semantik yang dipakai seluruh aplikasi."
            :icon="Palette"
          >
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div v-for="swatch in swatches" :key="swatch.label" class="flex items-center gap-2 text-sm">
                <span
                  :class="['size-6 rounded-md ring-1 ring-inset ring-game-border', swatch.className]"
                  aria-hidden="true"
                />
                {{ swatch.label }}
              </div>
            </div>
          </GamePanel>
        </TabsContent>

        <!-- Sesi -->
        <TabsContent value="session" class="space-y-4" data-settings-tab="session">
          <GamePanel
            variant="holo"
            title="Sesi saat ini"
            description="Sesi disimpan di server dan dikirim sebagai cookie HttpOnly; divalidasi ulang pada setiap request dan selama koneksi realtime."
            :icon="KeyRound"
          >
            <dl>
              <GameInfoRow label="Berlaku hingga">
                {{ sessionExpiresAt ? longFormatter.format(sessionExpiresAt) : '—' }}
              </GameInfoRow>
              <GameInfoRow label="Perusahaan aktif pada sesi">{{ activeCompany?.name ?? '—' }}</GameInfoRow>
              <GameInfoRow label="Perangkat ini" hint="Hanya sesi yang sedang Anda pakai yang dapat dilihat.">
                Aktif
              </GameInfoRow>
            </dl>
            <template #footer>
              <Button variant="destructive" :disabled="loggingOut" data-logout @click="logout">
                <Loader2 v-if="loggingOut" class="size-4 animate-spin" aria-hidden="true" />
                <LogOut v-else class="size-4" aria-hidden="true" />
                Keluar dari sesi ini
              </Button>
              <p class="type-support text-xs">Keluar mencabut sesi ini di database.</p>
            </template>
          </GamePanel>
          <GamePanel title="Perangkat & sesi lain" variant="sunken">
            <p class="type-support">
              Daftar perangkat lain dan pencabutan sesi jarak jauh belum tersedia di API; tidak ada daftar perangkat
              yang ditampilkan agar tidak menyesatkan.
            </p>
          </GamePanel>
        </TabsContent>
      </GameTabs>

      <!-- Rail ringkasan -->
      <aside class="space-y-4" aria-label="Area lain">
        <GamePanel variant="elevated" title="Area pusat komando" :icon="Bot" padding="sm">
          <ul class="space-y-1">
            <li v-for="item in quickLinks" :key="item.key">
              <NuxtLink
                :to="item.to ?? '/'"
                class="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-game-cyan/10"
              >
                <span
                  class="grid size-8 shrink-0 place-items-center rounded-lg bg-game-primary/15 text-game-cyan"
                  aria-hidden="true"
                >
                  <component :is="item.icon" class="size-4" />
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ item.label }}</span>
                  <span class="type-eyebrow block truncate text-[9.5px] tracking-[0.14em]">{{ item.identity }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </GamePanel>
        <GamePanel title="Perusahaan aktif" :icon="Building2" padding="sm">
          <template v-if="tenant">
            <p class="text-sm font-semibold">{{ tenant.tenant.name }}</p>
            <p class="type-support text-xs">{{ tenant.activeMemberCount }} anggota aktif · {{ tenant.tenant.slug }}</p>
            <Button variant="outline" size="sm" class="mt-3 w-full gap-1.5" as-child>
              <NuxtLink to="/tasks"><ListChecks class="size-4" aria-hidden="true" />Lihat papan misi</NuxtLink>
            </Button>
          </template>
          <p v-else class="type-support">Belum ada perusahaan aktif.</p>
        </GamePanel>
      </aside>
    </div>
  </div>
</template>
