<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

const route = useRoute()
const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))

/*
 * Status sidebar:
 * - Desktop (≥ 1280px): mengikuti pilihan pengguna (cookie `sidebar_state` yang
 *   ditulis SidebarProvider), default terbuka. Dibaca via useCookie agar SSR dan
 *   hidrasi konsisten.
 * - Tablet (768–1279px): mulai ringkas (rel ikon); pengguna tetap dapat membuka.
 * - Mobile (< 768px): drawer (Sheet), dikelola SidebarProvider.
 */
const preference = useCookie<boolean | undefined>('sidebar_state', { readonly: true })
const sidebarOpen = ref(preference.value !== false)
const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1279px)')
watch(isTablet, (tablet) => {
  if (tablet) sidebarOpen.value = false
})
onMounted(() => {
  if (isTablet.value) sidebarOpen.value = false
})
</script>

<template>
  <SidebarProvider v-model:open="sidebarOpen">
    <a
      href="#konten"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
    >
      Lewati ke konten
    </a>
    <AppSidebar />
    <SidebarInset class="app-backdrop relative min-w-0 overflow-x-clip">
      <AppHeader :title="title" />
      <div id="konten" class="relative z-10 mx-auto w-full max-w-[90rem] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
