<script setup lang="ts">
import { Bell, BellOff } from '@lucide/vue'

/**
 * Pusat notifikasi. Phase 1 belum memiliki sumber notifikasi (tugas,
 * persetujuan, aktivitas agent), sehingga panel menampilkan empty state jujur
 * dan tidak ada badge jumlah.
 */
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" class="size-10 rounded-xl md:size-9" aria-label="Notifikasi">
        <Bell class="size-4" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="surface-elevated w-80 p-0">
      <div class="flex items-center justify-between border-b border-hairline px-4 py-3">
        <p class="type-card-title">Notifikasi</p>
        <Badge variant="outline" class="text-[10px] text-muted-foreground">Wave 2</Badge>
      </div>
      <div class="p-3">
        <EmptyState
          size="compact"
          :icon="BellOff"
          title="Belum ada notifikasi"
          description="Permintaan persetujuan, tugas selesai, dan peringatan agent akan muncul di sini setelah orchestrator aktif."
        />
      </div>
    </PopoverContent>
  </Popover>
</template>
