# QA Visual & Interaksi Terpadu — Agentic Game UI

Bukti verifikasi redesign lintas aplikasi (12 Oktober 2026). Semua screenshot diambil sendiri dengan Chrome headless
(Puppeteer) terhadap dev server lokal (`AI_RUNTIME_PROVIDER=none`), akun seed `alya@nusantara.test`, tenant
PT Nusantara Digital. **Screenshot referensi pengguna tidak tersedia di repositori**, sehingga perbandingan
dilakukan terhadap tangkapan "sebelum" dari kode sebelum redesign — bukan perbandingan piksel terhadap gambar
pengguna. QA Virtual Office itu sendiri ada di `docs/frontend-visual-qa.md` (tidak berubah).

Skrip: `ui-shots.mjs` (tangkapan rute × tema × viewport) dan `ui-interactions.mjs` (navigasi, tema, gerakan, tab,
keyboard, dialog, ganti tenant, menu mobile) di scratchpad sesi; hasil disalin ke `docs/screenshots/ui-*.jpg`.

## 1. Sebelum vs sesudah (1920×1080)

| Halaman           | Sebelum                                                                                     | Sesudah                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Settings (terang) | `ui-before-light-settings-1920x1080.jpg` — sidebar putih, kartu kecil, 70 % viewport kosong | `ui-after-light-settings-profile-1920x1080.jpg` — varian siang: chrome game, hero komandan, tab, rail |
| Settings (gelap)  | `ui-before-dark-settings-1920x1080.jpg` — dark mode generik                                 | `ui-after-dark-settings-{profile,company,appearance,session}-1920x1080.jpg`                           |
| Agents            | `ui-before-light-agents-1920x1080.jpg`                                                      | `ui-after-dark-agents-1920x1080.jpg`, `ui-after-light-agents-1920x1080.jpg`                           |
| Agent detail      | `ui-before-light-agent-detail-1920x1080.jpg` (peringatan usang)                             | `ui-after-dark-agent-detail-1920x1080.jpg`                                                            |
| Tasks / detail    | (layout `app` lama)                                                                         | `ui-after-dark-tasks-1920x1080.jpg`, `ui-after-dark-task-detail-1920x1080.jpg`                        |
| Office (acuan)    | —                                                                                           | `ui-after-dark-office-1920x1080.jpg` — tidak berubah secara visual                                    |

Penerimaan visual (`/office` ↔ `/settings` berdampingan): palet sama (navy #071329-#0e2448, cyan #23d8ff, biru
#267bff, ungu, oranye), tipografi sama (Space Grotesk judul, Inter isi, eyebrow uppercase cyan), identitas navigasi
sama (logo, tenant, notifikasi, menu game), bahasa permukaan HUD sama (panel navy berbingkai biru/cyan, aksen
sudut, crest heksagonal), gaya status sama (badge lifecycle/runtime/tugas), pola kontrol sama (Button/Select/Tabs
shadcn bertoken game), ikon Lucide, atmosfer sama (kota Mission Map redup di tepi bawah). **Lulus.**

## 2. Viewport

| Viewport  | Berkas                                                                                                                                                                  | Hasil                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1920×1080 | semua `ui-after-*-1920x1080.jpg`                                                                                                                                        | Tab modul penuh dengan ikon, rail samping, 4 kolom metrik                                                   |
| 1440×900  | `ui-after-dark-settings-profile-1440x900.jpg`, `ui-after-dark-agents-1440x900.jpg`                                                                                      | Sama seperti 1920, konten memenuhi lebar                                                                    |
| 1280×800  | `ui-after-dark-settings-profile-1280x800.jpg`, `ui-after-dark-agents-1280x800.jpg`                                                                                      | Tab modul tanpa ikon, pencarian ikon, pemilih tenant tetap terbaca (perbaikan iterasi ke-2)                 |
| 768×1024  | `ui-after-dark-settings-profile-768x1024.jpg`, `ui-after-dark-agents-768x1024.jpg`                                                                                      | Menu game (tombol ☰), strip identitas, 2 kolom metrik, tab penuh                                           |
| 390×844   | `ui-after-dark-settings-{profile,appearance}-390x844.jpg`, `ui-after-dark-agents-390x844.jpg`, `ui-after-dark-tasks-390x844.jpg`, `ui-after-light-settings-390x844.jpg` | Satu kolom, tab menggulung/membungkus, tanpa overflow horizontal (`scrollWidth ≤ innerWidth` terverifikasi) |

## 3. Interaksi (hasil `ui-interactions.mjs`, 0 error konsol)

| Uji                                                      | Hasil                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSR terautentikasi `/settings`                           | HTML pertama memuat `data-game-shell`, `data-game-topnav`, "Commander Control Center", `html[data-motion]`; tanpa `data-slot="sidebar"`                                                                                        |
| Navigasi klien `/agents → /settings → /office → /agents` | Tanpa reload dokumen (penanda `window` bertahan), tab aktif & identitas ikut berubah, /office tetap layout `game`                                                                                                              |
| Tema terang via Pengaturan › Tampilan                    | `html.light`, `localStorage aivo-color-mode=light`, latar `oklch(0.955 0.016 250)`; **tetap terang setelah reload**, radio tercentang (`ui-qa-02-settings-light.jpg`)                                                          |
| Kurangi gerakan                                          | `html[data-motion="reduced"]`, cookie `aivo-motion=reduced`; tetap setelah reload                                                                                                                                              |
| Tab Pengaturan: klik & keyboard                          | Klik → `?tab=company` + panel perusahaan; ArrowRight → `?tab=appearance`, fokus pindah ke pemicu                                                                                                                               |
| Urutan fokus keyboard                                    | Lewati ke konten → Kembali ke Virtual Office (logo) → Virtual Office → AI Employees → Tugas → Pengaturan → Segera → …; semua dengan outline 2px (`ui-qa-03-keyboard-focus.jpg`)                                                |
| Dialog Buat perusahaan                                   | `role=dialog`, judul, fokus di dalam dialog, Escape menutup (`ui-qa-04-dialog-create-company.jpg`)                                                                                                                             |
| Ganti tenant dari Pengaturan                             | Chip header, panel perusahaan, dan navigasi atas berubah ke Garuda Logistik, lalu kembali (`ui-qa-05-tenant-switched.jpg`)                                                                                                     |
| Menu mobile (390×844)                                    | Sheet menu game: tautan /office, /agents, /tasks, /office/assets, /settings; 6 modul terkunci nonaktif; pemilih tenant ada; navigasi ke /agents tanpa overflow (`ui-qa-06-mobile-game-menu.jpg`, `ui-qa-07-mobile-agents.jpg`) |
| Menu game dari /office → /agents                         | Klien, tanpa reload (`ui-qa-01-office-game-menu.jpg`)                                                                                                                                                                          |
| Hidrasi                                                  | Tidak ada "Hydration completed but contains mismatches" setelah status radio tema diisi pasca-mount                                                                                                                            |

## 4. Aksesibilitas (diverifikasi)

- Satu `h1` per halaman, `header`/`nav aria-label`/`main#konten`/`aside aria-label`; tautan lewati konten pertama di
  urutan Tab.
- `fieldset`+`legend` (sr-only) + radio native untuk tema/gerakan; label kartu dapat diklik & difokuskan (ring).
- Kontrol nonaktif: `disabled` + `aria-disabled` + alasan tertulis (Ubah profil, Tugaskan, Chat, Jeda, Kualitas
  visual).
- Kontras: teks sekunder gelap `oklch(0.78)` di atas `oklch(0.225)` ≈ 9:1; terang `oklch(0.45)` di atas putih
  ≈ 7:1; eyebrow cyan terang `oklch(0.5)` ≈ 4.6:1. Diperiksa dengan perhitungan token; audit alat otomatis belum
  dijalankan (lihat batasan).
- Gerakan: media query sistem + preferensi pengguna; mesin game ikut (`engine.reducedMotion`).

## 5. Batasan

- Perbandingan dengan screenshot pengguna tidak dilakukan (berkas tidak tersedia).
- Audit kontras memakai nilai token, belum axe/Lighthouse.
- Menu game (Sheet) selalu gelap, juga pada varian terang (keputusan identitas; lihat kebijakan tema).
- QA light mode hanya pada 1920 & 390 untuk Pengaturan/Agents; viewport lain diuji pada tema gelap (default).

## 6. Gerbang kualitas (12 Oktober 2026)

| Gerbang                      | Hasil                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`          | lulus                                                                                                                                              |
| `bun run lint`               | lulus                                                                                                                                              |
| `bun run format:check`       | lulus untuk semua berkas proyek; gagal hanya pada `public/game-assets-v2/**/atlas.json` yang diubah proses lain                                    |
| `bun run check:assets`       | gagal hanya karena berkas `public/game-assets-v2` yang diubah proses lain (WebP berisi PNG, berkas yatim `sheet_old.webp`); tidak terkait redesign |
| `bun run test` (Bun)         | 271 lulus, 0 gagal                                                                                                                                 |
| `bun run test:nuxt` (Vitest) | 46 lulus (termasuk 7 test `tests/nuxt/game-ui.test.ts`)                                                                                            |
| `bun run build`              | sukses                                                                                                                                             |
| `bun run test:e2e`           | 15 lulus                                                                                                                                           |
