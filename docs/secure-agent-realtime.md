# Realtime Agent yang Aman (SSE)

Dokumen ini menjelaskan transport realtime Virtual Office setelah Phase 5: koneksi Server-Sent Events (SSE) yang
divalidasi ulang selama hidup, kontrak event bisnis agent, replay `Last-Event-ID` lewat outbox transaksional, dan
batas-batas keamanannya. Kode utama: `api/modules/realtime/routes.ts` (endpoint), `api/modules/realtime/hub.ts`
(poller outbox → langganan per tenant), `api/modules/realtime/outbox.ts` (tulis/baca outbox), kontrak tipe di
`domains/office/realtime.ts`, klien di `app/utils/realtime-sse.ts` dan `app/composables/useOfficeRealtime.ts`.

**Status:** VERIFIED COMPLETE untuk SSE melalui mount `nuxt-elysia` (test `tests/security/sse-security.test.ts`,
10 skenario; QA browser lihat `docs/phase5-live-agent-execution.md`). WebSocket tetap tidak dipakai (lihat
`docs/architecture.md`, "Batas realtime").

## 1. Endpoint

`GET /api/v1/realtime/stream` — memerlukan sesi cookie HttpOnly yang valid, tenant aktif, dan izin `tenant.read`.
Event bisnis (`agent.*`, `approval.*`) hanya dikirim bila pengguna juga memiliki `tasks.read`; tanpa izin itu koneksi
tetap hidup tetapi hanya menerima `ready`/`heartbeat`/`closed`.

| Frame SSE                | Kapan                                | Isi `data`                                                                                 |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `ready`                  | Sekali, setelah replay (bila ada)    | `tenantId`, `connectionId`, `serverTime`, `heartbeatIntervalMs`, `lastEventId`, `replayed` |
| `heartbeat`              | Setiap `REALTIME_HEARTBEAT_MS` (5 s) | `serverTime`                                                                               |
| `agent.*` / `approval.*` | Saat baris outbox tenant ini tiba    | Lihat §3; frame membawa `id: <outbox id>`                                                  |
| `closed`                 | Otorisasi tidak lagi valid           | `reason`, `serverTime`; setelah ini stream ditutup server                                  |

Semua frame bisnis memakai `id:` SSE = id outbox (bigint monoton), sehingga browser mengirim `Last-Event-ID` otomatis
saat menyambung ulang. Klien kustom (`fetch`) kita mengirim header yang sama; query `?lastEventId=` juga diterima.

## 2. Validasi ulang otorisasi selama koneksi

Koneksi SSE berumur panjang, sehingga pemeriksaan di awal saja tidak cukup. Generator stream membangunkan diri
(`Waiter`) pada: event baru, interval heartbeat, atau pembatalan request. Setiap `REALTIME_REVALIDATE_MS`
(default 15 s; test memakai 100 ms) `revalidate()` dijalankan:

| Pemeriksaan                                                               | Hasil bila gagal              |
| ------------------------------------------------------------------------- | ----------------------------- |
| Token sesi masih ada, belum kedaluwarsa, belum dicabut, pengguna aktif    | `closed` `SESSION_INVALID`    |
| `activeTenantId` sesi masih tenant koneksi ini (ganti tenant di tab lain) | `closed` `TENANT_CHANGED`     |
| Keanggotaan tenant masih ada & aktif (`tenant_memberships`)               | `closed` `ACCESS_REVOKED`     |
| Izin `tenant.read` masih dimiliki                                         | `closed` `PERMISSION_REVOKED` |
| Proses dihentikan                                                         | `closed` `SERVER_SHUTDOWN`    |

Setelah `closed` dikirim, generator berhenti (`finally` melepas langganan hub). Izin `tasks.read` yang dicabut di
tengah koneksi menghentikan pengiriman event bisnis pada siklus validasi berikutnya, tanpa menutup stream.

Batasan jujur: jendela antara pencabutan dan deteksi maksimal satu interval validasi (default 15 s). Kecilkan
`REALTIME_REVALIDATE_MS` bila kebutuhan kepatuhan menuntut, dengan biaya satu query sesi + konteks tenant per koneksi
per interval.

## 3. Kontrak event bisnis (skema versi 1)

Semua event bisnis membawa `AgentEventBase`: `eventId`, `schemaVersion`, `tenantId`, `agentId`, `taskId`, `runId`,
`taskStatus`, `runStatus`, `occurredAt`. Payload sengaja kecil dan tersanitasi: **tidak** memuat prompt, keluaran
model, penalaran, kredensial, maupun pesan error mentah provider/PostgreSQL. Hasil tugas selalu diambil lewat
`GET /api/v1/runs/:id/output` (dengan pemeriksaan izin dan rilis persetujuan), bukan lewat SSE.

| Event                        | Tambahan payload                                              | Dipicu oleh                             |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `agent.task.created`         | `title`                                                       | `POST /tasks` (service tasks)           |
| `agent.task.queued`          | `title`                                                       | `POST /tasks`, percobaan ulang worker   |
| `agent.run.started`          | `activity`                                                    | Worker saat run mulai                   |
| `agent.run.activity`         | `activity` (deskripsi tingkat tinggi dari adapter)            | Worker saat adapter melapor aktivitas   |
| `agent.run.waiting_approval` | `approvalId`, `actionType`, `actionSummary`, `approvalStatus` | Worker (tugas `requiresApproval`)       |
| `approval.requested`         | sama seperti di atas                                          | Worker                                  |
| `agent.run.completed`        | `released`, `outputType`                                      | Worker, atau persetujuan disetujui      |
| `agent.run.failed`           | `errorCode`, `errorMessage` (kode aman), `retryScheduled`     | Worker, persetujuan ditolak/kedaluwarsa |
| `agent.run.canceled`         | —                                                             | Pembatalan tugas                        |
| `approval.decided`           | `approvalStatus` `approved`/`rejected`                        | `POST /approvals/:id/decide`            |

Penambahan field baru harus kompatibel mundur; perubahan yang memutus menaikkan `REALTIME_SCHEMA_VERSION`.

## 4. Outbox transaksional dan pengiriman

1. Setiap perubahan status (service tasks/approvals, worker) menulis baris `realtime_outbox` **dalam transaksi yang
   sama** dengan perubahan data (`enqueueRealtimeEvent`). Tidak ada event tanpa perubahan yang ter-commit, dan
   sebaliknya.
2. `createRealtimeHub` mem-polling outbox hanya **selama ada pelanggan** (`REALTIME_OUTBOX_POLL_MS`, default 1 s)
   melalui fungsi SECURITY DEFINER sempit `app.realtime_outbox_after(after, limit)`; hub menyalurkan baris ke
   pelanggan berdasarkan `tenant_id` baris. Satu hub per proses melayani semua koneksi.
3. Antrean per koneksi dibatasi 1.000 frame; bila klien terlalu lambat, koneksi ditutup agar memori tidak membengkak.
4. Retensi: worker memanggil `app.prune_realtime_outbox(REALTIME_OUTBOX_RETENTION_HOURS)` (default 24 jam) berkala.

### Replay `Last-Event-ID`

Saat klien menyambung ulang dengan `Last-Event-ID`, route membaca event tenant **dalam konteks tenant** (RLS) setelah
id tersebut, maksimal 500 baris (`MAX_REPLAY`). Bila celah lebih besar atau klien tidak berizin `tasks.read`,
`ready.replayed = false` dan klien **wajib** sinkron ulang dari snapshot API (`useOfficeRealtime.resyncNeeded`).
Kursor `ready.lastEventId` dihitung sebagai `max(id outbox terbaru, id replay terakhir, Last-Event-ID klien)`, sehingga
event yang dihasilkan sebelum koneksi tidak dikirim dua kali.

## 5. Perilaku klien (`useOfficeRealtime`)

- Menyimpan `lastEventId` dari setiap frame bisnis dan `ready`, dan mengirimkannya saat menyambung ulang.
- `ready.replayed === false` → menaikkan `resyncNeeded`; `GameOffice` memuat ulang `/agents` dan `/tasks`.
- `ready.tenantId` ≠ tenant aktif tab → `useAuth().revalidate()` (indikasi tenant berubah dari luar tab).
- `closed` → `useAuth().revalidate()`, lalu menyambung ulang hanya bila tenant masih aktif dan pengguna masih
  terautentikasi; tidak ada reconnect membabi buta setelah `SESSION_INVALID`/`ACCESS_REVOKED`.
- Putus jaringan → status `reconnecting` dengan backoff (lihat `app/utils/realtime-sse.ts`).

## 6. Yang sengaja tidak dilakukan

- Tidak ada `tenantId`/`userId` dari klien yang dipercaya; identitas dari cookie sesi, tenant dari sesi server.
- Tidak ada penulisan lewat SSE; semua perintah bisnis adalah endpoint REST dengan izin.
- Tidak ada WebSocket; lihat batas `nuxt-elysia` di `docs/architecture.md`.
- Tidak ada event "progres"/"biaya" buatan: `agent.run.activity` hanya meneruskan deskripsi tingkat tinggi dari
  adapter; token usage hanya tersedia di `GET /runs/:id` bila provider melaporkannya.

## 7. Pengujian

`tests/security/sse-security.test.ts` (membutuhkan PostgreSQL test): anonim → 401; pengiriman & isolasi lintas tenant;
replay `Last-Event-ID`; `SESSION_INVALID` setelah logout dan setelah sesi kedaluwarsa; `ACCESS_REVOKED` setelah
keanggotaan dicabut; `TENANT_CHANGED` setelah ganti tenant; `PERMISSION_REVOKED`; pembersihan langganan saat klien
putus; heartbeat. Helper parser frame: `tests/helpers/sse.ts`.
