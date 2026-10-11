<script setup lang="ts">
/**
 * Topbar aplikasi terautentikasi.
 * Desktop: perusahaan aktif, pencarian global, notifikasi, tema, menu pengguna.
 * Mobile: tombol drawer, judul halaman, ikon pencarian, notifikasi, menu
 * pengguna (pemilih perusahaan ada di drawer, tema di menu pengguna).
 */
defineProps<{ title?: string }>()
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-background/80 px-3 backdrop-blur-xl md:h-16 md:rounded-t-xl md:px-4"
  >
    <SidebarTrigger class="size-10 rounded-xl md:size-9" aria-label="Buka/tutup navigasi" />
    <Separator orientation="vertical" class="mx-1 hidden h-6! md:block" />
    <div class="hidden min-w-0 md:block">
      <TenantSwitcher variant="header" />
    </div>
    <p class="type-card-title min-w-0 flex-1 truncate md:hidden">{{ title }}</p>
    <!-- Satu instance pencarian (satu dialog & satu pintasan ⌘K) untuk semua ukuran layar. -->
    <div class="flex md:flex-1 md:justify-center md:px-2">
      <GlobalSearch />
    </div>
    <div class="flex items-center gap-0.5 md:gap-1">
      <NotificationTrigger />
      <div class="hidden sm:block">
        <ThemeToggle />
      </div>
      <Separator orientation="vertical" class="mx-1 hidden h-6! md:block" />
      <UserMenu />
    </div>
  </header>
</template>
