# Laporan Phase 5 — Eksekusi AI Agent Live & Operasi Kantor Nyata

Tanggal: 11 Oktober 2026 · Branch: `feature/phase5-live-agent-execution` · Dasar: `main` (`4472473`)

Legenda status: **VERIFIED COMPLETE** = diimplementasikan dan dibuktikan dengan test otomatis/QA browser di repositori
ini · **IMPLEMENTED BUT NOT VERIFIED** = kode ada, belum dijalankan terhadap sistem nyata · **PROTOTYPE** · **BLOCKED**
= tidak dapat diverifikasi di lingkungan ini · **NOT IMPLEMENTED**.

## 1. Ringkasan eksekutif

Virtual Office kini dapat menjalankan **tugas nyata** untuk AI employee: perintah dari panel game menjadi baris
`agent_tasks`, worker PostgreSQL mengklaim run dengan lease, memanggil runtime AI yang dapat diganti, menyimpan
hasil, dan setiap perubahan status dipublikasikan lewat outbox transaksional ke SSE yang menggerakkan animasi robot.
Persetujuan manusia menggerbangi perilisan hasil. Semua lapisan keamanan lama (sesi cookie, keanggotaan tenant, RLS,
gerbang kesiapan, CSRF, pembatas laju, header keamanan) dipertahankan dan diperluas ke tabel baru.

| Area                                                                 | Status                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| SSE aman (validasi ulang, `closed`, replay)                          | VERIFIED COMPLETE                                                  |
| Domain tugas/run + API bertipe                                       | VERIFIED COMPLETE                                                  |
| Worker tahan lama (lease, retry, crash recovery)                     | VERIFIED COMPLETE (fixture)                                        |
| Runtime adapter `none` / `fixture`                                   | VERIFIED COMPLETE                                                  |
| Runtime `openai-compatible` (DigitalOcean)                           | IMPLEMENTED BUT NOT VERIFIED → skenario penyedia nyata **BLOCKED** |
| Persetujuan manusia persisten                                        | VERIFIED COMPLETE                                                  |
| Outbox + integrasi game live                                         | VERIFIED COMPLETE (fixture)                                        |
| Halaman riwayat `/tasks`, `/tasks/:id`                               | VERIFIED COMPLETE                                                  |
| Satu agent nyata mengeksekusi satu tugas nyata dengan model AI nyata | **BLOCKED** (tidak ada kredensial penyedia)                        |

## 2. Audit awal (Stage 0)

Temuan sebelum implementasi: SSE hanya memvalidasi otorisasi saat koneksi dibuka; tidak ada tabel tugas/run; perintah
bisnis di game nonaktif; `runtimeStatus` agent selalu `null`; tidak ada worker maupun antarmuka runtime. Arsitektur
yang dipertahankan: Nuxt 4 + Elysia via `nuxt-elysia`, Eden, PostgreSQL RLS via Bun SQL, readiness gate fail-closed,
mesin game `app/game/`, simulasi pratinjau. Tidak ada microservice, broker pesan, WebSocket, atau SDK AI baru.

## 3. Milestone A — SSE aman

Implementasi di `api/modules/realtime/routes.ts`: generator stream dengan `Waiter` (bangun pada event/heartbeat/
abort), validasi ulang setiap `REALTIME_REVALIDATE_MS` (sesi, tenant aktif, keanggotaan, izin) → frame `closed`
dengan alasan `SESSION_INVALID`/`TENANT_CHANGED`/`ACCESS_REVOKED`/`PERMISSION_REVOKED`/`SERVER_SHUTDOWN`; event
bisnis hanya untuk `tasks.read`; antrean per koneksi 1.000; `finally` melepas langganan. Replay `Last-Event-ID`
(header atau query) ≤ 500 event dalam konteks tenant, selain itu `replayed=false` → klien sinkron ulang snapshot.
Dokumen: `docs/secure-agent-realtime.md`. Test: `tests/security/sse-security.test.ts` (10). **VERIFIED COMPLETE.**

## 4. Milestone B — Domain tugas & run

Migrasi `db/migrations/0008_agent_tasks.sql`: `agent_tasks`, `agent_runs`, `agent_run_events`, `agent_run_outputs`,
`agent_approvals`, `realtime_outbox` (FORCE RLS, FK komposit `(id, tenant_id)`, unik idempotensi per tenant+pengguna,
unik `(task_id, attempt)`, satu output per run), izin `tasks.*`/`approvals.*`, helper `app.is_worker()`/
`app.is_privileged_caller()`, fungsi definer sempit. Aturan murni `domains/tasks/types.ts` (transisi, kode error aman).
API bertipe: `tasks/capabilities`, `POST/GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/cancel`, `GET /tasks/:id/runs`,
`GET /runs/:id`, `/events`, `/output`. Idempotensi & batas (laju per pengguna, aktif/harian per tenant) ditegakkan
sebelum menulis. Dokumen: `docs/task-run-lifecycle.md`. Test: `tests/integration/tasks.test.ts` (10),
`tests/security/task-isolation.test.ts` (7), `tests/integration/eden-types.test.ts`. **VERIFIED COMPLETE.**

## 5. Milestone C — Worker tahan lama

`api/modules/runs/worker.ts` + entry `api/worker.ts` (`bun run worker`) atau inline (`AI_WORKER_INLINE=true`, mulai
setelah readiness gate). Klaim `app.claim_agent_run` (`FOR UPDATE SKIP LOCKED` + lease), heartbeat lease/3 yang juga
membaca `cancel_requested`, pemulihan lease kedaluwarsa (`LEASE_EXPIRED` retryable → run baru), retry dengan run
`attempt+1` sampai `AI_RUN_MAX_ATTEMPTS`, kegagalan non-retryable tidak diulang, shutdown SIGTERM/SIGINT melepas klaim
ke `queued`, tidak ada transaksi terbuka selama panggilan model, pemangkasan outbox berkala. Dokumen:
`docs/agent-worker-operations.md`. Test: `tests/integration/worker.test.ts` (14, termasuk 2 worker 1 run, crash
recovery, cancel di tengah, perlindungan terminal). **VERIFIED COMPLETE** dengan fixture.

## 6. Runtime AI yang dapat diganti

`api/core/runtime/`: `AgentRuntime { provider, model, available, kind, execute() → AsyncIterable<RuntimeEvent> }`.
Adapter `none` (default; `POST /tasks` 409 `RUNTIME_NOT_CONFIGURED`), `fixture` (deterministik, berlabel
"[FIXTURE DETERMINISTIK — BUKAN HASIL MODEL AI]", **ditolak di production**), `openai-compatible` (DigitalOcean
Serverless Inference `https://inference.do-ai.run/v1/chat/completions`, Bearer model access key, `fetch` tanpa SDK,
klasifikasi error 429/5xx/timeout retryable vs 4xx non-retryable, usage hanya dari respons penyedia). Model tidak
diberi tool, shell, jaringan, atau akses database. Dokumen & langkah setup DigitalOcean:
`docs/agent-runtime-adapters.md`. Status: `none`/`fixture` **VERIFIED COMPLETE**; `openai-compatible`
**IMPLEMENTED BUT NOT VERIFIED** — tidak ada kredensial penyedia di lingkungan ini, sehingga skenario "model AI nyata
mengeksekusi tugas" tetap **BLOCKED**.

## 7. Milestone D — Persetujuan manusia

Tugas `requiresApproval` → output disimpan `released=false`, run/tugas `waiting_approval`, baris `agent_approvals`
`pending` (aksi `release_result`) dalam satu transaksi. `POST /approvals/:id/decide` (izin `approvals.decide`):
approve → rilis + `completed`; reject → `failed APPROVAL_REJECTED`; keputusan ganda 409; swa-persetujuan 403 bila
`APPROVAL_FORBID_SELF=true`; kedaluwarsa `APPROVAL_TTL_HOURS` disapu worker; pembatalan tugas menutup permintaan.
`GET /runs/:id/output` 409 `OUTPUT_PENDING_APPROVAL` sebelum keputusan. UI: toggle "Hasil perlu persetujuan manusia
sebelum dirilis" di panel, blok persetujuan dengan gating izin, `/tasks` menandai tugas berpersetujuan. Dokumen:
`docs/agent-approval-workflow.md`. **VERIFIED COMPLETE** (test integrasi + QA browser
`docs/screenshots/office-live-approval-1920x1080-*.jpg`).

## 8. Milestone E — Kontrak event & integrasi game

Kontrak `domains/office/realtime.ts` (skema v1, `AgentEventBase`, 10 tipe event bisnis, `ready` dengan
`lastEventId`/`replayed`, `closed`). Publikasi hanya lewat `enqueueRealtimeEvent` dalam transaksi perubahan; hub
(`createRealtimeHub`) mem-polling outbox hanya saat ada pelanggan. Game: `mapRealtimeEvent` → aksi presentasi
(`acknowledge`/`queued`/`work`/`wait_approval`/`complete`/`fail`/`cancel`/`task_changed`), `liveActivity` dari
`runtimeStatus` API, panel perintah live (kemampuan runtime, tugas saat ini, hasil, riwayat), sinkron ulang setelah
reconnect/`closed`, pemisahan ketat pratinjau vs live (prop `live` diabaikan di pratinjau). Dokumen:
`docs/game-live-event-integration.md`, `docs/live-agent-event-mapping.md` (diperbarui). Test:
`tests/unit/live-adapter.test.ts`, `tests/unit/office-engine.test.ts`, `tests/nuxt/components.test.ts` (3 kasus Phase
5). **VERIFIED COMPLETE** dengan fixture.

## 9. Frontend tambahan

`app/pages/tasks/index.vue` (riwayat tugas tenant, filter status, pemberitahuan fixture), `app/pages/tasks/[id].vue`
(detail, run, hasil bila dirilis), `app/components/agents/TaskStatusBadge.vue`, `app/utils/task-status.ts` (label
Bahasa Indonesia), navigasi "Tugas", tipe Eden `TaskItem`/`TaskDetail`/`TaskRun`/`TaskCapabilities`/`ApprovalItem`/
`RunOutput` (`app/utils/api-types.ts`). SSR lintas tenant → 404 (QA). **VERIFIED COMPLETE.**

## 10. Keamanan & tenancy

- Semua tabel baru: `tenant_id NOT NULL`, `ENABLE`+`FORCE RLS`, terdaftar di `RLS_PROTECTED_TABLES`; penulisan
  ditegakkan database (`app.has_permission(...)` atau `app.is_worker()`); role runtime tanpa `DELETE`.
- Konteks worker transaction-local (`withWorkerTransaction`), tidak pernah `SET` level sesi.
- Tidak ada `userId`/`tenantId` dari klien yang dipercaya; `x-active-tenant` tetap pemeriksaan konsistensi.
- Event SSE tanpa prompt/keluaran model/pesan error mentah; kunci API tidak pernah di-log atau dikirim ke klien.
- Pembatas laju pembuatan tugas per pengguna + batas aktif/harian per tenant; instruksi dibatasi panjang.
- Test keamanan: `task-isolation` (RLS langsung, FK komposit, definer vs select langsung), `sse-security`,
  `tenant-isolation` (izin peran diperbarui), `rls`, `pool-isolation`. **VERIFIED COMPLETE.**

## 11. Migrasi, konfigurasi, deploy

Migrasi baru `0008_agent_tasks.sql` (idempoten lewat migrator; sudah diterapkan ke DB dev & test lokal). Variabel
baru di `.env.example` (`AI_*`, `AI_WORKER_*`, `AI_RUN_*`, `AI_TENANT_*`, `RATE_LIMIT_TASK_CREATE_*`, `APPROVAL_*`,
`REALTIME_REVALIDATE_MS`, `REALTIME_OUTBOX_*`) dengan validasi startup fail-closed. Urutan deploy: `bun run db:migrate`
→ server web → `bun run worker` (≥ 1 proses) dengan `AI_RUNTIME_PROVIDER=openai-compatible` + kredensial. Dokumen:
`docs/setup.md`, `docs/agent-worker-operations.md`.

## 12. Pengujian otomatis (hasil nyata)

| Gerbang                                       | Hasil                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                           | lulus                                                                                                                                                                                                               |
| `bun run lint`                                | lulus                                                                                                                                                                                                               |
| `bun run format:check`                        | lulus untuk semua berkas Phase 5; **gagal** hanya pada `public/game-assets-v2/agents/{pixel,sage}/atlas.json` yang diubah di luar pekerjaan ini (lihat §19)                                                         |
| `bun run check:assets`                        | **38/38 lulus** dengan aset `public/` versi HEAD (diverifikasi di worktree sementara); **gagal** di working tree karena 40 berkas `.webp` v2 berisi data PNG + 1 berkas yatim yang bukan bagian pekerjaan ini (§19) |
| `bun run test` (Bun: unit+integrasi+keamanan) | **263 lulus, 0 gagal**, 29 berkas                                                                                                                                                                                   |
| `bun run test:nuxt` (Vitest)                  | **39 lulus**, 4 berkas                                                                                                                                                                                              |
| `bun run build`                               | sukses (Nitro preset bun)                                                                                                                                                                                           |
| `bun run test:e2e` (build produksi)           | **15 lulus** (termasuk Phase 5: tanpa runtime → 409 `RUNTIME_NOT_CONFIGURED`, `/tasks` SSR)                                                                                                                         |

Perbaikan stabilitas suite: timeout per test 20–30 s dan pembersihan stream `afterEach` di test SSE/worker (dalam
suite penuh, stream yang bocor memicu timeout 5 s & 503 pool) serta ekspektasi izin peran yang diperbarui.

## 13. QA browser & artefak

Skrip Puppeteer (Chrome headless) terhadap dev server `:4130` dengan `AI_RUNTIME_PROVIDER=fixture` +
`AI_WORKER_INLINE=true`, akun seed owner, tenant Nusantara Digital, agent nyata "Dimas":

| Viewport  | Alur tugas nyata                                                                                                                                                                    | Hasil                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1920×1080 | panel → kirim → `thinking` → `working` → `completed` → "Lihat hasil" → reload → `/tasks` → `/tasks/:id` → tenant lain 404 (API & halaman)                                           | lulus; rekaman `docs/screenshots/office-live-task-p5.mp4` |
| 1440×900  | sama                                                                                                                                                                                | lulus                                                     |
| 768×1024  | sama                                                                                                                                                                                | lulus                                                     |
| 390×844   | sama                                                                                                                                                                                | lulus                                                     |
| 1920×1080 | persetujuan: toggle → `waiting_approval` + blok persetujuan → API output 409 `OUTPUT_PENDING_APPROVAL` → Setujui → `completed` → hasil tampil → API output 200, approval `approved` | lulus                                                     |

Penulisan API yang terjadi hanya `POST /api/v1/tasks` dan `POST /api/v1/approvals/:id/decide` (plus login/switch
untuk setup); tidak ada error konsol selain 404/409 yang diharapkan. Screenshot: `docs/screenshots/office-live-*.jpg`.
Hasil yang tampil selalu berlabel fixture — **bukan keluaran model AI**.

## 14. Vertical slice wajib

"Satu agent nyata mengeksekusi satu tugas nyata": terbukti **end-to-end dengan adapter fixture** (perintah → tugas →
worker → hasil → SSE → animasi → riwayat). Dengan **model AI nyata: BLOCKED** — tidak ada `AI_RUNTIME_API_KEY`/model
di lingkungan ini dan tidak ada SDK/kredensial yang boleh dikarang. Instruksi menyelesaikan blokade ada di
`docs/agent-runtime-adapters.md` §3; setelah dijalankan, `GET /runs/:id` harus menunjukkan `runtimeProvider =
openai-compatible`, `providerRequestId`, dan `usage` dari penyedia.

## 15. Yang tidak diimplementasikan (disengaja)

Chat percakapan dengan agent, jeda/lanjutkan agent lewat API, tool calling/aksi eksternal (e-mail, kalender), antrean
terdistribusi/broker, WebSocket, notifikasi persetujuan (e-mail/push), kuorum persetujuan, penagihan/biaya,
streaming token. Semua ditampilkan sebagai state nonaktif yang jujur di UI atau tidak ditampilkan.

## 16. Prototipe / batasan yang disadari

- Frame animasi robot tetap prosedural (Phase 4, BLOCKED tanpa artist) — tidak berubah di Phase 5.
- Semantik worker at-least-once: run dapat diulang setelah crash; aman karena adapter hanya menghasilkan teks.
- Jendela deteksi pencabutan otorisasi SSE = `REALTIME_REVALIDATE_MS` (default 15 s).
- Hub outbox per proses mem-polling PostgreSQL (default 1 s) — cukup untuk skala saat ini, bukan LISTEN/NOTIFY.

## 17. Risiko & mitigasi

| Risiko                                         | Mitigasi                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Penyedia nyata berperilaku berbeda dari asumsi | Klasifikasi error konservatif (4xx non-retryable), timeout, batas keluaran; wajib uji dengan kredensial sebelum production |
| Worker tidak berjalan                          | Tugas tetap `queued` dan terlihat; dokumentasi operasi + checklist deploy                                                  |
| Pool habis                                     | Transaksi pendek, model dipanggil di luar transaksi, `DATABASE_POOL_MAX` dapat dinaikkan                                   |
| Kebocoran data lewat event                     | Payload event tanpa prompt/keluaran; hasil hanya lewat endpoint berizin                                                    |

## 18. Dokumentasi

Baru: `docs/phase5-live-agent-execution.md` (ini), `docs/task-run-lifecycle.md`, `docs/agent-runtime-adapters.md`,
`docs/agent-worker-operations.md`, `docs/secure-agent-realtime.md`, `docs/agent-approval-workflow.md`,
`docs/game-live-event-integration.md`. Diperbarui: `docs/api.md`, `docs/tenancy.md`, `docs/architecture.md`,
`docs/setup.md`, `docs/live-agent-event-mapping.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `.env.example`.

## 19. Catatan lingkungan (bukan bagian pekerjaan Phase 5)

- Saat sesi berlangsung, direktori `public/game-assets` ditemukan terhapus (belum di-commit) dan dipulihkan dari git
  (`git checkout -- public/game-assets`).
- 40 berkas `public/game-assets-v2/**/*.webp` yang terlacak git berisi **data PNG** (bukan WebP) di working tree,
  `agents/{pixel,sage}/atlas.json` berubah format, dan muncul berkas yatim `agents/echo/sheet_old.webp` — perubahan ini
  terjadi di luar pekerjaan Phase 5 dan **tidak** di-revert maupun di-commit; akibatnya `check:assets` dan
  `format:check` gagal di working tree tetapi lulus dengan aset versi HEAD. Perlu keputusan pemilik repo.
- Dev server `:3000` milik pengguna tidak disentuh; QA memakai `:4130` yang sudah dimatikan.

## 20. Langkah berikutnya

1. Isi kredensial DigitalOcean di lingkungan aman, jalankan worker, verifikasi satu tugas nyata, lalu ubah status §6/§14.
2. Putuskan nasib perubahan aset di `public/game-assets-v2` (pulihkan dari HEAD atau selesaikan pipeline-nya) agar
   `check:assets`/`format:check` hijau kembali.
3. Tambah test adapter `openai-compatible` dengan server HTTP tiruan (sukses, 429, 5xx, timeout, body tak valid).
4. Pertimbangkan LISTEN/NOTIFY untuk hub outbox dan notifikasi persetujuan bila kebutuhan skala/UX muncul.
