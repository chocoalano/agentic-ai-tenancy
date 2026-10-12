# QA Visual & Interaksi Terpadu — Agentic Game UI

Bukti verifikasi redesign lintas aplikasi (12 Oktober 2026, iterasi 2: pola HUD /office dipakai persis dan satu
identitas gelap). Semua screenshot diambil sendiri dengan Chrome headless (Puppeteer) terhadap dev server lokal
(`AI_RUNTIME_PROVIDER=none`), akun seed `alya@nusantara.test`, tenant PT Nusantara Digital. **Screenshot referensi
pengguna tidak tersedia di repositori**, sehingga perbandingan dilakukan terhadap tangkapan "sebelum" dari kode
sebelum redesign dan terhadap `/office` saat ini — bukan perbandingan piksel terhadap gambar pengguna. QA Virtual
Office itu sendiri ada di `docs/frontend-visual-qa.md` (tidak berubah).

Skrip: `ui-shots.mjs` (tangkapan rute × viewport) dan `ui-interactions.mjs` (navigasi, gerakan, tab, keyboard,
dialog, ganti tenant, menu mobile) di scratchpad sesi; hasil disalin ke `docs/screenshots/ui-*.jpg`.

## 1. Sebelum vs sesudah (1920×1080)

| Halaman      | Sebelum                                                                                                                       | Sesudah                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Settings     | `ui-before-light-settings-1920x1080.jpg` (sidebar putih, kartu kecil), `ui-before-dark-settings-1920x1080.jpg` (dark generik) | `ui-after-settings-{profile,company,appearance,session}-1920x1080.jpg` |
| Agents       | `ui-before-light-agents-1920x1080.jpg`                                                                                        | `ui-after-agents-1920x1080.jpg`                                        |
| Agent detail | `ui-before-light-agent-detail-1920x1080.jpg` (peringatan usang)                                                               | `ui-after-agent-detail-1920x1080.jpg`                                  |
| Tasks        | (layout `app` lama)                                                                                                           | `ui-after-tasks-1920x1080.jpg`, `ui-after-task-detail-1920x1080.jpg`   |
| Office       | —                                                                                                                             | `ui-after-office-1920x1080.jpg` — acuan, tidak berubah                 |

### Penerimaan visual `/office` ↔ halaman lain (berdampingan)

| Elemen HUD /office                                            | Halaman manajemen                                       | Sumber nilai yang sama                      |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| Strip HUD atas (gradien navy, garis bawah biru 2px)           | `GameTopNav` kelas `hud-bar`                            | `.office-hud` → `hud-bar`                   |
| Kartu komandan (crest heksagon ungu-cyan, radius 12/25px)     | Kartu perusahaan aktif = pemilih tenant `variant="hud"` | `.hud-card`, `.commander-crest`             |
| Kartu sumber daya (ikon bercahaya + angka tebal)              | Tab modul `game-nav-link`, metrik `StatCard`            | `.hud-card`, `drop-shadow` cyan             |
| Tombol ikon HUD (biru-300 → cyan)                             | Pencarian, notifikasi, pengaturan, menu                 | `hud-icon-btn`                              |
| Panel misi/roster (`hud-panel`, aksen sudut, blur)            | `GamePanel`, `GamePageHeader`                           | `hud-panel` = `game-panel`                  |
| Kepala panel (tinggi 54px, garis #6288cb5c, judul tebal 18px) | kepala `GamePanel`/`GamePageHeader`                     | `.mission-heading` → `hud-heading`          |
| Entri roster (gradien #112b54→#0a1938, hover cyan)            | `AgentCard`, baris tugas, baris perusahaan              | `.roster-entry` → `hud-row`                 |
| Blok kosong roster (putus-putus cyan)                         | `EmptyState`, `GameLoadingState`, sumur metrik          | `hud-well`                                  |
| Lencana status neon (`OfficeStatusBadge`)                     | Semua `Badge` shadcn (varian dipetakan)                 | `badgeVariants`                             |
| Tombol dunia (`game-btn-blue/navy`, inset highlight)          | Semua `Button` shadcn default/secondary/destructive     | `buttonVariants`                            |
| Latar dunia Mission Map + vinyet                              | `GamePageBackground` (aset yang sama, diredupkan)       | `GameBackdrop`, `game-sky`, `game-vignette` |
| Teks `#f5f8ff`, label `blue-100/200`, eyebrow cyan uppercase  | tipografi panel/baris/header                            | sama                                        |
| Selalu gelap                                                  | `GameShell`/layout memaksa `dark`, `colorMode: 'dark'`  | sama dengan layout `game`                   |

**Lulus**: tidak ada elemen chrome yang memakai bahasa visual lain (sidebar/kartu putih/tombol flat).

## 2. Viewport

| Viewport  | Berkas                                                                                                                | Hasil                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1920×1080 | semua `ui-after-*-1920x1080.jpg`                                                                                      | Kartu modul dengan ikon, rail samping, 4 kolom metrik                   |
| 1440×900  | `ui-after-settings-tab-profile-1440x900.jpg`, `ui-after-agents-1440x900.jpg`                                          | Sama seperti 1920                                                       |
| 1280×800  | `ui-after-settings-tab-profile-1280x800.jpg`, `ui-after-agents-1280x800.jpg`                                          | Kartu modul tanpa ikon, pencarian ikon, kartu komandan tetap terbaca    |
| 768×1024  | `ui-after-settings-tab-profile-768x1024.jpg`, `ui-after-agents-768x1024.jpg`                                          | Menu game (☰), strip identitas, 2 kolom metrik                         |
| 390×844   | `ui-after-settings-tab-{profile,appearance}-390x844.jpg`, `ui-after-agents-390x844.jpg`, `ui-after-tasks-390x844.jpg` | Satu kolom, aksi header turun ke bawah judul, tanpa overflow horizontal |

30 tangkapan (9 rute × 1920 & 390, 4 rute × 1440/1280/768): semua HTTP 200, shell game ada, 0 error konsol.

## 3. Interaksi (hasil `ui-interactions.mjs`, 0 error konsol)

| Uji                                                      | Hasil                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSR terautentikasi `/settings`                           | HTML pertama memuat `data-game-shell`, `data-game-topnav`, "Commander Control Center", `html[data-motion]`; tanpa `data-slot="sidebar"`                                                                                 |
| Navigasi klien `/agents → /settings → /office → /agents` | Tanpa reload dokumen (penanda `window` bertahan), kartu modul aktif & identitas ikut berubah, /office tetap layout `game`                                                                                               |
| Tema tunggal                                             | `html.dark`, bingkai `GameShell` berkelas `dark`, 0 kontrol pemilih tema, latar `oklch(0.175 0.05 262)` (`ui-qa-02-settings-appearance.jpg`)                                                                            |
| Kurangi gerakan                                          | `html[data-motion="reduced"]`, cookie `aivo-motion=reduced`; tetap setelah reload                                                                                                                                       |
| Tab Pengaturan: klik & keyboard                          | Klik → `?tab=company` + panel perusahaan; ArrowRight → `?tab=appearance`, fokus pindah ke pemicu                                                                                                                        |
| Urutan fokus keyboard                                    | Lewati ke konten → Ganti perusahaan (kartu komandan) → Virtual Office → AI Employees → Tugas → Pengaturan → Segera → …; tautan beroutline 2px, kartu komandan bercincin cyan (`ui-qa-03-keyboard-focus.jpg`)            |
| Dialog Buat perusahaan                                   | `role=dialog`, judul, fokus di dalam dialog, Escape menutup (`ui-qa-04-dialog-create-company.jpg`)                                                                                                                      |
| Ganti tenant dari Pengaturan                             | Chip header, panel perusahaan, dan kartu komandan berubah ke Garuda Logistik, lalu kembali (`ui-qa-05-tenant-switched.jpg`)                                                                                             |
| Menu mobile (390×844)                                    | Sheet menu game: /office, /agents, /tasks, /office/assets, /settings; 6 modul terkunci nonaktif; pemilih tenant ada; navigasi ke /agents tanpa overflow (`ui-qa-06-mobile-game-menu.jpg`, `ui-qa-07-mobile-agents.jpg`) |
| Menu game dari /office → /agents                         | Klien, tanpa reload (`ui-qa-01-office-game-menu.jpg`)                                                                                                                                                                   |
| Hidrasi                                                  | Tidak ada "Hydration completed but contains mismatches"                                                                                                                                                                 |

## 4. Aksesibilitas (diverifikasi)

- Satu `h1` per halaman, `header`/`nav aria-label`/`main#konten`/`aside aria-label`; tautan lewati konten pertama di
  urutan Tab.
- `fieldset`+`legend` (sr-only) + radio native untuk gerakan; label kartu dapat diklik & difokuskan (ring cyan).
- Kontrol nonaktif: `disabled` + `aria-disabled` + alasan tertulis (Ubah profil, Tugaskan, Chat, Jeda, Kualitas
  visual).
- Kontras: teks `#f5f8ff` dan label `blue-100/200` di atas panel navy ≈ 9–12:1; eyebrow cyan `#23d8ff` ≈ 8:1.
  Diperiksa dengan perhitungan token; audit alat otomatis belum dijalankan.
- Gerakan: media query sistem + preferensi pengguna; mesin game ikut (`engine.reducedMotion`).

## 5. Batasan

- Perbandingan dengan screenshot pengguna tidak dilakukan (berkas tidak tersedia).
- Audit kontras memakai nilai token, belum axe/Lighthouse.
- CSS scoped `GameHUD.vue`/`MissionPanel.vue`/`AgentRoster.vue` belum diganti ke utilitas `hud-*` (nilai disalin
  identik; konsolidasi = iterasi berikutnya agar tidak ada dua sumber).
