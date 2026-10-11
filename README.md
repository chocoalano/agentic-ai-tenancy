# Agentic AI Virtual Office

Platform SaaS multi-tenant tempat perusahaan merekrut, mengonfigurasi, mengelola, dan berinteraksi dengan
**AI digital employee**. Repositori ini berisi **fondasi Phase 1**: aplikasi Nuxt 4 tunggal dengan API Elysia
terintegrasi, autentikasi berbasis sesi, multi-tenancy dengan PostgreSQL Row Level Security, dan shell UI
shadcn-vue bertema futuristik korporat.

> Status: Phase 1 (fondasi). Orchestrator agent, inferensi AI, RAG, billing, dan marketplace **belum** dibangun —
> lihat [docs/next-steps.md](docs/next-steps.md).

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
bun run db:bootstrap            # membuat role + database (butuh DATABASE_ADMIN_URL)
bun run db:migrate              # migrasi skema dengan role pemilik
bun run db:migrate:test         # migrasi database test
bun run db:seed                 # data contoh KHUSUS lokal
bun run dev                     # http://localhost:3000
```

Akun seed (password default `VirtualOffice!2026`): `alya@nusantara.test` (owner PT Nusantara Digital & member
Garuda Logistik), `bima@garuda.test`, `citra@nusantara.test`.

## Perintah

| Perintah                          | Fungsi                                                                   |
| --------------------------------- | ------------------------------------------------------------------------ |
| `bun run dev`                     | Dev server Nuxt + Elysia dengan runtime Bun (`bun --bun nuxt dev`)       |
| `bun run build`                   | Build production (Nitro preset `bun`) ke `.output/`                      |
| `bun run preview`                 | Menjalankan build production dengan `.env`                               |
| `bun run start`                   | Menjalankan build production (env dari lingkungan)                       |
| `bun run typecheck`               | `nuxt typecheck` (vue-tsc) + typecheck backend mandiri                   |
| `bun run lint` / `lint:fix`       | ESLint (`@nuxt/eslint`)                                                  |
| `bun run format` / `format:check` | Prettier                                                                 |
| `bun run test`                    | Bun Test: unit + integrasi + keamanan (butuh PostgreSQL)                 |
| `bun run test:unit`               | Unit test murni (tanpa database)                                         |
| `bun run test:nuxt`               | Vitest + `@nuxt/test-utils` (komponen & composable)                      |
| `bun run test:e2e`                | E2E terhadap `.output` (jalankan `bun run build` dulu; butuh PostgreSQL) |
| `bun run check:assets`            | Verifikasi aset game Virtual Office (manifest, registry, pemakaian)      |
| `bun run assets:v2`               | Bangun ulang aset v2 + sprite sheet robot (butuh ImageMagick 7)          |
| `bun run assets:audit`            | Audit kualitas aset game (`-- --v2` untuk hasil v2)                      |
| `bun run db:bootstrap`            | Membuat role/database (idempoten)                                        |
| `bun run db:migrate`              | Menerapkan migrasi SQL (`db/migrations`)                                 |
| `bun run db:seed`                 | Seed pengembangan (ditolak bila `NODE_ENV=production`)                   |
| `bun run db:reset`                | KHUSUS lokal: hapus database, bootstrap, migrasi ulang                   |
| `bun run api:standalone`          | Menjalankan API yang sama sebagai server Elysia mandiri (port 4000)      |

## URL penting (dev)

- Aplikasi: `http://localhost:3000` — `/`, `/login`, `/register`, `/office`, `/agents`, `/settings`
- Health: `http://localhost:3000/api/v1/health`
- OpenAPI UI: `http://localhost:3000/api/openapi` · JSON: `http://localhost:3000/api/openapi/json`

## Dokumentasi

- [docs/setup.md](docs/setup.md) — instalasi environment & database
- [docs/architecture.md](docs/architecture.md) — integrasi Nuxt + Elysia, struktur, batas modul, ekstraksi layanan
- [docs/tenancy.md](docs/tenancy.md) — autentikasi, keanggotaan, konteks tenant, RLS, test isolasi
- [docs/api.md](docs/api.md) — konvensi endpoint & Eden Treaty
- [docs/next-steps.md](docs/next-steps.md) — roadmap
- Virtual Office: [kualitas aset](docs/game-asset-quality-report.md) · [animasi karakter](docs/character-animation-system.md)
  · [navigasi](docs/office-navigation-system.md) · [simulasi](docs/office-simulation.md) ·
  [pemetaan event live](docs/live-agent-event-mapping.md)
- [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) — instruksi untuk AI coding agent
