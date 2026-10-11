# Produksi Aset Game — Pipeline, Metadata, dan Spesifikasi Handoff

Status 11 Oktober 2026:

| Deliverable artwork                            | Status      | Keterangan                                                                                                |
| ---------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| Lima desain karakter konsisten                 | PROTOTYPE   | sprite statis pack asli (84×106 px) → v2 ×3; identitas warna sesuai brief, resolusi rendah                |
| Artwork karakter transparan bersih             | PROTOTYPE   | alpha lembut 9–10 % (v2), tepi gelap 0,6–9 %, sisi kanan terpotong diperbaiki simetris                    |
| Frame animasi artist (9 animasi × 5)           | **BLOCKED** | tidak ada tool generasi gambar/artist di lingkungan ini; frame saat ini PROSEDURAL (fallback)             |
| Frame arah (kiri/kanan/menghadap/membelakangi) | **BLOCKED** | hanya baris kanan + cermin; `heading` mesin sudah ada, baris `walk-toward`/`walk-away` menunggu artwork   |
| Artwork workstation berkualitas tinggi         | VERIFIED    | 8 pulau v3 hasil generate AI (pengungkapan di `docs/game-asset-quality-report.md`), geometri terkalibrasi |
| Tanpa serpihan potongan / label UI nyasar      | PARTIAL     | pulau v3 & efek bersih; karakter v2 masih sprite potongan beresolusi rendah; 2 pulau dekoratif kliping v2 |

Gerbang kualitas seni di atas **tidak** boleh ditandai selesai sampai artwork artist/generator tersedia. Frame
prosedural bukan artwork produksi.

## 1. Struktur berkas (yang berlaku)

Struktur yang disarankan brief (`design/game-art/…`, `public/game-assets/runtime/…`) **tidak** diterapkan agar path
runtime, registry, manifest, dan `check:assets` yang sudah teruji tidak rusak. Pemetaan:

| Peran                                   | Lokasi saat ini                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pack asli (tidak diubah)                | `public/game-assets/` (+ `asset-manifest.json`), mentah di `design/atlas_game_assets_pack/` |
| Sumber/master artwork (tidak di-deploy) | `design/office-reconstruction/{islands,backgrounds}/*.png` + `prompts.json`                 |
| Runtime                                 | `public/game-assets-v2/{characters,islands,backgrounds,tiles,fx,agents}/`                   |
| Atlas animasi                           | `public/game-assets-v2/agents/{karakter}/atlas.json` + `sheet.webp`                         |
| Geometri art → dunia                    | `app/game/island-geometry.ts` (dihasilkan) + `tests/fixtures/island-surface.json`           |
| Spesifikasi                             | dokumen ini, `docs/character-animation-system.md`, `docs/game-asset-quality-report.md`      |

Registry bertipe: `app/utils/game-assets.ts` (`CHARACTERS`, `ISLANDS`, `FX`, `TILES`, …) — komponen tidak pernah
menulis path `/game-assets(-v2)/...` secara literal (diuji `check:assets` §6).

## 2. Metadata per aset

| Bidang                 | Sumber saat ini                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Asset ID, path         | registry (`asset(id, w, h, …)`), manifest `public/game-assets/asset-manifest.json`                                                 |
| Dimensi sumber/runtime | manifest (asli) + faktor `v2` per kategori; `check:assets` §2/§7 memverifikasi dimensi berkas                                      |
| Transparansi           | audit `bun run assets:audit` (alpha lembut, tepi gelap, serpihan, terpotong, latar opak)                                           |
| Pivot/anchor           | karakter: `AGENT_ANCHOR` (96, 214) di `animation-spec.ts` dan `atlas.json.anchor`; pulau: slot/portal/spawn di `IslandArtGeometry` |
| State animasi, frame   | `atlas.json.animations[nama] = { row, fps, loop, frames[] }`; kontrak `AGENT_ANIMATIONS`                                           |
| Versi                  | `atlas.json.version` (2), akhiran `-v3` pada pulau/latar, registry `variant`                                                       |
| Sumber artwork         | `atlas.json.qualityNote`; `design/office-reconstruction/prompts.json` untuk v3                                                     |
| Status kualitas        | `atlas.json.quality = 'procedural-prototype'`; tabel status di `docs/game-asset-quality-report.md`                                 |
| Kontrak geometri       | `IslandArtGeometry` (`walkable`, `calibration`, `visibleBounds`, `walkablePolygon`, slot, portal)                                  |

Validasi otomatis: `bun run check:assets` (manifest, dimensi, registry, pemakaian, path literal, varian v2,
sprite sheet vs kontrak animasi, aset yatim) dan `tests/unit/office-geometry.test.ts` (anchor pada alpha & bukan
tebing). Perubahan artwork pulau wajib mengikuti urutan di `docs/asset-integration-report.md`/brief: impor →
periksa alpha → `bun run assets:geometry` → test geometri → verifikasi browser → baru ganti registry.

## 3. Audit karakter (11 Oktober 2026)

| Karakter | Sumber asli | Runtime v2 | Alpha lembut (v2) | Tepi gelap (v2) | Serpihan | Terpotong | Status artwork       | Animasi                       |
| -------- | ----------- | ---------- | ----------------: | --------------: | -------: | --------- | -------------------- | ----------------------------- |
| Nova     | 84×106      | 252×318    |            10,5 % |           8,9 % |        0 | kanan*    | prototipe (potongan) | prosedural (9 baris, 192×224) |
| Sage     | 82×106      | 246×318    |            10,1 % |           0,6 % |        0 | kanan*    | prototipe (potongan) | prosedural                    |
| Pixel    | 77×106      | 231×318    |             9,4 % |           9,0 % |        0 | kanan*    | prototipe (potongan) | prosedural                    |
| Bolt     | 86×106      | 258×318    |             8,7 % |           1,4 % |        0 | kanan*    | prototipe (potongan) | prosedural                    |
| Echo     | 82×106      | 246×318    |            10,0 % |           5,2 % |        1 | kanan*    | prototipe (potongan) | prosedural                    |

\* sisi kanan terpotong tipis pada sumber; diperbaiki simetris untuk sheet (`mirrorRepair`). Proporsi badan,
anchor kaki (96, 214), dan tinggi badan 176 px seragam di kelima sheet (diuji `check:assets` §8 dan
`tests/unit/office-engine.test.ts`). Frame-ke-frame hanya transformasi affine (napas, langkah teriris, condong,
lompat, larut, guncang) — identitas tidak berubah, tetapi tidak ada pose tangan/kepala baru.

Artwork yang hilang/tidak tersedia di workspace: `Neon Mission Map_ Project Atlas.png` dan
`virtual_office_clean_assets_v3.zip` (dicari di seluruh sistem; tidak ada). Baseline yang dipakai = artwork repo.

## 4. Spesifikasi handoff artist (per karakter)

- Kanvas frame **192 × 224 px @1×** (disarankan juga @2× 384 × 448; perbarui `AGENT_FRAME`), anchor kaki
  **(96, 214)**, tinggi badan 176 px, alpha sungguhan (tanpa latar), pencahayaan kiri-atas, tanpa teks.
- Sheet: 8 kolom × 9 baris (urutan `ANIMATION_ROWS`: idle, walk, think, work, read, communicate, celebrate,
  teleport, error), WebP alpha + `atlas.json` (`version`, `character`, `quality: 'artist'`, `anchor`,
  `animations` dengan `row`, `fps`, `loop`, `frames[]`).
- Frame & fps: idle 8 @6 (loop) · walk 8 @12 (loop, menghadap kanan; kiri = cermin) · think 8 @5 · work 8 @10 ·
  read 8 @6 · communicate 8 @8 · celebrate 8 @12 (tahan frame akhir) · teleport 8 @16 (maju masuk, mundur keluar) ·
  error 6 @12 (tahan frame akhir). Semua frame benar-benar berbeda (bukan duplikat), pivot konsisten.
- Opsional (kontrak mesin sudah siap, baris belum ada): `walk-toward`, `walk-away` (8 @12), `wave`, `sit`, `type`,
  `inspect`, `wait`. Tambahkan sebagai baris baru di `ANIMATION_ROWS`; renderer memakai `heading` (`data-heading`)
  untuk memilih baris bila tersedia — tanpa baris itu, fallback = baris kanan + cermin (`docs/character-animation-system.md`).
- Langkah jalan mengikuti **jarak** (`STRIDE_UNITS` = 64 unit dunia per siklus 8 frame); gambar siklus langkah
  penuh (2 langkah) per 8 frame agar kaki tidak meluncur.
- Pengiriman: `public/game-assets-v2/agents/{karakter}/sheet.webp` + `atlas.json`; simpan sumber (PSD/PNG lapis)
  di `design/` (tidak di-deploy). Jalankan `bun run check:assets` — mesin/renderer/state machine tidak perlu diubah.

Pulau baru (Research Lab, Training Center): kanvas 1536×1024, alpha bersih, apron jalan datar di depan bangunan
dengan tebing batu biru-abu konsisten agar `bun run assets:geometry` dapat mengalibrasi otomatis; lalu test
geometri, overlay `/office?debug=geometry`, dan verifikasi browser sebelum `walkable: true`.

## 5. Yang dilarang

- Mengklaim frame prosedural atau sprite yang diperbesar sebagai artwork artist/produksi.
- Membuat berkas gambar palsu hanya agar test keberadaan berkas lulus.
- Menaruh master/sumber di `public/` (aset yatim ditolak `check:assets`).
- Menandai pulau `walkable` sebelum geometrinya terverifikasi.
