<script setup lang="ts">
/**
 * Cangkang halaman manajemen (layout `app`) — pola yang sama dengan layout
 * game /office: bingkai SELALU gelap (kelas `dark`, latar office-bg), latar
 * dunia Mission Map, strip HUD atas, area konten, dan GameMenu (Sheet yang
 * sama dengan /office) untuk layar < 1280px.
 */
defineProps<{ title?: string }>()

const route = useRoute()
const menuOpen = ref(false)
const identity = computed(() => activeNavigation(route.path)?.identity ?? 'Agentic AI Virtual Office')
</script>

<template>
  <div class="dark relative min-h-dvh overflow-x-clip bg-office-bg text-foreground" data-game-shell>
    <GamePageBackground />
    <a
      href="#konten"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-office-bg focus:px-3 focus:py-2 focus:ring-2 focus:ring-office-cyan"
    >
      Lewati ke konten
    </a>
    <GameTopNav :identity="identity" :title="title" @open-menu="menuOpen = true" />
    <main id="konten" class="relative z-10 mx-auto w-full max-w-384 px-3 pb-16 pt-4 sm:px-5 lg:px-6 lg:pt-5">
      <slot />
    </main>
    <GameMenu v-model:open="menuOpen" />
  </div>
</template>
