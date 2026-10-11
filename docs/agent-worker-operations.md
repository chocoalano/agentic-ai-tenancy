# Operasi Worker Eksekusi Agent

Worker (`api/modules/runs/worker.ts`) mengambil run dari antrean PostgreSQL, menjalankan adapter runtime, dan
menulis hasil/status/event dalam transaksi pendek. Tidak ada broker tambahan: PostgreSQL adalah antrean, kunci, dan
outbox. Dokumen ini untuk operator.

**Status:** VERIFIED COMPLETE dengan runtime fixture (`tests/integration/worker.test.ts`, 14 skenario; QA browser).
Penyedia AI nyata belum pernah dijalankan dari lingkungan ini (BLOCKED, lihat `docs/agent-runtime-adapters.md`).

## 1. Cara menjalankan

| Mode    | Perintah / konfigurasi                         | Kapan dipakai                                                                     |
| ------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Mandiri | `bun run worker` (`api/worker.ts`)             | Produksi: proses terpisah dari server web, dapat diskalakan horizontal            |
| Inline  | `AI_WORKER_INLINE=true` pada proses Nuxt/Nitro | Pengembangan, demo satu proses; worker dimulai **setelah** gerbang kesiapan lulus |

Keduanya memuat konfigurasi yang sama (`loadApiConfig()`), termasuk `DATABASE_URL` role runtime (bukan superuser /
bukan pemilik) dan variabel `AI_*`. Worker mandiri memverifikasi role database dahulu (`inspectRuntimeRole`) dan
keluar dengan kode 1 bila tidak aman; bila database belum terjangkau ia menunggu, bukan mengklaim.

| Variabel                          | Default         | Keterangan                                                          |
| --------------------------------- | --------------- | ------------------------------------------------------------------- |
| `AI_WORKER_INLINE`                | `false`         | Jalankan worker di dalam proses server                              |
| `AI_WORKER_ID`                    | acak per proses | Identitas di `agent_runs.worker_id`, `app.request_id = worker:<id>` |
| `AI_WORKER_CONCURRENCY`           | `2`             | 1–32 run bersamaan per proses                                       |
| `AI_WORKER_POLL_MS`               | `1000`          | 20–60000; jeda antar putaran saat antrean kosong                    |
| `AI_RUN_LEASE_SECONDS`            | `60`            | 5–3600; harus > poll; lease diperpanjang setiap lease/3             |
| `AI_RUN_MAX_ATTEMPTS`             | `3`             | 1–10; percobaan maksimum per tugas                                  |
| `AI_TENANT_MAX_ACTIVE_RUNS`       | `3`             | Tugas aktif bersamaan per tenant (dicek saat `POST /tasks`)         |
| `AI_TENANT_DAILY_RUN_LIMIT`       | `100`           | Tugas per tenant per hari (UTC)                                     |
| `REALTIME_OUTBOX_RETENTION_HOURS` | `24`            | Retensi outbox yang dipangkas worker                                |
| `APPROVAL_TTL_HOURS`              | `24`            | Permintaan persetujuan kedaluwarsa (disapu worker)                  |

Checklist deploy: `bun run db:migrate` (migrasi 0008) **sebelum** memulai worker/server baru; `DATABASE_URL` =
`agentic_app`; `AI_RUNTIME_PROVIDER` bukan `fixture` di production; satu proses worker minimal; `SIGTERM` diberi
waktu ≥ `AI_RUNTIME_TIMEOUT_SECONDS` untuk drain.

## 2. Satu putaran (`tick`)

1. **Pulihkan lease kedaluwarsa** — `app.expired_run_leases()`; untuk tiap run: dalam transaksi worker tenant
   tersebut, run → `failed` `LEASE_EXPIRED` (retryable) + event `lease.expired`, lalu `scheduleRetryOrFail`.
2. **Sapu persetujuan kedaluwarsa** — `app.expired_pending_approvals()`; persetujuan → `expired`, run/tugas →
   `failed` `APPROVAL_EXPIRED`, event `agent.run.failed`.
3. **Pangkas outbox** — paling sering setiap 10 menit, `app.prune_realtime_outbox(REALTIME_OUTBOX_RETENTION_HOURS)`.
4. **Klaim** — selagi `inflight < AI_WORKER_CONCURRENCY`: `app.claim_agent_run(worker_id, lease_seconds)`; kosong →
   tidur `AI_WORKER_POLL_MS`.
5. **Proses** (per run, di luar transaksi apa pun):
   - transaksi pendek: run `claimed → running`, tugas `→ running`, event `run.started` + outbox `agent.run.started`;
   - **heartbeat** setiap `max(250 ms, lease/3)`: perpanjang `lease_expires_at` (hanya bila `worker_id` cocok) dan
     baca `cancel_requested`; lease hilang → abort `LEASE_LOST`; dibatalkan → abort `CANCELED`;
   - iterasi `runtime.execute(input)`: `activity` → event + outbox; `output` → disimpan di akhir; `usage` → kolom
     usage; `failed` → finalisasi gagal;
   - finalisasi dalam satu transaksi pendek: output (`released` sesuai `requires_approval`), run/tugas `completed`
     atau `waiting_approval` (+ baris `agent_approvals`), event outbox.

Model dipanggil **tanpa transaksi database terbuka**; semua tulis ke database berdurasi milidetik. Ini penting agar
pool kecil (`DATABASE_POOL_MAX`) tidak habis oleh panggilan model yang lambat.

## 3. Kegagalan, percobaan ulang, pembatalan

| Situasi                                 | Perilaku                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter `failed` `retryable=true`       | Run `failed`; bila `attempts < max_attempts` dan tidak dibatalkan: run baru `attempt+1`, tugas kembali `queued`, event `agent.run.failed {retryScheduled:true}` + `agent.task.queued` |
| Adapter `failed` `retryable=false`      | Run & tugas `failed` dengan kode adapter                                                                                                                                              |
| Percobaan habis                         | Tugas `failed` `ATTEMPTS_EXHAUSTED`                                                                                                                                                   |
| Adapter melempar exception              | Dicatat di log; run `failed` `INTERNAL_ERROR` (retryable)                                                                                                                             |
| Lease hilang (worker macet lalu bangun) | Hasil **tidak** ditulis; worker lain sudah memulihkan run (`LEASE_EXPIRED`) dan mungkin mengulang                                                                                     |
| `POST /tasks/:id/cancel` saat `running` | `cancel_requested=true`; heartbeat berikutnya abort adapter → run/tugas `canceled`, tidak diulang                                                                                     |
| Worker `stop()` / SIGTERM / SIGINT      | Berhenti mengklaim; run aktif di-abort `SHUTDOWN` dan **dikembalikan ke `queued`** (`worker_id` dihapus); proses menunggu semua selesai lalu keluar                                   |

Semantik **at-least-once**: setelah crash, run yang sama secara logis dapat dieksekusi ulang oleh percobaan baru.
Adapter tidak melakukan efek samping eksternal (hanya teks), sehingga pengulangan aman; bila di masa depan ada aksi
eksternal, aksi tersebut harus idempoten atau dilindungi persetujuan.

## 4. Skala dan isolasi

- Beberapa proses worker dapat berjalan bersamaan; `FOR UPDATE SKIP LOCKED` menjamin satu run hanya diklaim satu
  worker (diuji: 2 worker, 1 run → tepat satu `worker_id`).
- Setiap penulisan berjalan di `withWorkerTransaction(sql, { tenantId, workerId })` yang menyetel `app.tenant_id`
  (dari baris klaim), `app.user_id = ''`, `app.actor = 'worker'` **transaction-local**; RLS tetap aktif untuk worker
  dan worker tenant B tidak dapat menulis run tenant A (diuji).
- Hanya tiga fungsi definer yang melihat lintas tenant (`claim_agent_run`, `expired_run_leases`,
  `expired_pending_approvals`) dan dua untuk outbox; semuanya mengembalikan id + `tenant_id` saja atau baris outbox.

## 5. Observabilitas

Log worker (logger server, format JSON) memuat: `workerId`, `runId`, `taskId`, `tenantId`, kode error, dan
`String(error)` dari driver/adapter. **Tidak pernah** memuat `AI_RUNTIME_API_KEY`, prompt, atau keluaran model.
Jejak per run untuk pengguna ada di `GET /api/v1/runs/:id/events` (event `run.started`, `run.activity`,
`run.output_saved`, `run.completed`, `run.failed`, `run.queued`, `run.released`, `lease.expired`, dll.), dan
pemakaian token di `GET /api/v1/runs/:id` bila penyedia melaporkannya.

Metrik yang berguna untuk dipantau dari database (role pemilik/baca):

```sql
select status, count(*) from agent_runs group by status;                       -- antrean & kemacetan
select count(*) from agent_runs where status = 'claimed' and lease_expires_at < now(); -- lease basi
select count(*) from realtime_outbox;                                          -- retensi outbox
```

## 6. Pemecahan masalah

| Gejala                                             | Penyebab umum                                                   | Tindakan                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tugas tetap `queued`                               | Tidak ada worker berjalan; `AI_WORKER_INLINE` tidak diset       | Jalankan `bun run worker`; cek log "Worker eksekusi berjalan"              |
| `POST /tasks` 409 `RUNTIME_NOT_CONFIGURED`         | `AI_RUNTIME_PROVIDER=none`                                      | Konfigurasi adapter (`docs/agent-runtime-adapters.md`)                     |
| Server 503 `SERVICE_MISCONFIGURED`                 | `fixture` di production, URL bukan https, variabel wajib kosong | Perbaiki `.env`; kesalahan dicetak saat startup                            |
| Run berulang `LEASE_EXPIRED`                       | Lease terlalu pendek untuk latensi model / worker macet         | Naikkan `AI_RUN_LEASE_SECONDS` (> `AI_RUNTIME_TIMEOUT_SECONDS` dianjurkan) |
| Run `PROVIDER_RATE_LIMITED`/`PROVIDER_UNAVAILABLE` | Penyedia membatasi/tak tersedia                                 | Diulang otomatis sampai `AI_RUN_MAX_ATTEMPTS`; turunkan konkurensi         |
| Run `PROVIDER_REJECTED`                            | Kunci/model salah, body ditolak                                 | Periksa `AI_RUNTIME_API_KEY`/`AI_RUNTIME_MODEL`; lihat log server          |
| `OUTPUT_TOO_LARGE`                                 | Keluaran > `AI_MAX_OUTPUT_CHARS`                                | Naikkan batas atau kecilkan `AI_MAX_OUTPUT_TOKENS`                         |
| Event SSE tidak sampai                             | Hub mem-polling hanya saat ada pelanggan; outbox dipangkas      | Cek `REALTIME_OUTBOX_POLL_MS`, retensi, dan izin `tasks.read` pengguna     |
| Worker keluar kode 1 saat start                    | Role database superuser/BYPASSRLS/pemilik                       | Gunakan `agentic_app` (`docs/tenancy.md`)                                  |

## 7. Pengujian

`bun run test:worker` menjalankan `tests/integration/worker.test.ts` (membutuhkan PostgreSQL test): jalur sukses
(output + event + tugas selesai), dua worker satu run, pemulihan lease, retry retryable → sukses, non-retryable → gagal
tanpa ulang, percobaan habis, pembatalan di tengah run, perlindungan state terminal, shutdown melepaskan klaim, runtime
`none`, serta persetujuan (tertunda → 409 output, setujui, tolak, keputusan ganda, swa-persetujuan, kedaluwarsa,
batal).
