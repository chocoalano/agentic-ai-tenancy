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

Posisi awal: Nova di Client Brief, Sage di Web Research, Pixel di Analytics Tool, Bolt di Report Builder,
Echo di Knowledge Base. Kelima karakter tersebar pada pulau utama mengikuti komposisi referensi. Fase yang sudah
berada di tujuan langsung menjalankan aktivitas; perpindahan Echo dan Nova tetap memperlihatkan navigasi portal.
Panel misi (kiri) menandai sasaran yang selesai (0/4 → 4/4); setiap sasaran berlabel DEMO/MISI CONTOH.

Durasi terukur untuk penempatan awal versi sebelumnya pada kecepatan 1×: fase 2 mulai ±2 dtk, fase 3 ±10 dtk, fase 4 ±19 dtk, fase 5 ±28 dtk,
fase 6 ±35 dtk, selesai ±36 dtk. Waktu berjalan dan teleport termasuk di dalamnya.

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
  benar; jeda/lanjut/kecepatan/reset; reduced motion dan robot yang sudah di tujuan tidak menggantung; pengurai
  instruksi (5 contoh brief + persetujuan); alur persetujuan.
- `tests/nuxt/components.test.ts`: panel pratinjau mengirim instruksi; blok persetujuan hanya di pratinjau.

Browser (puppeteer, skrip di scratchpad; dev **dan** build production):

- Skenario lengkap: 7 status fase, 8 animasi teramati, orb transit dan kilat portal terlihat, kelima robot berpindah,
  panel misi 4/4, toast selesai, 0 galat konsol, 0 respons ≥ 400.
- Jeda membekukan posisi; lanjut menggerakkan lagi; reset mengembalikan status `idle`.
- Persetujuan: setujui → `working/work → completed/celebrate → idle`; tolak → `failed/error → idle`.
- Viewport 1672×941, 1920×1080, 1440×900, 768×1024, 390×844: panel perintah, quick view stasiun dan hub, Escape, zoom,
  menu, dan toggle mode berfungsi; 0 overflow, 0 gambar rusak. Di ponsel, bar simulasi dibuat satu baris (tombol ikon
  ber-`aria-label`).

Rekaman dan screenshot (`docs/screenshots/`):

- `office-sim-project-atlas.mp4`: rekaman 43 dtk (build production) dari klik Nova sampai selesai.
- `office-sim-1672x941-00-idle.jpg` … `07-completed.jpg`: setiap fase.
- `office-sim-1672x941-08-approval-request.jpg`, `09-approval-rejected.jpg`: alur persetujuan.

## 7. Batasan

- Frame animasi masih prototipe prosedural (lihat `docs/character-animation-system.md`).
- Pengurai instruksi berbasis kata kunci. Kalimat di luar kosakata tidak dipahami, dan hal ini disengaja: bukan AI.
- Skenario tunggal (Project Atlas). Skenario lain dapat ditambahkan sebagai daftar fase baru tanpa mengubah mesin.
