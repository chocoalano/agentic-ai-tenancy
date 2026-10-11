# Simulasi Virtual Office — Project Atlas

Mode **pratinjau** (preview) adalah simulasi frontend berlabel jelas, terpisah dari mode live. Mode ini tetap
berfungsi saat tenant tidak punya AI employee nyata, memakai lima maskot (Nova, Sage, Pixel, Bolt, Echo), dan
menyediakan skenario wajib **"Project Atlas — Market Research Mission"**.

Status interaktivitas office di pratinjau: **BERFUNGSI**. Setiap perintah menghasilkan perubahan yang terlihat
(gerak, animasi, gelembung ucapan, highlight workstation, log, toast); diverifikasi di browser (dev dan production).

## 1. Jaminan keamanan dan kejujuran

- **Tidak ada penulisan ke backend.** Simulasi hidup sepenuhnya di frontend (`app/game/simulation.ts`,
  `app/game/engine.ts`). Terverifikasi di browser: menjalankan simulasi penuh beserta perintah persetujuan, pindah
  workstation, dan jeda agent menghasilkan **0 request `/api`**. Tidak ada run, tugas, biaya, XP, atau penyelesaian
  yang dibuat di tabel bisnis.
- **Bukan inferensi AI.** Instruksi diurai dengan pencocokan kata kunci (`parsePreviewInstruction`). Gelembung ucapan
  adalah teks tetap berlabel **SIMULASI**; tidak ada balasan AI yang dikarang, dan tidak ada penalaran model yang
  ditampilkan.
- **Label di mana-mana:** bar simulasi (SIMULASI), badge SIM pada perintah bisnis, label "Karakter pratinjau", tooltip
  robot, tag SIMULASI pada gelembung, dan toast penutup ("tidak ada tugas, run, biaya, atau XP nyata yang dibuat").
  Jumlah AI employee **nyata** tetap ditampilkan ("nyata: N").
- **Jalur eksekusi terpisah.** Kode simulasi tidak pernah dipanggil di mode live; perintah bisnis live dinonaktifkan
  (lihat `docs/live-agent-event-mapping.md`).

## 2. Memulai

- Default pratinjau bila tenant tidak punya agent; selain itu klik **Pratinjau** (ikon mata) di HUD.
- **Klik Nova** → panel perintah → ketik "Nova, lakukan riset pasar untuk Project Atlas." → Enter. Nova menjawab
  (gelembung + animasi `communicate`), panel tertutup agar dunia terlihat, toast "Simulasi Project Atlas dimulai".
- Atau tekan **Mulai** di bar simulasi.

## 3. Alur skenario

| Langkah brief | Fase              | Aksi (aktor → tempat: aktivitas, durasi setelah tiba)                                         | Sasaran misi         |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| 1–2           | (awal)            | Kelima robot terlihat dan memutar animasi idle di posisi awal                                 | —                    |
| 3–4           | (UI)              | Klik Nova, ketik instruksi riset                                                              | —                    |
| 5             | 1. Brief          | Nova: `communicating` 2,5 dtk, "Siap! Membagi tugas Project Atlas."                           | —                    |
| 6–7           | 2. Riset          | Sage → Web Research (jalan → teleport → jalan): `researching` 4 dtk · Nova: `thinking` 2 dtk  | Kumpulkan data pasar |
| 8             | 3. Analisis       | Pixel → Analytics Tool: `working` 4 dtk · Sage: `reading` 2 dtk                               | Analisis tren utama  |
| 9–10          | 4. Laporan · alat | Bolt → Report Builder: `working` 4 dtk · Echo → Data Warehouse: `using_tool` 4 dtk            | Susun laporan akhir  |
| 11            | 5. Koordinasi     | Nova → Mission Hub: `communicating` 3 dtk                                                     | —                    |
| 12            | 6. Selesai        | Kelima robot `completed` (animasi celebrate) 1,4 dtk → toast "Simulasi Project Atlas selesai" | Kirim ke klien       |

Posisi awal (`ATLAS_START`) sengaja **berbeda dari tujuan fase**: Nova di Client Brief, Sage di Mission Hub (slot 0),
Pixel di Knowledge Base, Bolt di Task Manager, Echo di Mission Hub (slot 1). Dengan demikian kelima robot benar-benar
menempuh jalan → portal → teleport → jalan (Sage → Web Research, Pixel → Analytics Tool, Bolt → Report Builder,
Echo → Data Warehouse, Nova → Mission Hub). Sebelumnya tiga robot diinisialisasi tepat di tujuannya sehingga hanya 2
dari 5 yang pernah bergerak; kini dikunci test `posisi awal ≠ tujuan fase: kelima robot benar-benar berjalan`. Panel
misi (kiri) menandai sasaran yang selesai (0/4 → 4/4); setiap sasaran berlabel DEMO/MISI CONTOH.

Durasi terukur (build production, kecepatan 1×, Chrome headless): fase 2 mulai ±2 dtk, fase 3 ±12 dtk, fase 4
±21,5 dtk, fase 5 ±30 dtk, fase 6 ±38,5 dtk, selesai ±40 dtk. Waktu berjalan dan teleport termasuk di dalamnya.

## 4. Kontroler simulasi

`SimulationController` (`app/game/simulation.ts`) adalah timeline fase eksplisit di atas mesin:

- Setiap fase mendaftarkan aksi. Aksi dengan `moveTo` menunggu event `arrived`, lalu durasi aktivitas berjalan;
  setelah durasi habis aktor kembali `idle`. Fase berikutnya dimulai saat semua aksi selesai.
- Robot yang sudah berada di tujuan, atau mode reduced motion (tiba seketika), langsung memulai durasi. Kasus ini
  sebelumnya menggantung karena event `arrived` terjadi sebelum aksi terdaftar; kini dikunci test.
- Aksi yang ditolak state machine tidak lagi diabaikan diam-diam: dicatat di `rejectedActions` dan test mewajibkannya
  kosong. Temuan verifikasi: fase 6 sebelumnya ditolak (`idle → completed` tidak sah), sehingga perayaan tidak pernah
  tampil.
- **Jeda/Lanjut** membekukan atau melanjutkan waktu mesin (posisi, frame, timer). **Kecepatan** 0,5× / 1× / 2×
  (dibatasi 0,25–3). **Reset** mengembalikan kelima robot ke posisi dan state awal.
- **Jeda per robot** (`pauseActor`) menandai rencana robot itu `held`: tidak dihapus dan tidak dianggap selesai
  diam-diam; robot berhenti `idle` (teleport yang sedang transit diselesaikan di portal tujuan). `resumeActor`
  menerbitkan ulang gerak/aktivitas dengan durasi penuh. Event `arrived` hanya menyelesaikan aksi bila pulau tibanya =
  `moveTo` aksi (tiba di tempat lain karena perintah manual tidak dihitung). Sebelumnya menjeda robot saat berjalan
  membuat simulasi menggantung selamanya (aksi menunggu `arrived` yang tidak akan datang); kini dikunci test regresi:
  jeda saat berjalan, saat transit teleport, saat bekerja, saat siaga, reset saat dijeda, dan siklus jeda/lanjut
  berulang (per robot dan global). `heldActors` tersedia di snapshot untuk UI.
- Status bar: `idle` → `running` ⇄ `paused` → `completed` (atribut `data-status` dipakai test).

## 5. Perintah pratinjau

Panel perintah (klik robot atau pilih di Agent List/strip ponsel) menampilkan identitas (nama, peran, avatar, status,
runtime "Simulasi frontend", penugasan, model AI "—") dan perintah:

| Perintah              | Jenis  | Pratinjau                                                                           |
| --------------------- | ------ | ----------------------------------------------------------------------------------- |
| Tugaskan · Chat       | bisnis | mengisi kolom instruksi (SIM)                                                       |
| Pindah ke workstation | visual | robot berjalan/teleport ke stasiun lalu menjalankan aktivitas stasiun               |
| Lihat aktivitas       | visual | log aktivitas robot (6 entri terakhir, berprefiks "Simulasi")                       |
| Profil                | visual | tidak ditampilkan (karakter pratinjau tidak punya profil); live: buka `/agents/:id` |
| Jeda · Lanjutkan      | bisnis | robot berhenti (`idle`) / melanjutkan aktivitas stasiun (SIM)                       |

Instruksi bahasa alami (kata kunci, bukan AI). Target = nama karakter yang disebut **pertama**, jika tidak ada maka
robot yang dipilih:

| Contoh                                              | Hasil                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| "Nova, lakukan riset pasar untuk Project Atlas."    | memulai skenario Project Atlas                          |
| "Nova, koordinasikan pekerjaan seluruh tim."        | memulai skenario Project Atlas                          |
| "Sage, lakukan riset pasar."                        | Sage → Web Research, `researching`                      |
| "Pixel, analisis hasil riset Sage."                 | Pixel → Analytics Tool, `working`                       |
| "Bolt, buat laporan hasil analisis."                | Bolt → Report Builder, `working`                        |
| "Echo, jalankan tool yang diperlukan."              | Echo → Data Warehouse, `using_tool`                     |
| "Echo, minta persetujuan sebelum menjalankan tool." | Echo `waiting_approval` + toast + kontrol Setujui/Tolak |

Kata kunci lain: pengetahuan/SOP → Knowledge Base (`reading`); brief/klien → Client Brief (`communicating`).
Instruksi yang tidak dikenali dijawab dengan gelembung "Instruksi tidak dikenali dalam simulasi".

**Persetujuan (simulasi).** Saat robot `waiting_approval`, panel menampilkan blok "Persetujuan dibutuhkan · SIMULASI".
**Setujui** → `working` 3 dtk → `completed` (celebrate) → `idle`. **Tolak** → `failed` (animasi error, label Gagal)
2,5 dtk → `idle`. Blok ini tidak pernah tampil di mode live.

**Workstation.** Klik pulau untuk membuka panel stasiun: fungsi stasiun, robot di sana atau yang sedang menuju ke sana,
dan tombol "Tugaskan karakter (simulasi)" yang mengirim robot ke stasiun itu.

## 6. Verifikasi

Otomatis:

- `tests/unit/office-engine.test.ts`: skenario berjalan sampai selesai; setiap aktor mencapai setiap aktivitas
  fasenya; `rejectedActions` kosong; animasi walk/teleport/communicate/think/read/work/celebrate muncul; posisi akhir
  benar; kelima robot menerbitkan event `route` (benar-benar berjalan); jeda/lanjut per robot dan global tidak pernah
  menggantung (6 kasus); kecepatan/reset; reduced motion dan robot yang sudah di tujuan tidak menggantung; pengurai
  instruksi (5 contoh brief + persetujuan); alur persetujuan.
- `tests/nuxt/components.test.ts`: panel pratinjau mengirim instruksi; blok persetujuan hanya di pratinjau.

Browser (puppeteer, skrip di scratchpad; dev **dan** build production):

- Skenario lengkap: 7 status fase, 8 animasi teramati, orb transit dan kilat portal terlihat, kelima robot berpindah,
  panel misi 4/4, toast selesai, 0 galat konsol, 0 respons ≥ 400. FPS median 60 / minimum 59 (CPU 1×) dan 60 / 57
  (CPU diperlambat 4×).
- Jeda membekukan posisi; lanjut menggerakkan lagi; reset mengembalikan status `idle`.
- Persetujuan: setujui → `working/work → completed/celebrate → idle`; tolak → `failed/error → idle`.
- Viewport 1672×941, 1920×1080, 1440×900, 768×1024, 390×844: panel perintah, quick view stasiun dan hub, Escape, zoom,
  menu, dan toggle mode berfungsi; 0 overflow, 0 gambar rusak. Di ponsel, bar simulasi dibuat satu baris (tombol ikon
  ber-`aria-label`).

Rekaman dan screenshot (`docs/screenshots/`):

- `office-sim-project-atlas.mp4`: rekaman 50 dtk (build production) dari klik Nova sampai selesai.
- `office-sim-1672x941-00-idle.jpg` … `07-completed.jpg`: setiap fase.
- `office-sim-1672x941-08-approval-request.jpg`, `09-approval-rejected.jpg`: alur persetujuan.

## 7. Batasan

- Frame animasi masih prototipe prosedural (lihat `docs/character-animation-system.md`).
- Pengurai instruksi berbasis kata kunci. Kalimat di luar kosakata tidak dipahami, dan hal ini disengaja: bukan AI.
- Skenario tunggal (Project Atlas). Skenario lain dapat ditambahkan sebagai daftar fase baru tanpa mengubah mesin.

## 8. Phase 4 — pembaruan kantor hidup

- **Perintah dari panel** kini: Tugaskan · Chat · Pindah ke workstation · Lihat aktivitas · Jeda agent ·
  Lanjutkan agent · **Jalankan Project Atlas** · **Reset simulasi** (dua yang terakhir hanya pratinjau, berlabel
  SIM; di live nonaktif dengan alasan). Panel menampilkan bidang **Workstation** (stasiun saat ini / "Menuju …")
  dan **Penugasan** = nama aktivitas workstation (mis. "Meriset sumber pasar") atau "Menerima perintah…".
- **Umpan balik perintah**: robot disorot (cincin pilihan), menerima perintah dulu (`thinking` ±0,7 s dengan
  lencana ⚡ dan gelembung "Siap, menuju …"), lalu berangkat; feedback panel "Simulasi: <nama> menerima perintah →
  <stasiun> (<aktivitas>)". Skenario Project Atlas sendiri tidak memakai jeda penerimaan (deterministik, durasi
  tidak bertambah).
- **Aktivitas stasiun bernama & efek khas** per fase (`docs/workstation-interactions.md`): Nova "Mengoordinasikan
  tim" (hologram misi + sinyal), Sage "Meriset sumber pasar" (dokumen hologram), Pixel "Menganalisis metrik"
  (grafik), Bolt "Menyusun laporan" (mengetik + dokumen), Echo "Mengoperasikan alat data" (terminal + kontrol).
  Fase 6: ledakan selesai di lima stasiun. Label robot dan roster memakai nama aktivitas ini.
- **Ambient** saat siaga/antar fase (`docs/office-ambient-behavior.md`); ambient dibersihkan saat skenario dimulai
  dan tidak pernah memindahkan robot. Jeda simulasi membekukan ambient.
- **Posisi awal** tetap `ATLAS_START`; slot kiri Mission Hub digeser menjauhi pad portal agar Sage (menuju portal)
  tidak menumpuk dengan Echo (slot kiri).
- Verifikasi browser (build production): skenario tuntas ±41 dtk pada 1× (termasuk jeda reset), efek per fase
  berbeda, pause/resume/reset/kecepatan berfungsi, 0 request tulis, 0 galat konsol; reduced motion tuntas 19 dtk
  (`docs/frontend-visual-qa.md`). Rekaman: `docs/screenshots/office-living-p4.mp4`.
