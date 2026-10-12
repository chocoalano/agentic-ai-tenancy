# Agentic Game UI — Sistem Desain Terpadu

Satu produk, satu semesta: Virtual Office adalah pusat pengalaman, dan setiap halaman pendukung (AI Employees,
Tugas, Pengaturan) adalah area operasional lain di markas AI futuristik yang sama. Dokumen ini mendefinisikan
prinsip, token, arsitektur layout, tipografi, latar, dan kebijakan tema yang dipakai seluruh aplikasi.

Sumber kode: token & utilitas di `app/assets/css/tailwind.css` (lapisan "Agentic Game UI"), komponen chrome di
`app/components/game/`, layout `app/layouts/app.vue` (halaman manajemen) dan `app/layouts/game.vue` (/office),
identitas area di `app/utils/navigation.ts`. Pustaka komponen: `docs/game-ui-component-library.md`; inventaris rute:
`docs/frontend-route-design-audit.md`; bukti QA: `docs/unified-frontend-visual-qa.md`.

## 1. Prinsip

1. **Satu palet, satu bahasa permukaan.** Semua warna berasal dari token `--game-*` yang dikalibrasi dari HUD Virtual
   Office (asset pack Neon Mission Map). Token shadcn-vue (`--background`, `--card`, `--primary`, …) dan token brand
   lama (`--brand-*`) kini **alias** ke token game, sehingga primitive shadcn-vue otomatis bergaya game tanpa ditulis
   ulang.
2. **Presentasi yang tepat untuk tugas yang tepat.** /office = dunia isometrik imersif; halaman lain = panel pusat
   komando yang padat, terbaca, dan dapat diakses. Bertema game ≠ mengubah formulir menjadi artwork.
3. **Jujur.** Tidak ada XP/kredit/kuota/metrik yang dikarang. Kontrol yang belum didukung backend tampil nonaktif dengan
   alasan (mis. "Ubah profil" di Pengaturan, "Chat/Jeda" di profil agent), bukan input yang diam-diam tidak bekerja.
4. **Cahaya mengarahkan perhatian.** Glow cyan hanya pada panel utama (`holo`), hero (`command`), dan state aktif
   (tab/nav); bukan pada setiap elemen.
5. **Aksesibilitas tidak dikorbankan.** Kontras teks ≥ WCAG AA pada kedua tema, fokus keyboard terlihat
   (`--ring` = cyan), semantik HTML (h1 per halaman, `dl` untuk baris info, `fieldset` untuk pilihan tema/gerakan),
   preferensi gerakan dihormati.

## 2. Token

### 2.1 Token semantik `--game-*` (Tailwind: `bg-game-*`, `text-game-*`, `border-game-*`, `ring-game-*`)

| Token                   | Gelap (default, dari HUD)           | Terang (varian "siang")  | Pemakaian                               |
| ----------------------- | ----------------------------------- | ------------------------ | --------------------------------------- |
| `--game-bg`             | `oklch(0.175 0.05 262)` (#071329 ±) | `oklch(0.955 0.016 250)` | Latar halaman (`--background`)          |
| `--game-bg-deep`        | `oklch(0.13 0.04 265)`              | `oklch(0.905 0.03 252)`  | Gradien bawah latar, daftar tab         |
| `--game-surface`        | `oklch(0.225 0.062 262)` (#0a1936)  | `oklch(0.99 0.006 250)`  | Panel (`--card`)                        |
| `--game-surface-raised` | `oklch(0.27 0.072 260)` (#0e2448)   | `oklch(1 0 0)`           | Panel terangkat, popover, navigasi atas |
| `--game-border`         | `#205a9e` @ 55%                     | biru @ 30%               | Garis tepi panel/baris                  |
| `--game-border-strong`  | biru-cyan @ 75%                     | biru @ 55%               | Hero, navigasi atas                     |
| `--game-primary`        | `#267bff`                           | `oklch(0.52 0.2 258)`    | Tombol utama, aksen biru                |
| `--game-cyan`           | `#23d8ff`                           | `oklch(0.5 0.12 215)`    | Eyebrow, tab/nav aktif, ikon, fokus     |
| `--game-purple`         | ungu HUD                            | `oklch(0.5 0.2 300)`     | Crest, gradien latar                    |
| `--game-orange`         | `#ffae36`                           | `oklch(0.6 0.16 65)`     | Peringatan, persetujuan                 |
| `--game-success`        | `#2ee8af`                           | `oklch(0.55 0.14 160)`   | Sukses/selesai                          |
| `--game-text`           | `oklch(0.965 0.012 250)`            | `oklch(0.21 0.045 262)`  | Teks utama                              |
| `--game-text-muted`     | `oklch(0.78 0.035 250)`             | `oklch(0.45 0.04 258)`   | Teks sekunder (≥ 4.5:1 pada permukaan)  |
| `--game-glow`           | cyan @ 28%                          | biru @ 25%               | Cahaya panel/crest/tab aktif            |

Token turunan yang dipertahankan untuk kompatibilitas: `--surface*`, `--hairline`, `--glass-border`, `--glow`,
`--grid-line`, `--shadow-panel`, `--shadow-elevated`, `--brand-*` (= palet game), status agent `--agent-*`,
gamifikasi `--xp/--level/--mission`, palet mentah `--office-*` (sumber kalibrasi; tetap sama di kedua tema karena
artwork bernuansa malam).

### 2.2 Utilitas chrome (`@utility`, bekerja di kedua tema)

| Utilitas                         | Fungsi                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `game-chrome-bg`                 | Latar halaman berlapis (navy/biru pucat + cahaya ambient)                               |
| `game-topnav`                    | Strip navigasi atas (turunan `.office-hud`), blur + garis bawah biru                    |
| `game-nav-link`                  | Tab modul; `data-active="true"` = cyan                                                  |
| `game-panel`                     | Panel dasar; varian `-elevated`, `-holo`, `-command`, `-warning`, `-success`, `-sunken` |
| `game-tabs` / `game-tab`         | Daftar & pemicu tab pusat komando (di atas shadcn Tabs)                                 |
| `game-crest` / `game-crest-glow` | Crest heksagonal identitas + cahaya luar                                                |
| `game-chip`                      | Chip meta kecil (perusahaan, peran, runtime)                                            |
| `game-scrollbar`                 | Scrollbar tipis bertema                                                                 |
| `type-*`                         | Skala tipografi (lihat §4)                                                              |

Aturan: komponen memakai token/utilitas, **bukan** warna hardcoded. Warna heksadesimal hanya ada di CSS scoped
HUD /office yang sudah ada sebelumnya (`GameHUD.vue`).

## 3. Arsitektur layout

```text
app/layouts/game.vue   → /office (dunia layar penuh, HUD, GameMenu)          [tidak diubah]
app/layouts/app.vue    → GameShell
                          ├─ GamePageBackground  (latar bersama; fixed, z-0)
                          ├─ GameTopNav          (sticky; tab modul dari NAVIGATION; tenant, cari, notif, tema, user)
                          ├─ <main id="konten">  (max-w 96rem; padding responsif)
                          └─ GameMenu            (Sheet yang sama dengan /office untuk < 1280px)
app/layouts/default.vue→ beranda/masuk/daftar/error: GamePageBackground + header ringan
```

- Navigasi memakai **satu sumber** (`NAVIGATION`, `SETTINGS_NAVIGATION`) untuk tab atas, menu game, pencarian global,
  dan identitas area (`identity`, mis. "Commander Control Center"). Modul `soon` tidak pernah menjadi tautan: di tab
  atas masuk menu "Segera" (nonaktif), di GameMenu bertanda kunci.
- Jalur kembali ke Virtual Office ada di setiap halaman: tab "Virtual Office", logo, tombol cepat (< 1280px), dan
  tombol aksi di header halaman.
- Sidebar SaaS lama (`AppSidebar`, `AppHeader`) tidak lagi dipakai layout mana pun; komponennya tetap ada untuk
  kompatibilitas sementara dan dapat dihapus pada iterasi berikutnya.

## 4. Tipografi & jarak

| Utilitas             | Pemakaian                                         |
| -------------------- | ------------------------------------------------- |
| `type-eyebrow`       | Identitas area (uppercase, tracking 0.18em, cyan) |
| `type-page-title`    | h1 halaman (Space Grotesk)                        |
| `type-section-title` | Judul panel (h2/h3)                               |
| `type-card-title`    | Judul kartu/daftar                                |
| `type-body`          | Paragraf                                          |
| `type-support`       | Deskripsi sekunder                                |
| `type-label`         | Label baris info/form                             |
| `type-metric`        | Angka metrik (tabular)                            |

Jarak: grid halaman `space-y-6`; panel `p-4 sm:p-5` (`lg` untuk hero); radius panel `--radius-xl` (1rem); tinggi
kontrol 2.25–2.5rem; ikon 1rem di teks, 1.25–1.5rem di crest; lebar konten maksimum 96rem dengan rail samping 20rem
di ≥ 1280px. Tidak ada "kartu kecil di sudut viewport kosong": halaman menyusun hero + tab/konten + rail.

## 5. Latar

`GamePageBackground`: gradien `game-chrome-bg` → ilustrasi kota Mission Map (aset yang sama dengan /office, dari
registry `~/utils/game-assets`) hanya di 46vh bawah, opasitas 12–20 %, blur 1.5px, mask gradien → grid holografik
dengan mask radial → bintang (gelap saja) → gradien penutup. Panel konten hampir opak sehingga ilustrasi tidak pernah
berada langsung di belakang teks padat. Tidak ada aset besar yang diduplikasi.

## 6. Kebijakan tema

- **Gelap = identitas game, default** (`colorMode.preference: 'dark'`, fallback gelap).
- **Terang = varian siang yang didesain sengaja** dari sistem yang sama: permukaan biru pucat, aksen identik, chrome
  identik. Bukan dashboard putih; tidak ada komponen yang "jatuh" ke gaya generik.
- Preferensi pengguna disimpan @nuxtjs/color-mode (`aivo-color-mode`) dan **tidak pernah ditimpa** hanya dengan
  membuka halaman; perubahan hanya lewat kontrol eksplisit (Pengaturan › Tampilan, toggle tema, menu pengguna).
- /office selalu memakai bingkai gelap (kelas `dark` pada layout `game`) karena artwork malam-neon; GameMenu juga
  gelap di mana pun dibuka (identitas menu game).
- Tanpa kedipan SSR: kelas tema ditulis color-mode sebelum render; preferensi gerakan memakai **cookie**
  (`aivo-motion`) sehingga atribut `html[data-motion]` sudah benar saat SSR.

## 7. Gerakan

`useUiPreferences()` → `motion: 'system' | 'reduced'`. `reduced` mematikan animasi/transisi global
(`html[data-motion="reduced"]`, setara `prefers-reduced-motion`) **dan** animasi ambient mesin game
(`engine.reducedMotion`, lihat `useOfficeEngine`). Media query sistem tetap dihormati.

## 8. Aksesibilitas (ringkas)

Semantik: satu `h1` per halaman, `header`/`nav`/`main`/`aside`, `dl` untuk baris info, `fieldset`+radio untuk
pilihan tema/gerakan, tombol nonaktif memakai `disabled` + `aria-disabled` + alasan tertulis. Fokus:
`:focus-visible` cincin cyan di semua elemen. Kontras: teks sekunder ≥ 4.5:1 di kedua tema (cyan terang sengaja
diturunkan ke L≈0.5 pada varian terang). Sentuh: kontrol ≥ 40px di mobile. Motion: lihat §7.

## 9. Batasan yang diketahui

- Komponen sidebar/header lama masih ada di repositori (tidak dipakai).
- Varian terang belum diuji dengan pengguna; nilai token terang dapat dikalibrasi lagi.
- `/office` tidak disentuh selain token global; kontras label kecil di HUD mengikuti pekerjaan sebelumnya.
