<script setup lang="ts">
const colorMode = useColorMode()
const toasterTheme = computed(() => (colorMode.value === 'light' ? 'light' : 'dark'))

// Preferensi gerakan pengguna (cookie, konsisten SSR) → atribut html yang dibaca CSS global.
const uiPreferences = useUiPreferences()
useHead({ htmlAttrs: { 'data-motion': computed(() => uiPreferences.motion.value) } })
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLoadingIndicator color="var(--game-cyan)" />
  <TooltipProvider :delay-duration="200">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </TooltipProvider>
  <Toaster rich-colors close-button position="top-right" :theme="toasterTheme" />
</template>
