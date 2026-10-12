<script setup lang="ts">
/**
 * Layout halaman manajemen terautentikasi (AI Employees, Tugas, Pengaturan,
 * galeri aset): GameShell = latar game bersama + navigasi atas HUD + konten.
 * Sidebar SaaS lama dihapus; navigasi ke modul lain terasa seperti berpindah
 * area di pusat komando yang sama (lihat docs/unified-game-design-system.md).
 * /office memakai layout `game` layar penuh.
 */
const route = useRoute()
const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))
</script>

<template>
  <GameShell :title="title">
    <slot />
  </GameShell>
</template>
