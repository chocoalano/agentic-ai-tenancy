# Laporan Integrasi Aset & Redesain Game — Virtual Office (`/office`)

`/office` dibangun ulang sebagai **game manajemen AI employee layar penuh**: dunia isometrik memenuhi viewport, HUD
melayang di atasnya, dan aplikasi SaaS (sidebar, topbar, kartu pembungkus) tidak lagi membungkus halaman ini. Semua
artwork utama adalah aset asli asset pack **"Neon Mission Map — Project Atlas"** (dengan varian HD turunan). Backend,
autentikasi, RLS, isolasi tenant, dan kontrak Eden **tidak diubah**.

Tanggal verifikasi: 11 Oktober 2026. Revisi ini menggantikan desain "dashboard + kartu game" yang ditolak.

> **Pembaruan (fase animasi & simulasi, 11 Oktober 2026).** Sebagian isi laporan ini sudah digantikan:
> varian HD turunan (`public/game-assets/hd`, `bun run assets:hd`) diganti **registry v2**
> (`public/game-assets-v2`, `bun run assets:v2`) — lihat `docs/game-asset-quality-report.md`; robot kini memakai
> **sprite sheet animasi** dan mesin gerak (bukan sprite statis) — lihat `docs/character-animation-system.md` dan
> `docs/office-navigation-system.md`; mode pratinjau menjalankan simulasi Project Atlas — lihat
> `docs/office-simulation.md`; pemutusan SSE di produksi (§9) **sudah diperbaiki** — lihat
> `docs/live-agent-event-mapping.md` §5. Screenshot di `docs/screenshots/` telah diambil ulang dari build terbaru.
> Tabel komponen → file aset di bawah masih menyebut path `hd/...@3x.png`; padanannya kini `/game-assets-v2/{id}.webp`.

## 1. Status gerbang penerimaan

| Kriteria (brief §21)                         | Status | Bukti                                                                                   |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `/office` memakai layout game layar penuh    | ✅     | `app/layouts/game.vue`, `definePageMeta({ layout: 'game' })`                            |
| Sidebar standar dihapus dari route ini       | ✅     | Browser: `[data-slot="sidebar"]` tidak ada di 5 viewport                                |
| Topbar standar dihapus dari route ini        | ✅     | Browser: header aplikasi tidak ada; HUD game menggantikannya                            |
| Scene memenuhi viewport                      | ✅     | `h-dvh`, tanpa scroll halaman (overflow X/Y = 0) di 5 viewport                          |
| Mission Hub mendominasi pusat dunia          | ✅     | 430 unit dunia (≥ 1,9× pulau terlebar); 444 px di 1920×1080                             |
| ≥ 7 struktur pulau terlihat                  | ✅     | 10 (hub + 7 stasiun utama + 2 pulau jauh) di 5 viewport                                 |
| Lingkungan berwarna & berlapis               | ✅     | Langit senja, kota cermin HD, awan volumetrik, terrain melayang, cahaya ambien          |
| Robot terintegrasi terlihat                  | ✅     | Live: agent nyata; pratinjau: Nova, Sage, Pixel, Bolt, Echo                             |
| Mode pratinjau eksplisit untuk tenant kosong | ✅     | Build production + pengguna baru (0 agent) → default pratinjau berlabel                 |
| Koneksi energi neon terlihat jelas           | ✅     | 18 jalur SVG (cyan/biru/oranye/ungu) + pulsa cahaya berjalan                            |
| HUD game konsisten dengan referensi          | ✅     | Identitas · commander/level · sumber daya · misi · notifikasi · pengaturan · menu       |
| Panel misi kiri = HUD melayang               | ✅     | `MissionPanel` melayang (desktop) / drawer (tablet & ponsel), dapat diciutkan           |
| Roster agent kanan = HUD melayang            | ✅     | `AgentRoster` melayang / drawer, potret besar, status, aksi                             |
| Command bar bawah mirip referensi            | ✅     | 6 tombol besar bergradien, ikon, pintasan 1–6, lencana "Segera"                         |
| API terautentikasi tetap berfungsi           | ✅     | `bun run test` 106/106, `test:e2e` 8/8                                                  |
| Isolasi tenant tidak berubah                 | ✅     | Tidak ada perubahan `api/`, `db/`; test keamanan/RLS lulus                              |
| Build production lulus                       | ✅     | `bun run build`                                                                         |
| Screenshot ditinjau terhadap target          | ⚠️     | Ditinjau terhadap deskripsi brief + source sheet; **gambar target tidak tersedia** (§2) |

## 2. Referensi visual

- **Desain yang ditolak** — `~/Desktop/Screenshot 2026-10-11 at 08.17.58.png` ditinjau: tenant "PT MAJU MUNDUR" dengan
  0 agent, tema terang, sidebar putih, topbar, game di dalam kartu, roster kosong.
- **Target `Neon Mission Map_ Project Atlas.png` tidak ditemukan** di disk (Spotlight + folder umum) maupun lampiran,
  begitu pula `atlas_game_assets_pack.zip`. Sebagai pengganti, acuan visual yang dipakai: deskripsi komposisi rinci
  di brief (§5), serta dua source sheet di pack (`design/atlas_game_assets_pack/source-sheets/`) yang menurut README
  pack dibuat ulang dari referensi Project Atlas — keduanya berukuran 1672 × 941, sama dengan koordinat dunia yang
  diminta. Perbandingan langsung piksel-ke-piksel dengan target **belum dapat dilakukan**.

Akar masalah desain lama dan perbaikannya:

| Masalah lama                    | Perbaikan                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Sidebar putih & topbar SaaS     | Layout `game` khusus; navigasi lewat menu game (Sheet)                                 |
| Game di dalam kartu dashboard   | Dunia = fondasi halaman (full-bleed); HUD melayang di atasnya                          |
| Pulau kecil & berjauhan         | Dunia 1672×941, pulau 195–225 unit, hub 430 unit, jarak rapat                          |
| Latar gelap kabur               | Langit senja biru-ungu-merah muda, kota HD berlapis, awan, cahaya                      |
| Statis                          | Pulau & robot melayang, pulsa energi berjalan, awan bergerak, cahaya kristal berdenyut |
| Tidak ada robot (tenant kosong) | Mode pratinjau default dengan 5 maskot                                                 |
| Panel seperti kartu dashboard   | Panel HUD navy tembus pandang, garis cyan bercahaya, aksen sudut                       |
| Tombol aksi kecil               | Command bar strategi dengan tombol besar bergradien + pintasan keyboard                |

## 3. Arsitektur presentasi

```
app/layouts/game.vue          layar penuh (100dvh), tanpa sidebar/topbar, konteks tumpukan terisolasi
app/pages/office/index.vue    layout 'game', colorMode 'dark' (paksa per halaman), middleware 'auth'
app/components/office/
├── GameOffice.vue            komposisi + mode live/pratinjau + pintasan keyboard
├── GameBackdrop.vue          Z0–Z1 langit, kota, awan, cahaya (full-bleed)
├── GameWorld.vue             dunia + kamera (zoom, geser, fokus)
│   ├── OfficeTerrain.vue     Z1–Z2 awan dekat & pulau kecil melayang
│   ├── EnergyConnections.vue Z3 jaringan energi SVG (di belakang pulau)
│   ├── OfficeIsland.vue      Z4 pulau workstation (tombol)
│   ├── MissionHub.vue        Z4 pulau pusat (tombol)
│   ├── OfficeEffects.vue     Z5 portal, relay, partikel
│   ├── OfficeActor.vue       Z5–Z6 robot + label status + tooltip
│   └── OfficeLabels.vue      Z6 papan nama pulau & hub
├── GameHUD.vue               Z8 HUD atas
├── MissionPanel.vue          Z9 HUD misi (melayang / drawer) + SectorMap.vue
├── AgentRoster.vue           Z9 HUD roster (melayang / drawer)
├── GameQuickView.vue         Z9 detail objek terpilih
├── GameCommandBar.vue        Z10 command bar + kontrol kamera
├── GameMenu.vue              Z11 menu navigasi (Sheet)
├── GameImage.vue / AgentSprite.vue / OfficeStatusBadge.vue
app/utils/office-layout.ts    dunia, stasiun, penempatan agent, jaringan energi, dekorasi
app/utils/office-preview.ts   aktor scene, roster, misi & angka contoh mode pratinjau
app/utils/game-assets.ts      registry aset (path, dimensi, kliping, varian HD)
```

**Kamera.** Semua objek dunia memakai koordinat 1672 × 941 unit. Skala dasar `--s` (panjang satu unit) dihitung oleh
CSS dari ukuran viewport game lewat container query units dan didaftarkan dengan `@property` — sehingga SSR dan
browser menghasilkan markup identik (tanpa pengukuran JS). Lanskap: pita aman dunia (y 30–905) dimuat di antara HUD
dan command bar. Potret: dunia lebih lebar dari layar dan digeser dengan seret. Kamera klien hanya menambah zoom
(0,8–2,2×, tombol/roda/`+`/`-`/`0`), geser (seret), dan fokus otomatis ke objek terpilih.

**Determinisme SSR.** Jalur energi hanya memakai operasi aritmetika dasar dan `Math.sqrt` (dibulatkan tepat oleh
IEEE-754); arah lengkung spoke dibuat deterministik. Versi awal memakai arah "menjauhi hub" yang bergantung pada tanda
hasil perkalian titik ≈ 0 dan menimbulkan hydration mismatch antara Bun (server) dan V8 (browser) — sudah diperbaiki
dan diverifikasi.

**Responsif.** ≥ 1280 px: panel misi & roster melayang di atas dunia (dapat diciutkan). 768–1279 px: panel menjadi
drawer melayang (tab kiri/kanan), HUD diringkas. < 768 px: dunia potret yang dapat digeser, strip pemilih robot,
command bar ikon. Elemen HUD bertingkat per breakpoint sehingga tidak ada kontrol terpotong (diverifikasi).

## 4. Mode live vs mode pratinjau desain

| Elemen             | Mode live (data nyata)                          | Mode pratinjau (berlabel DEMO / PRATINJAU)           |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| Kapan aktif        | Default bila tenant punya agent                 | Default bila tenant 0 agent; dapat dinyalakan manual |
| Robot di dunia     | AI employee nyata (nama, peran, status, ID)     | Nova, Sage, Pixel, Bolt, Echo                        |
| Roster             | Semua agent nyata, status siklus hidup, stasiun | 5 karakter, level/XP contoh                          |
| Tenant kosong      | "0 AI employee direkrut" + ajakan pratinjau     | —                                                    |
| Level / XP         | "Lv. —", "XP —"                                 | Lv 12, 1.240/2.000 XP (contoh)                       |
| Energi/kapasitas   | AI employee aktif / terdaftar                   | 86/120 (contoh)                                      |
| Kredit / Compute   | "—" (belum ada sumber data)                     | 4.320 / 720 (contoh)                                 |
| Misi               | Misi persiapan dari data perusahaan             | "Project Atlas" (contoh)                             |
| Jaringan energi    | Menyala sesuai status stasiun nyata             | Seluruh jaringan menyala (contoh)                    |
| Jumlah agent nyata | Ditampilkan                                     | Tetap ditampilkan ("AI employee nyata: N")           |

Command bar tidak pernah berpura-pura berhasil di mode apa pun: semua aksi `aria-disabled` + alasan (Phase 1 belum
punya endpoint-nya). Quick-view karakter pratinjau menyatakan tidak ada tugas, inferensi AI, atau XP yang dijalankan.

## 5. Komposisi dunia (unit dunia)

| Posisi referensi   | Pulau / aset                          | Pusat (x, y)  | Lebar   | Robot pratinjau |
| ------------------ | ------------------------------------- | ------------- | ------- | --------------- |
| Tengah             | Mission Hub `islands/mission-hub`     | 836, 452      | 430     | —               |
| Kiri atas          | Web Research                          | 515, 205      | 215     | Sage (hijau)    |
| Kanan atas         | Data Warehouse                        | 1150, 192     | 225     | —               |
| Kiri tengah        | Client Brief                          | 448, 478      | 220     | Bolt (oranye)   |
| Kanan tengah       | Analytics Tool                        | 1228, 468     | 220     | Pixel (ungu)    |
| Kiri bawah         | Knowledge Base                        | 575, 728      | 205     | Echo (biru)     |
| Bawah tengah/kanan | Report Builder                        | 915, 778      | 200     | Nova (putih)    |
| Kanan bawah        | Final Report (`islands/task-manager`) | 1175, 728     | 195     | —               |
| Kejauhan (atas)    | Research Lab, Training Center         | 730/948, ±133 | 135–140 | —               |

Asset pack tidak memiliki pulau "Final Report"; dipakai `task-manager.png` (bangunan hijau dengan lencana centang)
yang paling mirip dengan pulau Final Report di source sheet. Mode live menempatkan agent nyata menurut kata kunci
peran (mis. `customer-support` → Client Brief) dengan karakter sesuai arketipe peran.

## 6. Aset

### Audit resolusi

| Aset                 | Ukuran asli | Tampilan di 1920×1080 | Penanganan                                                             |
| -------------------- | ----------- | --------------------- | ---------------------------------------------------------------------- |
| Mission Hub          | 250 × 239   | 444 × 458 px          | Varian HD turunan 3× (696 × 717)                                       |
| Pulau stasiun        | 106–147 px  | 140–230 px            | Varian HD 3×                                                           |
| Karakter (mis. Nova) | 84 × 106    | ±85 × 109 px          | Varian HD 3× (tajam juga di layar retina)                              |
| City skyline         | 317 × 125   | 960 px per salinan    | Kliping 265×105 → HD 4× (1060 × 420), dipasang sebagai pasangan cermin |
| Tile, pose karakter  | 52–120 px   | ≤ 1,5× natural        | Varian HD 3×                                                           |
| FX, ikon             | 44–240 px   | ≤ natural             | File asli (FX: mask luminans)                                          |

**Tidak ada alat image-generation di sesi ini**, sehingga aset resolusi tinggi baru (512–1024 px) **tidak dapat
dibuat**. Sebagai gantinya, `bun run assets:hd` (`scripts/build-hd-assets.ts`, butuh ImageMagick) membuat 36 varian HD
**turunan** di `public/game-assets/hd/`: aset asli dikliping sesuai registry, diperbesar dengan filter Lanczos,
dipertajam ringan pada kanal RGB, dan tepi alpha binernya dirapikan. Hasilnya lebih tajam daripada upscale bilinear
browser, tetapi **tidak menambah detail ilustrasi** — render ulang oleh artist tetap dibutuhkan untuk kualitas
produksi. File asli tidak diubah; `check:assets` memverifikasi keberadaan & dimensi varian HD.

### Komponen → file aset

| Komponen                                                    | Aset                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GameBackdrop`                                              | `hd/backgrounds/city-skyline@4x.png` (2 lapisan, cermin), `hd/tiles/cloud@3x.png`                                                                                                                |
| `OfficeTerrain`                                             | `hd/tiles/{purple-forest,evergreen-trees,stone-cluster,grass,purple-grass,shrubs,crystal-rock,cloud}@3x.png`                                                                                     |
| `MissionHub`                                                | `hd/islands/mission-hub@3x.png`                                                                                                                                                                  |
| `OfficeIsland`                                              | `hd/islands/{web-research,data-warehouse,client-brief,analytics-tool,knowledge-base,report-builder,task-manager,research-lab,training-center}@3x.png`                                            |
| `EnergyConnections`                                         | — (SVG)                                                                                                                                                                                          |
| `OfficeEffects`                                             | `fx/portal-cyan`, `fx/energy-spawn`, `fx/portal-violet`, `fx/hologram-cube`, `fx/energy-ring`, `fx/particles-cyan`, `fx/particles-purple`                                                        |
| `OfficeActor`                                               | `hd/characters/{nova,sage,pixel,bolt,echo}@3x.png`, `fx/energy-ring.png`                                                                                                                         |
| `AgentRoster`, `GameQuickView`, strip ponsel, `AgentAvatar` | `hd/characters/*@3x.png`                                                                                                                                                                         |
| `GameQuickView`                                             | `hd/islands/*`, `hd/character-states/{researching,coding,communicating,thinking,analyzing,reporting,generating,success,working}@3x.png` (ilustrasi fungsi stasiun, berlabel "bukan status live") |
| `MissionPanel`                                              | `icons/task.png`, `fx/connection-path.png`                                                                                                                                                       |
| Galeri `/office/assets`                                     | Seluruh 78 aset (+ varian HD bila ada), `ui-previews/*` berlabel referensi                                                                                                                       |

### Keterbatasan aset (masih berlaku)

| Aset                                                     | Masalah                             | Penanganan                                 |
| -------------------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| `backgrounds/city-skyline.png`                           | 317×125; memuat judul lembar sumber | Dikliping; **perlu render ≥ 1920 px**      |
| `character-states/*` (6 pose)                            | Sisa label teks & serpihan tetangga | Dikliping                                  |
| `character-states/generating`, `reporting`               | Gir/panel terpotong di tepi         | Perlu render ulang                         |
| `islands/web-research`, `analytics-tool`, `client-brief` | Badge ikon terpotong rata di atas   | Perlu render ulang dengan margin           |
| `tiles/crystal-rock` / `stone-cluster`                   | Salah label (isi tertukar)          | Nama dipertahankan, dicatat di registry    |
| `tiles/rocks`, `cloud`                                   | Blok navy opak                      | `rocks` tidak dipakai; `cloud` dikliping   |
| `fx/*`                                                   | Tanpa alpha lembut                  | Mask luminans CSS; perlu ekspor alpha asli |
| Semua aset                                               | Resolusi konsep, alpha biner        | Varian HD turunan; perlu render 2×/4× asli |
| Tidak ada pulau "Final Report"                           | —                                   | Memakai `task-manager.png`                 |
| Karakter                                                 | Pose statis, bukan frame animasi    | Gerak = animasi CSS (melayang/bob)         |

## 7. Interaksi

Klik/Enter robot → quick-view agent (atau karakter pratinjau) + kamera fokus; hover/fokus robot → tooltip status;
klik pulau → info workstation; klik Mission Hub → ringkasan misi; klik sasaran misi → detail + data penentu; klik node
peta sektor → fokus stasiun; ciutkan/buka panel misi & roster; menu game (navigasi modul, ganti perusahaan, galeri,
pengaturan, keluar); zoom (tombol, roda, `+`/`-`/`0`), geser (seret), Escape/klik area kosong → peta penuh; toggle
pratinjau; pintasan `1`–`6` command bar. Semua kontrol berupa tombol/tautan dengan label aksesibel; animasi mati pada
`prefers-reduced-motion`.

## 8. Verifikasi

**Gerbang proyek** (kode final): `typecheck` ✅ · `lint` ✅ · `format:check` ✅ · `check:assets` 36/36 ✅ ·
`test` 106/106 ✅ · `test:nuxt` 13/13 ✅ · `build` ✅ · `test:e2e` 8/8 ✅.

**Browser** (Chrome headless + puppeteer-core di scratchpad; dev server dan **build production**):

| Skenario (build production)             | Viewport                                         | Hasil                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant kosong (pengguna baru, DB test)  | 1672×941, 1920×1080, 1440×900, 768×1024, 390×844 | Default **pratinjau**; 10 pulau, 5 karakter, 18 jalur, 8 FX, kota; 0 gambar rusak, 0 respons 404, overflow 0, tidak ada kontrol terpotong |
| Tenant dengan agent (Nusantara, DB dev) | 1920×1080, 1440×900, 390×844                     | Mode **live**; 4 agent nyata, 0 karakter pratinjau                                                                                        |
| Interaksi (semua run)                   | semua                                            | tooltip, quick-view robot/stasiun/hub, Escape, zoom, menu, toggle mode, toast command bar ✅; ponsel: pilih robot lewat strip ✅          |
| Hydration                               | semua                                            | 0 peringatan/galat hydration (dev & production)                                                                                           |

Konsol production hanya mencatat `ERR_INCOMPLETE_CHUNKED_ENCODING` pada stream SSE realtime — masalah bawaan (§9),
bukan dari redesain ini.

**Screenshot (build production)** di `docs/screenshots/`: `office-game-{1672x941,1920x1080,1440x900,768x1024,390x844}-preview.jpg`
(tenant kosong), `office-game-1440x900-live-empty.jpg`, `office-game-{1920x1080,1440x900,390x844}-live.jpg` (agent
nyata), `office-game-1440x900-live-actor.jpg`, `office-game-1672x941-preview-actor.jpg`, `office-game-1440x900-menu.jpg`.

Untuk skenario tenant kosong, sebuah pengguna uji (`qa-office-…@example.test`, perusahaan "PT Kantor Kosong QA")
didaftarkan lewat endpoint registrasi normal **di database test** (yang memang sekali pakai), bukan di database dev.

## 9. Keterbatasan & temuan di luar lingkup

- Gambar target tidak tersedia (§2) dan tidak ada image-generation (§6).
- Di ponsel, robot ±42 px dan dunia harus digeser; pemilihan penuh tersedia lewat strip robot dan drawer.
- Saat zoom/fokus, label dunia ikut membesar (skala kamera).
- ~~**SSE produksi dapat terputus saat idle**~~ — **sudah diperbaiki** pada fase berikutnya: heartbeat default 5 detik
  dan konfigurasi menolak heartbeat ≥ `NITRO_BUN_IDLE_TIMEOUT` (lihat `docs/live-agent-event-mapping.md` §5).
- Rute tetap `app/pages/office/index.vue` (setara `/office`) karena ada rute anak `/office/assets`; brief menyebut
  `app/pages/office.vue`.
