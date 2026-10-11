# Laporan Phase 4 — Living Virtual Office

Branch `feature/living-virtual-office` (dari `fix/virtual-office-stabilization` @ `ed139c5`). Tanggal: 11 Oktober 2026. Status per deliverable memakai: VERIFIED COMPLETE · IMPLEMENTED, NOT VERIFIED · PROTOTYPE · BLOCKED · NOT
IMPLEMENTED.

## 1. Ringkasan eksekutif

Phase 4 mengubah Virtual Office dari "lima PNG yang melayang" menjadi tempat kerja yang hidup **di atas fondasi
mesin yang sudah ada** (tanpa state machine kedua, tanpa engine baru, tanpa perubahan backend/RLS/auth):

- **Workstation interaktif**: aktivitas bernama dan efek hologram khas untuk Mission Hub, Web Research, Analytics
  Tool, Report Builder, Data Warehouse (+ Client Brief, Knowledge Base, Final Report), diturunkan dari state agent.
- **Umpan balik perintah**: robot menerima perintah (lencana, gelembung, label) sebelum berangkat; label robot,
  roster, dan panel menyebut aktivitas yang sedang dijalankan.
- **Kantor hidup**: perilaku ambient deterministik saat siaga (menoleh/merenung/memeriksa/mengangguk, hologram
  pulau menyala) dengan prioritas perintah > misi > workstation > ambient; ikut jeda; mati pada reduced motion.
- **Gerak lebih alami**: langkah jalan mengikuti jarak (tidak meluncur), arah hadap 4 sisi di mesin, idle tidak
  serempak, bayangan kontak, sorotan pilihan.
- **Verifikasi**: 218 test backend, 36 test Nuxt, 14 e2e, 38 cek aset; browser production & dev, 5 viewport,
  reduced motion di browser, performa 60 FPS median pada semua skenario (daya listrik).

**Artwork tetap BLOCKED**: tidak ada tool generasi gambar maupun artist di lingkungan ini. Frame karakter masih
prosedural (fallback berlabel), arah hadap depan/belakang memakai fallback baris kanan, dan referensi
`Neon Mission Map_ Project Atlas.png` / `virtual_office_clean_assets_v3.zip` tidak ada di workspace. Spesifikasi
handoff artist disiapkan (`docs/game-asset-production.md`).

## 2. Character production

| Karakter | Identitas (brief)        | Artwork saat ini                                  | Animasi                              | Status                                   |
| -------- | ------------------------ | ------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| Nova     | Koordinator, biru/cyan   | sprite pack 84×106 → v2 252×318, tepi gelap 8,9 % | 9 baris prosedural, anchor (96, 214) | artwork PROTOTYPE · frame artist BLOCKED |
| Sage     | Peneliti, ungu/violet    | 82×106 → 246×318, tepi gelap 0,6 %                | idem                                 | PROTOTYPE · BLOCKED                      |
| Pixel    | Analis, cyan/biru        | 77×106 → 231×318, tepi gelap 9,0 %                | idem                                 | PROTOTYPE · BLOCKED                      |
| Bolt     | Pembangun, oranye/kuning | 86×106 → 258×318, tepi gelap 1,4 %                | idem                                 | PROTOTYPE · BLOCKED                      |
| Echo     | Operator, hijau/cyan     | 82×106 → 246×318, tepi gelap 5,2 %, 1 serpihan    | idem                                 | PROTOTYPE · BLOCKED                      |

Identitas (warna, proporsi, anchor) konsisten di kelima sheet dan tidak berubah antar frame (transformasi affine
saja). Audit lengkap dan spesifikasi: `docs/game-asset-production.md` §3–4. Tidak ada frame yang dibuat dengan
mendistorsi PNG dan diklaim sebagai artwork.

## 3. Asset production

- Aset yang dipakai ulang: fx pack (`hologram-cube`, `energy-ring`, `particles-purple`, `energy-spawn`), sheet
  prosedural v2, pulau v3 (AI, diungkap), latar v3. **Tidak ada aset gambar baru** (tidak ada tool yang layak).
- Glyph hologram (kartu dokumen, grafik batang, terminal, rak buku, segel) = CSS prosedural berlabel di
  `OfficeWorkstationEffects.vue`, bukan pengganti artwork.
- Pipeline/metadata/validasi dan pemetaan struktur yang disarankan brief → struktur yang berlaku:
  `docs/game-asset-production.md` §1–2 (struktur tidak dipindah agar path, registry, dan `check:assets` tetap).
- Geometri: slot kiri Mission Hub digeser (manual) menjauhi pad portal; `bun run assets:geometry` dijalankan ulang,
  test geometri lulus.
- Kesenjangan: frame artist 9 animasi × 5 (BLOCKED), baris arah depan/belakang (BLOCKED), artwork Research Lab &
  Training Center dengan apron jalan (BLOCKED), referensi visual Project Atlas tidak tersedia.

## 4. Animation system

Status: VERIFIED COMPLETE (rekayasa) · visual arah depan/belakang BLOCKED.

- Satu state machine (`agent-state.ts`) tetap; penerimaan perintah memakai state `thinking` yang sah lalu rute
  diterbitkan mesin (`engine.moveTo(..., { acknowledgeSeconds })`, event `acknowledge`).
- Alur contoh (diverifikasi di browser, Sage): `idle → thinking(ack) → walk(left) → teleport(in) → orb →
teleport(out) → walk(toward/right) → researching/read + efek → … → idle`.
- Frame jalan berbasis jarak (`STRIDE_UNITS` 64), `heading` 4 arah (`data-heading`), offset fase idle
  deterministik, teleport keluar mundur (dari stabilisasi), reduced motion frame 0, overlay ambient.
- Fallback terdokumentasi: `toward`/`away` memakai baris kanan + cermin sampai artwork tersedia.
- Test: 6 test mesin baru + renderer/aktor Nuxt (`docs/character-animation-system.md` §8).

## 5. Interactive workstations

Status: VERIFIED COMPLETE (lima stasiun utama + tiga stasiun lain; dua pulau dekoratif tetap non-walkable).

`app/game/workstations.ts` + `OfficeWorkstationEffects.vue`; tabel aktivitas/efek, siklus hidup, dan rendering di
`docs/workstation-interactions.md`. Efek diturunkan dari state → tidak pernah tertinggal setelah pembatalan/jeda.
Browser: lima robot bekerja serentak = 10 efek; label "Mengoordinasikan tim · Meriset sumber pasar ·
Menganalisis metrik · Menyusun laporan · Mengoperasikan alat data".

## 6. Living office

Status: VERIFIED COMPLETE (pratinjau) · live sengaja tanpa ambient karakter.

`app/game/ambient.ts`: 4 perilaku, ≤ 2 serentak, hologram pulau ambient, PRNG hash deterministik, jam mesin
(ikut jeda/kecepatan), prioritas perintah > misi > workstation > ambient, reduced motion → tidak ada, tanpa API
tulis. Browser 40 dtk siaga: kelima robot beraksi, 2 pulau menyala, 0 robot berpindah, 0 request tulis
(`docs/office-ambient-behavior.md`).

## 7. Project Atlas simulation

Status: VERIFIED COMPLETE.

Alur tidak diubah (Nova brief → Sage riset → Pixel analisis → Bolt laporan · Echo alat → Nova koordinasi →
selesai); kelima robot tetap berjalan dari posisi awal yang berbeda. Yang ditambah: aktivitas bernama & efek khas
per fase, lima ledakan selesai, perintah panel "Jalankan Project Atlas"/"Reset simulasi", ambient antar fase.
Bukti: unit (`office-engine.test.ts`, `office-ambient.test.ts`: skenario tuntas bersama ambient, `rejectedActions`
kosong) dan browser production: 7 status fase, efek per fase berbeda, selesai ±41 dtk (1×), pause/resume/reset
berfungsi, reduced motion 19,1 dtk, 0 galat (`docs/frontend-visual-qa.md`).

## 8. Testing

| Gate                   | Hasil                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun run typecheck`    | lulus                                                                                                |
| `bun run lint`         | lulus                                                                                                |
| `bun run format:check` | lulus                                                                                                |
| `bun run check:assets` | 38 lulus, 0 gagal; 0 aset yatim                                                                      |
| `bun run test`         | 218 pass / 0 fail (24 file; baru: `office-workstations` 10, `office-ambient` 11, `office-engine` +6) |
| `bun run test:nuxt`    | 36 pass / 0 fail (4 file; baru: `office-living` 6)                                                   |
| `bun run build`        | lulus                                                                                                |
| `bun run test:e2e`     | 14 pass / 0 fail                                                                                     |

Cakupan test baru per kategori brief: animasi (pemetaan state→animasi, metadata atlas, anchor, arah, interupsi,
reset), gerak (anchor kaki, tiba di slot, portal masuk/keluar, jeda/lanjut saat bergerak, pembatalan, koordinat
bebas zoom), workstation (aktivasi, pemilihan aktivitas, siklus efek, zona interaksi, tanpa efek setelah
pembatalan), ambient (tidak mengganggu misi, jeda/lanjut, tanpa data backend, bersih saat dispose), simulasi
(lima robot, tuntas, pause/resume/reset, kecepatan, tanpa deadlock, tanpa API tulis), pipeline aset (`check:assets`,
geometri tetap valid).

## 9. Performance

`docs/game-performance.md`. Build production, Chrome headless, Apple M2, daya listrik: **60/60 FPS** (min/median)
pada siaga, lima bergerak, lima bekerja, fase 2 (portal), simulasi penuh, zoom/geser, seleksi; frame terburuk 17 ms;
heap +3,2 MB sepanjang ±2 menit; muat aset 318 ms. CPU 4×: median 60 di semua skenario, min 51 (perintah panel +
toast) dan 54 (zoom). Pengukuran ulang build final di baterai 19 % terkunci 30 Hz oleh compositor (bukan aplikasi;
biaya main-thread justru lebih rendah) — dicatat apa adanya.

## 10. Visual QA

`docs/frontend-visual-qa.md`. Screenshot `docs/screenshots/office-living-*.jpg` (siaga, ambient, ack, perjalanan,
lima stasiun bekerja + crop 2× per stasiun, perayaan, selesai, reduced motion, slice Sage), viewport
`office-game-*-{preview,live,…}.jpg` (5 ukuran), rekaman `office-living-p4.mp4` (84 dtk). Semua run: 0 galat
konsol/hidrasi, 0 respons ≥ 400, 0 gambar rusak, 0 overflow, 0 request tulis.

## 11. Limitations

Artwork (BLOCKED, bukan rekayasa): frame artist 9 animasi × 5 karakter; baris arah depan/belakang; artwork
Research Lab/Training Center dengan apron jalan; referensi visual Project Atlas tidak tersedia; sprite karakter
tetap resolusi rendah. Rekayasa (dicatat): ambient hanya pratinjau (live menunggu status runtime backend); efek
workstation live menunggu event runtime (`event-driven`); glyph hologram prosedural dapat diganti artwork efek;
performa build final belum diukur ulang pada daya listrik; QA hanya Chrome headless (tanpa Safari/Firefox/sentuh
nyata).

## 12. Files changed

Mesin/game: `app/game/engine.ts` (ack, stride, heading, offset fase, ambient overlay), `app/game/workstations.ts`
(baru), `app/game/ambient.ts` (baru), `app/game/dom-renderer.ts` (`data-heading/ambient/acknowledging`),
`app/game/commands.ts` (`STATION_ACTIVITY` dari workstation, perintah `run_atlas`/`reset_simulation`),
`app/game/agent-state.ts` (`communicating` menyalakan stasiun), `app/game/island-geometry.ts` +
`scripts/calibrate-island-geometry.ts` (slot kiri hub). Vue: `app/composables/useOfficeEngine.ts`,
`app/components/office/OfficeWorkstationEffects.vue` (baru), `OfficeActor.vue`, `GameWorld.vue`, `GameOffice.vue`,
`AgentCommandPanel.vue`, `OfficeIsland.vue`, `MissionHub.vue`, `app/assets/css/office-scene.css` (keyframes).
Test: `tests/unit/office-workstations.test.ts`, `tests/unit/office-ambient.test.ts`, `tests/nuxt/office-living.test.ts`
(baru), `tests/unit/office-engine.test.ts`, `tests/nuxt/components.test.ts`, `tests/nuxt/office-renderer.test.ts`.
Dokumen: 8 dokumen (`phase4-living-office-report`, `game-asset-production`, `workstation-interactions`,
`office-ambient-behavior`, `game-performance`, `frontend-visual-qa`, `character-animation-system` §8,
`office-simulation` §8), `CLAUDE.md`, `AGENTS.md`, `README.md`, screenshot & rekaman.

## 13. Git status

Lihat bagian Git pada laporan akhir sesi (branch `feature/living-virtual-office`, commit Phase 4, working tree
bersih setelah commit; tidak di-push; tidak ada force push).

## 14. Next development phase

1. Produksi artwork (prasyarat tool generasi gambar/artist): frame artist 9 animasi × 5 + baris `walk-toward`/
   `walk-away` sesuai spesifikasi; artwork Research Lab/Training Center; lalu `check:assets`, `assets:geometry`, QA
   visual — tanpa perubahan kode mesin.
2. Status runtime backend + revalidasi sesi SSE (prasyarat keamanan dari stabilisasi) → aktivitas workstation live
   `event-driven` dan ambient live yang jujur.
3. Modul tugas/persetujuan nyata (perintah bisnis masih nonaktif di live).
4. Pengukuran performa pada perangkat target (daya listrik, Safari/Firefox, sentuh nyata) dan opsi "kualitas efek"
   untuk perangkat lemah.
