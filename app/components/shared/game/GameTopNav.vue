<script setup lang="ts">
import { Building2, ChevronDown, Lock, Menu, Settings } from '@lucide/vue'

/**
 * Strip HUD atas halaman manajemen — pola yang sama dengan GameHUD /office:
 * strip `hud-bar`, kartu komandan (crest perusahaan = pemilih tenant), kartu
 * modul (`game-nav-link` = kartu HUD kecil dengan ikon bercahaya) dari
 * `NAVIGATION`, menu "Segera" untuk modul yang belum dibangun (nonaktif,
 * tanpa tautan palsu), lalu aksi HUD: pencarian, notifikasi, pengaturan,
 * tombol cepat Virtual Office, menu pengguna, dan menu game (< 1280px).
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
  <header class="hud-bar sticky top-0 z-30 px-2.5 pt-1 md:px-3" data-game-topnav>
    <div class="mx-auto flex h-14.75 max-w-384 items-center gap-2 max-md:h-13.75 max-md:gap-1">
      <Button
        variant="ghost"
        size="icon"
        class="hud-icon-btn size-10 shrink-0 xl:hidden"
        aria-label="Buka menu game"
        data-game-menu-trigger
        @click="emit('openMenu')"
      >
        <Menu class="size-7" aria-hidden="true" />
      </Button>

      <!-- Kartu komandan: perusahaan aktif (crest) + komandan; klik = ganti perusahaan -->
      <TenantSwitcher variant="hud" />

      <nav class="ml-1 hidden items-center gap-1.5 xl:flex [&_a>svg]:hidden 2xl:[&_a>svg]:block" aria-label="Modul">
        <NuxtLink
          v-for="item in available"
          :key="item.key"
          :to="item.to ?? '/'"
          class="game-nav-link"
          :data-active="isNavigationActive(item, path) ? 'true' : 'false'"
          :aria-current="isNavigationActive(item, path) ? 'page' : undefined"
          :data-nav="item.key"
        >
          <component :is="item.icon" class="size-4.5" aria-hidden="true" />
          {{ item.label }}
        </NuxtLink>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button type="button" class="game-nav-link" data-nav="upcoming">
              <Lock class="size-4.5" aria-hidden="true" />
              Segera
              <ChevronDown class="size-3.5 opacity-70" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="game-panel w-72 rounded-xl">
            <DropdownMenuLabel class="text-[10px] font-semibold uppercase tracking-[0.16em] text-office-orange"
              >Area yang sedang dibangun</DropdownMenuLabel
            >
            <DropdownMenuItem v-for="item in upcoming" :key="item.key" disabled class="gap-2 text-blue-100">
              <component :is="item.icon" class="size-4" aria-hidden="true" />
              <span class="flex-1">{{ item.label }}</span>
              <OfficeStatusBadge tone="purple" :label="item.release ?? 'Segera'" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div class="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 md:gap-1">
        <div class="min-w-0 2xl:w-64">
          <GlobalSearch />
        </div>
        <NotificationTrigger />
        <Button variant="ghost" size="icon" class="hud-icon-btn hidden size-10 xl:inline-flex" as-child>
          <NuxtLink to="/settings" aria-label="Pengaturan" data-nav="settings-quick">
            <Settings class="size-7" aria-hidden="true" />
          </NuxtLink>
        </Button>
        <Button variant="ghost" size="icon" class="hud-icon-btn size-10 xl:hidden" as-child>
          <NuxtLink to="/office" aria-label="Buka Virtual Office" data-nav="office-quick">
            <Building2 class="size-7" aria-hidden="true" />
          </NuxtLink>
        </Button>
        <UserMenu />
      </div>
    </div>

    <div
      class="mx-auto flex h-8 max-w-384 items-center gap-2 border-t border-[#6288cb5c] text-[10px] font-semibold uppercase tracking-[0.16em] xl:hidden"
      data-game-identity-strip
    >
      <p class="truncate text-office-cyan">{{ identity ?? 'Agentic AI Virtual Office' }}</p>
      <template v-if="title">
        <span class="text-blue-300" aria-hidden="true">·</span>
        <p class="truncate normal-case tracking-normal text-blue-100">{{ title }}</p>
      </template>
    </div>
  </header>
</template>
