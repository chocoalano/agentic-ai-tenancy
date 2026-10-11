# Sistem Navigasi Virtual Office

Robot bergerak di dunia 1672 × 941 unit dengan aturan: **berjalan hanya di atas area jalan sebuah pulau**, dan
perpindahan antar pulau **selalu lewat portal** di sepanjang jalur energi yang terlihat. Robot tidak pernah berjalan
melintasi udara kosong. Area jalan, simpul, spawn, slot, dan portal setiap pulau **diturunkan dari artwork-nya**
(`app/game/geometry.ts`, `app/game/island-geometry.ts`), bukan dari fraksi kotak yang ditebak. Semua logika berada di
TypeScript murni (`app/game/world.ts`, `navigation.ts`, `engine.ts`), tanpa Vue/DOM, dan diuji di
`tests/unit/office-engine.test.ts` serta `tests/unit/office-geometry.test.ts`.

## 1. Entitas dunia

Satu sistem koordinat (unit dunia) dipakai bersama oleh layout, renderer, dan navigasi. Kamera (zoom/geser) hanya
mengubah tampilan, tidak mengubah koordinat.

| Entitas           | Sumber                                       | Isi                                                                                                                |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `World`           | `buildWorld()`                               | graf 8 pulau yang dapat dijalani (hub + 7 stasiun) + 14 tautan portal; 2 pulau dekoratif dirender tanpa masuk graf |
| `Island`          | `world.ts`                                   | `id`, `box` (posisi dunia), `walkable`, `hub`, `spawn`, `portal`, `workstations`, `zone`                           |
| `Workstation`     | `world.ts`                                   | `island`, `slot` (0/1), `point` = titik kaki robot saat bekerja (anchor)                                           |
| `Portal`          | `world.ts`                                   | satu pad per pulau; kontrak memisahkan `entry` (berangkat) dan `exit` (tiba) — pada artwork saat ini keduanya sama |
| `PortalLink`      | dari `energyConnections()` (`office-layout`) | pasangan pulau + kurva Bézier kuadratik jalur energi (`start`, `control`, `end`)                                   |
| `InteractionZone` | `world.ts`                                   | kotak klik pulau (membuka quick view stasiun)                                                                      |
| Agent             | `OfficeEngine.agents`                        | posisi, pulau, slot, arah hadap, aktivitas, rute, teleport, ucapan                                                 |
| Effect            | `OfficeEffects.vue`, `OfficeActor.vue`       | pad portal (kilat saat dipakai), cincin energi, hologram/partikel/ikon status                                      |
| Connection        | `EnergyConnections.vue`                      | jaringan energi SVG (lapisan statis + lapisan pulsa)                                                               |

### Geometri art → dunia (`IslandArtGeometry`)

Masalah yang diperbaiki: geometri lama adalah belah ketupat dengan fraksi kotak yang sama untuk semua pulau, padahal
artwork v3 tiap pulau berbeda (bangunan di belakang, apron di depan), sehingga robot berdiri di tebing, di udara,
atau di dinding bangunan. Kini setiap pulau memiliki kontrak eksplisit (`app/game/geometry.ts`), dengan semua
koordinat **dinormalkan ke kanvas gambar yang dirender** ((0,0) kiri atas, (1,1) kanan bawah) dan dipetakan ke unit
dunia lewat kotak render pulau (`toWorld`: x = left + nx × width, dibulatkan 0,1 unit → deterministik SSR). Kamera
bekerja pada seluruh panggung, jadi pemetaan tidak berubah saat zoom atau ukuran viewport berubah.

| Bidang                    | Arti                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibleBounds`           | kotak piksel terlihat (alpha > 16) — dibedakan dari kanvas penuh                                                                                                      |
| `walkablePolygon`         | permukaan atas yang dapat dijalani: pita apron heksagonal di DEPAN bangunan (6 titik); tebing, sisi, dan bangunan opak BUKAN tempat berdiri — "alpha > 0" tidak cukup |
| `navNode`, `spawnPoint`   | simpul navigasi lokal (tengah pita depan) dan titik muncul                                                                                                            |
| `workstationSlots`        | 2 slot (kiri-depan, kanan-depan) = anchor kaki robot saat bekerja                                                                                                     |
| `portalEntry/Exit`        | titik berangkat dan tiba (kiri-depan)                                                                                                                                 |
| `walkable`, `calibration` | `false` = dekoratif (tanpa slot/portal, di luar graf); `auto` (dari mask) atau `manual`                                                                               |

Nilainya **dihasilkan** oleh `bun run assets:geometry` (`scripts/calibrate-island-geometry.ts`; butuh ImageMagick 7)
dari berkas yang benar-benar dirender: (1) alpha → `visibleBounds`; (2) mask **tebing** batu biru-abu (warna yang
konsisten antar artwork; warna tanah permukaan justru bervariasi — rumput, lavender, oranye, platform cyan — jadi
permukaan tidak ditebak dari warna tanah); profil tepi atas tebing per kolom = tepi depan permukaan; (3) sudut
kiri/kanan dari siluet dan ujung depan → apron yang disusutkan dari bibir; (4) simpul/slot/portal dipastikan di dalam
poligon dan di atas sel permukaan. `app/game/island-geometry.ts` jangan disunting manual. Tujuh stasiun utama
dikalibrasi `auto`; **Mission Hub `manual`** (platform cincin tanpa pemisahan warna tebing/platform yang andal),
tetap diuji untuk kontainmen dan alpha. **Research Lab dan Training Center** ditandai `walkable: false` (kliping v2
kecil yang didominasi bangunan, tanpa permukaan jalan yang dapat dikalibrasi; butuh artwork baru) — tetap dirender
dan dapat diklik, tetapi tidak menerima penempatan agent.

Verifikasi: `tests/unit/office-geometry.test.ts` memakai fixture mask tebing/alpha 96×64 per pulau
(`tests/fixtures/island-surface.json`, dihasilkan skrip yang sama) sehingga berjalan tanpa ImageMagick: semua anchor
(slot, portal, spawn, simpul) berada pada alpha penuh dan bukan tebing; bibir luar poligon ≥ 75% dan interior ≥ 80% di
luar batu; pemetaan ke dunia linear terhadap kotak render. Overlay kalibrasi (`OfficeGeometryDebug.vue`) hanya di
`nuxt dev` dengan `/office?debug=geometry` (kotak terlihat, poligon jalan, slot, portal, simpul);
`docs/screenshots/office-geometry-overlay-1672x941.jpg`.

Tautan portal (14): Mission Hub ↔ ketujuh stasiun yang dapat dijalani, ditambah web-research↔data-warehouse,
data-warehouse↔analytics-tool, analytics-tool↔task-manager, task-manager↔report-builder, web-research↔client-brief,
client-brief↔knowledge-base, knowledge-base↔report-builder. Empat jalur energi ke Research Lab dan Training Center
tetap digambar (total 18 jalur SVG) tetapi bukan tautan navigasi.

## 2. Perencanaan rute

`findRoute(world, asal, tujuan)` menghasilkan urutan leg:

```text
walk(pulau asal: titik → portal)  →  teleport(A → B) [→ teleport(B → C) …]  →  walk(pulau tujuan: portal → workstation)
```

- **Jalur lokal (`localPath`)**: area jalan adalah apron berbentuk "U" di depan bangunan (cekung), jadi ruas lurus
  dapat memotong bangunan. Bila ruas langsung tetap di dalam area jalan (disampel setiap ±6 unit) robot berjalan
  langsung; selain itu lewat simpul navigasi di tengah pita depan, yang "melihat" kedua sayap. Tidak ada bolak-balik.
- **Antar pulau (`islandPath`)**: Dijkstra di atas graf pulau. Biaya per lompatan = 400 + 0,2 × jarak antar portal,
  sehingga rute dengan lompatan paling sedikit diutamakan. Arah kurva dicatat (`reversed`) agar orb mengikuti jalur
  energi ke arah yang benar.
- Satu pulau: hanya leg `walk`. Rute kosong (sudah di tujuan) berarti tiba seketika.

Contoh: Sage dari Mission Hub (slot 0) ke Web Research = walk(mission-hub, 3 titik) → teleport(mission-hub →
web-research) → walk(web-research, 3 titik). Client Brief → Report Builder = 2 lompatan lewat Knowledge Base. Research
Lab dan Training Center tidak dapat dituju (dekoratif).

## 3. Gerak

| Parameter             | Nilai                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kecepatan jalan       | 95 unit/detik × kecepatan simulasi                                                                                                                            |
| Akselerasi/deselerasi | rasio kecepatan = min(1, (s + 4) / 36, (sisa + 4) / 36), minimal 0,25 (ease-in/out per leg)                                                                   |
| Arah hadap            | dari komponen x gerak (ambang 0,5 unit); sheet menghadap kanan, kiri = cermin                                                                                 |
| Kedalaman             | `z-index = 100 + y`: robot di depan/belakang robot lain sesuai posisi kaki; selalu di atas pulau (z 40–49) karena hanya berdiri di area depan permukaan pulau |
| Anchor kaki           | titik dunia = anchor sheet (96, 214); robot berhenti tepat di `workstation.point`                                                                             |
| Langkah waktu         | `dt` dibatasi 0,1 detik (tab yang tertidur tidak melompat), dikalikan kecepatan simulasi                                                                      |

Teleport (per leg): **masuk** (animasi `teleport` maju, 8 frame @16 fps = 0,5 detik), lalu **transit** (robot
disembunyikan dan orb partikel mengikuti kurva jalur energi selama 0,6 detik), lalu **keluar** (animasi `teleport`
mundur di portal tujuan, 0,5 detik). Pad portal asal dan tujuan berkilat (±1,1 detik) saat dipakai. Fase keluar
memulai ulang pewaktuan frame (kunci animasi `teleport:in` / `teleport:out`), sehingga animasi mundur benar-benar
diputar 7 → 0; sebelumnya frame mandek di akhir fase masuk karena kedua fase dianggap animasi yang sama (dikunci test
`animasi teleport: masuk diputar maju, keluar diputar MUNDUR`).

Pulau tidak lagi melayang naik-turun agar kaki robot tetap menempel di permukaannya.

## 4. Pembatalan, interupsi, dan event

- `moveTo(key, {island, slot?}, then?)`: slot kosong dipilih otomatis (`freeSlot`). `then` = aktivitas saat tiba (mis.
  `researching` di Web Research). Agent `offline` atau transisi tidak sah ditolak (mengembalikan `false`).
- **Rute baru saat berjalan** menggantikan rute lama dari posisi sekarang.
- **Rute baru saat transit teleport**: teleport yang sedang berjalan diselesaikan dulu, lalu rute baru dihitung dari
  portal tujuan, jadi robot tidak pernah "melompat" tanpa efek.
- `cancel(key)`: berhenti di tempat dan kembali `idle`. Jika sedang transit, robot tetap keluar di portal tujuan.
- `setActivity` ke state non-`moving` membatalkan rute yang sedang berjalan.
- **Jeda** (`engine.paused`) membekukan waktu mesin: posisi, frame, dan timer aktivitas.
- **Reduced motion**: `moveTo` langsung menempatkan robot di tujuan dan memicu event tiba (tanpa jalan/teleport).

Event mesin (`engine.on`): `route` (rute dimulai), `teleport` (`in`/`out`), `arrived` (tiba di workstation),
`activity` (perubahan state), `speech`, `agents`, `clock`. Simulasi menunggu event `arrived` sebelum menghitung durasi
aktivitas. Snapshot Vue diperbarui hanya pada event ini, tidak per frame.

## 5. Invarian yang diuji

`tests/unit/office-engine.test.ts`:

- Semua simpul pulau (spawn, hub, portal, workstation) berada di dalam area jalan.
- Graf portal terhubung: setiap pulau dapat dicapai dari setiap pulau.
- Untuk semua pasangan pulau: setiap titik leg `walk` berada di dalam area jalan pulaunya, dan setiap leg `teleport`
  memakai tautan yang ada. Tidak ada ruas yang melintasi udara.
- Robot berjalan, teleport, lalu berhenti tepat di anchor workstation dan memulai aktivitasnya.
- Pembatalan menghentikan robot di tempat (`idle`); jeda membekukan gerak.
- Reduced motion: tiba seketika.
- Simulasi tetap selesai bila robot sudah berada di tujuan atau reduced motion aktif (sebelumnya menggantung karena
  event `arrived` terjadi sebelum aksi fase terdaftar).

`tests/unit/office-geometry.test.ts`: delapan pulau utama dapat dijalani dan dua pulau kliping dekoratif eksplisit;
anchor pada alpha penuh dan bukan tebing; pemetaan geometri → dunia linear terhadap kotak render; pulau dekoratif
dirender tetapi menolak penempatan agent.

`tests/nuxt/office-renderer.test.ts` memastikan renderer menulis posisi setiap frame saat berjalan (asal ≠ tujuan),
menampilkan orb selama transit antar pulau, berjalan tanpa teleport pada pulau yang sama, tiba seketika pada jarak nol
dengan state kerja langsung dipakai, dan berhenti tepat di anchor dengan satu event `arrived` (state saat tiba).

Verifikasi browser (skenario Project Atlas, sampel setiap 100 ms): selama berjalan, 18 dari 19 sampel menunjukkan
posisi baru, dengan akselerasi dan deselerasi terlihat; orb transit dan kilat portal teramati; kelima robot berpindah
posisi.
