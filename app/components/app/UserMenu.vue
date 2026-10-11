<script setup lang="ts">
import { Laptop, LogOut, Moon, Settings, Sun, UserRound } from '@lucide/vue'
import { toast } from 'vue-sonner'

const auth = useAuth()
const colorMode = useColorMode()
const loggingOut = ref(false)
const initials = computed(() => initialsOf(auth.user.value?.displayName ?? '?'))
const roleLabel = computed(() => auth.activeTenant.value?.roles.join(', ') ?? 'Tanpa perusahaan aktif')

const themes = [
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'system', label: 'Ikuti sistem', icon: Laptop },
] as const

function onThemeChange(value: unknown) {
  const theme = themes.find((item) => item.value === value)
  if (theme) colorMode.preference = theme.value
}

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
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="h-10 gap-2.5 rounded-xl px-1.5 md:pr-2.5" aria-label="Menu pengguna">
        <Avatar class="size-8 rounded-lg ring-1 ring-inset ring-glass-border">
          <AvatarFallback
            class="rounded-lg bg-gradient-to-br from-brand-blue/45 to-brand-violet/35 text-xs font-semibold"
          >
            {{ initials }}
          </AvatarFallback>
        </Avatar>
        <span class="hidden min-w-0 flex-col items-start leading-tight md:flex">
          <span class="max-w-36 truncate text-sm font-medium">{{ auth.user.value?.displayName }}</span>
          <span class="max-w-36 truncate text-[11px] font-normal capitalize text-muted-foreground">{{
            roleLabel
          }}</span>
        </span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64">
      <DropdownMenuLabel class="font-normal">
        <p class="truncate text-sm font-medium">{{ auth.user.value?.displayName }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ auth.user.value?.email }}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <NuxtLink to="/settings?tab=profile"><UserRound class="size-4" aria-hidden="true" />Profil</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <NuxtLink to="/settings"><Settings class="size-4" aria-hidden="true" />Pengaturan</NuxtLink>
      </DropdownMenuItem>
      <!-- Tema di menu pengguna untuk layar kecil (tombol tema topbar disembunyikan di bawah sm). -->
      <div class="sm:hidden">
        <DropdownMenuSeparator />
        <DropdownMenuLabel class="text-xs text-muted-foreground">Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup :model-value="colorMode.preference" @update:model-value="onThemeChange">
          <DropdownMenuRadioItem v-for="theme in themes" :key="theme.value" :value="theme.value">
            <component :is="theme.icon" class="size-4" aria-hidden="true" />
            {{ theme.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" :disabled="loggingOut" @select="logout">
        <LogOut class="size-4" aria-hidden="true" />
        Keluar
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
