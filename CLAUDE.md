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
bun run assets:geometry     # kalibrasi ulang geometri pulau dari artwork → app/game/island-geometry.ts (ImageMagick 7)
bun run worker              # worker eksekusi agent mandiri (antrean PostgreSQL, lease, retry); alternatif AI_WORKER_INLINE=true
bun run test:worker         # test integrasi worker + persetujuan saja
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
  gerbang kesiapan **fail-closed** (`api/core/database/readiness.ts`): request tenant 503 `DATABASE_UNAVAILABLE` /
  `SERVICE_MISCONFIGURED` sampai DB terjangkau dan role RLS terverifikasi; pulih sendiri; kegagalan pemeriksaan tidak
  pernah dianggap lulus. Standalone exit 1 bila role tidak aman.
- `domains/` berisi tipe/aturan murni tanpa dependensi runtime; boleh dipakai frontend dan backend.
- Identitas agent milik platform (`agents`), bukan ID agent di penyedia AI. Akses AI hanya lewat `AgentRuntime`
  (`api/core/runtime/`: `none` default, `fixture` dev/test, `openai-compatible` → DigitalOcean Serverless Inference
  via `fetch`, tanpa SDK). Model tidak diberi tool, shell, jaringan, atau akses database; keluarannya hanya teks.
- Eksekusi tugas (Phase 5): `POST /tasks` hanya mencatat tugas + run antre (transaksi tenant + outbox); worker
  (`api/modules/runs/worker.ts`, `bun run worker` atau `AI_WORKER_INLINE=true`) mengklaim lewat
  `app.claim_agent_run` (FOR UPDATE SKIP LOCKED + lease), memanggil runtime **di luar transaksi**, dan menulis
  hasil/transisi dengan CAS (`TASK_TRANSITIONS`/`RUN_TRANSITIONS` di `domains/tasks/types.ts`). Percobaan ulang =
  run baru (`attempt+1`). Persetujuan manusia menggerbangi perilisan hasil (`agent_approvals`, `approvals.decide`).
  Lihat `docs/task-run-lifecycle.md`, `docs/agent-worker-operations.md`, `docs/agent-approval-workflow.md`.

## Aturan keamanan (wajib)

- Data tenant-scoped: kolom `tenant_id NOT NULL`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, kebijakan berbasis
  `app.current_tenant_id()`, tambahkan tabel ke `RLS_PROTECTED_TABLES` (`api/core/database/safety.ts`).
- Operasi tenant hanya lewat `withTenantTransaction(sql, context, fn)`; repository tenant menerima
  `TenantTransaction`. Jangan pernah `set_config(..., false)` atau `SET` level sesi.
- Pada `tenant_memberships`, `membership_roles`, `roles`: kebijakan SELECT memakai `OR user_id = current_user`.
  Query dalam konteks tenant pada tabel ini **wajib** memfilter `tenant_id` eksplisit.
- Jangan mengandalkan `WHERE tenant_id = ...` saja; RLS adalah lapisan utama, filter eksplisit = defense-in-depth.
- Role runtime (`DB_USERNAME`, atau `DATABASE_URL`) tidak boleh superuser/BYPASSRLS/pemilik tabel. Migrasi memakai
  role pemilik (`DB_MIGRATION_USERNAME`). Variabel database berformat Laravel (`DB_CONNECTION=pgsql`, `DB_HOST`,
  `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`; resolver `api/core/config/database-env.ts`); URL lengkap
  `DATABASE_URL`/`*_URL` tetap diterima dan menang bila ada.
  GRANT ke group role `agentic_runtime`, least privilege per tabel.
- Identitas dari cookie sesi HttpOnly saja; jangan percaya `userId`/`tenantId` dari klien. Pilihan tenant
  selalu divalidasi terhadap `tenant_memberships`. Header `x-active-tenant` dari tab hanya pemeriksaan konsistensi
  (409 `TENANT_MISMATCH` bila ≠ tenant sesi), bukan otorisasi.
- Pembatasan laju (login per email/IP, registrasi per IP, pembuatan tenant per pengguna) lewat `deps.limits`:
  `consume` atomik SEBELUM kerja mahal (Argon2/DB). IP klien hanya dari `api/core/http/client-ip.ts` (soket atau
  header internal yang ditulis `server/middleware/client-ip.ts`; `X-Forwarded-For` hanya bila `TRUSTED_PROXY=true`).
- Header keamanan HTML di `server/plugins/security-headers.ts`: CSP dengan hash skrip inline (tanpa
  `unsafe-inline`/`unsafe-eval` pada `script-src`), `frame-ancestors 'none'`, HSTS hanya `SECURITY_HSTS=true`,
  `Cache-Control: private, no-store` bila ada cookie sesi. OpenAPI mati di production (`OPENAPI_ENABLED`).
- Penulisan `tenant_memberships`/`membership_roles`/`roles`/`role_permissions` ditegakkan database lewat
  `app.has_permission('members.manage')` (migrasi 0007); pengecualian hanya bootstrap pembuat tenant.
- Tidak ada token di `localStorage`. Tidak ada secret di `runtimeConfig.public` atau kode frontend.
- SQL hanya berparameter (tagged template Bun SQL). `sql.unsafe` hanya untuk file migrasi dan DDL yang di-quote
  server-side dengan `format('%I'/'%L')`.
- Jangan `v-html` (ESLint error). Halaman terautentikasi tidak boleh di-cache publik (`routeRules` no-store).
- Izin tidak di-hardcode per pengguna; pemetaan peran → izin ada di database. `PERMISSION_KEYS` hanya kontrak tipe.
- Seed hanya lokal (`NODE_ENV=production` ditolak). Jangan membuat akun/tenant hardcoded untuk production.
- Error ke klien hanya `ApiError {code, message, requestId?, details?}`; jangan membocorkan pesan PostgreSQL.
- Worker: hanya `withWorkerTransaction` (`app.actor='worker'`, transaction-local) boleh memenuhi `app.is_worker()`;
  jangan memakainya di route/service HTTP. Fungsi SECURITY DEFINER lintas tenant hanya untuk klaim antrean, lease/
  persetujuan kedaluwarsa, dan outbox — jangan menambah yang mengembalikan data bisnis.
- Runtime AI: `AI_RUNTIME_API_KEY` tidak pernah di-log, masuk event/outbox, atau dikirim ke klien. `fixture` ditolak di
  production. Jangan mengarang usage/biaya/progres: kolom usage hanya dari respons penyedia (`null` bila tidak ada).
  Event realtime (`enqueueRealtimeEvent`) tidak memuat prompt, keluaran model, atau pesan error mentah.
- Tabel bisnis Phase 5 (`agent_tasks`, `agent_runs`, `agent_run_events`, `agent_run_outputs`, `agent_approvals`,
  `realtime_outbox`): penulisan ditegakkan RLS lewat `app.has_permission('tasks.create'|'tasks.cancel'|'approvals.decide')`
  atau `app.is_worker()`; FK komposit `(id, tenant_id)`; role runtime tanpa DELETE.

## Konvensi kode

- TypeScript strict; dilarang `any`, `@ts-ignore`, dan cast tidak aman. `@ts-expect-error` hanya dengan deskripsi.
- Respons Eden ditangani eksplisit: `const { data, error } = await $api...; if (error) ...`.
- Schema respons wajib mendeklarasikan status error. Map status (`protectedErrors`, dll.) **tanpa `as const`**
  (kunci jadi string dan merusak tipe Eden). Timestamp = `t.Date()`.
- Route root modul: path `''`, bukan `'/'`.
- Tipe data frontend diturunkan dari `$api` (`app/utils/api-types.ts`); jangan menulis ulang kontrak API.
- Data tenant di frontend: `useTenantAsyncData(name, (tenantId, signal, request) => ...)` (kunci
  `tenant:<id>:<name>`); teruskan `request` ke setiap `$api` agar header `x-active-tenant` + sinyal pembatalan ikut.
  Ganti tenant lewat `useAuth().switchTenant()`; indikasi perubahan dari luar tab (409, BroadcastChannel, fokus, SSE
  `ready`) → `useAuth().revalidate()`. Logout hanya mengosongkan state bila server mengonfirmasi (200/401).
- Halaman harness khusus pengembangan di `app/dev/*.vue` (modul inline `devOnlyPages` di `nuxt.config.ts`, hanya saat
  `nuxt dev` → `/__dev/...`); jangan menaruhnya di `app/pages/`. Build production harus 404 (diuji e2e).
- Primitive UI: gunakan shadcn-vue (`bunx shadcn-vue@2.8.2 add <komponen>`, style `new-york`). Jangan menulis
  ulang primitive; komponen kustom hanya untuk domain (`app/components/{app,office,agents,shared}`); chrome
  sistem desain ada di `app/components/shared/game` (ikut registrasi `shared`, tanpa prefix).
- **Agentic Game UI** (satu produk, satu semesta): semua halaman terautentikasi non-office memakai layout `app` =
  `GameShell` (latar `GamePageBackground`, navigasi atas `GameTopNav` dari `NAVIGATION`, `GameMenu` < 1280px) dan
  komponen `GamePageHeader`/`GamePanel`/`GameTabs`/`GameInfoRow`/`GameLoadingState`; identitas area dari
  `NavigationItem.identity` (mis. "Commander Control Center"). Jangan menghidupkan kembali sidebar/kartu putih SaaS,
  jangan membuat modul palsu, kontrol yang belum didukung backend = `disabled` + alasan. SATU identitas gelap
  HUD /office untuk seluruh aplikasi (tanpa mode terang; `GameShell`/layout memaksa `dark`, halaman manajemen memakai
  `colorMode: 'dark'`); nilai HUD dipakai ulang lewat utilitas `hud-*` (office-scene.css), `game-panel` = `hud-panel`,
  Button/Badge shadcn = `game-btn-*`/gaya `OfficeStatusBadge`; preferensi gerakan lewat `useUiPreferences` (cookie
  `aivo-motion`). Lihat
  `docs/unified-game-design-system.md`, `docs/game-ui-component-library.md`.
- Warna lewat token semantik (`bg-game-*`, `bg-primary`, `text-agent-working`, ...) di `app/assets/css/tailwind.css`;
  token shadcn & brand adalah alias token `--game-*`. Tanpa warna hardcoded di komponen.
- Zod di Vue SFC: `import * as z from 'zod'` (named import gagal di Vite SSR).
- Jangan menampilkan data palsu (status runtime, progres, biaya). Fitur belum ada → empty/disabled state jujur.
- `/office` = game layar penuh dengan layout `game` (tanpa sidebar/topbar; navigasi lewat menu game). Artwork = PNG
  asli asset pack "Neon Mission Map" di `public/game-assets` (tidak diubah) + runtime `public/game-assets-v2`
  (varian perbaikan v2 via `bun run assets:v2` + artwork v3 untuk 8 pulau utama & latar kota yang **dihasilkan AI**,
  master PNG-nya di `design/office-reconstruction/`, tidak di-deploy), diakses lewat registry
  `app/utils/game-assets.ts`. Jangan menaruh sumber/PNG master di `public/` (`check:assets` menolak berkas yatim).
  Jangan menulis path `/game-assets(-v2)/...` di komponen atau menggambar ulang robot/pulau dengan CSS/emoji/ikon.
  Aset v2 BUKAN aset produksi (`docs/game-asset-quality-report.md`). Semua objek dunia memakai koordinat 1672×941
  (`app/utils/office-layout.ts`); hitungan yang dirender SSR harus deterministik antar mesin JS (tanpa `Math.hypot`,
  `**`, trigonometri pada nilai yang dirender). Geometri jalan/slot/portal per pulau = kontrak `IslandArtGeometry`
  yang dikalibrasi dari artwork (`bun run assets:geometry` → `app/game/island-geometry.ts`, jangan disunting manual;
  Research Lab & Training Center dekoratif; overlay dev `/office?debug=geometry`). Pack mentah ada di
  `design/atlas_game_assets_pack/`. Detail: `docs/asset-integration-report.md`, `docs/office-navigation-system.md`.
- Mesin game di `app/game/` (TS murni, tanpa Vue/DOM): dunia/navigasi, `OfficeEngine`, state machine aktivitas,
  simulasi, perintah, adaptor live, renderer DOM. SATU loop `requestAnimationFrame` (`useOfficeEngine`); renderer
  menulis gaya DOM langsung — jangan memicu reaktivitas Vue per frame atau membuat loop per komponen. Robot memakai
  sprite sheet `agents/{karakter}/sheet.webp` + `atlas.json` dengan kontrak `app/game/animation-spec.ts` (frame saat
  ini prosedural = prototipe; tanpa tool generasi gambar/artist statusnya BLOCKED — jangan menyebutnya frame
  artist; spesifikasi handoff di `docs/game-asset-production.md`). Detail: `docs/character-animation-system.md`,
  `docs/office-navigation-system.md`.
- Lapisan "kantor hidup" (Phase 4): `app/game/workstations.ts` = aktivitas & efek per stasiun yang DITURUNKAN dari
  state agent (bukan state kedua; `workstationVisuals`), `app/game/ambient.ts` = perilaku siaga deterministik
  (overlay render saja; prioritas perintah > misi > workstation > ambient; ikut jam mesin; mati pada reduced motion),
  penerimaan perintah `engine.moveTo(key, target, plan, { acknowledgeSeconds })` (thinking → berangkat), frame jalan
  berbasis jarak (`STRIDE_UNITS`), `heading` 4 arah (fallback: baris kanan + cermin). Efek dirender
  `OfficeWorkstationEffects.vue` per snapshot (fx pack + glyph hologram prosedural), bukan per frame. Lihat
  `docs/workstation-interactions.md`, `docs/office-ambient-behavior.md`, `docs/game-performance.md`.
- Mode pratinjau (`app/game/simulation.ts`, `app/utils/office-preview.ts`) hanya simulasi frontend berlabel
  SIMULASI/DEMO: tidak pernah memanggil API tulis, tidak menjadi jalur eksekusi live, tidak mengarang balasan AI.
  Mode live memetakan event SSE nyata (`ready`, `heartbeat`, `closed`, `agent.*`, `approval.*`) lewat
  `mapRealtimeEvent` (`app/game/live-adapter.ts`) ke aksi presentasi saja; status bisnis selalu dibaca ulang dari API.
  Perintah bisnis yang ada: Tugaskan (`POST /tasks`, dengan opsi persetujuan), Batalkan, Setujui/Tolak, Lihat hasil;
  `chat`/`pause`/`resume` tetap nonaktif sampai endpoint-nya ada (`app/game/commands.ts`,
  `docs/live-agent-event-mapping.md`, `docs/game-live-event-integration.md`, `docs/office-simulation.md`). Runtime
  `fixture` wajib berlabel "Fixture (bukan AI)" di UI; SSE menutup koneksi (`closed`) saat otorisasi berubah
  (`docs/secure-agent-realtime.md`).
- Pemetaan agent → karakter/stasiun hanya presentasi (`app/utils/office-layout.ts`); nama agent tidak diubah.

## Test

- Bun Test untuk backend; Vitest (`tests/nuxt/`) untuk komponen/composable Nuxt.
- Test DB memakai `DB_TEST_DATABASE` (role `DB_USERNAME` & `DB_MIGRATION_USERNAME` yang sama) atau
  `TEST_DATABASE_URL`/`TEST_DATABASE_MIGRATION_URL`; preload menerapkan migrasi.
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
