<script setup lang="ts">
import { Building2 } from '@lucide/vue'
</script>

<template>
  <EmptyState
    :icon="Building2"
    title="Belum ada perusahaan aktif"
    description="Buat perusahaan baru atau minta undangan dari administrator perusahaan Anda untuk mulai bekerja dengan AI employee."
  >
    <Button as-child size="sm">
      <NuxtLink to="/settings?tab=company">Buat perusahaan</NuxtLink>
    </Button>
  </EmptyState>
</template>
