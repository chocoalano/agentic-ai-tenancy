# QA Visual Frontend — Virtual Office

Prosedur dan hasil pemeriksaan browser yang WAJIB sebelum menyatakan pekerjaan game selesai. Lulusnya
`typecheck`/`build` bukan bukti artwork atau gerak terlihat benar.

## 1. Prosedur

1. `bun run build`, jalankan `.output` (mis. `PORT=4123 bun --env-file=.env .output/server/index.mjs`).
2. Skrip puppeteer (Chrome headless, `puppeteer-core`) di luar repo: masuk lewat `/api/v1/auth/login` dari konteks
   `/api/v1/health` (bukan halaman `/login`, agar tidak berpacu dengan redirect), pilih tenant, buka `/office`,
   paksa mode pratinjau lewat `[data-preview-toggle]`.
3. Pemeriksaan DOM memakai atribut data yang disediakan komponen (bukan selector kelas):
   `[data-actor]` (+`data-activity`, `data-ambient`, `data-acknowledging`, `data-selected`), tombol sprite
   (`data-animation`, `data-heading`, `backgroundPosition` = frame), `[data-orb]`, `[data-portal]`,
   `[data-workstation-effect]` + `data-workstation-island`, `[data-ambient-island]`, `[data-actor-ack]`,
   `[data-actor-shadow]`, `[data-actor-selection]`, `[data-simulation-bar][data-status]`, `[data-command-key]`,
   `[data-move-target]`, `[data-agent-workstation]`, `[data-agent-assignment]`, `[data-activity-log]`,
   `[data-office-stage]` (`data-fps`, `data-worst-frame-ms`).
4. Setiap run mencatat galat/peringatan konsol (termasuk hidrasi), respons ≥ 400, request tulis ke `/api`, gambar
   rusak, overflow, dan elemen HUD yang terpotong.
5. Reduced motion: `page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])` sebelum
   navigasi; verifikasi tidak ada deadlock dan kontrol tetap berfungsi.
6. Viewport wajib: 1920×1080, 1672×941, 1440×900, 768×1024, 390×844.

## 2. Hasil 11 Oktober 2026 (build production, branch `feature/living-virtual-office`)

| Pemeriksaan                                 | Hasil                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kantor siaga 40 dtk (ambient)               | overlay pada kelima robot (glance/ponder/inspect/nod), maks 2 serentak, hologram ambient Mission Hub & Data Warehouse, frame idle berubah, tidak ada robot berpindah, 0 request tulis                                                                                                                                             |
| Vertical slice Sage (Pindah → Web Research) | `thinking`+lencana ack (0,7 s) → `walk` heading `left` → `teleport` (orb) → `walk` heading `toward`/`right` → `researching`/`read` + efek `document-holograms`+`search-rings`; label "Menerima perintah" → "Berpindah" → "Meriset sumber pasar"; panel: Workstation "Web Research", Penugasan "Meriset sumber pasar"; log 5 entri |
| Lima perintah dari panel                    | kelima robot menerima, berangkat, tiba, dan bekerja; 10 efek workstation; label stasiun per robot berbeda (Mengoordinasikan tim · Meriset sumber pasar · Menganalisis metrik · Menyusun laporan · Mengoperasikan alat data)                                                                                                       |
| Project Atlas penuh                         | 7 status fase, selesai ±41 dtk (1×); efek per fase berbeda (lihat `docs/workstation-interactions.md` §6); lima `completion-burst` di fase 6; reset mengembalikan posisi awal                                                                                                                                                      |
| Perintah panel                              | `assign_task`, `chat`, `move`, `inspect`, `pause`, `resume`, `run_atlas`, `reset_simulation` aktif di pratinjau; `profile` hanya live                                                                                                                                                                                             |
| Reduced motion (emulasi)                    | 0 overlay ambient, 0 pulau ambient, frame idle tetap, tiba seketika tanpa ack/orb, efek workstation tetap, simulasi tuntas 19,1 dtk, kontrol berfungsi, 0 galat                                                                                                                                                                   |
| Dev (`nuxt dev` terisolasi, port 4130)      | skenario yang sama: 0 peringatan hidrasi/konsol, ambient & efek & ack sama seperti production                                                                                                                                                                                                                                     |
| Viewport pratinjau (5 ukuran)               | 10 pulau, 5 robot, 18 koneksi; panel perintah, quick view, Escape, zoom, menu, toggle mode; 0 overflow, 0 gambar rusak, 0 galat, 0 asset 404                                                                                                                                                                                      |
| Viewport live (1440×900, 390×844)           | 3 AI employee nyata (1 draft → offline), tooltip "Status dari backend · runtime belum terhubung", perintah bisnis nonaktif, 0 galat                                                                                                                                                                                               |
| Konsol & jaringan (semua run)               | 0 galat/peringatan konsol, 0 respons ≥ 400, 0 request tulis dari simulasi/ambient                                                                                                                                                                                                                                                 |

Catatan QA: klik koordinat pada dua robot yang tumpang tindih di Mission Hub pernah membuka panel robot yang salah
(skrip, bukan aplikasi). Dua perbaikan: skrip mengklik elemen tombol secara langsung, dan slot kiri Mission Hub
digeser menjauhi pad portal (`scripts/calibrate-island-geometry.ts`, geometri `manual`) agar robot yang menuju
portal tidak menumpuk dengan robot yang bekerja.

## 3. Artefak (`docs/screenshots/`)

- `office-living-00-idle.jpg` — kantor siaga; `office-living-01-ambient-crop.jpg` — robot beraksi ambient (2×).
- `office-living-02-ack-crop.jpg` — penerimaan perintah (gelembung, lencana, label) (2×);
  `office-living-sage-ack.jpg`, `office-living-sage-arrived.jpg` — vertical slice Sage.
- `office-living-03-commands-travel.jpg` — lima robot berangkat; `office-living-04-all-working.jpg` — lima
  stasiun bekerja; `office-living-05-{web-research,analytics-tool,report-builder,data-warehouse,mission-hub}-crop.jpg`
  — efek per stasiun (2×).
- `office-living-06-atlas-celebrate.jpg`, `office-living-07-atlas-done.jpg` — akhir Project Atlas.
- `office-living-reduced-motion.jpg` — simulasi tuntas dengan reduced motion.
- `office-living-p4.mp4` — rekaman 84 dtk: siaga/ambient → perintah → bekerja → Project Atlas (build production).
- `office-game-{1920x1080,1672x941,1440x900,768x1024,390x844}-preview*.jpg`, `office-game-*-live*.jpg`,
  `office-game-1440x900-menu.jpg` — viewport.

## 4. Yang belum diperiksa di browser

- Perangkat sentuh nyata (hanya emulasi viewport/ponsel), Safari/Firefox (hanya Chrome headless).
- Pengukuran FPS build final pada daya listrik (lihat `docs/game-performance.md` §3).
