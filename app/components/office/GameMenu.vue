<script setup lang="ts">
import { Images, Lock, LogOut } from '@lucide/vue'
import { toast } from 'vue-sonner'

/**
 * Menu game (Sheet) — pengganti sidebar aplikasi di layout game: pemilih
 * perusahaan, navigasi modul (modul belum tersedia tampil nonaktif), galeri
 * aset, pengaturan, dan keluar.
 */
const open = defineModel<boolean>('open', { required: true })

const route = useRoute()
const auth = useAuth()
const loggingOut = ref(false)
const settings = SETTINGS_NAVIGATION

watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

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
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="left"
      class="dark w-80 gap-0 border-office-border/60 bg-office-bg/95 p-0 text-foreground backdrop-blur-xl sm:max-w-80"
    >
      <SheetHeader class="border-b border-white/10 px-4 py-4">
        <SheetTitle class="sr-only">Menu Virtual Office</SheetTitle>
        <SheetDescription class="sr-only">Navigasi modul, perusahaan aktif, dan akun.</SheetDescription>
        <AppLogo />
      </SheetHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        <TenantSwitcher variant="header" />

        <nav aria-label="Navigasi modul" class="space-y-4">
          <section v-for="group in NAVIGATION" :key="group.key">
            <p class="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              {{ group.label }}
            </p>
            <ul class="space-y-0.5">
              <li v-for="item in group.items" :key="item.key">
                <NuxtLink
                  v-if="item.to"
                  :to="item.to"
                  :aria-current="isNavigationActive(item, route.path) ? 'page' : undefined"
                  :class="[
                    'flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-white/8',
                    isNavigationActive(item, route.path) ? 'bg-office-cyan/12 text-office-cyan' : '',
                  ]"
                >
                  <component :is="item.icon" class="size-4" aria-hidden="true" />
                  {{ item.label }}
                </NuxtLink>
                <span
                  v-else
                  class="flex h-9 cursor-not-allowed items-center gap-2.5 rounded-lg px-2 text-sm text-muted-foreground/70"
                  aria-disabled="true"
                >
                  <component :is="item.icon" class="size-4" aria-hidden="true" />
                  {{ item.label }}
                  <span class="ml-auto flex items-center gap-1 text-[10px]">
                    <Lock class="size-3" aria-hidden="true" />{{ item.release }}
                  </span>
                  <span class="sr-only">— belum tersedia</span>
                </span>
              </li>
            </ul>
          </section>
        </nav>

        <div class="space-y-0.5 border-t border-white/10 pt-3">
          <NuxtLink
            to="/office/assets"
            class="flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-white/8"
          >
            <Images class="size-4" aria-hidden="true" />
            Galeri aset game
          </NuxtLink>
          <NuxtLink
            :to="settings.to ?? '/settings'"
            class="flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-white/8"
          >
            <component :is="settings.icon" class="size-4" aria-hidden="true" />
            {{ settings.label }}
          </NuxtLink>
        </div>
      </div>

      <div class="flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ auth.user.value?.displayName }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ auth.user.value?.email }}</p>
        </div>
        <Button variant="ghost" size="sm" class="gap-1.5" :disabled="loggingOut" @click="logout">
          <LogOut class="size-4" aria-hidden="true" />
          Keluar
        </Button>
      </div>
    </SheetContent>
  </Sheet>
</template>
