import { SQL } from 'bun'
import type { ApiConfig } from '../config/env'

export type { TransactionSQL } from 'bun'

/**
 * Membuat pool koneksi PostgreSQL berbasis Bun SQL.
 *
 * Koneksi dibuat secara lazy dan dipakai ulang oleh pool. Jangan pernah
 * menyimpan state tenant di level sesi koneksi; gunakan helper transaksi di
 * `transactions.ts` yang memakai `set_config(..., true)` (transaction-local).
 */
export function createDatabasePool(config: ApiConfig['database']): SQL {
  return new SQL({
    url: config.url,
    max: config.poolMax,
    idleTimeout: config.idleTimeoutSeconds,
    connectionTimeout: config.connectionTimeoutSeconds,
  })
}
