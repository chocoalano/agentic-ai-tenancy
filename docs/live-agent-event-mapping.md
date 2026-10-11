# Pemetaan Event Agent Live

Mode **live** menampilkan AI employee nyata milik tenant aktif. Backend adalah sumber kebenaran untuk identitas,
kepemilikan tenant, izin, penugasan, status run, persetujuan, biaya, dan hasil bisnis. Frontend hanya memetakan data
dan event yang **benar-benar ada** ke aksi visual. Tidak ada aktivitas yang dikarang ketika event tidak tersedia.

Adaptor bertipe: `app/game/live-adapter.ts`. Kontrak event: `domains/office/realtime.ts`.

## 1. Sumber data live saat ini

| Sumber                                   | Isi yang dipakai                                                    | Pemakaian di game                                              |
| ---------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/v1/agents` (Eden, SSR + klien) | `id`, `name`, `roleTitle`, `lifecycleStatus`, `runtimeStatus: null` | daftar robot, nama, peran; status visual dari `liveActivity()` |
| `GET /api/v1/tenants/:id`                | data tenant aktif                                                   | HUD                                                            |
| `GET /api/v1/realtime/stream` (SSE)      | event `ready`, `heartbeat`                                          | sinkron ulang dan konfirmasi status (tabel di bawah)           |

Status visual live (`liveActivity`): agent `active` → `idle` (Siaga); `paused`/`draft`/`archived` → `offline`
(sprite grayscale). `runtimeStatus` selalu `null` di Phase 1 karena belum ada runtime/orchestrator, sehingga robot live
tidak pernah tampil "bekerja", "meriset", dan sebagainya.

Penempatan robot di workstation dan pemilihan karakter (Nova/Sage/…) adalah **pemetaan presentasi** deterministik
(`buildOfficeScene` → `liveAgentSpecs`), bukan penugasan bisnis.

## 2. Event yang dipetakan (nyata)

| Event SSE   | Data                                                            | Aksi game (`mapRealtimeEvent`)                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ready`     | `tenantId`, `connectionId`, `serverTime`, `heartbeatIntervalMs` | `resync`: muat ulang snapshot agent dari API (`refresh()` → `engine.setAgents`), lalu `confirm(serverTime)`; bila `tenantId` ≠ tenant aktif tab → `useAuth().revalidate()` (tab usang, lihat §6) |
| `heartbeat` | `serverTime`                                                    | `confirm(serverTime)`: perbarui waktu konfirmasi terakhir                                                                                                                                        |

**Sinkronisasi ulang saat (re)koneksi.** Transport SSE (`app/utils/realtime-sse.ts`) menyambung ulang dengan
exponential backoff (1 s → 30 s); 401/403 tidak dicoba ulang. Setiap koneksi baru diawali `ready`, sehingga snapshot
selalu disinkronkan ulang setelah terputus. `setAgents` mempertahankan posisi robot yang sudah ada dan hanya
memperbarui nama, karakter, dan status otoritatif; agent yang dihapus hilang, agent baru muncul di posisinya.

**Status terakhir yang dikonfirmasi.** Bila stream terputus:

- robot tetap menampilkan status otoritatif terakhir dari API (tanpa aktivitas karangan);
- indikator HUD menampilkan "Menyambung ulang…" / "Realtime terputus" beserta waktu heartbeat terakhir (tooltip);
- panel perintah live menampilkan `confirmationLabel()`: "Status live terkonfirmasi · 11.25.38" saat terhubung,
  "Menampilkan status terakhir yang dikonfirmasi · …" saat terputus, atau "Belum ada konfirmasi realtime".

Terverifikasi di browser (tenant Nusantara Digital, 4 agent nyata): 2 `idle`, 2 `offline`, konfirmasi tampil di panel,
perintah bisnis nonaktif, kontrol persetujuan tidak tampil, dan pemindahan visual tidak mengirim request tulis.

## 3. Event masa depan (BELUM ADA di backend)

Event berikut dari brief **tidak** dipancarkan backend Phase 1 dan **tidak** diimplementasikan di adaptor. Tabel ini
adalah kontrak usulan agar adaptor dapat diperluas tanpa mengubah mesin. Semua event baru wajib masuk ke
`OfficeRealtimeEvent` (domains), dikirim per tenant oleh server, dan hanya membawa data yang aman ditampilkan (tanpa
penalaran model/chain-of-thought).

| Event usulan           | Data minimal                                       | Aksi game yang direncanakan                                                       | Prasyarat backend                         |
| ---------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| `agent.status.changed` | `agentId`, `lifecycleStatus`, `runtimeStatus`      | perbarui state (`idle`/`offline`/`thinking`/…) via `liveActivity`                 | kolom runtime status + publisher event    |
| `agent.run.started`    | `agentId`, `runId`, `taskId?`, `workstation?`      | `moveTo(workstation)` lalu `working`                                              | AI Runtime Interface + Agent Orchestrator |
| `agent.run.step`       | `runId`, `kind` (research/tool/write), `summary`   | aktivitas sesuai `kind` + ringkasan aman di log (bukan penalaran model)           | orchestrator dengan langkah teraudit      |
| `task.updated`         | `taskId`, `status`, `assigneeId`                   | indikator workstation/misi                                                        | modul tugas                               |
| `approval.created`     | `approvalId`, `agentId`, `action`                  | `waiting_approval` + notifikasi + kontrol persetujuan (bila RBAC mengizinkan)     | modul persetujuan + audit                 |
| `agent.run.completed`  | `runId`, `status` (succeeded/failed), `resultRef?` | `completed` (celebrate) atau `failed` (error), lalu `idle`; hasil dapat diperiksa | orchestrator + penyimpanan hasil          |

Aturan: status bisnis hanya berubah karena event/data backend yang terkonfirmasi, bukan timer frontend. `moving`
tetap state visual sementara.

## 4. Perintah: visual vs bisnis

Sumber: `app/game/commands.ts` (`AGENT_COMMANDS`). Panel perintah membaca definisi ini. Perintah yang tidak tersedia
memakai `aria-disabled`, ikon gembok, dan tooltip alasan.

| Perintah              | Jenis  | Live                             | Alasan / perilaku live                                        |
| --------------------- | ------ | -------------------------------- | ------------------------------------------------------------- |
| Tugaskan              | bisnis | **nonaktif**                     | butuh modul tugas dan Agent Orchestrator (belum ada endpoint) |
| Chat                  | bisnis | **nonaktif**                     | butuh AI Runtime Interface; tidak ada inferensi AI di Phase 1 |
| Jeda / Lanjutkan      | bisnis | **nonaktif**                     | API mengubah status agent belum tersedia (Phase 1 read-only)  |
| Pindah ke workstation | visual | aktif                            | hanya posisi tampilan; penugasan backend tidak berubah        |
| Lihat aktivitas       | visual | aktif                            | status terakhir yang dikonfirmasi backend                     |
| Profil                | visual | aktif                            | membuka `/agents/:id`                                         |
| Instruksi teks        | bisnis | **nonaktif** (textarea disabled) | eksekusi tugas belum tersedia                                 |
| Persetujuan           | bisnis | tidak tampil                     | modul persetujuan belum ada                                   |

Kode simulasi pratinjau tidak pernah menjadi jalur eksekusi live. Perintah bisnis di masa depan wajib melalui
endpoint terautentikasi yang menegakkan: sesi cookie HttpOnly, keanggotaan tenant, RBAC (izin dari database), validasi
lisensi, budget guard, persetujuan manusia untuk aksi eksternal, audit log, dan idempotensi bila relevan. Endpoint
harus memakai `withTenantTransaction` (RLS) seperti modul lain.

## 5. Transport realtime

- **SSE** melalui mount `nuxt-elysia` (`/api/v1/realtime/stream`), tenant dari sesi (tidak dari klien). WebSocket
  Elysia tidak berfungsi melalui mount (400 "Expected a websocket connection"); bila dibutuhkan, gunakan layanan
  Bun/Elysia mandiri (`api/standalone.ts`) dengan `OfficeRealtimeTransport` yang sama.
- **Perbaikan stabilitas produksi.** Preset Nitro `bun` memakai `Bun.serve` dengan `idleTimeout` default 10 detik,
  sedangkan heartbeat default sebelumnya 15 detik. Akibatnya di build produksi stream diputus ±setiap 10 detik
  (`ERR_INCOMPLETE_CHUNKED_ENCODING`): 3 koneksi dalam 32 detik, disusul sinkron ulang berulang. Perbaikannya:
  - `REALTIME_HEARTBEAT_MS` default menjadi **5000**;
  - `loadApiConfig` menolak konfigurasi dengan heartbeat ≥ `NITRO_BUN_IDLE_TIMEOUT` × 1000 (default 10 detik), jadi
    salah konfigurasi gagal saat startup, bukan diam-diam di produksi.

  Terukur ulang di build produksi dengan konfigurasi default: 1 koneksi selama 40 detik, 0 kegagalan.
  `NITRO_BUN_IDLE_TIMEOUT` (detik, maks. 255) dapat dinaikkan bila heartbeat yang lebih jarang diinginkan.

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
- stream SSE: `ready` membawa tenant sesi (tabel §2) — tenant berbeda → `revalidate()`; stream juga ditolak 409
  sebelum dibuka bila header tab usang;
- **logout** mengosongkan state/cache dan mengirim `logged-out` **hanya** bila server mengonfirmasi (200) atau
  menyatakan sesi memang tidak valid (401). Kegagalan jaringan/server mengembalikan error (UserMenu/GameMenu
  menawarkan coba lagi) tanpa berpura-pura sudah keluar; tab lain yang menerima `logged-out` diarahkan ke `/login`.

## 7. Pengujian

- `tests/unit/office-engine.test.ts`: `ready` → `resync` + `confirm`; `heartbeat` → `confirm`; `liveAgentSpecs`
  memakai status otoritatif (aktif → siaga, lainnya → offline); perintah bisnis tidak didukung di live, perintah visual
  didukung.
- `tests/unit/config.test.ts`: heartbeat default 5000; kombinasi heartbeat ≥ idle timeout ditolak.
- `tests/nuxt/components.test.ts`: panel live menonaktifkan perintah bisnis dan instruksi ("Runtime belum
  terhubung"); kontrol persetujuan tidak tampil di live; dunia live merender agent nyata dengan sprite sheet.
- `tests/nuxt/tenant-switch.test.ts` (11 kasus): ganti tenant di satu tab (cache dibuang, konteks dimuat ulang, tab
  lain diberi tahu; header `x-active-tenant` dikirim; switch ditolak tidak mengubah apa pun; ganti beruntun →
  tenant terakhir), tenant berubah di tab lain (BroadcastChannel; request in-flight 409 tidak mengisi cache lama;
  SSE `ready` tenant lain; logout di tab lain → `/login`), logout (gagal → tetap masuk + error; sukses → bersih).
- `tests/integration/tenant-consistency.test.ts` (7 kasus): header cocok/kosong/usang/rusak, ganti beruntun, SSE
  ditolak sebelum dibuka, header tidak memberi akses ke tenant yang bukan milik pengguna.
- `tests/e2e/production.test.ts` (build produksi): SSE melalui mount Nitro (`ready` lalu `heartbeat`, dapat
  dibatalkan), SSE ditolak tanpa sesi, SSR `/office` memuat data tenant aktif lalu berganti saat switch tenant.
  Isolasi tenant lintas modul diuji di `tests/integration` dan `tests/security`.
