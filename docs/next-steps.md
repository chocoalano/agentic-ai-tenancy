# Roadmap

Catatan: file `BACKEND_BLUEPRINT.txt` dan `FRONTEND_BLUEPRINT.txt` **tidak tersedia** di workspace saat Phase 1
dibangun. Roadmap ini disusun dari deskripsi domain pada brief Phase 1 dan perlu diselaraskan ulang ketika blueprint
tersedia.

## Wave 2 — Operasional tenant & ketenagakerjaan AI

1. **Robot Role & Role Version** — katalog peran robot (tabel global + versi), `agents.role_key` menjadi FK.
2. **Robot License** — lisensi per tenant (tenant-scoped, RLS), kuota agent aktif.
3. **Manajemen agent** — `POST/PATCH /v1/agents` (izin `agents.manage`), siklus hidup draft → active → paused →
   archived, audit perubahan instruksi utama.
4. **Manajemen anggota** — undangan via email (status `invited` sudah ada), ganti peran, cabut akses
   (`members.manage`), peran kustom per tenant (`roles`/`role_permissions` sudah mendukung).
5. **Tasks & Runs (skema)** — tabel `tasks`, `task_runs` tenant-scoped, belum dieksekusi AI.
6. **Audit log** — tabel `audit_events` memakai `app.request_id` yang sudah di-set di setiap transaksi.
7. **Keamanan** — throttle login ke Valkey (multi-instance), CSP (mis. `nuxt-security`), verifikasi email,
   reset password, rotasi sesi & daftar sesi aktif, akses `sessions` via fungsi `SECURITY DEFINER`.

## Wave 3 — Eksekusi AI

1. **AI Runtime Interface** (`domains/ai/runtime.ts`) + **provider adapter** DigitalOcean AI; identitas agent tetap
   milik platform.
2. **Agent Orchestrator** — worker Bun/Elysia mandiri (ekstraksi dari `createApi`), antrean pekerjaan.
3. **Streaming** — SSE untuk teks AI memakai pola `realtime/routes.ts`.
4. **Knowledge & Memory** — tabel embedding dengan pgvector (ekstensi sudah disiapkan oleh `0006_pgvector.sql`),
   ingest dokumen ke DigitalOcean Spaces.
5. **Tools & Permissions** — registry tool per agent, persetujuan manusia (`waiting_approval`).
6. **Status runtime** — `runtimeStatus` di API mulai diisi dari orchestrator; token warna `agent-*` sudah tersedia.

## Wave 4 — Monetisasi & pengalaman

1. **Usage & Budget** — meter token/biaya per tenant/agent.
2. **Billing** — payment gateway, langganan.
3. **XP, Level, Missions** — perhitungan di backend (bukan frontend).
4. **Virtual Office realtime** — gateway WebSocket Bun/Elysia mandiri + Valkey pub/sub; frontend cukup mengganti
   implementasi `OfficeRealtimeTransport`.
5. **Kantor 3D** — evaluasi Three.js/TresJS setelah data realtime tersedia.
6. **Aset game produksi** — regenerasi karakter (9 animasi × 5 karakter sesuai kontrak `animation-spec`), pulau, latar,
   tile, ikon menurut `docs/game-asset-quality-report.md` §5; sheet artist menggantikan sheet prosedural tanpa
   perubahan kode.
7. **Event agent live** — publisher event `agent.status.changed`, `agent.run.*`, `task.updated`, `approval.created`
   (kontrak usulan di `docs/live-agent-event-mapping.md` §3) setelah orchestrator, modul tugas, dan persetujuan ada.

## Utang teknis yang diketahui

- `nuxt-elysia@1.0.0-beta.1` masih beta; shim tipe `app/types/nuxt-elysia-compat.d.ts` dapat dihapus bila upstream
  memperbaiki augmentasi `nuxt/schema`.
- Pembatas laju dan gerbang kesiapan bersifat per proses (antarmuka `RateLimiter`/`ReadinessGate` siap diganti
  implementasi Valkey untuk multi-instance).
- Penguncian per email masih bisa disalahgunakan untuk mengunci email korban selama jendela waktu (per IP sudah
  membatasi pelakunya); mitigasi lanjutan: CAPTCHA/bukti kerja setelah N kegagalan.
- Tenant aktif melekat pada sesi (semua tab): tab konvergen lewat header `x-active-tenant` (409), BroadcastChannel,
  revalidasi saat fokus, dan event SSE `ready` — bukan tenant per tab.
- Stream SSE tidak memvalidasi ulang sesi/keanggotaan setelah dibuka (hanya `ready`/`heartbeat` tanpa data bisnis);
  wajib ditambahkan sebelum event bisnis dikirim.
- Sesi kedaluwarsa/dicabut belum dibersihkan dari tabel `sessions`.
- Virtual Office: Research Lab & Training Center dekoratif (kliping v2 tanpa permukaan jalan); geometri Mission Hub
  dikalibrasi manual; frame animasi robot masih prosedural; artwork pulau/latar v3 hasil generate AI tanpa sumber
  yang dapat direproduksi (lihat `docs/game-asset-quality-report.md`).
- Belum ada CI pipeline; urutan verifikasi ada di `CLAUDE.md`/`AGENTS.md`.
