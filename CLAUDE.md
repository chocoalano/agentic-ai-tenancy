# CLAUDE.md — Agentic AI Virtual Office

Instruksi persisten untuk sesi Claude Code di repositori ini. Tulis dokumentasi dan laporan dalam
**Bahasa Indonesia**; kode, identifier, dan commit message boleh berbahasa Inggris.

## Ringkasan proyek

SaaS multi-tenant untuk AI digital employee. Phase 1 = fondasi: satu aplikasi Nuxt 4 dengan API Elysia di-mount
lewat `nuxt-elysia` di `/api`, Eden Treaty (`$api`), shadcn-vue + Tailwind 4, PostgreSQL + RLS via Bun SQL.
Lihat `docs/architecture.md` dan `docs/tenancy.md` sebelum mengubah apa pun yang menyentuh auth/tenancy.

## Perintah

```bash
bun install
bun run dev                 # bun --bun nuxt dev
bun run typecheck           # nuxt typecheck + tsc -p tsconfig.backend.json
bun run lint                # eslint
bun run format:check        # prettier
bun run test                # Bun Test: unit + integration + security (butuh PostgreSQL test)
bun run test:unit           # tanpa database
bun run test:nuxt           # Vitest + @nuxt/test-utils
bun run build && bun run test:e2e
bun run db:bootstrap | db:migrate | db:migrate:test | db:seed | db:reset
bun run check:assets        # verifikasi aset game Virtual Office
bun run assets:v2           # bangun ulang aset v2 + sprite sheet robot (butuh ImageMagick 7)
bun run assets:audit        # audit kualitas aset (alpha, halo, serpihan, terpotong); -- --v2 untuk hasil v2
```

Sebelum menyatakan pekerjaan selesai: `typecheck`, `lint`, `format:check`, `check:assets`, `test`, `test:nuxt`,
`build`, `test:e2e` harus lulus. Jangan mengklaim sesuatu berfungsi tanpa menjalankannya.

## Prinsip arsitektur

- Modular monolith; backend adalah sumber kebenaran; tanpa microservice/Kubernetes.
- Alur: route (Elysia) → service → repository → PostgreSQL. Route tidak menulis SQL; repository tidak membuka
  transaksi sendiri dan tidak membaca `process.env`.
- `api/` harus tetap dapat diekstrak: **import relatif saja**, tanpa alias/auto-import Nuxt, konfigurasi dari
  `api/core/config/env.ts`. `createApi(deps)` tidak boleh bergantung pada Nuxt/Nitro.
- `api/index.ts` (factory nuxt-elysia) harus **sinkron** dan tidak memanggil `.listen()`. I/O startup masuk ke
  readiness gate (`api/container.ts`).
- `domains/` berisi tipe/aturan murni tanpa dependensi runtime; boleh dipakai frontend dan backend.
- Identitas agent milik platform (`agents`), bukan ID agent di penyedia AI. Akses AI kelak lewat AI Runtime
  Interface + adapter.

## Aturan keamanan (wajib)

- Data tenant-scoped: kolom `tenant_id NOT NULL`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, kebijakan berbasis
  `app.current_tenant_id()`, tambahkan tabel ke `RLS_PROTECTED_TABLES` (`api/core/database/safety.ts`).
- Operasi tenant hanya lewat `withTenantTransaction(sql, context, fn)`; repository tenant menerima
  `TenantTransaction`. Jangan pernah `set_config(..., false)` atau `SET` level sesi.
- Pada `tenant_memberships`, `membership_roles`, `roles`: kebijakan SELECT memakai `OR user_id = current_user`.
  Query dalam konteks tenant pada tabel ini **wajib** memfilter `tenant_id` eksplisit.
- Jangan mengandalkan `WHERE tenant_id = ...` saja; RLS adalah lapisan utama, filter eksplisit = defense-in-depth.
- Role runtime (`DATABASE_URL`) tidak boleh superuser/BYPASSRLS/pemilik tabel. Migrasi memakai role pemilik.
  GRANT ke group role `agentic_runtime`, least privilege per tabel.
- Identitas dari cookie sesi HttpOnly saja; jangan percaya `userId`/`tenantId` dari klien. Pilihan tenant
  selalu divalidasi terhadap `tenant_memberships`.
- Tidak ada token di `localStorage`. Tidak ada secret di `runtimeConfig.public` atau kode frontend.
- SQL hanya berparameter (tagged template Bun SQL). `sql.unsafe` hanya untuk file migrasi dan DDL yang di-quote
  server-side dengan `format('%I'/'%L')`.
- Jangan `v-html` (ESLint error). Halaman terautentikasi tidak boleh di-cache publik (`routeRules` no-store).
- Izin tidak di-hardcode per pengguna; pemetaan peran → izin ada di database. `PERMISSION_KEYS` hanya kontrak tipe.
- Seed hanya lokal (`NODE_ENV=production` ditolak). Jangan membuat akun/tenant hardcoded untuk production.
- Error ke klien hanya `ApiError {code, message, requestId?, details?}`; jangan membocorkan pesan PostgreSQL.

## Konvensi kode

- TypeScript strict; dilarang `any`, `@ts-ignore`, dan cast tidak aman. `@ts-expect-error` hanya dengan deskripsi.
- Respons Eden ditangani eksplisit: `const { data, error } = await $api...; if (error) ...`.
- Schema respons wajib mendeklarasikan status error. Map status (`protectedErrors`, dll.) **tanpa `as const`**
  (kunci jadi string dan merusak tipe Eden). Timestamp = `t.Date()`.
- Route root modul: path `''`, bukan `'/'`.
- Tipe data frontend diturunkan dari `$api` (`app/utils/api-types.ts`); jangan menulis ulang kontrak API.
- Data tenant di frontend: `useTenantAsyncData(name, handler)` (kunci `tenant:<id>:<name>`); setelah ganti
  tenant panggil `useAuth().switchTenant()` (membuang cache `tenant:*`).
- Primitive UI: gunakan shadcn-vue (`bunx shadcn-vue@2.8.2 add <komponen>`, style `new-york`). Jangan menulis
  ulang primitive; komponen kustom hanya untuk domain (`app/components/{app,office,agents,shared}`).
- Warna lewat token semantik (`bg-primary`, `text-agent-working`, `glass`, ...) di `app/assets/css/tailwind.css`.
- Zod di Vue SFC: `import * as z from 'zod'` (named import gagal di Vite SSR).
- Jangan menampilkan data palsu (status runtime, progres, biaya). Fitur belum ada → empty/disabled state jujur.
- `/office` = game layar penuh dengan layout `game` (tanpa sidebar/topbar; navigasi lewat menu game). Artwork = PNG
  asli asset pack "Neon Mission Map" di `public/game-assets` (tidak diubah) + varian perbaikan v2 di
  `public/game-assets-v2` (`bun run assets:v2`), diakses lewat registry `app/utils/game-assets.ts`. Jangan menulis path
  `/game-assets(-v2)/...` di komponen atau menggambar ulang robot/pulau dengan CSS/emoji/ikon. Aset v2 BUKAN aset
  produksi (status kualitas: TERBLOKIR, `docs/game-asset-quality-report.md`). Semua objek dunia memakai koordinat 1672×941
  (`app/utils/office-layout.ts`); hitungan yang dirender SSR harus deterministik antar mesin JS (tanpa `Math.hypot`,
  `**`, trigonometri pada nilai yang dirender). Pack mentah ada di `design/atlas_game_assets_pack/`.
  Detail: `docs/asset-integration-report.md`.
- Mesin game di `app/game/` (TS murni, tanpa Vue/DOM): dunia/navigasi, `OfficeEngine`, state machine aktivitas,
  simulasi, perintah, adaptor live, renderer DOM. SATU loop `requestAnimationFrame` (`useOfficeEngine`); renderer
  menulis gaya DOM langsung — jangan memicu reaktivitas Vue per frame atau membuat loop per komponen. Robot memakai
  sprite sheet `agents/{karakter}/sheet.webp` + `atlas.json` dengan kontrak `app/game/animation-spec.ts` (frame saat
  ini prosedural = prototipe). Detail: `docs/character-animation-system.md`, `docs/office-navigation-system.md`.
- Mode pratinjau (`app/game/simulation.ts`, `app/utils/office-preview.ts`) hanya simulasi frontend berlabel
  SIMULASI/DEMO: tidak pernah memanggil API tulis, tidak menjadi jalur eksekusi live, tidak mengarang balasan AI.
  Mode live hanya memetakan event SSE yang ada (`ready`, `heartbeat`) dan data API; perintah bisnis tetap nonaktif
  sampai endpoint-nya ada (`app/game/commands.ts`, `docs/live-agent-event-mapping.md`, `docs/office-simulation.md`).
- Pemetaan agent → karakter/stasiun hanya presentasi (`app/utils/office-layout.ts`); nama agent tidak diubah.

## Test

- Bun Test untuk backend; Vitest (`tests/nuxt/`) untuk komponen/composable Nuxt.
- Test DB memakai `TEST_DATABASE_URL`/`TEST_DATABASE_MIGRATION_URL`; preload menerapkan migrasi.
- Data test dibuat unik per test (email/slug acak) — tidak perlu truncate.
- **Jebakan Bun:** jangan meneruskan objek `Query` Bun SQL mentah ke `expect(...).rejects`; runner menggantung.
  Bungkus: `await expect(run(() => sql\`...\`)).rejects.toThrow()`.
- Fitur tenant-scoped baru wajib punya test isolasi (lintas tenant → 404/403, RLS langsung).

## Dependensi yang sengaja di-pin

- `typescript ~6.0` (TS 7 tidak punya compiler API untuk vue-tsc).
- `@elysiajs/eden` (bukan `@elysia/eden`) karena template nuxt-elysia meng-hardcode import tersebut.
- `nuxt-elysia 1.0.0-beta.1` + shim `app/types/nuxt-elysia-compat.d.ts`.
- Jangan memakai npm/pnpm/yarn; hanya `bun.lock`.

## Batas realtime

SSE berfungsi melalui mount. WebSocket native Elysia **tidak** berfungsi melalui mount nuxt-elysia (terverifikasi:
400 "Expected a websocket connection"); gunakan layanan Bun/Elysia mandiri (`api/standalone.ts` sebagai dasar)
dan implementasikan `OfficeRealtimeTransport`.
