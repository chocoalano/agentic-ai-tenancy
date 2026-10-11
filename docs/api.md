# API

## Konvensi

- Basis: `/api` (mount nuxt-elysia) + versi `/v1` → `/api/v1/...`.
- JSON untuk request & respons (body dibaca sesuai `Content-Type`; jenis body bukan lapisan CSRF — lihat
  `docs/tenancy.md`).
- Route tenant-scoped menerima header opsional `x-active-tenant` (tenant yang dikira aktif oleh tab); bila berbeda
  dari tenant aktif sesi → 409 `TENANT_MISMATCH` tanpa data. Respons tenant membawa `x-tenant-id`.
  `useTenantAsyncData` mengirimnya otomatis (`request` ke setiap pemanggilan `$api`).
- Dokumentasi OpenAPI/Scalar (`/api/openapi`) aktif di development/test dan **mati di production** kecuali
  `OPENAPI_ENABLED=true`.
- Setiap route mendeklarasikan schema `body`/`params`/`response` (TypeBox `t`), termasuk status error, sehingga
  OpenAPI dan Eden Treaty mengetahui bentuk sukses **dan** error.
- Timestamp dideklarasikan `t.Date()` — Eden mengubah string ISO-8601 menjadi `Date` di klien.
- Semua respons: `x-request-id`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- Route root modul ditulis `''` (bukan `'/'`) agar path OpenAPI tidak ber-trailing slash.

### Error

```ts
interface ApiError {
  code: string // stabil, mis. UNAUTHENTICATED, TENANT_NOT_FOUND
  message: string // aman ditampilkan (Bahasa Indonesia)
  requestId?: string
  details?: unknown // mis. [{ path: '/email', message: '...' }] untuk VALIDATION_ERROR
}
```

| Status | Kode umum                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `INVALID_BODY`                                                                                                                                        |
| 401    | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                                                                                              |
| 403    | `CROSS_ORIGIN_REQUEST_BLOCKED`, `TENANT_NOT_SELECTED`, `TENANT_ACCESS_DENIED`, `TENANT_ACCESS_REVOKED`, `PERMISSION_DENIED`, `DATABASE_ACCESS_DENIED` |
| 404    | `ROUTE_NOT_FOUND`, `TENANT_NOT_FOUND`, `AGENT_NOT_FOUND`                                                                                              |
| 409    | `EMAIL_ALREADY_REGISTERED`, `RESOURCE_CONFLICT`, `REFERENCE_CONFLICT`, `TENANT_SLUG_CONFLICT`, `TENANT_MISMATCH`                                      |
| 422    | `VALIDATION_ERROR` (nilai input tidak pernah dipantulkan), `INVALID_DATA`                                                                             |
| 429    | `TOO_MANY_REQUESTS` (+ `Retry-After`): login per email/IP, registrasi per IP, pembuatan perusahaan per pengguna                                       |
| 500    | `INTERNAL_ERROR` (detail hanya di log server)                                                                                                         |
| 503    | `DATABASE_UNAVAILABLE` (+ `Retry-After`; gerbang kesiapan/DB), `TRANSACTION_CONFLICT`, `SERVICE_MISCONFIGURED`                                        |

## Endpoint

| Metode | Path                                | Akses                    | Keterangan                                                          |
| ------ | ----------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| GET    | `/api/v1/health`                    | publik                   | `{status, time, checks.database}`; 503 bila DB tidak siap           |
| POST   | `/api/v1/auth/register`             | publik, dibatasi per IP  | Buat akun (+ perusahaan opsional), set cookie sesi → 201; 429       |
| POST   | `/api/v1/auth/login`                | publik, dibatasi         | Set cookie sesi; 429 per email/IP                                   |
| POST   | `/api/v1/auth/logout`               | sesi                     | Cabut sesi di DB, hapus cookie                                      |
| GET    | `/api/v1/auth/me`                   | sesi                     | Profil, kedaluwarsa sesi, konteks tenant aktif (peran & izin)       |
| GET    | `/api/v1/tenants`                   | sesi                     | Perusahaan tempat pengguna anggota aktif                            |
| POST   | `/api/v1/tenants`                   | sesi, dibatasi/pengguna  | Buat perusahaan (pengguna menjadi owner) → 201; 429                 |
| GET    | `/api/v1/tenants/:id`               | sesi + keanggotaan       | Detail; 404 untuk non-anggota                                       |
| POST   | `/api/v1/tenants/:id/switch`        | sesi + keanggotaan       | Ganti tenant aktif sesi                                             |
| GET    | `/api/v1/memberships`               | sesi                     | Keanggotaan aktif + peran                                           |
| GET    | `/api/v1/agents`                    | tenant + `agents.read`   | AI employee tenant aktif (`runtimeStatus` selalu `null` di Phase 1) |
| GET    | `/api/v1/agents/:id`                | tenant + `agents.read`   | Detail + instruksi utama; 404 bila bukan milik tenant aktif         |
| GET    | `/api/v1/realtime/stream`           | tenant + `tenant.read`   | SSE: `ready`, lalu `heartbeat` periodik                             |
| GET    | `/api/openapi`, `/api/openapi/json` | publik (dapat dimatikan) | Scalar UI & spesifikasi                                             |

Semua endpoint di atas tidak memiliki "jalur sukses palsu": data berasal dari PostgreSQL atau status nyata.

## Eden Treaty

### Di komponen/composable Nuxt

```ts
const { $api } = useNuxtApp()

const { data, error } = await $api.v1.agents.get()
if (error) {
  // error.status: 401 | 403 | 409 ; error.value: ApiError (bertipe) — 409 = TENANT_MISMATCH (tab usang)
  throw apiFailure(error) // → NuxtError untuk useAsyncData
}
data.items[0].createdAt // Date
```

Path parameter: `$api.v1.agents({ id }).get()`, `$api.v1.tenants({ id }).switch.post()`.

### Data fetching SSR

```ts
// app/pages/office/index.vue — `request` = header x-active-tenant + sinyal pembatalan; teruskan ke setiap $api
const { data, error } = await useTenantAsyncData('office-overview', async (tenantId, _signal, request) => {
  const [tenant, agents] = await Promise.all([
    $api.v1.tenants({ id: tenantId }).get(request),
    $api.v1.agents.get(request),
  ])
  if (tenant.error) throw apiFailure(tenant.error)
  if (agents.error) throw apiFailure(agents.error)
  return { tenant: tenant.data, agents: agents.data.items }
})
```

Saat SSR, panggilan ini dijalankan in-process ke Elysia dengan cookie pengguna; di browser memakai `fetch`.

### Tipe turunan

`app/utils/api-types.ts` menurunkan tipe dari `$api` (mis. `AgentSummary`, `MeResponse`) — jangan menulis ulang
interface respons secara manual. Test tipe: `tests/integration/eden-types.test.ts` (diperiksa `tsc`).

### SSE dengan Eden

Route generator Elysia (`yield sse(...)`) menghasilkan `data` berupa async iterable di Eden. Konsumen:
`app/utils/realtime-sse.ts` (backoff, tidak mencoba ulang 401/403, `AbortController` untuk pembatalan) dan
`app/composables/useOfficeRealtime.ts` (buka saat mount, tutup saat unmount, buka ulang saat ganti tenant).

## Menambah endpoint

1. Schema di `api/modules/<modul>/schemas.ts` atau inline dengan `t`.
2. Repository menerima scope transaksi (`TenantTransaction` untuk data tenant).
3. Service membuka transaksi (`withTenantTransaction`) dan melempar `AppError` untuk error yang diharapkan.
4. Route memakai `guardPlugin` + macro `auth: true` atau `tenant: '<izin>'`, mendeklarasikan semua status respons.
5. Test integrasi + test isolasi bila tenant-scoped.
