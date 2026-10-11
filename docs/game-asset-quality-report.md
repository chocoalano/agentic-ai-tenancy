# Laporan Kualitas Aset Game

Pembaruan 11 Oktober 2026: **rekonstruksi statis sebagian selesai**. Latar kota dan delapan pulau utama kini
memakai ilustrasi v3 dari referensi pengguna: Mission Hub, Web Research, Data Warehouse, Client Brief,
Knowledge Base, Analytics Tool, Report Builder, dan Final Report. PNG hasil generasi beserta WebP untuk runtime
disimpan terpisah di `public/game-assets-v2/` dengan akhiran `-v3`; semua PNG pack asli tetap utuh.

Generasi memakai tool bawaan `image_gen`, dengan prompt lengkap di
`design/office-reconstruction-prompts.json`. Gambar latar tidak memuat UI, karakter, pulau utama, atau jalur;
pulau memakai alpha transparan tanpa label/robot. Sembilan WebP berjumlah sekitar **2,2 MB**. Registry memilih
varian rekonstruksi untuk render default, sedangkan `GameImage :v2="false"` tetap menampilkan sumber asli.
Builder `assets:v2` secara eksplisit memilih tujuan prosedural sehingga tidak menimpa ilustrasi v3.

**Karakter, frame animasi artist, tile, dan dua pulau tambahan belum direkonstruksi.** Status keseluruhan belum
LULUS. Audit dan tabel di bawah adalah catatan pack asli serta perbaikan prosedural sebelumnya; angka tersebut
bukan audit kualitas ilustrasi v3.

## Catatan audit awal

Status Objective A pada audit awal: **TERBLOKIR** — bukan LULUS.

Asset pack `atlas_game_assets_pack` adalah potongan dari lembar komposit beresolusi rendah. Lingkungan
pengembangan pada audit awal **tidak memiliki artwork sumber maupun alat image generation**, sehingga aset bersih beresolusi
tinggi tidak dapat dibuat ulang. Yang sudah dikerjakan: audit terukur atas setiap aset, perbaikan teknis yang memang
bisa dilakukan dengan pengolahan citra (registry v2 terversi), dan spesifikasi regenerasi untuk sisanya. Varian v2
**bukan** aset siap produksi: perbesaran Lanczos dan penajaman tidak menambah detail ilustrasi.

File asli tidak diubah (`public/game-assets/`, 78 file, 2,5 MB). Hasil perbaikan terpisah di `public/game-assets-v2/`
(5,6 MB).

## 1. Cara mengaudit dan membangun ulang

```bash
bun run assets:audit           # audit file asli (tabel Markdown; --json untuk mesin)
bun run assets:audit -- --v2   # audit hasil v2 untuk perbandingan
bun run assets:v2              # bangun ulang public/game-assets-v2 (butuh ImageMagick 7)
bun run check:assets           # gerbang integrasi: manifest, registry, v2, sprite sheet
```

Skrip: `scripts/audit-game-assets.ts`, `scripts/build-game-assets-v2.ts`, `scripts/lib/raster.ts`.

## 2. Metrik audit

Semua metrik diukur pada area aset **setelah kliping registry** (bukan seluruh lembar sumber).

| Metrik       | Arti                                                                                      | Indikasi cacat                       |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Alpha lembut | % piksel tampak dengan alpha parsial                                                      | 0% = tepi biner/bergerigi            |
| Tepi gelap   | % piksel tepi yang warnanya dekat navy latar lembar sumber (garis kartun hitam diabaikan) | halo sisa potongan                   |
| Serpihan     | jumlah komponen terpisah ≥ 6 px selain badan utama                                        | fragmen tetangga/potongan persegi    |
| Terpotong    | sisi dengan deretan piksel opak lurus ≥ max(8 px, 12% sisi)                               | garis tepi objek terpotong kliping   |
| Latar opak   | % piksel opak yang gelap                                                                  | latar ikut opak (relevan untuk efek) |

Klasifikasi (sesuai brief): **layak** (apa adanya), **dapat diperbaiki** (pengolahan citra), **perlu dibuat ulang**
(cacat yang tidak bisa dipulihkan, mis. tepi terpotong), **terblokir** (butuh artwork sumber/generator yang tidak
tersedia), **referensi saja** (pratinjau UI berisi teks tercetak; tidak dipakai sebagai aset).

## 3. Ringkasan klasifikasi aset asli

| Kategori                      | Jumlah | Layak | Dapat diperbaiki | Perlu dibuat ulang | Terblokir | Referensi saja |
| ----------------------------- | -----: | ----: | ---------------: | -----------------: | --------: | -------------: |
| Karakter (`characters/`)      |      5 |     — |                — |                  — |         5 |              — |
| Pose (`character-states/`)    |     11 |     2 |                — |                  9 |         — |              — |
| Pulau (`islands/`)            |     10 |     — |                — |                 10 |         — |              — |
| Tile (`tiles/`)               |      9 |     — |                — |                  9 |         — |              — |
| Efek (`fx/`)                  |      8 |     3 |                5 |                  — |         — |              — |
| Latar (`backgrounds/`)        |      1 |     — |                — |                  — |         1 |              — |
| Ikon (`icons/`)               |     20 |     — |                7 |                 13 |         — |              — |
| Pratinjau UI (`ui-previews/`) |     14 |     — |                — |                  — |         — |             14 |
| **Total**                     | **78** | **5** |           **12** |             **41** |     **6** |         **14** |

Tabel lengkap per aset ada di [Lampiran A](#lampiran-a--audit-aset-asli).

## 4. Perbaikan yang dilakukan (registry v2)

`bun run assets:v2` membangun 44 aset statis v2 (WebP alpha) plus 5 sprite sheet karakter:

1. **Kliping registry** dan pembuangan bintik serpihan kecil (komponen < 0,6% area; efek 5%).
2. **Dekontaminasi tepi**: piksel tepi yang warnanya dekat navy latar lembar sumber (16, 26, 58) diturunkan alpha-nya
   sehingga halo berkurang.
3. **Efek (fx)**: latar gelap yang ikut opak diubah menjadi alpha sungguhan dengan _unblend_
   `a = max((C − bg) / (255 − bg))`, `F = bg + (C − bg) / a`; `bg` = persentil ke-10 luminans piksel opak. Warna efek
   tetap (cyan tidak bergeser ke hijau).
4. **Karakter**: perbaikan simetri untuk sisi kanan yang terpotong tipis — **hanya** untuk sumber sprite sheet.
5. **Resampling Lanczos** (karakter/pose/pulau/tile ×3, efek ×2, latar ×4), penajaman RGB ringan, dan anti-alias
   alpha.

Registry `app/utils/game-assets.ts` menyimpan faktor `v2` per kategori; `v2Source(item)` menunjuk
`/game-assets-v2/{id}.webp`. Komponen `GameImage` memakai v2 secara default; ikon dan pratinjau UI tetap memakai file
asli (tidak punya varian v2). `check:assets` memverifikasi keberadaan dan dimensi setiap varian (44/44) serta kontrak
sprite sheet (5/5).

### Hasil terukur (asli → v2)

Perbaikan nyata ada pada **efek**: halo latar hilang (tepi gelap → 0%) dan latar opak turun drastis, mis.
`fx/hologram-cube` 51,6% → 0%, `fx/connection-path` 58,1% → 0,4%, `fx/particles-purple` 71,5% → 0%. Halo pulau
berkurang (`islands/web-research` tepi gelap 17,8% → 9,6%, `islands/client-brief` 20,5% → 15,2%).

Yang **tidak** membaik dan tidak bisa dibaikkan dengan pengolahan citra:

- **Tepi terpotong** tetap ada pada semua pulau, tile, dan 9 pose (kolom "Terpotong" v2): piksel yang tidak ada di
  sumber tidak dapat dipulihkan.
- **Karakter** tetap satu pose statis 84×106 px; perbesaran ×3 tidak menambah detail.
- **Latar city-skyline** 265×105 px setelah kliping; ×4 tetap buram.
- Jumlah **serpihan** pada beberapa efek partikel naik (mis. `fx/energy-spawn` 1 → 5) karena percikan cahaya yang
  semula menyatu dengan latar opak kini menjadi komponen terpisah. Pada partikel ini disengaja; pada `fx/energy-ring`
  (1 → 3) berarti masih ada sisa kecil di sekitar cincin.

Tabel lengkap di [Lampiran B](#lampiran-b--perbandingan-asli--v2).

## 5. Aset yang perlu dibuat ulang (spesifikasi regenerasi)

Dibutuhkan artwork sumber atau ilustrator/generator. Identitas visual mengacu ke aset yang ada (Nova, Sage, Pixel,
Bolt, Echo **tidak boleh** diganti karakter lain).

| Prioritas | Aset                                               | Masalah                                           | Spesifikasi target                                                                                                                                                                                                                                                                                                              |
| --------- | -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | 5 karakter + frame animasi                         | satu pose statis, 84×106 px, sisi kanan terpotong | Per karakter: 9 animasi sesuai `docs/character-animation-system.md` (idle 8, walk 8 kanan, think 8, work 8, read 8, communicate 8, celebrate 8, teleport 8, error 6 frame), frame 192×224 px @1× (disarankan juga @2× 384×448), anchor kaki (96, 214), PNG/WebP alpha sungguhan, pencahayaan dari kiri atas, skala badan 176 px |
| 2         | 10 pulau (`islands/*`)                             | tepi terpotong, halo, resolusi rendah             | Isometrik konsisten, ≥ 3× ukuran tampil saat ini (mis. mission hub ≥ 700 px lebar), alpha bersih tanpa latar, titik pivot di dasar pulau, ruang jalan datar di permukaan                                                                                                                                                        |
| 3         | Latar `city-skyline`                               | 265×105 px                                        | ≥ 1920×760 px, dapat diulang horizontal, tanpa elemen UI                                                                                                                                                                                                                                                                        |
| 4         | 9 tile (`tiles/*`)                                 | tepi bawah/samping terpotong                      | Utuh, ≥ 3× ukuran sekarang, alpha bersih                                                                                                                                                                                                                                                                                        |
| 5         | 9 pose (`character-states/*` selain idle/thinking) | tepi terpotong                                    | Digantikan oleh frame animasi prioritas 1 (pose terpisah tidak lagi dibutuhkan untuk dunia)                                                                                                                                                                                                                                     |
| 6         | 13 ikon terpotong (`icons/*`)                      | ubin terpotong + sisa label                       | Ikon utuh 128×128 px tanpa teks; alternatif: ikon vektor (lucide) yang sudah dipakai HUD                                                                                                                                                                                                                                        |

Efek (8) sudah layak/diperbaiki dan tidak perlu dibuat ulang untuk prototipe; versi produksi tetap disarankan
diekspor dari sumber dengan alpha asli.

## 6. Pemakaian di aplikasi

- Dunia `/office` memakai varian v2 untuk pulau, tile, efek, latar; robot memakai sprite sheet
  `agents/{karakter}/sheet.webp` (lihat `docs/character-animation-system.md`).
- Pose `character-states/*` tidak dipakai sebagai animasi dunia (terpotong); tampil lengkap di galeri
  `/office/assets` dan satu pose (thinking) di quick view Mission Hub.
- Galeri `/office/assets` memperlihatkan seluruh aset beserta label pratinjau.

## Lampiran A — Audit aset asli

Keluaran `bun run assets:audit` (file asli, setelah kliping registry).

| Aset                               | Ukuran  | Alpha lembut | Tepi gelap | Serpihan | Terpotong                | Latar opak | Status             | Alasan                                                                                                |
| ---------------------------------- | ------- | ------------ | ---------- | -------- | ------------------------ | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `characters/nova`                  | 84×106  | 18.7%        | 7.9%       | 0        | kanan                    | 29.7%      | terblokir          | Statis 1 pose, resolusi rendah; frame animasi butuh render ulang dari artwork sumber (tidak tersedia) |
| `characters/sage`                  | 82×106  | 17.8%        | 0.3%       | 0        | kanan                    | 27.4%      | terblokir          | Statis 1 pose, resolusi rendah; frame animasi butuh render ulang dari artwork sumber (tidak tersedia) |
| `characters/pixel`                 | 77×106  | 18.1%        | 7.1%       | 0        | kanan                    | 43.5%      | terblokir          | Statis 1 pose, resolusi rendah; frame animasi butuh render ulang dari artwork sumber (tidak tersedia) |
| `characters/bolt`                  | 86×106  | 15.9%        | 2%         | 0        | kanan                    | 30.1%      | terblokir          | Statis 1 pose, resolusi rendah; frame animasi butuh render ulang dari artwork sumber (tidak tersedia) |
| `characters/echo`                  | 82×106  | 18.8%        | 5.9%       | 0        | kanan                    | 28.3%      | terblokir          | Statis 1 pose, resolusi rendah; frame animasi butuh render ulang dari artwork sumber (tidak tersedia) |
| `character-states/idle`            | 82×100  | 23.6%        | 9.2%       | 0        | —                        | 29.5%      | layak              | Tidak ada cacat terukur                                                                               |
| `character-states/thinking`        | 86×100  | 23.4%        | 2.3%       | 0        | —                        | 42.1%      | layak              | Tidak ada cacat terukur                                                                               |
| `character-states/working`         | 97×102  | 14.8%        | 4.5%       | 0        | kanan                    | 24.3%      | perlu dibuat ulang | Garis tepi terpotong (kanan) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `character-states/analyzing`       | 85×103  | 13.2%        | 1.9%       | 0        | kanan                    | 39.5%      | perlu dibuat ulang | Garis tepi terpotong (kanan) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `character-states/generating`      | 89×103  | 19%          | 1.3%       | 0        | kanan                    | 31.1%      | perlu dibuat ulang | Garis tepi terpotong (kanan) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `character-states/researching`     | 80×84   | 16.2%        | 0%         | 0        | bawah                    | 18.9%      | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `character-states/coding`          | 80×82   | 16.7%        | 4.1%       | 0        | bawah                    | 25.8%      | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `character-states/reporting`       | 74×80   | 12.6%        | 0%         | 0        | bawah, kiri              | 23.2%      | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri) — tidak dapat dipulihkan dengan pengolahan citra                   |
| `character-states/communicating`   | 80×80   | 14.9%        | 4.3%       | 0        | bawah, kiri              | 40.3%      | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri) — tidak dapat dipulihkan dengan pengolahan citra                   |
| `character-states/success`         | 63×83   | 20.3%        | 0%         | 0        | kiri                     | 23.9%      | perlu dibuat ulang | Garis tepi terpotong (kiri) — tidak dapat dipulihkan dengan pengolahan citra                          |
| `character-states/alert`           | 60×79   | 15.9%        | 0%         | 0        | bawah                    | 47.6%      | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `islands/mission-hub`              | 232×239 | 7.4%         | 6.3%       | 5        | atas, kiri, kanan        | 21.7%      | perlu dibuat ulang | Garis tepi terpotong (atas, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra             |
| `islands/web-research`             | 130×127 | 11.3%        | 17.8%      | 1        | atas, kiri, kanan        | 19%        | perlu dibuat ulang | Garis tepi terpotong (atas, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra             |
| `islands/data-warehouse`           | 142×132 | 11.6%        | 13.9%      | 1        | atas                     | 22%        | perlu dibuat ulang | Garis tepi terpotong (atas) — tidak dapat dipulihkan dengan pengolahan citra                          |
| `islands/client-brief`             | 139×127 | 10.3%        | 20.5%      | 1        | atas, kiri, kanan        | 17.5%      | perlu dibuat ulang | Garis tepi terpotong (atas, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra             |
| `islands/knowledge-base`           | 119×112 | 11.7%        | 30%        | 3        | atas, bawah, kiri, kanan | 24.5%      | perlu dibuat ulang | Garis tepi terpotong (atas, bawah, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra      |
| `islands/analytics-tool`           | 136×126 | 11.1%        | 16.1%      | 1        | atas, kiri               | 24%        | perlu dibuat ulang | Garis tepi terpotong (atas, kiri) — tidak dapat dipulihkan dengan pengolahan citra                    |
| `islands/report-builder`           | 112×114 | 8.9%         | 6.3%       | 1        | bawah, kiri, kanan       | 6.9%       | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra            |
| `islands/research-lab`             | 111×112 | 9.1%         | 8.4%       | 0        | bawah, kiri              | 21.4%      | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri) — tidak dapat dipulihkan dengan pengolahan citra                   |
| `islands/training-center`          | 106×111 | 9.4%         | 7.6%       | 1        | bawah, kiri, kanan       | 20%        | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra            |
| `islands/task-manager`             | 112×111 | 9.8%         | 7%         | 1        | bawah, kiri, kanan       | 6%         | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra            |
| `tiles/cloud`                      | 87×49   | 10.4%        | 0.4%       | 0        | bawah, kiri, kanan       | 1.1%       | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra            |
| `tiles/grass`                      | 40×49   | 13.8%        | 3.9%       | 0        | bawah, kanan             | 6.9%       | perlu dibuat ulang | Garis tepi terpotong (bawah, kanan) — tidak dapat dipulihkan dengan pengolahan citra                  |
| `tiles/purple-grass`               | 54×48   | 15.7%        | 5.5%       | 0        | bawah, kiri              | 31.8%      | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri) — tidak dapat dipulihkan dengan pengolahan citra                   |
| `tiles/purple-forest`              | 70×47   | 17.8%        | 5.1%       | 0        | bawah                    | 28.6%      | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `tiles/evergreen-trees`            | 30×35   | 27.3%        | 4.7%       | 0        | bawah                    | 3.9%       | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `tiles/crystal-rock`               | 34×49   | 30.4%        | 5.4%       | 0        | bawah, kiri              | 25.5%      | perlu dibuat ulang | Garis tepi terpotong (bawah, kiri) — tidak dapat dipulihkan dengan pengolahan citra                   |
| `tiles/rocks`                      | 38×30   | 12.4%        | 44.8%      | 0        | atas, bawah, kiri, kanan | 40.9%      | perlu dibuat ulang | Garis tepi terpotong (atas, bawah, kiri, kanan) — tidak dapat dipulihkan dengan pengolahan citra      |
| `tiles/shrubs`                     | 51×33   | 20.1%        | 8.3%       | 0        | bawah                    | 6.3%       | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `tiles/stone-cluster`              | 58×29   | 28.1%        | 0.7%       | 1        | bawah                    | 27.8%      | perlu dibuat ulang | Garis tepi terpotong (bawah) — tidak dapat dipulihkan dengan pengolahan citra                         |
| `fx/portal-cyan`                   | 86×47   | 29.6%        | 4.1%       | 3        | atas, bawah, kiri, kanan | 7.3%       | layak              | Alpha memadai                                                                                         |
| `fx/portal-violet`                 | 91×44   | 36.7%        | 27.9%      | 4        | atas, bawah, kiri, kanan | 59.2%      | dapat diperbaiki   | Latar gelap opak → konversi luminans ke alpha                                                         |
| `fx/energy-ring`                   | 62×65   | 24.8%        | 0%         | 1        | kiri, kanan              | 13.4%      | layak              | Alpha memadai                                                                                         |
| `fx/energy-spawn`                  | 72×68   | 30.3%        | 0%         | 1        | kiri, kanan              | 49%        | dapat diperbaiki   | Latar gelap opak → konversi luminans ke alpha                                                         |
| `fx/hologram-cube`                 | 68×66   | 30.7%        | 52.1%      | 4        | atas, bawah, kiri, kanan | 51.6%      | dapat diperbaiki   | Latar gelap opak → konversi luminans ke alpha                                                         |
| `fx/particles-cyan`                | 57×55   | 20.6%        | 0%         | 0        | bawah, kiri              | 17.7%      | layak              | Alpha memadai                                                                                         |
| `fx/particles-purple`              | 58×55   | 33.6%        | 0%         | 0        | —                        | 71.5%      | dapat diperbaiki   | Latar gelap opak → konversi luminans ke alpha                                                         |
| `fx/connection-path`               | 240×68  | 42.1%        | 32.4%      | 9        | atas, kiri, kanan        | 58.1%      | dapat diperbaiki   | Latar gelap opak → konversi luminans ke alpha                                                         |
| `backgrounds/city-skyline`         | 265×105 | 0%           | 8.6%       | 0        | atas, bawah, kiri, kanan | 13.5%      | terblokir          | Resolusi 265×105 setelah kliping; perlu render ulang ≥ 1920 px (tanpa sumber/alat generasi)           |
| `icons/globe`                      | 54×63   | 0%           | 71.7%      | 0        | atas, bawah, kiri, kanan | 80.5%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/database`                   | 56×63   | 0%           | 52.6%      | 0        | atas, bawah, kiri, kanan | 77.7%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/analytics`                  | 65×63   | 0%           | 54.8%      | 0        | atas, bawah, kiri, kanan | 85.6%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/document`                   | 46×47   | 0%           | 20.9%      | 0        | atas, bawah, kiri, kanan | 4.3%       | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `icons/task`                       | 46×47   | 0%           | 13.7%      | 0        | atas, bawah, kiri, kanan | 3.2%       | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `icons/knowledge`                  | 56×62   | 0%           | 69%        | 0        | atas, bawah, kiri, kanan | 56.9%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/research`                   | 57×62   | 0%           | 45.7%      | 0        | atas, bawah, kiri, kanan | 68.2%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/settings`                   | 60×62   | 0%           | 46.7%      | 0        | atas, bawah, kiri, kanan | 76.9%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/user`                       | 46×48   | 0%           | 22.8%      | 0        | atas, bawah, kiri, kanan | 66.8%      | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `icons/chat`                       | 46×46   | 0%           | 17.8%      | 0        | atas, bawah, kiri, kanan | 3.1%       | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `icons/check`                      | 59×63   | 0%           | 74.6%      | 0        | atas, bawah, kiri, kanan | 53.8%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/clock`                      | 62×66   | 0%           | 53.2%      | 0        | atas, bawah, kiri, kanan | 63.5%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/warning`                    | 63×65   | 0%           | 52.4%      | 0        | atas, bawah, kiri, kanan | 77.9%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/error`                      | 62×63   | 0%           | 54.5%      | 0        | atas, bawah, kiri, kanan | 77.9%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/growth`                     | 47×48   | 0%           | 17.7%      | 0        | atas, bawah, kiri, kanan | 3.5%       | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `icons/star`                       | 62×65   | 0%           | 79.6%      | 0        | atas, bawah, kiri, kanan | 59.7%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/trophy`                     | 60×68   | 0%           | 60.7%      | 0        | atas, bawah, kiri, kanan | 47.6%      | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/lightning`                  | 62×67   | 0%           | 60.6%      | 0        | atas, bawah, kiri, kanan | 77%        | perlu dibuat ulang | Ubin ikon terpotong + sisa label                                                                      |
| `icons/cpu`                        | 46×49   | 0%           | 22%        | 0        | atas, bawah, kiri, kanan | 44.1%      | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `icons/network`                    | 47×49   | 0%           | 24.5%      | 0        | atas, bawah, kiri, kanan | 6.9%       | dapat diperbaiki   | Ubin utuh setelah kliping                                                                             |
| `ui-previews/top-status-hud`       | 1238×60 | 0%           | 65.9%      | 0        | atas, bawah, kiri, kanan | 84.9%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/mission-panel`        | 243×192 | 0%           | 86.8%      | 0        | atas, bawah, kiri, kanan | 84.4%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/mission-and-map`      | 386×366 | 0%           | 37.2%      | 0        | atas, bawah, kiri, kanan | 85.5%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/sector-map`           | 278×126 | 0%           | 82.5%      | 0        | atas, bawah, kiri, kanan | 85.8%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/agent-roster`         | 485×394 | 0%           | 81.3%      | 0        | atas, bawah, kiri, kanan | 82.1%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/agent-status-card`    | 328×214 | 0%           | 99.1%      | 0        | atas, bawah, kiri, kanan | 82.3%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/action-buttons`       | 393×104 | 0%           | 64.4%      | 0        | atas, bawah, kiri, kanan | 47.8%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/mission-controls`     | 825×124 | 0%           | 34.3%      | 0        | atas, bawah, kiri, kanan | 71.7%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/status-badges`        | 333×215 | 0%           | 93.2%      | 0        | atas, bawah, kiri, kanan | 64.8%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/xp-energy-progress`   | 252×198 | 0%           | 71.1%      | 0        | atas, bawah, kiri, kanan | 79.4%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/notification-panel`   | 251×121 | 0%           | 89.9%      | 0        | atas, bawah, kiri, kanan | 87.9%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/automation-panel`     | 343×112 | 0%           | 90.3%      | 0        | atas, bawah, kiri, kanan | 83.9%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/insight-toast`        | 230×70  | 0%           | 52.5%      | 0        | atas, bawah, kiri, kanan | 13.5%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |
| `ui-previews/task-completed-toast` | 237×72  | 0%           | 54.2%      | 0        | atas, bawah, kiri, kanan | 23.6%      | referensi saja     | Teks tercetak; hanya acuan gaya                                                                       |

Ringkasan: terblokir 6 · layak 5 · perlu dibuat ulang 41 · dapat diperbaiki 12 · referensi saja 14

## Lampiran B — Perbandingan asli → v2

Keluaran `bun run assets:audit` dibandingkan dengan `bun run assets:audit -- --v2` (44 aset yang punya varian v2).
Status audit = klasifikasi file asli; v2 tidak mengubah klasifikasi karena cacat struktural (terpotong, resolusi)
tetap ada.

| Aset                             | Ukuran asli → v2   | Tepi gelap    | Latar opak    | Serpihan | Terpotong (v2)           | Status audit (asli) |
| -------------------------------- | ------------------ | ------------- | ------------- | -------- | ------------------------ | ------------------- |
| `characters/nova`                | 84×106 → 252×318   | 7.9% → 8.9%   | 29.7% → 29.4% | 0 → 0    | kanan                    | terblokir           |
| `characters/sage`                | 82×106 → 246×318   | 0.3% → 0.6%   | 27.4% → 28.3% | 0 → 0    | kanan                    | terblokir           |
| `characters/pixel`               | 77×106 → 231×318   | 7.1% → 9%     | 43.5% → 43.1% | 0 → 0    | kanan                    | terblokir           |
| `characters/bolt`                | 86×106 → 258×318   | 2% → 1.4%     | 30.1% → 30.4% | 0 → 0    | kanan                    | terblokir           |
| `characters/echo`                | 82×106 → 246×318   | 5.9% → 5.2%   | 28.3% → 27.8% | 0 → 1    | kanan                    | terblokir           |
| `character-states/idle`          | 82×100 → 246×300   | 9.2% → 15%    | 29.5% → 28.8% | 0 → 0    | —                        | layak               |
| `character-states/thinking`      | 86×100 → 258×300   | 2.3% → 5.8%   | 42.1% → 41.5% | 0 → 0    | —                        | layak               |
| `character-states/working`       | 97×102 → 291×306   | 4.5% → 4.8%   | 24.3% → 23.7% | 0 → 0    | kanan                    | perlu dibuat ulang  |
| `character-states/analyzing`     | 85×103 → 255×309   | 1.9% → 2.4%   | 39.5% → 40.1% | 0 → 0    | kanan                    | perlu dibuat ulang  |
| `character-states/generating`    | 89×103 → 267×309   | 1.3% → 2.8%   | 31.1% → 31%   | 0 → 0    | kanan                    | perlu dibuat ulang  |
| `character-states/researching`   | 80×84 → 240×252    | 0% → 0%       | 18.9% → 19.9% | 0 → 0    | bawah                    | perlu dibuat ulang  |
| `character-states/coding`        | 80×82 → 240×246    | 4.1% → 5.5%   | 25.8% → 24.9% | 0 → 0    | bawah                    | perlu dibuat ulang  |
| `character-states/reporting`     | 74×80 → 222×240    | 0% → 0.4%     | 23.2% → 24.4% | 0 → 0    | bawah, kiri              | perlu dibuat ulang  |
| `character-states/communicating` | 80×80 → 240×240    | 4.3% → 5.2%   | 40.3% → 39.6% | 0 → 0    | bawah, kiri              | perlu dibuat ulang  |
| `character-states/success`       | 63×83 → 189×249    | 0% → 0.4%     | 23.9% → 24.7% | 0 → 0    | kiri                     | perlu dibuat ulang  |
| `character-states/alert`         | 60×79 → 180×237    | 0% → 0%       | 47.6% → 47.3% | 0 → 0    | bawah                    | perlu dibuat ulang  |
| `islands/mission-hub`            | 232×239 → 696×717  | 6.3% → 6.3%   | 21.7% → 21.7% | 5 → 5    | atas, kanan              | perlu dibuat ulang  |
| `islands/web-research`           | 130×127 → 390×381  | 17.8% → 9.6%  | 19% → 18.3%   | 1 → 1    | atas, kiri, kanan        | perlu dibuat ulang  |
| `islands/data-warehouse`         | 142×132 → 426×396  | 13.9% → 8.9%  | 22% → 21.5%   | 1 → 1    | atas                     | perlu dibuat ulang  |
| `islands/client-brief`           | 139×127 → 417×381  | 20.5% → 15.2% | 17.5% → 16.8% | 1 → 2    | atas, kiri, kanan        | perlu dibuat ulang  |
| `islands/knowledge-base`         | 119×112 → 357×336  | 30% → 19.7%   | 24.5% → 23%   | 3 → 2    | atas, bawah, kiri, kanan | perlu dibuat ulang  |
| `islands/analytics-tool`         | 136×126 → 408×378  | 16.1% → 7.9%  | 24% → 23.5%   | 1 → 1    | atas, kiri               | perlu dibuat ulang  |
| `islands/report-builder`         | 112×114 → 336×342  | 6.3% → 16%    | 6.9% → 6.8%   | 1 → 1    | bawah, kiri, kanan       | perlu dibuat ulang  |
| `islands/research-lab`           | 111×112 → 333×336  | 8.4% → 6.3%   | 21.4% → 21.3% | 0 → 0    | bawah, kiri              | perlu dibuat ulang  |
| `islands/training-center`        | 106×111 → 318×333  | 7.6% → 6.9%   | 20% → 20.1%   | 1 → 1    | bawah, kiri, kanan       | perlu dibuat ulang  |
| `islands/task-manager`           | 112×111 → 336×333  | 7% → 10.2%    | 6% → 6.5%     | 1 → 1    | bawah, kiri, kanan       | perlu dibuat ulang  |
| `tiles/cloud`                    | 87×49 → 261×147    | 0.4% → 1.6%   | 1.1% → 1.6%   | 0 → 0    | bawah, kiri, kanan       | perlu dibuat ulang  |
| `tiles/grass`                    | 40×49 → 120×147    | 3.9% → 5.4%   | 6.9% → 7.1%   | 0 → 0    | bawah, kanan             | perlu dibuat ulang  |
| `tiles/purple-grass`             | 54×48 → 162×144    | 5.5% → 8%     | 31.8% → 31.1% | 0 → 0    | bawah, kiri              | perlu dibuat ulang  |
| `tiles/purple-forest`            | 70×47 → 210×141    | 5.1% → 8.5%   | 28.6% → 28%   | 0 → 0    | bawah                    | perlu dibuat ulang  |
| `tiles/evergreen-trees`          | 30×35 → 90×105     | 4.7% → 3.4%   | 3.9% → 2.9%   | 0 → 0    | bawah                    | perlu dibuat ulang  |
| `tiles/crystal-rock`             | 34×49 → 102×147    | 5.4% → 4.3%   | 25.5% → 24.7% | 0 → 0    | bawah, kiri              | perlu dibuat ulang  |
| `tiles/rocks`                    | 38×30 → 114×90     | 44.8% → 44.2% | 40.9% → 40.9% | 0 → 0    | atas, bawah, kiri, kanan | perlu dibuat ulang  |
| `tiles/shrubs`                   | 51×33 → 153×99     | 8.3% → 9%     | 6.3% → 5.9%   | 0 → 0    | bawah                    | perlu dibuat ulang  |
| `tiles/stone-cluster`            | 58×29 → 174×87     | 0.7% → 2.5%   | 27.8% → 27%   | 1 → 1    | bawah                    | perlu dibuat ulang  |
| `fx/portal-cyan`                 | 86×47 → 172×94     | 4.1% → 0%     | 7.3% → 0%     | 3 → 3    | kanan                    | layak               |
| `fx/portal-violet`               | 91×44 → 182×88     | 27.9% → 0%    | 59.2% → 18.9% | 4 → 1    | kanan                    | dapat diperbaiki    |
| `fx/energy-ring`                 | 62×65 → 124×130    | 0% → 0%       | 13.4% → 0%    | 1 → 3    | kiri                     | layak               |
| `fx/energy-spawn`                | 72×68 → 144×136    | 0% → 0%       | 49% → 9.4%    | 1 → 5    | kiri, kanan              | dapat diperbaiki    |
| `fx/hologram-cube`               | 68×66 → 136×132    | 52.1% → 0%    | 51.6% → 0%    | 4 → 2    | kiri, kanan              | dapat diperbaiki    |
| `fx/particles-cyan`              | 57×55 → 114×110    | 0% → 0%       | 17.7% → 0%    | 0 → 0    | —                        | layak               |
| `fx/particles-purple`            | 58×55 → 116×110    | 0% → 0%       | 71.5% → 0%    | 0 → 3    | —                        | dapat diperbaiki    |
| `fx/connection-path`             | 240×68 → 480×136   | 32.4% → 0%    | 58.1% → 0.4%  | 9 → 4    | —                        | dapat diperbaiki    |
| `backgrounds/city-skyline`       | 265×105 → 1060×420 | 8.6% → 8.6%   | 13.5% → 13.4% | 0 → 0    | atas, bawah, kiri, kanan | terblokir           |
