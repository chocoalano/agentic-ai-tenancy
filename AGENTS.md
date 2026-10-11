# AGENTS.md

Instruksi ringkas untuk AI coding agent. Detail lengkap: `CLAUDE.md`, `docs/architecture.md`, `docs/tenancy.md`.

## Stack

Nuxt 4 + Elysia (via `nuxt-elysia`, mount `/api`, route `/v1`) + Eden Treaty (`$api`) + shadcn-vue (New York) +
Tailwind 4 + PostgreSQL RLS via Bun SQL. Runtime & package manager: **Bun saja**.

## Wajib dijalankan sebelum selesai

```bash
bun run typecheck && bun run lint && bun run format:check && bun run check:assets
bun run test && bun run test:nuxt
bun run build && bun run test:e2e
```

## Aturan

1. Backend (`api/`): import relatif, tanpa alias Nuxt; route → service → repository; `api/index.ts` sinkron, tanpa `.listen()`.
2. Data tenant hanya lewat `withTenantTransaction`; tabel tenant baru = `tenant_id NOT NULL` + `ENABLE`/`FORCE` RLS + masuk `RLS_PROTECTED_TABLES`.
3. Query pada `tenant_memberships`/`membership_roles`/`roles` dalam konteks tenant wajib filter `tenant_id`.
4. Identitas hanya dari cookie sesi; tenant pilihan klien selalu divalidasi ke database.
5. Tanpa `any`, `@ts-ignore`, cast tidak aman, `v-html`, token di `localStorage`, secret di frontend.
6. Frontend hanya `import type` dari `api/`; tipe data diturunkan dari `$api`.
7. Schema respons mendeklarasikan status error; map status tanpa `as const`; timestamp `t.Date()`.
8. Pakai primitive shadcn-vue; jangan menampilkan data palsu.
9. Fitur tenant-scoped baru wajib disertai test isolasi.
10. Jangan mengubah migrasi lama; buat file `db/migrations/NNNN_*.sql` baru.
11. `/office` = game layar penuh (layout `game`). Artwork = PNG asli di `public/game-assets` (tidak diubah) + varian
    v2 di `public/game-assets-v2` lewat registry `app/utils/game-assets.ts`; jangan menulis path `/game-assets(-v2)/...`
    di komponen atau menggambar ulang aset dengan CSS. Lihat `docs/game-asset-quality-report.md`.
12. Mesin game `app/game/` (TS murni): satu loop rAF, renderer menulis DOM langsung, tanpa reaktivitas Vue per frame.
    Simulasi pratinjau berlabel SIMULASI, tanpa API tulis, bukan jalur eksekusi live; mode live hanya memetakan event
    SSE yang ada. Lihat `docs/character-animation-system.md`, `docs/office-simulation.md`,
    `docs/live-agent-event-mapping.md`.
