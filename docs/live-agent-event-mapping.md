# Pemetaan Event Agent Live

Mode **live** menampilkan AI employee nyata milik tenant aktif. Backend adalah sumber kebenaran untuk identitas,
kepemilikan tenant, izin, penugasan, status run, persetujuan, dan hasil. Frontend hanya memetakan data dan event yang
**benar-benar ada** ke aksi visual. Tidak ada aktivitas yang dikarang ketika event tidak tersedia.

Adaptor bertipe: `app/game/live-adapter.ts`. Kontrak event: `domains/office/realtime.ts`. Sejak Phase 5, event
bisnis agent benar-benar dipancarkan backend (outbox transaksional → SSE); rincian integrasi game ada di
`docs/game-live-event-integration.md`, keamanan transport di `docs/secure-agent-realtime.md`.

## 1. Sumber data live

| Sumber                                                               | Isi yang dipakai                                                                               | Pemakaian di game                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/agents` (Eden, SSR + klien)                             | `id`, `name`, `roleTitle`, `lifecycleStatus`, `runtimeStatus`, `currentTaskId`, `currentRunId` | daftar robot, nama, peran; status awal dari `liveActivity()` |
| `GET /api/v1/tasks/capabilities`                                     | runtime (`available`, `kind`, `provider`, `model`), `canCreate`, `canCancel`, batas            | gating tombol Tugaskan + label runtime jujur                 |
| `GET /api/v1/tasks?agentId=`, `GET /api/v1/approvals?status=pending` | tugas agent terpilih, persetujuan tertunda                                                     | kartu tugas, riwayat, blok persetujuan                       |
| `GET /api/v1/runs/:id/output`                                        | isi hasil (hanya bila dirilis)                                                                 | tombol "Lihat hasil"                                         |
| `GET /api/v1/tenants/:id`                                            | data tenant aktif                                                                              | HUD                                                          |
| `GET /api/v1/realtime/stream` (SSE)                                  | `ready`, `heartbeat`, `closed`, `agent.*`, `approval.*`                                        | sinkron ulang, konfirmasi, animasi (tabel §2)                |

Status visual live (`liveActivity(lifecycle, runtimeStatus)`): agent bukan `active` → `offline` (sprite grayscale);
`runtimeStatus` `thinking`/`working`/`waiting_approval` → state yang sama; tidak ada run aktif → `idle`.
`runtimeStatus` diturunkan backend dari run aktif agent (`runtimeStatusOfRun`), bukan dari timer frontend.

Penempatan robot di workstation dan pemilihan karakter (Nova/Sage/…) adalah **pemetaan presentasi** deterministik
(`buildOfficeScene` → `liveAgentSpecs`), bukan penugasan bisnis.

## 2. Event yang dipetakan (`mapRealtimeEvent`)

| Event SSE                        | Data penting                                        | Aksi game                                                                                                     |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ready`                          | `tenantId`, `lastEventId`, `replayed`, `serverTime` | `resync` (muat ulang snapshot bila `replayed=false`) + `confirm`; `tenantId` ≠ tab → `useAuth().revalidate()` |
| `heartbeat`                      | `serverTime`                                        | `confirm`                                                                                                     |
| `closed`                         | `reason`                                            | `closed` → revalidasi auth, reconnect hanya bila masih berhak                                                 |
| `agent.task.created`             | `agentId`, `taskId`, `title`                        | `acknowledge`: balon "Perintah diterima", state `thinking`                                                    |
| `agent.task.queued`              | `agentId`, `taskId`                                 | `queued`: state `thinking`                                                                                    |
| `agent.run.started` / `activity` | `runId`, `activity`                                 | `work`: ke stasiun rumah bila perlu, state kerja per peran (`workActivityFor`), balon aktivitas               |
| `agent.run.waiting_approval`     | `approvalId`, `actionSummary`                       | `wait_approval`: state `waiting_approval`                                                                     |
| `agent.run.completed`            | `released`, `outputType`                            | `complete`: state `completed` 2 s → `idle`; balon "hasil tersedia" bila `released`                            |
| `agent.run.failed`               | `errorCode`, `errorMessage`, `retryScheduled`       | `fail`: state `failed` 2,5 s → `thinking` (akan diulang) atau `idle`                                          |
| `agent.run.canceled`             | —                                                   | `cancel`: state `idle`                                                                                        |
| `approval.requested` / `decided` | `approvalId`, `approvalStatus`                      | `task_changed`: muat ulang tugas/persetujuan                                                                  |

Semua aksi hanya memanggil mesin (`setActivity`/`moveTo`/`say`) sebagai presentasi dan memicu pembacaan ulang data
API (`liveRefresh`, `resync`); status bisnis tidak pernah diubah oleh frontend.

**Sinkronisasi ulang saat (re)koneksi.** Transport SSE (`app/utils/realtime-sse.ts`) menyambung ulang dengan
exponential backoff (1 s → 30 s), mengirim `Last-Event-ID` terakhir, dan tidak mencoba ulang 401/403. Server memutar
ulang event yang terlewat (≤ 500) atau menandai `replayed=false` sehingga klien memuat ulang snapshot.

**Status terakhir yang dikonfirmasi.** Bila stream terputus: robot tetap menampilkan status otoritatif terakhir;
HUD menampilkan "Menyambung ulang…" / "Realtime terputus" beserta waktu heartbeat terakhir; panel menampilkan
`confirmationLabel()`.

## 3. Event yang belum ada

Backend belum memancarkan: perubahan status siklus hidup agent (`agent.status.changed`), langkah tool/riset
granular (`agent.run.step`), maupun percakapan chat. Adaptor tidak memetakan event tersebut; penambahan baru wajib
masuk `OfficeRealtimeEvent`, dikirim per tenant oleh server, dan hanya membawa data yang aman ditampilkan (tanpa
penalaran model).

## 4. Perintah: visual vs bisnis

Sumber: `app/game/commands.ts` (`AGENT_COMMANDS`). Perintah yang tidak tersedia memakai `aria-disabled`, ikon gembok,
dan tooltip alasan.

| Perintah              | Jenis  | Live                                           | Perilaku live                                                                   |
| --------------------- | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Tugaskan              | bisnis | **aktif bersyarat**                            | `POST /api/v1/tasks` bila runtime tersedia, `tasks.create`, agent aktif & bebas |
| Instruksi teks        | bisnis | aktif bersyarat (textarea)                     | sama seperti Tugaskan; opsi "perlu persetujuan"                                 |
| Batalkan tugas        | bisnis | aktif bila `tasks.cancel`                      | `POST /api/v1/tasks/:id/cancel`                                                 |
| Setujui / Tolak       | bisnis | aktif bila `approvals.decide` & ada permintaan | `POST /api/v1/approvals/:id/decide`                                             |
| Lihat hasil           | bisnis | aktif setelah hasil dirilis                    | `GET /api/v1/runs/:id/output`                                                   |
| Chat                  | bisnis | **nonaktif**                                   | belum ada endpoint percakapan                                                   |
| Jeda / Lanjutkan      | bisnis | **nonaktif**                                   | API mengubah status agent belum tersedia                                        |
| Pindah ke workstation | visual | aktif                                          | hanya posisi tampilan                                                           |
| Lihat aktivitas       | visual | aktif                                          | status terakhir yang dikonfirmasi backend                                       |
| Profil                | visual | aktif                                          | membuka `/agents/:id`                                                           |

Kode simulasi pratinjau tidak pernah menjadi jalur eksekusi live. Setiap perintah bisnis melalui endpoint
terautentikasi yang menegakkan sesi cookie HttpOnly, keanggotaan tenant, izin dari database (juga di RLS), batas
tenant, idempotensi, dan persetujuan manusia untuk perilisan hasil (`docs/task-run-lifecycle.md`).

## 5. Transport realtime

- **SSE** melalui mount `nuxt-elysia` (`/api/v1/realtime/stream`), tenant dari sesi (tidak dari klien). WebSocket
  Elysia tidak berfungsi melalui mount (400 "Expected a websocket connection"); bila dibutuhkan, gunakan layanan
  Bun/Elysia mandiri (`api/standalone.ts`) dengan `OfficeRealtimeTransport` yang sama.
- **Perbaikan stabilitas produksi.** Preset Nitro `bun` memakai `Bun.serve` dengan `idleTimeout` default 10 detik,
  sedangkan heartbeat default sebelumnya 15 detik. Akibatnya di build produksi stream diputus ±setiap 10 detik
  (`ERR_INCOMPLETE_CHUNKED_ENCODING`). Perbaikannya:
  - `REALTIME_HEARTBEAT_MS` default menjadi **5000**;
  - `loadApiConfig` menolak konfigurasi dengan heartbeat ≥ `NITRO_BUN_IDLE_TIMEOUT` × 1000 (default 10 detik).

  Terukur ulang di build produksi dengan konfigurasi default: 1 koneksi selama 40 detik, 0 kegagalan.

- **Validasi ulang otorisasi** setiap `REALTIME_REVALIDATE_MS` dan penutupan `closed` — lihat
  `docs/secure-agent-realtime.md`.

## 6. Konsistensi tenant lintas tab

Tenant aktif melekat pada **sesi** (`sessions.active_tenant_id`), jadi berlaku untuk semua tab. Agar tab yang tidak
mengganti tenant tidak menampilkan atau menyimpan data tenant yang salah:

- setiap request tenant-scoped dari `useTenantAsyncData` membawa header `x-active-tenant` (tenant yang dikira aktif
  oleh tab); backend membandingkannya dengan tenant sesi dan menjawab **409 `TENANT_MISMATCH` tanpa data** bila
  berbeda (`api/core/auth/guard.ts`). Header ini bukan otorisasi: identitas dan keanggotaan tetap dari sesi/database;
- cache tenant memakai kunci `tenant:<id>:<name>`, sehingga data tenant lama tidak pernah tampil untuk tenant baru,
  dan respons 409 tidak mengisi cache mana pun; 409 memicu `useAuth().revalidate()` yang membaca ulang konteks
  otoritatif, membuang `tenant:*` bila pengguna/tenant berubah, lalu mengambil data ulang;
- tab yang mengganti tenant/masuk mengirim `session-changed` lewat BroadcastChannel `aivo-auth-sync`
  (`app/plugins/auth-sync.client.ts`); tab lain `revalidate()`. Tab juga `revalidate()` saat kembali fokus/terlihat;
- stream SSE: `ready` membawa tenant sesi — tenant berbeda → `revalidate()`; server juga menutup stream dengan
  `closed TENANT_CHANGED` bila tenant sesi berganti selama koneksi; stream ditolak 409 sebelum dibuka bila header tab
  usang;
- **logout** mengosongkan state/cache dan mengirim `logged-out` **hanya** bila server mengonfirmasi (200) atau
  menyatakan sesi memang tidak valid (401). Kegagalan jaringan/server mengembalikan error tanpa berpura-pura sudah
  keluar; tab lain yang menerima `logged-out` diarahkan ke `/login`.

## 7. Pengujian

- `tests/unit/live-adapter.test.ts`: pemetaan setiap event bisnis → aksi, `ready` dengan/tanpa replay, `closed`.
- `tests/unit/office-engine.test.ts`: `liveAgentSpecs` memakai status otoritatif; perintah live yang didukung hanya
  `assign_task` (+ visual), simulasi tidak menyentuh live.
- `tests/unit/config.test.ts`: heartbeat default 5000; kombinasi heartbeat ≥ idle timeout ditolak.
- `tests/nuxt/components.test.ts`: panel live tanpa data runtime menonaktifkan perintah bisnis; Phase 5 — `assign`
  dengan opsi persetujuan, runtime `none` → alasan jujur, blok persetujuan hanya dengan `approvals.decide`, mode
  pratinjau mengabaikan data live; kontrol simulasi tidak tampil di live.
- `tests/nuxt/tenant-switch.test.ts` (11 kasus): ganti tenant satu/lintas tab, 409 tidak mengisi cache, SSE `ready`
  tenant lain, logout.
- `tests/integration/tenant-consistency.test.ts` (7 kasus): header cocok/kosong/usang/rusak, SSE ditolak sebelum
  dibuka.
- `tests/security/sse-security.test.ts` (10 kasus): 401 anonim, isolasi tenant, replay, `SESSION_INVALID`,
  `ACCESS_REVOKED`, `TENANT_CHANGED`, `PERMISSION_REVOKED`, pembersihan langganan, heartbeat.
- `tests/e2e/production.test.ts` (build produksi): SSE melalui mount Nitro, SSE ditolak tanpa sesi, SSR `/office`,
  Phase 5 tanpa runtime → 409 `RUNTIME_NOT_CONFIGURED` dan `/tasks` SSR.
