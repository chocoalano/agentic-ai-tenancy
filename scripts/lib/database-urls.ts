/**
 * Utilitas untuk skrip database (bootstrap, migrate, seed, reset).
 * Skrip-skrip ini berjalan di luar Nuxt sebagai proses Bun biasa.
 */

export interface ParsedDatabaseUrl {
  url: string
  user: string
  password: string
  database: string
  host: string
  port: string
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/

/** Label koneksi untuk pesan error (format Laravel DB_* dengan alternatif URL lengkap). */
export const LABELS = {
  app: 'koneksi runtime (DB_USERNAME/DB_PASSWORD atau DATABASE_URL)',
  owner: 'koneksi pemilik skema (DB_MIGRATION_USERNAME/DB_MIGRATION_PASSWORD atau DATABASE_MIGRATION_URL)',
  testApp: 'koneksi runtime database test (DB_TEST_DATABASE atau TEST_DATABASE_URL)',
  testOwner: 'koneksi pemilik skema database test (DB_TEST_DATABASE atau TEST_DATABASE_MIGRATION_URL)',
} as const

export function parseDatabaseUrl(name: string, value: string | undefined): ParsedDatabaseUrl {
  if (!value) throw new Error(`${name} belum dikonfigurasi. Lihat .env.example (bagian Database).`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} bukan URL yang valid.`)
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${name} harus memakai skema postgresql://`)
  }
  const user = decodeURIComponent(url.username)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  for (const [label, identifier] of [
    ['user', user],
    ['database', database],
  ] as const) {
    if (!IDENTIFIER.test(identifier)) {
      throw new Error(`${name}: nama ${label} "${identifier}" harus berupa identifier huruf kecil (a-z, 0-9, _)`)
    }
  }
  return {
    url: value,
    user,
    password: decodeURIComponent(url.password),
    database,
    host: url.hostname,
    port: url.port || '5432',
  }
}

export function requireNonProduction(action: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(`✖ ${action} tidak boleh dijalankan dengan NODE_ENV=production.`)
    process.exit(1)
  }
}

/** Mengganti database pada URL (dipakai untuk memilih database test). */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}
