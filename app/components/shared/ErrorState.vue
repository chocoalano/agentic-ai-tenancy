<script setup lang="ts">
import { CircleAlert, Lock, RotateCw } from '@lucide/vue'

const props = defineProps<{
  error: { statusCode?: number; message?: string } | null | undefined
  retry?: () => void
}>()

const unauthorized = computed(() => props.error?.statusCode === 401 || props.error?.statusCode === 403)
</script>

<template>
  <Alert :variant="unauthorized ? 'default' : 'destructive'" class="game-panel game-panel-warning">
    <Lock v-if="unauthorized" class="size-4" aria-hidden="true" />
    <CircleAlert v-else class="size-4" aria-hidden="true" />
    <AlertTitle>{{ unauthorized ? 'Akses ditolak' : 'Gagal memuat data' }}</AlertTitle>
    <AlertDescription class="flex flex-col items-start gap-3">
      <span>{{ error?.message || 'Terjadi kesalahan yang tidak diketahui.' }}</span>
      <Button v-if="retry && !unauthorized" variant="outline" size="sm" @click="retry">
        <RotateCw class="size-3.5" aria-hidden="true" />
        Coba lagi
      </Button>
    </AlertDescription>
  </Alert>
</template>
