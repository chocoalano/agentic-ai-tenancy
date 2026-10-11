# Neon Mission Map — Game Asset Pack

Asset konsep/prototipe untuk **Agentic AI Virtual Office** menggunakan Nuxt 4, Vue, Tailwind CSS 4 dan shadcn-vue. Karya dibuat ulang berdasarkan referensi **Neon Mission Map: Project Atlas**.

## Konten

- `public/game-assets/characters/`: 5 karakter Nova, Sage, Pixel, Bolt, Echo
- `public/game-assets/character-states/`: 11 ilustrasi pose/aktivitas
- `public/game-assets/islands/`: 10 pulau/workstation termasuk Mission Hub
- `public/game-assets/tiles/`: 9 lingkungan kecil/terrain
- `public/game-assets/fx/`: 8 efek portal, partikel, hologram
- `public/game-assets/icons/`: 20 ikon PNG
- `public/game-assets/ui-previews/`: 14 ilustrasi HUD/panel statis
- `public/game-assets/backgrounds/`: 1 lanskap kota kecil
- `source-sheets/`: 2 lembar ilustrasi AI sumber pemotongan
- `asset-manifest.json`: daftar aset beserta dimensi dan lokasi
- `gameAssets.ts`: registry contoh untuk Nuxt
- `AgentSprite.vue`: komponen tampilan sprite robot contoh

## Cara pakai di Nuxt 4

1. Ekstrak ZIP. Salin `public/game-assets/` ke `public/game-assets/` proyek Nuxt.
2. Letakkan `gameAssets.ts` di `app/constants/gameAssets.ts`.
3. Letakkan `AgentSprite.vue` di `app/components/office/AgentSprite.vue`.
4. Gunakan `<AgentSprite agent="nova" :size="100" />` dan `<img src="/game-assets/islands/mission-hub.png" alt="Mission Hub">`.
5. Buat HUD, level, status, progress, XP, biaya dan tombol sebagai komponen Vue/shadcn-vue; jangan menggantungkan data dinamis pada panel gambar.

## Kualitas dan batasan

- Sprite dipisahkan **otomatis** dari konsep gambar gabungan; beberapa tepi transparansi, halo, atau fragmen objek tetangga mungkin belum sempurna. Perlu artist cleanup untuk produksi.
- Resolusi setiap potongan relatif kecil (konsep). Jangan menampilkan jauh lebih besar daripada ukuran natural tanpa rerender 2x/4x.
- Varian karakter adalah pose statis, **bukan** sprite animation frame sheet.
- Elemen `ui-previews` memiliki teks tercetak; gunakan hanya sebagai referensi gaya visual.
- Aset `fx` dan `tiles` memakai isolasi warna otomatis dan perlu peninjauan khusus sebelum compositing final.
- `source-sheets` disertakan supaya aset dapat dipotong/dirender ulang.
- Untuk koneksi neon antar pulau gunakan `<svg>` overlay, dan untuk animasi gunakan CSS/Vue dengan penghormatan terhadap `prefers-reduced-motion`.
- Ini aset konseptual AI-generated, bukan ekstraksi presisi/layer asli dari gambar sumber.

## Urutan scene

Latar kota → pulau isometrik → SVG garis koneksi → glow/effects → robot agents → panel DOM shadcn-vue.

Pada mobile tampilkan ringkasan agent, mission, dan card kontrol yang lebih terbaca daripada memaksa seluruh map menjadi miniatur.
