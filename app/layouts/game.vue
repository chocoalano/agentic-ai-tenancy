<script setup lang="ts">
/**
 * Layout game layar penuh — khusus /office.
 *
 * Tanpa sidebar, topbar, padding halaman, atau kartu pembungkus: dunia game
 * memenuhi viewport (100dvh) dan HUD melayang di atasnya. Navigasi modul lain
 * tersedia lewat menu game (Sheet) di HUD. Autentikasi & validasi tenant tetap
 * dijalankan oleh middleware halaman dan `useTenantAsyncData`.
 *
 * Bingkai selalu bertema gelap (kelas `dark`) karena artwork bernuansa
 * malam-neon; halaman juga memaksa colorMode gelap agar overlay (Sheet,
 * tooltip) konsisten. `isolate` membuat lapisan Z0–Z10 game menjadi satu
 * konteks tumpukan sehingga overlay portal (Z11: menu, drawer, tooltip)
 * selalu tampil di atas dunia & HUD.
 */
</script>

<template>
  <div class="dark relative isolate h-dvh w-full overflow-hidden bg-office-bg text-foreground" data-game-layout>
    <a
      href="#game-world"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
    >
      Lewati ke peta kantor
    </a>
    <main class="relative size-full">
      <slot />
    </main>
  </div>
</template>
