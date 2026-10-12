# Pustaka Komponen Agentic Game UI

Komponen chrome & panel bersama untuk halaman terautentikasi non-office, di `app/components/shared/game/` (auto-import
tanpa prefix folder lewat registrasi `~/components/shared` yang sudah ada). Semua memakai token `--game-*` dan primitive shadcn-vue;
tidak ada warna hardcoded. Test: `tests/nuxt/game-ui.test.ts`.

| Komponen             | Peran                                                                                                                                                                  | Prop utama                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GameShell`          | Cangkang layout `app`: latar, navigasi atas, `<main id="konten">`, GameMenu (< 1280px)                                                                                 | `title`                                                                                                                                                                                                                                      |
| `GameTopNav`         | Navigasi atas HUD: tab modul (`NAVIGATION` + Pengaturan), menu "Segera", tenant, cari, notifikasi, tema, user, tombol cepat Virtual Office, strip identitas (< 1280px) | `identity`, `title`, `currentPath?` (override untuk test); emit `openMenu`                                                                                                                                                                   |
| `GamePageBackground` | Latar bersama (gradien, kota Mission Map redup, grid, bintang)                                                                                                         | —                                                                                                                                                                                                                                            |
| `GamePageHeader`     | Header halaman: crest, identitas area, h1, deskripsi, chip meta, aksi, tautan kembali                                                                                  | `identity`, `title`, `description`, `icon`, `backTo`, `backLabel`; slot `meta`, `actions`                                                                                                                                                    |
| `GamePanel`          | Panel pengganti kartu putih; header & footer opsional                                                                                                                  | `variant` (`default`/`elevated`/`holo`/`command`/`warning`/`success`/`sunken`), `as`, `title`, `description`, `eyebrow`, `icon`, `headingLevel`, `headingId`, `padding` (`none`/`sm`/`md`/`lg`); slot `header`, `actions`, default, `footer` |
| `GameTabs`           | Tab pusat komando di atas shadcn Tabs; konten lewat `<TabsContent>`                                                                                                    | `items: {value,label,icon?,badge?}[]`, `modelValue`, `label`; emit `update:modelValue`                                                                                                                                                       |
| `GameInfoRow`        | Baris label/nilai hanya-baca di dalam `<dl>`                                                                                                                           | `label`, `hint`, `mono`                                                                                                                                                                                                                      |
| `GameLoadingState`   | Kerangka pemuatan bergaya panel (`aria-busy`)                                                                                                                          | `rows`, `label`                                                                                                                                                                                                                              |

Komponen bersama yang **disesuaikan** (bukan dibuat ulang): `PageHeader` (kini pembungkus `GamePageHeader`,
identitas dari navigasi), `StatCard` (panel game; `unavailable` → sumur putus-putus "Belum tersedia"), `EmptyState`
(sumur game), `ErrorState` (panel peringatan), `AgentCard` (panel holo saat hover, portret `AgentAvatar` ukuran
`lg`, badge lifecycle+runtime, tautan tugas aktif). Primitive shadcn-vue (Button, Badge, Input, Select, Dialog,
Tabs, Table, Tooltip, Popover, DropdownMenu, Sheet, Skeleton, Checkbox, Separator) dipakai apa adanya dan otomatis
mengikuti token.

## Kapan memakai varian `GamePanel`

| Varian     | Pakai untuk                                                      | Jangan untuk          |
| ---------- | ---------------------------------------------------------------- | --------------------- |
| `default`  | Konten umum, daftar, formulir                                    | —                     |
| `elevated` | Rail samping, ringkasan, popover kustom                          | Konten utama panjang  |
| `holo`     | Satu panel utama per layar (profil, hasil, perusahaan aktif)     | Semua panel sekaligus |
| `command`  | Hero identitas (komandan, agent)                                 | Panel sekunder        |
| `warning`  | Persetujuan tertunda, runtime belum siap, error tugas            | Informasi netral      |
| `success`  | Hasil dirilis, tugas selesai                                     | Status belum pasti    |
| `sunken`   | Sumur bersarang: kode/hasil, tile metrik, kontrol belum tersedia | Panel tingkat atas    |

## Pola halaman

```vue
<div class="space-y-6">
  <GamePageHeader identity="Mission Board" title="Tugas AI employee" :icon="ListChecks">
    <template #meta><span class="game-chip">…</span></template>
    <template #actions><Button variant="outline" as-child><NuxtLink to="/office">Virtual Office</NuxtLink></Button></template>
  </GamePageHeader>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard … /></div>
  <GamePanel padding="sm" as="div">…toolbar…</GamePanel>
  <GameLoadingState v-if="pending" /> <ErrorState v-else-if="error" /> <EmptyState v-else-if="empty" />
  <GamePanel v-else variant="holo" title="…">…</GamePanel>
</div>
```

Tata letak dua kolom (`xl:grid-cols-[minmax(0,1fr)_20rem]`) untuk halaman dengan rail ringkasan (Pengaturan);
`xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]` untuk detail (agent, tugas).

## Aturan penggunaan

- Identitas area (eyebrow) selalu dari `NavigationItem.identity` atau konstanta yang sama; jangan mengarang nama area
  baru per halaman.
- Setiap halaman harus memiliki jalur kembali ke Virtual Office (sudah disediakan `GameTopNav`; tambahkan tombol di
  header bila relevan).
- Kontrol yang belum didukung backend: `disabled` + `aria-disabled="true"` + teks alasan di sebelahnya.
- Jangan memakai `glass` untuk konten padat (hanya overlay di atas scene); gunakan `GamePanel`.
- Jangan menambah wrapper baru untuk primitive yang sudah bergaya lewat token (Button, Input, Select, Badge).
- Status, metrik, dan angka hanya dari API; `StatCard` menerima `unavailable` untuk menyatakan "belum tersedia".
