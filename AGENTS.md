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

Worker eksekusi agent: `bun run worker` (atau `AI_WORKER_INLINE=true`); test khusus `bun run test:worker`.

## Aturan

1. Backend (`api/`): import relatif, tanpa alias Nuxt; route → service → repository; `api/index.ts` sinkron, tanpa `.listen()`.
2. Data tenant hanya lewat `withTenantTransaction`; tabel tenant baru = `tenant_id NOT NULL` + `ENABLE`/`FORCE` RLS + masuk `RLS_PROTECTED_TABLES`.
3. Query pada `tenant_memberships`/`membership_roles`/`roles` dalam konteks tenant wajib filter `tenant_id`.
4. Identitas hanya dari cookie sesi; tenant pilihan klien selalu divalidasi ke database. Header `x-active-tenant`
   dari tab hanya pemeriksaan konsistensi (409 `TENANT_MISMATCH`), bukan otorisasi; di frontend pakai
   `useTenantAsyncData` dan teruskan `request` ke setiap `$api`.
5. Tanpa `any`, `@ts-ignore`, cast tidak aman, `v-html`, token di `localStorage`, secret di frontend.
6. Frontend hanya `import type` dari `api/`; tipe data diturunkan dari `$api`.
7. Schema respons mendeklarasikan status error; map status tanpa `as const`; timestamp `t.Date()`.
8. Pakai primitive shadcn-vue; jangan menampilkan data palsu. Halaman terautentikasi non-office memakai Agentic Game
   UI (`app/components/game`: GameShell/GameTopNav/GamePageHeader/GamePanel/GameTabs; token `--game-*`); jangan
   kembali ke sidebar/kartu putih SaaS; tema gelap default, terang = varian game, preferensi pengguna dihormati
   (`docs/unified-game-design-system.md`).
9. Fitur tenant-scoped baru wajib disertai test isolasi.
10. Jangan mengubah migrasi lama; buat file `db/migrations/NNNN_*.sql` baru.
11. `/office` = game layar penuh (layout `game`). Artwork = PNG asli di `public/game-assets` (tidak diubah) + runtime
    `public/game-assets-v2` (varian v2 + artwork v3 **hasil generate AI** untuk 8 pulau & latar) lewat registry
    `app/utils/game-assets.ts`; master/sumber artwork hanya di `design/` (jangan taruh PNG master di `public/`;
    `check:assets` gagal bila ada berkas yatim). Geometri jalan/slot/portal pulau dari artwork
    (`bun run assets:geometry`); jangan sunting `app/game/island-geometry.ts` manual. Jangan menulis path
    `/game-assets(-v2)/...` di komponen atau menggambar ulang aset dengan CSS. Lihat `docs/game-asset-quality-report.md`.
12. Mesin game `app/game/` (TS murni): satu loop rAF, renderer menulis DOM langsung, tanpa reaktivitas Vue per frame.
    Simulasi pratinjau berlabel SIMULASI, tanpa API tulis, bukan jalur eksekusi live; mode live hanya memetakan event
    SSE yang ada. Efek workstation diturunkan dari state agent (`workstations.ts`), ambient hanya overlay render
    (`ambient.ts`, prioritas perintah > misi > workstation > ambient). Frame robot masih prosedural (BLOCKED) — jangan
    menyebutnya artwork artist. Lihat `docs/character-animation-system.md`, `docs/office-simulation.md`,
    `docs/workstation-interactions.md`, `docs/office-ambient-behavior.md`, `docs/live-agent-event-mapping.md`.
13. Halaman harness khusus pengembangan di `app/dev/*.vue` (didaftarkan modul inline `devOnlyPages` hanya saat
    `nuxt dev`), bukan di `app/pages/`; build production harus 404.
14. Backend fail-closed: request tenant tidak dilayani sebelum gerbang kesiapan (`api/core/database/readiness.ts`)
    memverifikasi DB & role RLS (503, bukan fail-open). Pembatasan laju lewat `deps.limits` (`consume` atomik sebelum
    kerja mahal); IP klien hanya dari `api/core/http/client-ip.ts`, bukan header klien. Header keamanan HTML
    (CSP hash, HSTS opsional, no-store) di `server/plugins/security-headers.ts` — jangan menambah `unsafe-inline`
    pada `script-src`.
15. Eksekusi agent (Phase 5): tugas/run/persetujuan hanya lewat `api/modules/{tasks,runs,approvals}`; worker
    (`api/modules/runs/worker.ts`) adalah satu-satunya pemakai `withWorkerTransaction` (`app.actor='worker'`);
    transisi status memakai `TASK_TRANSITIONS`/`RUN_TRANSITIONS` (`domains/tasks/types.ts`) dengan CAS; event realtime
    hanya lewat outbox dalam transaksi yang sama (`enqueueRealtimeEvent`), payload tanpa prompt/keluaran model.
    Runtime AI lewat `AgentRuntime` (`api/core/runtime/`): tanpa SDK tak terverifikasi, tanpa tool/shell/DB untuk model,
    `fixture` bukan AI dan ditolak di production, usage hanya dari penyedia (jangan dikarang). Kunci API tidak pernah
    di-log/dikirim ke klien. Lihat `docs/task-run-lifecycle.md`, `docs/agent-runtime-adapters.md`,
    `docs/agent-worker-operations.md`, `docs/secure-agent-realtime.md`, `docs/agent-approval-workflow.md`.
