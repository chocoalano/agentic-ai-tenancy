<script setup lang="ts">
/**
 * Cangkang halaman manajemen (layout `app`): latar game bersama, navigasi
 * atas HUD, area konten, dan GameMenu (Sheet yang sama dengan /office) untuk
 * layar < 1280px. /office tetap memakai layout `game` layar penuh.
 */
defineProps<{ title?: string }>()

const route = useRoute()
const menuOpen = ref(false)
const identity = computed(() => activeNavigation(route.path)?.identity ?? 'Agentic AI Virtual Office')
</script>

<template>
  <div class="relative min-h-dvh overflow-x-clip text-foreground" data-game-shell>
    <GamePageBackground />
    <a
      href="#konten"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
    >
      Lewati ke konten
    </a>
    <GameTopNav :identity="identity" :title="title" @open-menu="menuOpen = true" />
    <main id="konten" class="relative z-10 mx-auto w-full max-w-[96rem] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
      <slot />
    </main>
    <GameMenu v-model:open="menuOpen" />
  </div>
</template>
