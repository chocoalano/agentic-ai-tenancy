# Interaksi Workstation — Virtual Office

Setiap pulau yang dapat dijalani adalah tempat kerja dengan identitas operasional yang dapat dikenali tanpa
membuka panel: robot yang bekerja di sana memakai animasi tertentu, stasiun menyala, dan efek hologram khas
stasiun itu muncul di samping robot. Sistemnya murni TypeScript (`app/game/workstations.ts`) dan diturunkan dari
state agent yang sudah ada — **bukan** state machine kedua.

```text
OfficeSimulation / perintah pengguna
    ↓
AgentStateMachine (app/game/agent-state.ts: ActivityState + TRANSITIONS)
    ↓
Aktivitas workstation (workstations.ts: WORKSTATION_ACTIVITIES, workstationActivity, workstationVisuals)
    ↓
Animasi karakter (ACTIVITY_PRESENTATION → sheet) + efek workstation (OfficeWorkstationEffects.vue)
```

## 1. Kontrak

```ts
interface WorkstationActivity {
  id: string // 'web-research:research'
  workstationId: IslandId
  label: string // 'Meriset sumber pasar' (dipakai label robot, roster, panel)
  activity: ActivityState // state agent yang menjalankan aktivitas ini
  animation: AgentAnimationName // = ACTIVITY_PRESENTATION[activity].animation
  effects: readonly WorkstationEffect[]
  interactionAnchorId: string // id slot geometri artwork ('slot-0'); anchor nyata = slot yang dipakai robot
  durationMode: 'simulated' | 'event-driven'
}
```

- `WORKSTATION_ACTIVITIES[island]`: daftar aktivitas per pulau; entri pertama = aktivitas default saat robot
  dikirim ke stasiun (`STATION_ACTIVITY` di `commands.ts` kini diturunkan dari sini — satu sumber kebenaran).
- `workstationActivity(island, state)`: aktivitas yang cocok dengan state robot di pulau itu, atau `null`.
- `workstationVisuals(agents)`: visual yang sedang aktif, satu per pulau: `effects` gabungan (unik), `anchors`
  per robot (`{ key, slot, anchorId }`), `label`, `activityId`, `durationMode` (`simulated` untuk robot pratinjau,
  `event-driven` untuk agent live).
- Pulau dekoratif (Research Lab, Training Center) tidak punya aktivitas dan tidak pernah menerima robot
  (`docs/office-navigation-system.md`).

## 2. Lima workstation utama

| Workstation                 | Karakter utama | Aktivitas (state → label)                                                                                                                   | Efek visual (fx pack + glyph hologram)                                                                    |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mission Hub                 | Nova           | `communicating` → Mengoordinasikan tim · `thinking` → Memantau progres · `reading` → Meninjau laporan · `working` → Menyusun rencana        | `mission-hologram` (kubus hologram besar + cincin energi di pusat), `signal-pulse` (cincin sinyal meluas) |
| Web Research                | Sage           | `researching` → Meriset sumber pasar · `reading` → Membaca temuan · `working` → Merangkum · `thinking` → Menilai sumber                     | `document-holograms` (3 kartu dokumen hologram bergantian), `search-rings`                                |
| Analytics Tool              | Pixel          | `working` → Menganalisis metrik · `thinking` → Membandingkan tren · `using_tool` → Memproses data · `reading` → Membaca hasil               | `chart-hologram` (panel grafik batang beranimasi), `data-particles` (particles-purple)                    |
| Report Builder              | Bolt           | `working` → Menyusun laporan · `reading` → Merapikan dokumen · `thinking` → Menyusun kerangka · `using_tool` → Menyiapkan artefak           | `typing-glow` (kilau mengetik di tangan), `document-assembly` (dokumen tersusun)                          |
| Data Warehouse / Operations | Echo           | `using_tool` → Mengoperasikan alat data · `working` → Memproses permintaan · `reading` → Memeriksa penyimpanan · `thinking` → Memantau alur | `terminal-lines` (terminal dengan baris "diketik"), `tool-controls` (hologram-cube)                       |

Pulau lain: Client Brief (`brief-bubble`), Knowledge Base (`knowledge-shelf`), Final Report/`task-manager`
(`quality-seal`). Reaksi di anchor robot, di pulau mana pun: `waiting_approval` → `approval-beacon`,
`completed` → `completion-burst` (energy-spawn), `failed` → `error-flicker`.

Efek pertama kelima stasiun utama saling berbeda dan diuji (`lima workstation utama memiliki tanda efek yang
saling berbeda`), sehingga pengguna dapat membedakan siapa mengerjakan apa dari dunia saja.

## 3. Siklus hidup aktivitas

```text
Perintah diterima (thinking ±0,7 dtk, lencana "Menerima perintah")   ← app/game/engine.ts moveTo(..., { acknowledgeSeconds })
        ↓
Tujuan ditentukan (slot kosong di stasiun; stasiun disorot "dituju")
        ↓
Jalan → portal → teleport → jalan (docs/office-navigation-system.md)
        ↓
Tiba di anchor interaksi (titik slot geometri artwork; event `arrived`)
        ↓
State aktivitas stasiun (mis. researching) → animasi `read`; label "Meriset sumber pasar"
        ↓
Efek workstation menyala (workstationVisuals → OfficeWorkstationEffects); lampu pulau aktif
        ↓
Selesai (durasi simulasi) / transisi (perintah baru, jeda, pembatalan)
        ↓
Efek padam (diturunkan dari state: begitu state bukan aktivitas stasiun atau robot bergerak)
        ↓
Siaga (ambient boleh mulai) atau penugasan berikutnya
```

Karena efek **diturunkan**, tidak ada efek yang tertinggal setelah pembatalan, jeda, atau pindah: snapshot
dihitung ulang pada setiap event mesin dan efek hilang bersama state-nya (diuji: `pembatalan/perintah baru saat
bekerja mematikan efek`). Fase menerima perintah (thinking di stasiun lama) **tidak** dihitung sebagai aktivitas
stasiun (`moving` di pandangan visual = rute aktif atau perintah tertunda).

## 4. Rendering

`app/components/office/OfficeWorkstationEffects.vue` dirender sebagai anak langsung panggung (`display: contents`)
agar kedalamannya berbaur dengan robot: efek per anchor memakai `--ax/--ay` = titik slot dan `z-index = 100 + y + 1`
(tepat di depan robot pada anchor itu); hologram pusat Mission Hub memakai `z-index = 100 + y − 2` (di belakang
robot). Posisi panel: di samping bahu robot (x +44…+100, y −74…−118 unit) agar tidak menutupi wajah robot maupun
papan nama pulau. Komponen hanya diperbarui saat snapshot berubah (event diskret), bukan per frame; kantor siaga
tidak merender satu pun elemen efek.

Artwork efek = `fx/*` dari asset pack (hologram-cube, energy-ring, particles-purple, energy-spawn). Panel grafik,
kartu dokumen, terminal, dan rak buku adalah **glyph UI prosedural** (CSS gradien/garis) — bukan pengganti artwork
pulau atau robot. Semua animasi hanya `transform`/`opacity` dengan `motion-safe:`; reduced motion → diam.

## 5. Mode

- **Pratinjau**: durasi dari skenario/perintah (`simulated`); label robot, roster, dan panel perintah
  (bidang Workstation & Penugasan) memakai nama aktivitas.
- **Live**: hanya state otoritatif backend. `runtimeStatus` masih `null` (Phase 1), jadi agent live tidak pernah
  bekerja dan tidak ada efek — frontend tidak mengarang penyelesaian kerja. Saat backend kelak mengirim status
  runtime (`docs/live-agent-event-mapping.md` §3), `liveActivity` memetakannya ke state kerja dan efek menyala
  dengan `durationMode: 'event-driven'`.

## 6. Pengujian

- `tests/unit/office-workstations.test.ts` (10): setiap pulau yang dapat dijalani punya ≥ 3 aktivitas dan pulau
  dekoratif tidak; id unik, animasi = presentasi state, anchor = id slot geometri; tanda efek lima stasiun utama
  berbeda; `STATION_ACTIVITY` = default; pencocokan state; siklus hidup tiba → menyala → padam; pembatalan dan
  perintah baru mematikan efek; dua robot satu pulau → satu visual dengan dua anchor; reaksi
  persetujuan/selesai/gagal; mode live `event-driven`.
- `tests/nuxt/office-living.test.ts`: efek ditambatkan ke titik slot dalam koordinat dunia dan kedalaman di depan
  robot; hologram Mission Hub di pusat pulau; tanpa visual → tanpa elemen; reaksi dirender.
- Browser (production): efek per fase Project Atlas — fase 2 `web-research:document-holograms+search-rings`,
  fase 3 `analytics-tool:chart-hologram+data-particles`, fase 4 `report-builder:typing-glow+document-assembly` dan
  `data-warehouse:terminal-lines+tool-controls`, fase 5 `mission-hub:mission-hologram+signal-pulse`, fase 6 lima
  `completion-burst`; lima robot bekerja serentak → 10 efek (`docs/frontend-visual-qa.md`).
