# Agentic AI Virtual Office

Platform SaaS multi-tenant tempat perusahaan merekrut, mengonfigurasi, mengelola, dan berinteraksi dengan
**AI digital employee**. Repositori ini berisi **fondasi Phase 1**: aplikasi Nuxt 4 tunggal dengan API Elysia
terintegrasi, autentikasi berbasis sesi, multi-tenancy dengan PostgreSQL Row Level Security, dan shell UI
shadcn-vue bertema futuristik korporat.

> Status: Phase 5 (eksekusi agent live). Tugas nyata → worker PostgreSQL → runtime AI yang dapat diganti →
> persetujuan manusia → event realtime ke game. Penyedia AI nyata (DigitalOcean, OpenAI-compatible) terimplementasi
> tetapi **belum diverifikasi** tanpa kredensial; adapter `fixture` hanya untuk dev/test (bukan AI). RAG, billing,
> marketplace **belum** dibangun — lihat [docs/phase5-live-agent-execution.md](docs/phase5-live-agent-execution.md)
> dan [docs/next-steps.md](docs/next-steps.md).

## Teknologi

| Lapisan         | Teknologi                                                             |
| --------------- | --------------------------------------------------------------------- |
| Framework       | Nuxt 4.6 (Vue 3.5, Composition API, direktori `app/`)                 |
| Runtime & PM    | Bun 1.3 (dev, build, production, test)                                |
| Backend API     | ElysiaJS 1.4, di-mount di `/api` lewat `nuxt-elysia`                  |
| Klien bertipe   | Eden Treaty (`$api`) — tipe diinferensi dari aplikasi Elysia          |
| UI              | shadcn-vue (style New York v4) + shadcn-nuxt, Reka UI, Tailwind CSS 4 |
| Database        | PostgreSQL (diuji pada 18.4) via Bun SQL, RLS, pgvector disiapkan     |
| Dokumentasi API | `@elysia/openapi` (Scalar) di `/api/openapi`                          |
| Test            | Bun Test (unit/integrasi/keamanan/e2e) + Vitest + `@nuxt/test-utils`  |

Versi persis dan alasan pemilihannya ada di [docs/architecture.md](docs/architecture.md#versi-paket-dan-keputusan-kompatibilitas).

## Mulai cepat

Prasyarat: Bun ≥ 1.3, PostgreSQL ≥ 15 (pgvector opsional), akses role superuser lokal untuk bootstrap.

```bash
bun install
cp .env.example .env            # lalu isi password & SESSION_SECRET (lihat docs/setup.md)
bun run db:bootstrap            # membuat role + database (butuh DB_ADMIN_USERNAME atau DATABASE_ADMIN_URL)
bun run db:migrate              # migrasi skema dengan role pemilik
bun run db:migrate:test         # migrasi database test
bun run db:seed                 # data contoh KHUSUS lokal
bun run dev                     # http://localhost:3000
```

Akun seed (password default `VirtualOffice!2026`): `alya@nusantara.test` (owner PT Nusantara Digital & member
Garuda Logistik), `bima@garuda.test`, `citra@nusantara.test`.

## Perintah

| Perintah                          | Fungsi                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun run dev`                     | Dev server Nuxt + Elysia dengan runtime Bun (`bun --bun nuxt dev`)                                   |
| `bun run build`                   | Build production (Nitro preset `bun`) ke `.output/`                                                  |
| `bun run preview`                 | Menjalankan build production dengan `.env`                                                           |
| `bun run start`                   | Menjalankan build production (env dari lingkungan)                                                   |
| `bun run typecheck`               | `nuxt typecheck` (vue-tsc) + typecheck backend mandiri                                               |
| `bun run lint` / `lint:fix`       | ESLint (`@nuxt/eslint`)                                                                              |
| `bun run format` / `format:check` | Prettier                                                                                             |
| `bun run test`                    | Bun Test: unit + integrasi + keamanan (butuh PostgreSQL)                                             |
| `bun run test:unit`               | Unit test murni (tanpa database)                                                                     |
| `bun run test:nuxt`               | Vitest + `@nuxt/test-utils` (komponen & composable)                                                  |
| `bun run test:e2e`                | E2E terhadap `.output` (jalankan `bun run build` dulu; butuh PostgreSQL)                             |
| `bun run check:assets`            | Verifikasi aset game Virtual Office (manifest, registry, pemakaian)                                  |
| `bun run assets:v2`               | Bangun ulang aset v2 + sprite sheet robot (butuh ImageMagick 7)                                      |
| `bun run assets:audit`            | Audit kualitas aset game (`-- --v2` untuk hasil v2)                                                  |
| `bun run assets:geometry`         | Kalibrasi ulang geometri pulau dari artwork (butuh ImageMagick 7)                                    |
| `bun run db:bootstrap`            | Membuat role/database (idempoten)                                                                    |
| `bun run db:migrate`              | Menerapkan migrasi SQL (`db/migrations`); `db:migrate:test` untuk DB test                            |
| `bun run db:seed`                 | Seed pengembangan (ditolak bila `NODE_ENV=production`)                                               |
| `bun run db:reset`                | KHUSUS lokal: hapus database, bootstrap, migrasi ulang                                               |
| `bun run api:standalone`          | Menjalankan API yang sama sebagai server Elysia mandiri (port 4000)                                  |
| `bun run worker`                  | Worker eksekusi agent mandiri (antrean PostgreSQL, lease, retry); alternatif `AI_WORKER_INLINE=true` |
| `bun run test:worker`             | Test integrasi worker/persetujuan saja                                                               |

## URL penting (dev)

- Aplikasi: `http://localhost:3000` — `/`, `/login`, `/register`, `/office`, `/agents`, `/tasks`, `/settings`
- Health: `http://localhost:3000/api/v1/health`
- OpenAPI UI: `http://localhost:3000/api/openapi` · JSON: `http://localhost:3000/api/openapi/json` (hanya
  development/test; mati di production kecuali `OPENAPI_ENABLED=true`)
- Harness QA visual Virtual Office: `http://localhost:3000/__dev/office-visual-qa` (hanya `nuxt dev`, tidak ada di
  build production) · overlay geometri pulau: `/office?debug=geometry`

## Dokumentasi

- [docs/setup.md](docs/setup.md) — instalasi environment & database
- [docs/architecture.md](docs/architecture.md) — integrasi Nuxt + Elysia, struktur, batas modul, ekstraksi layanan
- [docs/tenancy.md](docs/tenancy.md) — autentikasi, keanggotaan, konteks tenant, RLS, test isolasi
- [docs/api.md](docs/api.md) — konvensi endpoint & Eden Treaty
- [docs/next-steps.md](docs/next-steps.md) — roadmap
- Virtual Office: [kualitas aset](docs/game-asset-quality-report.md) · [integrasi aset](docs/asset-integration-report.md)
  · [animasi karakter](docs/character-animation-system.md) · [navigasi & geometri pulau](docs/office-navigation-system.md)
  · [simulasi](docs/office-simulation.md) · [pemetaan event live & konsistensi tenant](docs/live-agent-event-mapping.md)
  · [interaksi workstation](docs/workstation-interactions.md) · [perilaku ambient](docs/office-ambient-behavior.md)
  · [performa](docs/game-performance.md) · [QA visual](docs/frontend-visual-qa.md)
  · [produksi aset](docs/game-asset-production.md) · [laporan Phase 4](docs/phase4-living-office-report.md)
- Agentic Game UI (desain terpadu): [sistem desain](docs/unified-game-design-system.md)
  · [pustaka komponen](docs/game-ui-component-library.md) · [audit rute](docs/frontend-route-design-audit.md)
  · [QA visual terpadu](docs/unified-frontend-visual-qa.md)
- Eksekusi agent live (Phase 5): [laporan & status](docs/phase5-live-agent-execution.md)
  · [siklus hidup tugas/run](docs/task-run-lifecycle.md) · [runtime & adapter AI](docs/agent-runtime-adapters.md)
  · [operasi worker](docs/agent-worker-operations.md) · [realtime aman](docs/secure-agent-realtime.md)
  · [persetujuan manusia](docs/agent-approval-workflow.md) · [integrasi event ke game](docs/game-live-event-integration.md)
- [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) — instruksi untuk AI coding agent
