<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const title = computed(() => {
  if (props.error.statusCode === 404) return 'Halaman tidak ditemukan'
  if (props.error.statusCode === 401 || props.error.statusCode === 403) return 'Akses ditolak'
  return 'Terjadi kesalahan'
})

useHead({ title })
</script>

<template>
  <NuxtLayout name="default">
    <section class="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <p class="font-heading text-6xl font-semibold text-gradient-brand">{{ error.statusCode }}</p>
      <h1 class="font-heading text-2xl font-semibold">{{ title }}</h1>
      <p class="text-sm text-muted-foreground">
        {{
          error.statusCode === 404 ? 'Alamat yang Anda buka tidak tersedia.' : 'Silakan coba lagi beberapa saat lagi.'
        }}
      </p>
      <Button @click="clearError({ redirect: '/' })">Kembali ke beranda</Button>
    </section>
  </NuxtLayout>
</template>
