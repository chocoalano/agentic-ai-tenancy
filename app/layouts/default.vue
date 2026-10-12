<script setup lang="ts">
/**
 * Layout publik (beranda, masuk, daftar, halaman error): identitas game yang
 * sama dengan Virtual Office — selalu gelap, latar dunia Mission Map, tombol
 * game — agar perpindahan masuk → kantor tidak terasa berganti produk.
 */
const auth = useAuth()
</script>

<template>
  <div class="dark relative min-h-dvh overflow-x-clip bg-office-bg text-foreground">
    <GamePageBackground />
    <a
      href="#konten"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-office-bg focus:px-3 focus:py-2"
    >
      Lewati ke konten
    </a>
    <header class="hud-bar relative z-10 px-3">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between">
        <NuxtLink to="/" aria-label="Beranda"><AppLogo /></NuxtLink>
        <nav class="flex items-center gap-2" aria-label="Navigasi utama">
          <template v-if="auth.isAuthenticated.value">
            <Button as-child size="sm"><NuxtLink to="/office">Buka kantor</NuxtLink></Button>
          </template>
          <template v-else>
            <Button as-child variant="outline" size="sm"><NuxtLink to="/login">Masuk</NuxtLink></Button>
            <Button as-child size="sm"><NuxtLink to="/register">Daftar</NuxtLink></Button>
          </template>
        </nav>
      </div>
    </header>
    <main id="konten" class="relative z-10">
      <slot />
    </main>
  </div>
</template>
