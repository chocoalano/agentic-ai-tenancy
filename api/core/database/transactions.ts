import type { SQL, TransactionSQL } from 'bun'
import type { TenantContext } from '../../../domains/tenancy/types'
import { errors } from '../errors/app-error'

/**
 * Token privat modul: hanya fungsi di file ini yang dapat membuat objek
 * scope transaksi. Repository tenant-scoped menerima `TenantTransaction`,
 * sehingga secara tipe tidak mungkin dipanggil di luar konteks tenant yang
 * sudah diverifikasi.
 */
const scopeToken: unique symbol = Symbol('database-scope')

/** Transaksi dengan konteks pengguna terautentikasi (tanpa tenant). */
export class UserTransaction {
  constructor(
    token: typeof scopeToken,
    readonly sql: TransactionSQL,
    readonly userId: string,
  ) {
    if (token !== scopeToken) throw new Error('UserTransaction hanya dapat dibuat oleh withUserTransaction')
  }
}

/** Transaksi dengan konteks tenant terverifikasi; tunduk pada RLS tenant. */
export class TenantTransaction {
  constructor(
    token: typeof scopeToken,
    readonly sql: TransactionSQL,
    readonly context: TenantContext,
  ) {
    if (token !== scopeToken) throw new Error('TenantTransaction hanya dapat dibuat oleh withTenantTransaction')
  }
}

/** Transaksi biasa tanpa konteks RLS (identitas global: users, sessions). */
export function withTransaction<T>(sql: SQL, fn: (tx: TransactionSQL) => Promise<T>): Promise<T> {
  return sql.begin((tx) => fn(tx))
}

/**
 * Menjalankan `fn` di dalam transaksi dengan `app.user_id` di-set secara
 * transaction-local. Dipakai untuk membaca keanggotaan milik pengguna sendiri
 * lintas tenant (mis. daftar tenant, tenant switcher).
 */
export function withUserTransaction<T>(
  sql: SQL,
  userId: string,
  fn: (scope: UserTransaction) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true), set_config('app.tenant_id', '', true)`
    return fn(new UserTransaction(scopeToken, tx, userId))
  })
}

/**
 * Menjalankan operasi tenant-scoped:
 *
 * 1. Membuka transaksi.
 * 2. Men-set `app.tenant_id`, `app.user_id`, dan `app.request_id` secara
 *    transaction-local (`set_config(..., true)`), sehingga state tidak pernah
 *    menempel pada koneksi pool setelah commit/rollback.
 * 3. Memverifikasi ulang keanggotaan aktif di dalam transaksi yang sama.
 * 4. Menjalankan `fn`; commit bila sukses, rollback bila melempar error.
 *
 * Isolasi ditegakkan oleh kebijakan RLS PostgreSQL, bukan hanya filter
 * `WHERE tenant_id = ...` di query.
 */
export function withTenantTransaction<T>(
  sql: SQL,
  context: TenantContext,
  fn: (scope: TenantTransaction) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`
      select
        set_config('app.tenant_id', ${context.tenantId}, true),
        set_config('app.user_id', ${context.userId}, true),
        set_config('app.request_id', ${context.requestId}, true)
    `
    const [membership] = await tx<{ active: boolean }[]>`
      select exists (
        select 1
        from tenant_memberships m
        join tenants t on t.id = m.tenant_id
        where m.id = ${context.membershipId}
          and m.tenant_id = ${context.tenantId}
          and m.user_id = ${context.userId}
          and m.status = 'active'
          and t.status = 'active'
      ) as active
    `
    if (!membership?.active) {
      throw errors.forbidden('TENANT_ACCESS_REVOKED', 'Keanggotaan Anda pada perusahaan ini sudah tidak aktif.')
    }
    return fn(new TenantTransaction(scopeToken, tx, context))
  })
}

/**
 * Khusus untuk pembuatan tenant baru: konteks tenant di-set ke ID yang baru
 * dibuat sehingga baris tenant, keanggotaan pemilik, dan peran awal dapat
 * ditulis di bawah kebijakan RLS yang sama. Tidak ada verifikasi keanggotaan
 * karena keanggotaan justru sedang dibuat di dalam transaksi ini.
 */
export function withNewTenantTransaction<T>(
  sql: SQL,
  input: { tenantId: string; userId: string; requestId: string },
  fn: (scope: TenantBootstrapTransaction) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => fn(await enterTenantBootstrap(tx, input)))
}

/**
 * Varian `withNewTenantTransaction` untuk transaksi yang sudah berjalan
 * (mis. registrasi pengguna + perusahaan pertama secara atomik).
 */
export async function enterTenantBootstrap(
  tx: TransactionSQL,
  input: { tenantId: string; userId: string; requestId: string },
): Promise<TenantBootstrapTransaction> {
  await tx`
    select
      set_config('app.tenant_id', ${input.tenantId}, true),
      set_config('app.user_id', ${input.userId}, true),
      set_config('app.request_id', ${input.requestId}, true)
  `
  return new TenantBootstrapTransaction(scopeToken, tx, input.tenantId, input.userId)
}

/** Transaksi pembuatan tenant baru (lihat `withNewTenantTransaction`). */
export class TenantBootstrapTransaction {
  constructor(
    token: typeof scopeToken,
    readonly sql: TransactionSQL,
    readonly tenantId: string,
    readonly userId: string,
  ) {
    if (token !== scopeToken) {
      throw new Error('TenantBootstrapTransaction hanya dapat dibuat oleh withNewTenantTransaction')
    }
  }
}
