# Audit Desain Rute Frontend (Phase A)

Inventaris semua rute Nuxt sebelum dan sesudah penerapan Agentic Game UI (12 Oktober 2026). Screenshot "sebelum"
diambil sendiri dari dev server (screenshot referensi pengguna tidak tersedia di repositori), lihat
`docs/unified-frontend-visual-qa.md`.

## 1. Akar masalah ketidakkonsistenan

| Penyebab                                                                                                                       | Dampak                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Dua layout dengan bahasa visual berbeda: `game` (HUD neon, artwork) vs `app` (SidebarProvider shadcn + topbar + kartu `glass`) | /office terasa produk lain dari /settings, /agents, /tasks                  |
| Token tema terang = putih/abu-abu netral generik (`--background oklch(0.975 …)`, kartu putih)                                  | Preferensi "Terang" menghasilkan dashboard SaaS putih (screenshot pengguna) |
| Token tema gelap tidak dikalibrasi dari HUD (`--background oklch(0.145 0.028 266)` abu-abu kebiruan, border 11 %)              | Gelap pun terasa "admin dark mode", bukan markas game                       |
| Tidak ada identitas area (eyebrow generik "Akun & perusahaan", "Tim digital")                                                  | Tidak ada narasi "area pusat komando"                                       |
| Konten kecil di viewport besar (kartu `max-w-2xl` di kiri, 70 % layar kosong)                                                  | Hierarki lemah, kesan belum selesai                                         |
| Navigasi berbeda: sidebar rel ikon (manajemen) vs menu game Sheet (office); jalur kembali ke office hanya lewat sidebar        | Perpindahan modul terasa berganti aplikasi                                  |
| Peringatan usang di profil agent ("Agent Orchestrator … fase berikutnya") meski runtime Phase 5 ada                            | Informasi tidak jujur terhadap kondisi backend                              |

## 2. Inventaris rute (sesudah)

| Rute                                                                      | Layout    | Identitas area                      | Komponen bersama                                                                  | Status fungsi                                                                                                           | Catatan responsif             |
| ------------------------------------------------------------------------- | --------- | ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `/office`                                                                 | `game`    | Interactive AI World                | GameHUD, GameMenu, GameCommandBar (tidak diubah)                                  | Live + pratinjau SIMULASI                                                                                               | HUD adaptif (sudah ada)       |
| `/office/assets`                                                          | `app`     | Interactive AI World                | GameShell, PageHeader→GamePageHeader                                              | Galeri aset dev                                                                                                         | mengikuti shell               |
| `/agents`                                                                 | `app`     | AI Employee Headquarters            | GamePageHeader, StatCard, GamePanel (toolbar), AgentCard, Tabs game, Table        | Daftar nyata, filter, kartu/tabel                                                                                       | 1→2→3 kolom; toolbar menumpuk |
| `/agents/[id]`                                                            | `app`     | AI Employee Control Center          | GamePageHeader (back), GamePanel command/holo, GameInfoRow, TaskStatusBadge       | Identitas, mandat, riwayat tugas nyata, tugas saat ini, perintah (Tugaskan bila runtime+izin; Chat/Jeda nonaktif jujur) | 1 kolom < 1280px              |
| `/tasks`                                                                  | `app`     | Mission Board                       | GamePageHeader, StatCard, GamePanel warning (runtime), daftar panel               | Riwayat nyata, filter status                                                                                            | kartu daftar menumpuk         |
| `/tasks/[id]`                                                             | `app`     | Mission Detail                      | GamePageHeader (back), GamePanel success/holo/warning, GameInfoRow                | Hasil, instruksi, run, persetujuan, batal                                                                               | 1 kolom < 1280px              |
| `/settings`                                                               | `app`     | Commander Control Center            | GamePageHeader, GamePanel command (profil), GameTabs, GameInfoRow, rail ringkasan | Profil (baca), perusahaan (ganti/buat), tampilan (tema, gerakan), sesi (keluar)                                         | rail turun ke bawah < 1280px  |
| `/`                                                                       | `default` | —                                   | GamePageBackground + header ringan                                                | Landing publik                                                                                                          | —                             |
| `/login`, `/register`                                                     | `default` | —                                   | GamePageBackground                                                                | Autentikasi                                                                                                             | —                             |
| `/__dev/office-visual-qa`                                                 | `game`    | —                                   | harness dev (hanya `nuxt dev`)                                                    | —                                                                                                                       | —                             |
| Modul `soon` (Misi, Knowledge, Integrasi, Analitik, Marketplace, Tagihan) | —         | identitas disiapkan di `NAVIGATION` | tampil nonaktif di menu "Segera"/GameMenu                                         | belum ada halaman (disengaja)                                                                                           | —                             |

## 3. Perubahan per rute

- **Semua rute `app`**: sidebar + topbar diganti `GameShell` (latar game, navigasi atas HUD, GameMenu). Chrome,
  tipografi, token, state kosong/galat/pemuatan seragam.
- **/settings**: hero profil komandan, tab pusat komando, rail area, panel izin per modul, daftar perusahaan dengan
  aksi aktifkan, kontrol tema (3 kartu radio), gerakan (2 kartu radio, nyata), kualitas visual (nonaktif jujur), sesi
  (info nyata + keluar; perangkat lain "belum tersedia"), "Ubah profil" nonaktif dengan alasan.
- **/agents**: ringkasan 4 metrik nyata, toolbar panel, kartu bergaya game dengan portret & dua badge status, tabel.
- **/agents/[id]**: hero identitas karakter, mandat, riwayat tugas nyata (`GET /tasks?agentId=`), tugas saat ini,
  perintah berdasarkan `GET /tasks/capabilities` (menggantikan peringatan usang).
- **/tasks**, **/tasks/[id]**: identitas Mission Board/Detail, metrik, panel peringatan runtime, hasil dalam sumur.
- **/** , **/login**, **/register**: latar game bersama (kontinuitas masuk → kantor).

## 4. Yang sengaja tidak diubah

- Mesin game, HUD, menu game, simulasi pratinjau, kontrak event, keamanan (sesi, RLS, CSRF, pembatas laju), API.
- Komponen sidebar/header lama (`AppSidebar`, `AppHeader`) dibiarkan di repositori (tidak dipakai) untuk dihapus pada
  iterasi berikutnya setelah tim memastikan tidak ada pemakaian lain.
