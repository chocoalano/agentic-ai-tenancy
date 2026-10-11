# Perilaku Ambient — Kantor yang Hidup

Saat tidak ada perintah, kantor pratinjau tetap hidup: robot yang siaga sesekali menoleh, merenung, memeriksa
tablet, atau mengangguk; satu pulau sesekali "menyala" sebentar; awan dan partikel terus bergerak. Semuanya
deterministik (dapat diuji ulang), tidak pernah memindahkan robot, dan tidak pernah mengubah state bisnis.

Sumber: `app/game/ambient.ts` (`AmbientScheduler`), overlay di `app/game/engine.ts` (`AgentRuntime.ambient`,
`engine.setAmbient`, `engine.ambientApplies`).

## 1. Perilaku

| Id        | Label            | Animasi       | Durasi | Catatan                                    |
| --------- | ---------------- | ------------- | -----: | ------------------------------------------ |
| `glance`  | Menoleh          | `idle`        |  1,4 s | arah hadap dibalik (cermin) selama overlay |
| `ponder`  | Merenung sejenak | `think`       |  1,8 s |                                            |
| `inspect` | Memeriksa tablet | `read`        |  1,6 s |                                            |
| `nod`     | Mengangguk       | `communicate` |  0,9 s |                                            |

Lingkungan: hologram pulau ambient (`ambientIslands`, satu pulau yang sedang tidak dipakai/dituju, 2,6 s, jeda
7–13 s; `OfficeIsland`/`MissionHub` ikut berpendar), ditambah animasi CSS yang sudah ada (awan `cloud-pan`,
partikel `office-twinkle`, pulsa jalur energi, pad portal).

Variasi: idle kelima robot tidak serempak berkat **offset fase deterministik** per agent
(`phaseOffsetFor(key)`, 0–1,5 s), dan ambient dibatasi **maksimal 2 robot bersamaan**.

## 2. Penjadwalan deterministik

- Jam yang dipakai hanya jam mesin (`engine.time`): jeda simulasi membekukan ambient, kecepatan simulasi
  mempercepatnya — konsisten dengan gerak dan animasi.
- PRNG = `stableHash(seed | key | counter | salt)` (FNV-1a, sama di server & browser). Benih sama → urutan
  perilaku identik (diuji); benih lain → berbeda.
- Per robot: perilaku pertama setelah `settleSeconds` (3 s) + jeda acak 6–14 s; setelah selesai bekerja/bergerak,
  robot "tenang" dulu 3 s sebelum ambient berikutnya.

## 3. Prioritas dan keamanan

```text
Perintah pengguna  >  Aktivitas misi  >  Aktivitas workstation  >  Ambient
```

- Ambient **hanya overlay render**: `renderStates()` memakai animasi/arah overlay bila
  `engine.ambientApplies(agent)` (siaga, tidak ada rute, tidak transit, tidak ada perintah tertunda, bukan reduced
  motion). State machine, posisi, event, log, dan snapshot agent tidak disentuh (diuji: nol event
  `activity`/`route` selama 120 detik siaga).
- Perubahan aktivitas apa pun (`forceActivity`) langsung membuang overlay; perintah pengguna (`moveTo` dengan
  penerimaan) memutus ambient seketika (diuji).
- Robot yang menjalankan misi tidak pernah "pergi" karena ambient — ambient tidak memindahkan apa pun; selama
  Project Atlas, ambient hanya menyentuh robot yang sedang siaga di antara fase (diuji: skenario tetap tuntas
  dengan tujuan yang sama dan `rejectedActions` kosong).
- Tidak ada API tulis; tidak ada data backend yang dibuat (diverifikasi di browser: 0 request tulis selama 40 s).

## 4. Kebijakan jeda & reduced motion

- **Jeda simulasi** (`engine.paused`) → ambient robot dan hologram pulau ikut berhenti (jam mesin beku). Dekorasi
  CSS murni (awan, partikel, pulsa jalur) **tetap** berjalan — itu lingkungan, bukan aktivitas simulasi.
- **Reduced motion** (`prefers-reduced-motion`, dibaca live) → tidak ada overlay maupun hologram pulau ambient;
  `AmbientScheduler.update()` membersihkan yang ada. Semua animasi karakter diam di frame 0 dan CSS `motion-safe:`
  mati (diverifikasi di browser: 0 overlay, 0 pulau ambient, frame idle tidak berubah).
- **Mode live** → `ambient.enabled = false` (agent nyata hanya menampilkan status otoritatif; tidak ada perilaku
  karangan). Ganti mode/reset simulasi → `ambient.reset()`; unmount → `ambient.dispose()`.

## 5. Pengujian

`tests/unit/office-ambient.test.ts` (11): deterministik per benih; semua robot siaga ikut hidup, ≤ 2 serentak,
variasi > 1; tidak menyentuh state machine/posisi; overlay hanya memengaruhi render (menoleh membalik arah,
merenung memutar `think`); hanya robot pratinjau yang siaga; prioritas perintah; jeda membekukan; reduced motion
→ kosong; hologram pulau menyala di pulau yang tidak dipakai lalu padam (pendengar diberi tahu); tidak mengganggu
Project Atlas; `clear`/`dispose`.

Browser (production, 40 s siaga): overlay teramati pada kelima robot (`glance`, `ponder`, `inspect`, `nod`),
maksimum 2 serentak, hologram ambient di Mission Hub dan Data Warehouse, tidak ada robot yang berpindah, 0 request
tulis, 0 galat konsol (`docs/frontend-visual-qa.md`).
