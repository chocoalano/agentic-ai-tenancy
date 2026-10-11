# Setup Environment & Database

Panduan ini menyiapkan lingkungan pengembangan lokal dari nol.

## 1. Prasyarat

| Perangkat  | Versi                  | Catatan                                                         |
| ---------- | ---------------------- | --------------------------------------------------------------- |
| Bun        | ≥ 1.3 (diuji 1.3.10)   | Runtime, package manager, test runner                           |
| PostgreSQL | ≥ 15 (diuji 18.4)      | Wajib mendukung RLS; pgvector opsional                          |
| pgvector   | opsional (diuji 0.8.7) | Disiapkan untuk fase AI; migrasi aman bila tidak tersedia       |
| Node.js    | opsional               | Hanya dipakai beberapa CLI dev (Vitest); runtime aplikasi = Bun |

Gunakan **hanya Bun** sebagai package manager (`bun install`, `bun add`). Jangan membuat `package-lock.json`,
`pnpm-lock.yaml`, atau `yarn.lock`.

## 2. Instal dependensi

```bash
bun install        # menjalankan `nuxt prepare` (postinstall)
```

## 3. Konfigurasi environment

```bash
cp .env.example .env
```

### Membuat secret

```bash
# SESSION_SECRET (≥ 32 karakter; nilai contoh di .env.example ditolak saat startup)
bun -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
# Password role database
bun -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))"
```

Alternatif: `openssl rand -base64 48`.

### Variabel

| Variabel                                                                                                           | Wajib | Keterangan                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DB_CONNECTION`                                                                                                    | ya    | `pgsql` (format Laravel; hanya PostgreSQL yang didukung)                                                                       |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`                                                                                | ya    | Server dan database utama (mis. `127.0.0.1`, `5432`, `agentic_office`)                                                         |
| `DB_USERNAME`, `DB_PASSWORD`                                                                                       | ya    | Role **runtime** (`agentic_app`) — tunduk pada RLS                                                                             |
| `DB_MIGRATION_USERNAME`, `DB_MIGRATION_PASSWORD`                                                                   | ya*   | Role **pemilik skema** (`agentic_owner`) — hanya untuk migrasi                                                                 |
| `DB_ADMIN_USERNAME`, `DB_ADMIN_PASSWORD`, `DB_ADMIN_DATABASE`                                                      | lokal | Superuser (database default `postgres`), hanya untuk `db:bootstrap`/`db:reset`                                                 |
| `DB_TEST_DATABASE`                                                                                                 | test  | Database test (role runtime & pemilik yang sama; wajib ≠ `DB_DATABASE`)                                                        |
| `DB_SSLMODE`                                                                                                       | tidak | `disable` · `prefer` · `require` · `verify-full` (ditambahkan sebagai `?sslmode=`)                                             |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `DATABASE_ADMIN_URL`, `TEST_DATABASE_URL`, `TEST_DATABASE_MIGRATION_URL` | tidak | Alternatif URL lengkap `postgresql://user:pass@host:port/db`; bila diisi, **menang** atas `DB_*` (dipakai test e2e/standalone) |
| `SESSION_SECRET`                                                                                                   | ya    | Kunci HMAC hash token sesi                                                                                                     |
| `NUXT_PUBLIC_APP_NAME`                                                                                             | tidak | Nama aplikasi (publik)                                                                                                         |
| `SESSION_TTL_HOURS`                                                                                                | tidak | Masa berlaku sesi absolut (default 168 jam)                                                                                    |
| `APP_TRUSTED_ORIGINS`                                                                                              | tidak | Origin tambahan untuk request mutasi                                                                                           |
| `AUTH_LOGIN_MAX_FAILURES`, `AUTH_LOGIN_WINDOW_MINUTES`                                                             | tidak | Percobaan masuk per email (default 5 / 15 menit; 1–100 / 1–1440)                                                               |
| `RATE_LIMIT_LOGIN_IP_MAX`, `..._WINDOW_MINUTES`                                                                    | tidak | Percobaan masuk per IP, apa pun emailnya (default 30 / 15)                                                                     |
| `RATE_LIMIT_REGISTER_IP_MAX`, `..._WINDOW_MINUTES`                                                                 | tidak | Registrasi per IP (default 10 / 60)                                                                                            |
| `RATE_LIMIT_TENANT_CREATE_MAX`, `..._WINDOW_MINUTES`                                                               | tidak | Pembuatan perusahaan per pengguna (default 10 / 60)                                                                            |
| `TRUSTED_PROXY`                                                                                                    | tidak | `true` hanya di belakang reverse proxy yang menyetel `X-Forwarded-For` (IP klien untuk pembatasan laju)                        |
| `SECURITY_HSTS`                                                                                                    | tidak | `true` hanya di lingkungan HTTPS: kirim `Strict-Transport-Security`                                                            |
| `OPENAPI_ENABLED`                                                                                                  | tidak | Default `true` di development/test, **`false` di production**                                                                  |
| `NODE_ENV`                                                                                                         | tidak | `development` (default) · `test` · `production`                                                                                |
| `SESSION_COOKIE_SECURE`                                                                                            | tidak | Paksa cookie `Secure` di luar production (default `false`)                                                                     |
| `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT_SECONDS`, `DATABASE_CONNECT_TIMEOUT_SECONDS`                           | tidak | Pool (default 10 / 30 dtk / 10 dtk; batas 1–100 / 1–3600 / 1–120)                                                              |
| `API_STANDALONE_PORT`                                                                                              | tidak | Port `bun run api:standalone` (default 4000)                                                                                   |
| `SEED_DEFAULT_PASSWORD`                                                                                            | lokal | Password akun seed (`bun run db:seed`)                                                                                         |
| `REALTIME_HEARTBEAT_MS`                                                                                            | tidak | Interval heartbeat SSE (default 5000; harus < idle timeout)                                                                    |
| `REALTIME_REVALIDATE_MS`, `REALTIME_OUTBOX_POLL_MS`, `REALTIME_OUTBOX_RETENTION_HOURS`                             | tidak | Validasi ulang otorisasi SSE (15000), polling outbox (1000), retensi outbox (24 jam)                                           |
| `AI_RUNTIME_PROVIDER`                                                                                              | tidak | `none` (default) · `fixture` (dev/test, ditolak production) · `openai-compatible`                                              |
| `AI_RUNTIME_BASE_URL`, `AI_RUNTIME_API_KEY`, `AI_RUNTIME_MODEL`                                                    | ya**  | Penyedia OpenAI-compatible (DigitalOcean: `https://inference.do-ai.run/v1`); kunci tidak pernah di-log                         |
| `AI_RUNTIME_TIMEOUT_SECONDS`, `AI_RUNTIME_TEMPERATURE`                                                             | tidak | Batas waktu panggilan model (120), temperature (0.2)                                                                           |
| `AI_MAX_INSTRUCTION_CHARS`, `AI_MAX_OUTPUT_CHARS`, `AI_MAX_OUTPUT_TOKENS`                                          | tidak | Batas instruksi (4000), keluaran (20000 karakter / 1024 token)                                                                 |
| `AI_WORKER_INLINE`, `AI_WORKER_ID`, `AI_WORKER_CONCURRENCY`, `AI_WORKER_POLL_MS`                                   | tidak | Worker inline (false), identitas, konkurensi (2), jeda polling (1000)                                                          |
| `AI_RUN_LEASE_SECONDS`, `AI_RUN_MAX_ATTEMPTS`                                                                      | tidak | Lease run (60), percobaan maksimum (3)                                                                                         |
| `AI_TENANT_MAX_ACTIVE_RUNS`, `AI_TENANT_DAILY_RUN_LIMIT`                                                           | tidak | Batas tugas aktif (3) dan harian (100) per tenant                                                                              |
| `RATE_LIMIT_TASK_CREATE_MAX`, `..._WINDOW_MINUTES`                                                                 | tidak | Pembuatan tugas per pengguna (default 30 / 15)                                                                                 |
| `APPROVAL_TTL_HOURS`, `APPROVAL_FORBID_SELF`                                                                       | tidak | Kedaluwarsa persetujuan (24), larang swa-persetujuan (false)                                                                   |
| `NITRO_BUN_IDLE_TIMEOUT`                                                                                           | tidak | Idle timeout `Bun.serve` produksi, detik (default Bun 10)                                                                      |

\* wajib untuk menjalankan migrasi. \*\* wajib hanya bila `AI_RUNTIME_PROVIDER=openai-compatible`.

Konfigurasi server divalidasi saat startup (`api/core/config/env.ts`). Nilai tidak valid membuat server gagal
start dengan pesan yang jelas — tidak ada fallback diam-diam.

## 4. Database

### Model role

| Role              | Jenis   | Fungsi                                                                             |
| ----------------- | ------- | ---------------------------------------------------------------------------------- |
| `agentic_runtime` | NOLOGIN | Group role penerima `GRANT` dari migrasi (nama tetap)                              |
| `agentic_owner`   | LOGIN   | Pemilik skema/tabel; menjalankan migrasi                                           |
| `agentic_app`     | LOGIN   | Role aplikasi: `NOSUPERUSER NOBYPASSRLS`, anggota `agentic_runtime`, bukan pemilik |

Pemisahan ini wajib: pemilik tabel dan superuser dapat melewati RLS. Gerbang kesiapan (fail-closed) **menolak
melayani request tenant** (503) sampai verifikasi berhasil: database terjangkau (`DATABASE_UNAVAILABLE`, dicoba
ulang tiap 2 detik, pulih sendiri) dan role runtime aman (`SERVICE_MISCONFIGURED` bila superuser, `BYPASSRLS`,
pemilik tabel tenant, RLS belum dipaksa, atau ada tabel ber-`tenant_id` di luar `RLS_PROTECTED_TABLES`; diperiksa
ulang tiap 60 detik). `/api/v1/health` melaporkan state gerbang. Mode standalone berhenti (exit 1) bila role
tidak aman saat start. Lihat `docs/architecture.md`.

Setelah menarik perubahan yang membawa migrasi baru (mis. `0007_membership_write_permissions.sql`), jalankan
`bun run db:migrate` (dan `bun run db:migrate:test`); migrasi menerapkan kebijakan RLS baru tanpa mengubah data.

### Bootstrap (lokal)

```bash
bun run db:bootstrap
```

Membuat (idempoten) `agentic_runtime`, role `DB_MIGRATION_USERNAME` dan `DB_USERNAME` (password dari variabel
masing-masing), database `DB_DATABASE` dan `DB_TEST_DATABASE`, mencabut hak `PUBLIC`, serta mengaktifkan pgvector
bila tersedia. Koneksi admin dari `DB_ADMIN_USERNAME`/`DB_ADMIN_PASSWORD`/`DB_ADMIN_DATABASE`. Password role yang sudah ada tidak diubah
kecuali dengan `bun scripts/db-bootstrap.ts --sync-passwords`.

Di server terkelola (mis. DigitalOcean Managed PostgreSQL), jalankan SQL setara secara manual oleh admin:

```sql
CREATE ROLE agentic_runtime NOLOGIN;
CREATE ROLE agentic_owner LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE agentic_app   LOGIN PASSWORD '...' INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT agentic_runtime TO agentic_app;
CREATE DATABASE agentic_office OWNER agentic_owner;
REVOKE ALL ON DATABASE agentic_office FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE agentic_office TO agentic_runtime;
-- di database agentic_office:
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO agentic_owner;
GRANT USAGE ON SCHEMA public TO agentic_runtime;
CREATE EXTENSION IF NOT EXISTS vector; -- opsional
```

### Migrasi

```bash
bun run db:migrate        # database utama
bun run db:migrate:test   # database test
```

- File: `db/migrations/NNNN_nama.sql`, dijalankan berurutan, masing-masing dalam transaksi.
- Advisory lock mencegah migrasi paralel; checksum mencegah perubahan diam-diam pada migrasi lama.
- **Jangan mengubah migrasi yang sudah diterapkan** — buat migrasi baru.
- `0006_pgvector.sql` aman dijalankan pada server tanpa pgvector (hanya `NOTICE`).

### Seed pengembangan

```bash
bun run db:seed
```

Berjalan sebagai role runtime melalui helper transaksi aplikasi (tunduk RLS). Membuat 3 pengguna, 2 tenant,
7 agent bertanda `is_seed_data = true`. Ditolak bila `NODE_ENV=production`. Idempoten (tidak menggandakan data).

### Reset (lokal)

```bash
bun run db:reset && bun run db:seed
```

## 5. Menjalankan aplikasi

```bash
bun run dev              # http://localhost:3000
```

`bun run dev` memakai `bun --bun nuxt dev` agar Nitro benar-benar berjalan di Bun (bukan Node.js).

### Production

```bash
bun run build            # Nitro preset bun → .output/
bun run preview          # = bun --env-file=.env .output/server/index.mjs
# atau di server:
NODE_ENV=production PORT=3000 DATABASE_URL=... SESSION_SECRET=... bun .output/server/index.mjs
```

Deploy cukup menyalin `.output/` (dependensi server sudah di-trace ke `.output/server/node_modules`). Production
memerlukan HTTPS: cookie sesi memakai prefix `__Host-` dan atribut `Secure`.

### Worker eksekusi agent (Phase 5)

Tugas nyata dieksekusi worker, bukan request HTTP. Jalankan sebagai proses terpisah (dianjurkan di production):

```bash
bun run worker                      # memuat .env yang sama; keluar kode 1 bila role database tidak aman
# atau satu proses (dev/demo): AI_WORKER_INLINE=true bun run dev
```

Tanpa worker, tugas tetap `queued`. Tanpa `AI_RUNTIME_PROVIDER`, `POST /api/v1/tasks` menjawab 409
`RUNTIME_NOT_CONFIGURED` dan panel perintah menampilkan alasannya. Panduan operasi: `docs/agent-worker-operations.md`;
konfigurasi penyedia: `docs/agent-runtime-adapters.md`.

## 6. Test

| Perintah            | Butuh PostgreSQL | Butuh build | Isi                                                                                                                                                                          |
| ------------------- | ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:unit` | tidak*           | tidak       | Config, CSRF, token, pembatas laju, slug, util frontend, mesin/geometri/simulasi Virtual Office                                                                              |
| `bun run test`      | **ya**           | tidak       | Unit + integrasi (API, Eden, auth, migrasi, gerbang kesiapan, standalone, konsistensi tenant, pembatasan laju) + keamanan (isolasi tenant, RLS, pengerasan 0007, pool, CSRF) |
| `bun run test:nuxt` | tidak            | tidak       | Komponen, renderer dunia, ganti tenant lintas tab, logout                                                                                                                    |
| `bun run test:e2e`  | **ya**           | **ya**      | Server production: SSR, `/api`, header keamanan (CSP/HSTS/no-store), cookie, SSE, harness QA 404, server dengan DB mati                                                      |

\* preload Bun Test menerapkan migrasi bila `TEST_DATABASE_MIGRATION_URL` terisi (Bun memuat `.env` otomatis).

Test yang memakai database membaca `TEST_DATABASE_URL` dan `TEST_DATABASE_MIGRATION_URL`; preload Bun Test
(`tests/helpers/preload.ts`) menerapkan migrasi ke database test. Bila variabel tersebut kosong, test database
**gagal dengan pesan jelas** — tidak dilewati diam-diam.

## 7. Masalah umum

| Gejala                                                          | Penyebab & solusi                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Konfigurasi server tidak valid: SESSION_SECRET ...`            | Isi `SESSION_SECRET` acak ≥ 32 karakter                                                               |
| API 503 `SERVICE_MISCONFIGURED`                                 | `DATABASE_URL` memakai superuser/pemilik tabel. Gunakan role runtime (`agentic_app`)                  |
| `Role agentic_runtime belum ada` saat migrasi                   | Jalankan `bun run db:bootstrap`                                                                       |
| Peringatan "Current version of Node.js (24.3.0) is unsupported" | Muncul di `bun --bun nuxt dev` karena Bun melaporkan versi kompatibilitas Node 24.3; hanya peringatan |
