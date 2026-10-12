<script setup lang="ts">
import { Building2, ChevronDown, Lock, Menu } from '@lucide/vue'

/**
 * Navigasi atas bergaya HUD game untuk halaman manajemen (Agentic Game UI).
 *
 * Desktop ≥ 1280px: identitas aplikasi, tab modul yang tersedia (data
 * `NAVIGATION` — satu sumber dengan menu game & pencarian global), menu
 * "Segera" untuk modul yang belum dibangun (nonaktif, tanpa tautan palsu),
 * pemilih perusahaan, pencarian global, notifikasi, tema, menu pengguna.
 * Di bawah 1280px: tombol menu membuka GameMenu (Sheet yang sama dengan
 * /office) dan tombol cepat ke Virtual Office; strip kedua menampilkan
 * identitas area + judul halaman.
 */
const props = defineProps<{ identity?: string; title?: string; currentPath?: string }>()
const emit = defineEmits<{ openMenu: [] }>()

const route = useRoute()
const path = computed(() => props.currentPath ?? route.path)
const modules = NAVIGATION.flatMap((group) => group.items)
const available = [...modules.filter((item) => item.status === 'available' && item.to), SETTINGS_NAVIGATION]
const upcoming = modules.filter((item) => item.status === 'soon')
</script>

<template>
  <header class="game-topnav sticky top-0 z-30" data-game-topnav>
    <div class="mx-auto flex h-16 max-w-[96rem] items-center gap-2 px-3 sm:px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        class="size-10 rounded-xl xl:hidden"
        aria-label="Buka menu game"
        data-game-menu-trigger
        @click="emit('openMenu')"
      >
        <Menu class="size-5" aria-hidden="true" />
      </Button>
      <NuxtLink to="/office" class="shrink-0 rounded-xl" aria-label="Kembali ke Virtual Office">
        <AppLogo />
      </NuxtLink>

      <nav
        class="ml-2 hidden items-center gap-0.5 xl:flex 2xl:ml-3 2xl:gap-1 [&_a>svg]:hidden 2xl:[&_a>svg]:block"
        aria-label="Modul"
      >
        <NuxtLink
          v-for="item in available"
          :key="item.key"
          :to="item.to ?? '/'"
          class="game-nav-link"
          :data-active="isNavigationActive(item, path) ? 'true' : 'false'"
          :aria-current="isNavigationActive(item, path) ? 'page' : undefined"
          :data-nav="item.key"
        >
          <component :is="item.icon" class="size-4" aria-hidden="true" />
          {{ item.label }}
        </NuxtLink>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button type="button" class="game-nav-link" data-nav="upcoming">
              <Lock class="size-4" aria-hidden="true" />
              Segera
              <ChevronDown class="size-3.5 opacity-70" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-72">
            <DropdownMenuLabel class="text-xs text-muted-foreground">Area yang sedang dibangun</DropdownMenuLabel>
            <DropdownMenuItem v-for="item in upcoming" :key="item.key" disabled class="gap-2">
              <component :is="item.icon" class="size-4" aria-hidden="true" />
              <span class="flex-1">{{ item.label }}</span>
              <span class="text-[10px] font-medium text-muted-foreground">{{ item.release }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div class="ml-auto flex min-w-0 items-center gap-1 md:gap-1.5">
        <div class="hidden shrink-0 md:block">
          <TenantSwitcher variant="header" />
        </div>
        <div class="min-w-0 2xl:w-64">
          <GlobalSearch />
        </div>
        <NotificationTrigger />
        <div class="hidden sm:block">
          <ThemeToggle />
        </div>
        <Button variant="ghost" size="icon" class="size-10 rounded-xl text-game-cyan xl:hidden" as-child>
          <NuxtLink to="/office" aria-label="Buka Virtual Office" data-nav="office-quick">
            <Building2 class="size-5" aria-hidden="true" />
          </NuxtLink>
        </Button>
        <UserMenu />
      </div>
    </div>

    <div
      class="mx-auto flex h-9 max-w-[96rem] items-center gap-2 border-t border-game-border/60 px-3 sm:px-4 lg:px-6 xl:hidden"
      data-game-identity-strip
    >
      <p class="type-eyebrow truncate">{{ identity ?? 'Agentic AI Virtual Office' }}</p>
      <template v-if="title">
        <span class="text-game-text-muted" aria-hidden="true">·</span>
        <p class="truncate text-xs font-medium">{{ title }}</p>
      </template>
    </div>
  </header>
</template>
