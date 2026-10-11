# Arsitektur

## Gambaran umum

Satu aplikasi Nuxt 4 dengan API Elysia terintegrasi (modular monolith). Backend adalah sumber kebenaran; frontend
hanya mencerminkan state dari API.

```text
Browser
  → Nuxt 4 (SSR + SPA, app/)
  → Eden Treaty ($api dari nuxt-elysia)
  → nuxt-elysia (Nitro plugin, mount di /api)
  → Elysia API (api/app.ts, route /v1/*)
  → Application services (api/modules/*/service.ts)
  → Repositories (api/modules/*/repository.ts, butuh scope transaksi)
  → PostgreSQL (Bun SQL, RLS)
```

Jalur eksekusi AI (fase berikutnya):

```text
Agent domain → Agent Orchestrator → AI Runtime Interface → Provider Adapter → DigitalOcean AI / provider lain
```

Identitas permanen agent adalah baris `agents` milik platform — **bukan** ID agent terkelola di penyedia AI.
Penyedia hanya diakses melalui adapter yang dapat diganti.

## Integrasi Nuxt ↔ Elysia ↔ Eden

### Cara kerja `nuxt-elysia` (dibaca langsung dari kode modul)

1. **Server plugin Nitro** memanggil factory `api/index.ts` sekali saat start, lalu:
   - menyimpan instance Elysia di `event.context._elysiaApp` untuk setiap request;
   - membungkusnya dengan `new Elysia({ prefix: '/api' })` dan memasang `fromWebHandler(app.handle)` di **awal**
     stack h3 (`nitroApp.h3App.stack.unshift`). Request `/api/*` ditangani Elysia sebelum Nuxt renderer.
2. **Client plugin Nuxt** membuat Eden Treaty `$api`:
   - **SSR**: `treaty(event.context._elysiaApp)` → memanggil `app.handle()` **in-process** (tanpa HTTP), dengan
     header `Cookie` browser diteruskan (`treatyRequestHeaders: ['Cookie']`).
   - **Browser**: `treaty(window.location.origin + '/api')` → `fetch` biasa.
3. **Type template** menurunkan tipe `$api` dari `Awaited<ReturnType<typeof createElysiaApp>>`. Tidak ada kontrak
   API yang ditulis manual di frontend (`app/utils/api-types.ts` hanya menurunkan tipe dari `$api`).

### Path

| Path                | Isi                                  |
| ------------------- | ------------------------------------ |
| `/api/v1/*`         | Route bisnis berversi                |
| `/api/openapi`      | UI Scalar (terverifikasi dev & prod) |
| `/api/openapi/json` | Spesifikasi OpenAPI 3                |

### Factory sinkron + readiness gate

Nitro 2 **tidak menunggu plugin async**. Saat factory melakukan I/O (mis. query database), request pertama dapat
masuk sebelum `_elysiaApp` terpasang — terobservasi sebagai `TypeError ... undefined.location` di plugin klien
saat SSR. Karena itu `api/index.ts` sengaja **sinkron**: konfigurasi divalidasi sinkron (env tidak valid →
server gagal start), sedangkan verifikasi role database berjalan sekali di latar dan setiap request API menunggu
hasilnya (`createReadinessGate`). Bila role tidak aman, API menolak semua request dengan 503 (fail-closed).
Test e2e memverifikasi bahwa request pertama setelah start sudah dilayani Elysia.

## Struktur folder

```text
api/                    Backend Elysia (tanpa alias/auto-import Nuxt; import relatif)
├── index.ts            Factory nuxt-elysia (sinkron, tanpa .listen())
├── standalone.ts       Menjalankan API yang sama sebagai server Elysia mandiri
├── app.ts              createApi(deps): perakitan plugin & route, export type Api
├── container.ts        Komposisi dependensi manual + readiness gate
├── core/
│   ├── config/         Validasi env server
│   ├── database/       Pool Bun SQL, helper transaksi (user/tenant), normalisasi error, cek role RLS
│   ├── auth/           Password (Argon2id), token sesi (HMAC), cookie, guard (macro auth/tenant)
│   ├── tenancy/        resolveTenantContext (keanggotaan → peran → izin)
│   ├── security/       Proteksi CSRF (Fetch Metadata/Origin), throttle login
│   ├── http/           Plugin global (request id, header, CSRF, error), logger
│   └── errors/         AppError + schema ApiError
├── modules/            health, auth, users, tenants, memberships, agents, realtime
└── shared/             Schema TypeBox bersama
domains/                Tipe & aturan domain murni (dipakai backend & frontend)
db/                     migrations/*.sql, migrator.ts, seeds/development.ts
app/                    Frontend Nuxt (pages, layouts, components, composables, utils, middleware, plugins)
├── components/ui/      Primitive shadcn-vue (hasil CLI, jangan ditulis ulang)
├── components/{app,office,agents,shared}/  Komponen domain
tests/                  unit · integration · security · e2e (Bun Test) · nuxt (Vitest)
scripts/                db-bootstrap, db-migrate, db-drop
```

### Batas modul

| Lapisan    | Boleh memanggil                               | Tidak boleh                                                     |
| ---------- | --------------------------------------------- | --------------------------------------------------------------- |
| Route      | service, guard, schema                        | SQL langsung                                                    |
| Service    | repository, helper transaksi                  | objek `Request`/cookie                                          |
| Repository | SQL berparameter melalui scope transaksi      | membuat transaksi sendiri / membaca `process.env`               |
| `domains/` | tidak ada dependensi runtime                  | import dari `api/`, `app/`, Bun, Nuxt                           |
| `app/`     | `$api`, `domains/`, `import type` dari `api/` | import nilai dari `api/`, `db/`, `scripts/` (ditegakkan ESLint) |

Repository tenant-scoped hanya menerima `TenantTransaction`, yang hanya dapat dibuat oleh
`withTenantTransaction` (konstruktor dilindungi token simbol privat). Akibatnya query data tenant **secara tipe**
tidak dapat dijalankan di luar konteks tenant yang sudah diverifikasi.

## Ekstraksi layanan di masa depan

`createApi(deps)` tidak bergantung pada Nuxt/Nitro, membaca konfigurasi dari `process.env`, dan semua import
backend bersifat relatif. `tsconfig.backend.json` mengetik ulang seluruh backend sebagai kode Bun murni.
`bun run api:standalone` menjalankan aplikasi yang sama sebagai server Elysia mandiri — inilah jalur ekstraksi
(mis. gateway realtime WebSocket, worker orchestrator) tanpa menulis ulang domain logic.

## Realtime

| Kanal              | Status Phase 1                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| SSE                | **Berfungsi** di dev & production melalui mount: `GET /api/v1/realtime/stream` (auth + tenant) |
| WebSocket (Elysia) | **Tidak berfungsi melalui mount nuxt-elysia** (terverifikasi), berfungsi di mode standalone    |

Hasil eksperimen WebSocket (route `.ws()` probe sementara, sudah dihapus):

| Mode                                   | Hasil                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `bun --bun nuxt dev` (mount)           | Handshake gagal                                                               |
| `bun .output/server/index.mjs` (mount) | Request mencapai Elysia, tetapi dibalas `400 Expected a websocket connection` |
| `bun api/standalone.ts`                | Upgrade sukses, pesan echo diterima                                           |

Penyebab: Elysia di-mount sebagai handler web (`app.handle(request)`) tanpa server Bun miliknya sendiri, sehingga
`server.upgrade()` tidak tersedia; upgrade WebSocket di Nitro ditangani di luar stack h3 (crossws), bukan oleh
handler `fromWebHandler`. Keputusan: SSE untuk Phase 1; kontrak event (`domains/office/realtime.ts`) dan antarmuka
`OfficeRealtimeTransport` disiapkan agar frontend dapat beralih ke gateway WebSocket Bun/Elysia mandiri tanpa
mengubah konsumen. Valkey/event bus terdistribusi belum diperkenalkan.

## Versi paket dan keputusan kompatibilitas

| Paket                                  | Versi                     | Catatan                                                            |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| bun                                    | 1.3.10                    | Runtime dev/build/prod/test                                        |
| nuxt / @nuxt/kit                       | 4.6.1                     | Nitro 2.13.4, h3 1.15.11, Vite 8.3.4, Vue 3.5.43, vue-router 5.4.0 |
| elysia                                 | 1.4.30                    | Satu salinan di `node_modules` (syarat inferensi Eden)             |
| @elysiajs/eden                         | 1.4.9                     | Lihat keputusan Eden di bawah                                      |
| @elysia/openapi                        | 1.4.16                    | Paket yang didokumentasikan Elysia saat ini                        |
| nuxt-elysia                            | 1.0.0-beta.1              | Dibangun untuk `@nuxt/kit ^4`; 0.2.0 menarik kit v3                |
| typescript                             | 6.0.3                     | TS 7 (native) tidak menyediakan compiler API untuk vue-tsc         |
| vue-tsc                                | 3.3.13                    |                                                                    |
| tailwindcss / @tailwindcss/vite        | 4.3.3                     |                                                                    |
| shadcn-nuxt / shadcn-vue CLI           | 2.8.2                     | Style `new-york` (registry `new-york-v4`)                          |
| reka-ui                                | 2.11.0                    | Primitive di balik shadcn-vue                                      |
| @lucide/vue                            | 1.55.0                    | Ikon; `lucide-vue-next` sudah deprecated                           |
| vee-validate / @vee-validate/zod / zod | 4.15.1 / 4.15.1 / 3.25.76 | Dipasang CLI shadcn untuk komponen Form                            |
| @nuxtjs/color-mode                     | 4.0.1                     | Tema gelap default                                                 |
| vitest / @nuxt/test-utils / happy-dom  | 4.1.11 / 4.3.3 / 20.14.6  |                                                                    |
| eslint / @nuxt/eslint / prettier       | 10.12.0 / 1.17.0 / 3.9.10 |                                                                    |
| PostgreSQL / pgvector                  | 18.4 / 0.8.7              | Diuji lokal                                                        |

### Keputusan: Eden

Dokumentasi Elysia kini memakai `@elysia/eden`, sedangkan `nuxt-elysia` (peer dependency **dan** template plugin
klien) meng-hardcode `import { treaty } from '@elysiajs/eden'`. Isi `dist/` `@elysia/eden@1.4.10` dan
`@elysiajs/eden@1.4.9` identik (hanya README & package.json berbeda). Agar tidak ada dua implementasi Eden, proyek
memasang **hanya `@elysiajs/eden`**, yang juga dipakai test.

### Keputusan: TypeScript 6

`typescript@latest` adalah 7.0.2 (compiler native). Paket tersebut hanya mengekspor `lib/version.cjs` dan API
`unstable/*`, tanpa compiler API klasik yang dibutuhkan vue-tsc/Volar. Proyek mem-pin `~6.0.3`.

### Keputusan: style shadcn-vue "New York"

CLI 2.8.2 hanya menerima style baru (`vega`, `nova`, …) pada `init`, tetapi `add` tetap mendukung
`"style": "new-york"` (dipetakan ke registry `new-york-v4` untuk Tailwind v4). Proyek di-init dengan `vega`
(menghasilkan `lib/utils.ts`, token CSS, `tw-animate-css`), lalu `components.json` dikembalikan ke `new-york`
dan seluruh komponen dipasang dari registry `new-york-v4`. Import Google Fonts yang ditambahkan init diganti font
self-hosted (`@fontsource-variable/*`).

### Masalah kompatibilitas yang ditemukan & solusinya

| Masalah                                                                                                              | Dampak                                                         | Solusi (teruji)                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Template `nuxt-elysia` mengaugmentasi `'nuxt/schema'`; di Nuxt 4.6 augmentasi itu tidak mengalir ke `useAppConfig()` | `nuxt typecheck` gagal di `.nuxt/nuxt-elysia/client-plugin.ts` | `app/types/nuxt-elysia-compat.d.ts` mengaugmentasi `CustomAppConfig` milik `'@nuxt/schema'` (tipe saja) |
| Nitro 2 tidak menunggu plugin async                                                                                  | Race pada request pertama                                      | Factory sinkron + readiness gate                                                                        |
| Map status error `{401: …} as const` yang di-spread ke `response`                                                    | Status Eden menjadi `"401"` (string), `error` bertipe `{}`     | Objek tanpa `as const` (`api/core/errors/schemas.ts`)                                                   |
| Eden mengonversi string ISO-8601 menjadi `Date` meski schema `t.String()`                                            | Tipe statis tidak sesuai runtime                               | Semua timestamp dideklarasikan `t.Date()`                                                               |
| `import { z } from 'zod'` di Vite SSR                                                                                | 500 di halaman form                                            | `import * as z from 'zod'`                                                                              |
| `bun --bun nuxt dev` melaporkan Node 24.3                                                                            | Peringatan versi Node dari Nuxt                                | Hanya peringatan; production tidak terpengaruh                                                          |
| Issue nuxt-elysia #2: header `Transfer-Encoding` ganda di `bun --bun nuxt dev` untuk respons plaintext               | Hanya dev, respons string                                      | API ini selalu merespons JSON/SSE; tidak terobservasi pada respons JSON                                 |
| Objek `Query` Bun SQL mentah di `expect(...).rejects`                                                                | Runner Bun Test menggantung                                    | Bungkus dengan fungsi async yang meng-`await` query                                                     |
