# Sistem Navigasi Virtual Office

Robot bergerak di dunia 1672 × 941 unit dengan aturan: **berjalan hanya di atas area jalan sebuah pulau**, dan
perpindahan antar pulau **selalu lewat portal** di sepanjang jalur energi yang terlihat. Robot tidak pernah berjalan
melintasi udara kosong. Semua logika berada di TypeScript murni (`app/game/world.ts`, `navigation.ts`, `engine.ts`),
tanpa Vue/DOM, dan diuji di `tests/unit/office-engine.test.ts`.

## 1. Entitas dunia

Satu sistem koordinat (unit dunia) dipakai bersama oleh layout, renderer, dan navigasi. Kamera (zoom/geser) hanya
mengubah tampilan, tidak mengubah koordinat.

| Entitas           | Sumber                                       | Isi                                                                                      |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `World`           | `buildWorld()`                               | peta 10 pulau + 18 tautan portal                                                         |
| `Island`          | `world.ts`                                   | `id`, `box` (posisi dunia), `walkable`, `hub`, `spawn`, `portal`, `workstations`, `zone` |
| `Workstation`     | `world.ts`                                   | `island`, `slot` (0/1), `point` = titik kaki robot saat bekerja (anchor)                 |
| `Portal`          | `world.ts`                                   | satu pad per pulau: titik masuk = titik keluar                                           |
| `PortalLink`      | dari `energyConnections()` (`office-layout`) | pasangan pulau + kurva Bézier kuadratik jalur energi (`start`, `control`, `end`)         |
| `InteractionZone` | `world.ts`                                   | kotak klik pulau (membuka quick view stasiun)                                            |
| Agent             | `OfficeEngine.agents`                        | posisi, pulau, slot, arah hadap, aktivitas, rute, teleport, ucapan                       |
| Effect            | `OfficeEffects.vue`, `OfficeActor.vue`       | pad portal (kilat saat dipakai), cincin energi, hologram/partikel/ikon status            |
| Connection        | `EnergyConnections.vue`                      | jaringan energi SVG (lapisan statis + lapisan pulsa)                                     |

Geometri pulau stasiun (relatif terhadap kotak pulau):

| Titik        | Posisi (fraksi lebar, tinggi kotak)                                 |
| ------------ | ------------------------------------------------------------------- |
| Area jalan   | belah ketupat (0,12; 0,66) · (0,5; 0,5) · (0,9; 0,66) · (0,5; 0,86) |
| Simpul (hub) | (0,5; 0,72)                                                         |
| Spawn        | (0,5; 0,68)                                                         |
| Portal       | (0,26; 0,71)                                                        |
| Workstation  | 2 slot per pulau (dari `STATIONS[].slots`)                          |

Mission Hub memakai belah ketupat yang lebih lebar (0,2; 0,7) · (0,5; 0,6) · (0,8; 0,7) · (0,5; 0,86), simpul
(0,5; 0,76), portal (0,3; 0,74), dan workstation (0,4; 0,72) serta (0,62; 0,74). Semua titik dibulatkan ke 0,1 unit
sehingga hasilnya deterministik di SSR maupun browser.

Tautan portal (18): Mission Hub ↔ kesembilan stasiun, ditambah web-research↔data-warehouse,
data-warehouse↔analytics-tool, analytics-tool↔task-manager, task-manager↔report-builder, web-research↔client-brief,
client-brief↔knowledge-base, knowledge-base↔report-builder, research-lab↔web-research, training-center↔data-warehouse.

## 2. Perencanaan rute

`findRoute(world, asal, tujuan)` menghasilkan urutan leg:

```text
walk(pulau asal: titik → portal)  →  teleport(A → B) [→ teleport(B → C) …]  →  walk(pulau tujuan: portal → workstation)
```

- **Jalur lokal (`localPath`)**: area jalan berbentuk poligon cembung, sehingga ruas lurus antara dua titik di
  dalamnya tetap berada di atas pulau. Simpul tengah dipakai sebagai titik lewat **hanya bila searah** (jarak lewat
  simpul ≤ 1,25 × jarak langsung). Selain itu robot berjalan langsung, tanpa bolak-balik (perbaikan dari hasil
  verifikasi browser: sebelumnya Sage berjalan menjauhi portal ke simpul lalu kembali).
- **Antar pulau (`islandPath`)**: Dijkstra di atas graf pulau. Biaya per lompatan = 400 + 0,2 × jarak antar portal,
  sehingga rute dengan lompatan paling sedikit diutamakan. Arah kurva dicatat (`reversed`) agar orb mengikuti jalur
  energi ke arah yang benar.
- Satu pulau: hanya leg `walk`. Rute kosong (sudah di tujuan) berarti tiba seketika.

Contoh: Sage dari Mission Hub (slot 0) ke Web Research = walk(mission-hub, 2 titik) → teleport(mission-hub →
web-research) → walk(web-research, 2 titik). Client Brief → Research Lab = 2 lompatan lewat Web Research.

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
mundur di portal tujuan, 0,5 detik). Pad portal asal dan tujuan berkilat (±1,1 detik) saat dipakai.

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

`tests/nuxt/office-renderer.test.ts` memastikan renderer menulis posisi setiap frame saat berjalan (bukan melompat per
event) dan menampilkan orb selama transit.

Verifikasi browser (skenario Project Atlas, sampel setiap 100 ms): selama berjalan, 18 dari 19 sampel menunjukkan
posisi baru, dengan akselerasi dan deselerasi terlihat; orb transit dan kilat portal teramati; kelima robot berpindah
posisi.
