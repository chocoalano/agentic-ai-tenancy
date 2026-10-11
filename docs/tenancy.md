# Autentikasi & Multi-Tenancy

## Model

- **Shared database, shared schema.** Semua data tenant-scoped memiliki kolom `tenant_id NOT NULL`.
- **Identitas global**: `users`, `sessions` (satu manusia dapat menjadi anggota banyak tenant).
- **Keanggotaan**: `tenant_memberships (tenant_id, user_id, status)`; peran lewat `membership_roles`.
- **Izin**: katalog global `permissions`; pemetaan `role_permissions`; peran sistem (`owner`, `admin`, `member`,
  `viewer`) ber-`tenant_id NULL`, peran kustom milik tenant.
- **Sumber kebenaran izin adalah database.** `domains/auth/permissions.ts` hanya kontrak tipe; test memastikan
  katalog kode = isi tabel `permissions`.

| Peran  | Izin                                         |
| ------ | -------------------------------------------- |
| owner  | semua                                        |
| admin  | semua kecuali `tenant.manage`                |
| member | `tenant.read`, `members.read`, `agents.read` |
| viewer | `tenant.read`, `agents.read`                 |

## Autentikasi

| Aspek             | Implementasi                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Password          | Argon2id (`Bun.password`, m=19 MiB, t=2), panjang 10–128                                                                     |
| Token sesi        | 32 byte acak (base64url) di cookie; DB menyimpan **HMAC-SHA256(SESSION_SECRET, token)**                                      |
| Cookie            | `HttpOnly`, `SameSite=Lax`, `Path=/`; production: `Secure` + prefix `__Host-aivo_session`                                    |
| Kedaluwarsa       | Absolut (`SESSION_TTL_HOURS`, default 7 hari); `last_seen_at` diperbarui maks. tiap 5 menit                                  |
| Pencabutan        | Logout mengisi `revoked_at`; cookie lama langsung ditolak                                                                    |
| Login gagal       | Pesan sama untuk email tak dikenal & password salah; verifikasi dummy hash menyamakan waktu                                  |
| Brute force       | Throttle per email (default 5 gagal / 15 menit → 429 + `Retry-After`), in-memory per proses                                  |
| CSRF              | Fetch Metadata (`Sec-Fetch-Site`) + fallback `Origin` vs `Host` untuk semua metode mutasi, plus `SameSite=Lax` dan body JSON |
| Token di frontend | Tidak ada. Tidak ada `localStorage` token; JavaScript tidak dapat membaca cookie sesi                                        |

Identitas pengguna **hanya** berasal dari sesi. Header seperti `x-user-id`/`x-tenant-id` dari klien diabaikan
(diuji di `tests/integration/auth.test.ts`).

## Alur request tenant-scoped

Route mendeklarasikan izin lewat macro: `{ tenant: 'agents.read' }` (`api/core/auth/guard.ts`).

```text
1. Autentikasi        cookie → hash HMAC → sessions (belum dicabut, belum kedaluwarsa, user aktif)
2. Resolusi tenant    sessions.active_tenant_id (dipilih via POST /v1/tenants/:id/switch)
3. Verifikasi anggota resolveTenantContext(): tenant_memberships aktif + tenant aktif (konteks app.user_id)
4. Resolusi izin      membership_roles → roles → role_permissions → permissions
5. Transaksi          withTenantTransaction(sql, context, fn) → BEGIN
6. Konteks lokal      set_config('app.tenant_id' | 'app.user_id' | 'app.request_id', …, true)
                      + verifikasi ulang keanggotaan di dalam transaksi yang sama
7. Repository         query berparameter; RLS membatasi baris ke tenant aktif
8. Commit/rollback    konteks hilang otomatis (transaction-local)
```

`TenantContext` (`domains/tenancy/types.ts`):

```ts
interface TenantContext {
  tenantId: string
  userId: string
  membershipId: string
  userRoles: string[]
  permissions: PermissionKey[]
  requestId: string
}
```

Kode error yang relevan: `UNAUTHENTICATED` (401), `TENANT_NOT_SELECTED`, `TENANT_ACCESS_DENIED`,
`PERMISSION_DENIED`, `TENANT_ACCESS_REVOKED` (403), `TENANT_NOT_FOUND`/`AGENT_NOT_FOUND` (404 — juga untuk
sumber daya tenant lain agar keberadaannya tidak bocor).

## PostgreSQL Row Level Security

Helper konteks (skema `app`):

```sql
app.current_tenant_id() = nullif(current_setting('app.tenant_id', true), '')::uuid
app.current_user_id()   = nullif(current_setting('app.user_id', true), '')::uuid
```

Semua tabel tenant memakai `ENABLE` **dan** `FORCE ROW LEVEL SECURITY` (pemilik tabel pun tunduk).

| Tabel                | SELECT                                                         | Tulis                                                                             |
| -------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `agents`             | `tenant_id = current_tenant`                                   | sama (USING + WITH CHECK)                                                         |
| `tenants`            | `id = current_tenant` **atau** anggota aktif                   | insert: `id = current_tenant` & `created_by = current_user`; update: tenant aktif |
| `tenant_memberships` | `tenant_id = current_tenant` **atau** `user_id = current_user` | tenant aktif                                                                      |
| `membership_roles`   | tenant aktif **atau** keanggotaan milik pengguna               | tenant aktif (+ trigger: peran harus sistem/tenant sama)                          |
| `roles`              | sistem, tenant aktif, atau tenant tempat pengguna anggota      | hanya peran kustom tenant aktif                                                   |
| `role_permissions`   | mengikuti visibilitas `roles`                                  | hanya peran kustom tenant aktif                                                   |

> **Perhatian:** kebijakan `tenant_memberships`, `membership_roles`, dan `roles` sengaja memakai `OR` agar
> pengguna dapat melihat keanggotaannya sendiri lintas tenant (tenant switcher, resolusi izin). Akibatnya, query
> agregat/daftar pada tabel tersebut di dalam konteks tenant **wajib** memfilter `tenant_id` secara eksplisit.
> Bug nyata yang ditemukan saat verifikasi UI (jumlah anggota ikut menghitung keanggotaan pengguna di tenant lain)
> diperbaiki dan dikunci dengan test regresi.

`users` dan `sessions` tidak memakai RLS tenant: keduanya global dan hanya diakses melalui repository auth/users.
Penguatan berikutnya (Wave 2): akses sesi via fungsi `SECURITY DEFINER` sempit.

### Role database

Aplikasi berjalan dengan `agentic_app` (NOSUPERUSER, NOBYPASSRLS, bukan pemilik). `inspectRuntimeRole()`
memeriksa hal ini saat start dan di `/v1/health`; bila tidak aman, API menolak melayani (503).

### Pool koneksi

Konteks **tidak pernah** di-set di level sesi koneksi. `set_config(..., true)` hanya berlaku sampai akhir
transaksi, sehingga koneksi yang kembali ke pool bersih. Diuji dengan 60 transaksi paralel pada pool berukuran 3
dan pemeriksaan setiap koneksi pool setelah commit/rollback.

## Ganti tenant di frontend

1. `POST /api/v1/tenants/:id/switch` — backend memvalidasi keanggotaan aktif, lalu menyimpan pilihan di sesi.
2. `clearNuxtData(key => key.startsWith('tenant:'))` — seluruh cache data tenant dibuang.
3. `GET /auth/me` + `GET /memberships` dimuat ulang (peran & izin baru).
4. Data halaman memakai `useTenantAsyncData(name, handler)` dengan kunci reaktif `tenant:<tenantId>:<name>`,
   sehingga data diambil ulang untuk tenant baru dan request lama dibatalkan (`AbortSignal`).
5. Stream SSE ditutup dan dibuka ulang untuk tenant baru.

Catatan: tenant aktif melekat pada sesi, sehingga berlaku untuk semua tab pada sesi yang sama.

## Test isolasi

| File                                      | Cakupan                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/security/tenant-isolation.test.ts` | User A hanya melihat tenant A; Tenant B → 404; agent B tidak terbaca; `active_tenant_id` palsu di sesi ditolak; switch menukar data; izin per tenant; anggota tanpa izin → 403; keanggotaan ditangguhkan; agregat tidak bocor         |
| `tests/security/rls.test.ts`              | Role runtime aman; query tanpa filter `tenant_id` tetap terisolasi; INSERT/UPDATE/DELETE lintas tenant ditolak; FORCE RLS pada pemilik; peran tenant lain tidak dapat ditautkan; konteks tidak valid fail-closed; katalog izin = kode |
| `tests/security/pool-isolation.test.ts`   | 60 transaksi paralel dua tenant (pool 3); koneksi bersih setelah commit/rollback; 40 request HTTP paralel                                                                                                                             |
| `tests/security/csrf.test.ts`             | Login/logout/switch lintas situs ditolak; same-origin & GET diizinkan                                                                                                                                                                 |
| `tests/nuxt/tenant-switch.test.ts`        | Cache `tenant:*` dibuang; `useTenantAsyncData` mengambil ulang untuk tenant baru; switch gagal tidak mengubah state                                                                                                                   |
| `tests/e2e/production.test.ts`            | SSR production menampilkan data tenant aktif saja, sebelum & sesudah switch                                                                                                                                                           |

Semua test di atas (kecuali `tests/nuxt`) membutuhkan PostgreSQL.
