<script setup lang="ts">
const auth = useAuth()
</script>

<template>
  <div class="relative min-h-dvh overflow-x-clip">
    <div class="holo-aurora pointer-events-none absolute inset-0" aria-hidden="true" />
    <div
      class="holo-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      aria-hidden="true"
    />
    <a
      href="#konten"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
    >
      Lewati ke konten
    </a>
    <header class="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
      <NuxtLink to="/" aria-label="Beranda"><AppLogo /></NuxtLink>
      <nav class="flex items-center gap-1" aria-label="Navigasi utama">
        <ThemeToggle />
        <template v-if="auth.isAuthenticated.value">
          <Button as-child size="sm"><NuxtLink to="/office">Buka kantor</NuxtLink></Button>
        </template>
        <template v-else>
          <Button as-child variant="ghost" size="sm"><NuxtLink to="/login">Masuk</NuxtLink></Button>
          <Button as-child size="sm"><NuxtLink to="/register">Daftar</NuxtLink></Button>
        </template>
      </nav>
    </header>
    <main id="konten" class="relative z-10">
      <slot />
    </main>
  </div>
</template>
