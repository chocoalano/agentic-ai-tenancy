<script setup lang="ts">
const colorMode = useColorMode()
const toasterTheme = computed(() => (colorMode.value === 'light' ? 'light' : 'dark'))
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLoadingIndicator color="var(--brand-cyan)" />
  <TooltipProvider :delay-duration="200">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </TooltipProvider>
  <Toaster rich-colors close-button position="top-right" :theme="toasterTheme" />
</template>
