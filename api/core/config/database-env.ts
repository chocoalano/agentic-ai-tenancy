/**
 * Resolusi koneksi PostgreSQL dari environment dengan format variabel ala Laravel.
 *
 * Format utama (sama seperti `config/database.php` Laravel):
 *
 *   DB_CONNECTION=pgsql
 *   DB_HOST=127.0.0.1
 *   DB_PORT=5432
 *   DB_DATABASE=agentic_office
 *   DB_USERNAME=agentic_app        ← role RUNTIME (tunduk RLS)
 *   DB_PASSWORD=...
 *
 * Tambahan khusus proyek ini (host/port/database mengikuti di atas):
 *
 *   DB_MIGRATION_USERNAME / DB_MIGRATION_PASSWORD  ← role PEMILIK skema (migrasi)
 *   DB_ADMIN_USERNAME / DB_ADMIN_PASSWORD / DB_ADMIN_DATABASE  ← admin lokal (bootstrap/reset)
 *   DB_TEST_DATABASE                                ← database test (role yang sama)
 *   DB_SSLMODE                                      ← opsional (disable | prefer | require | verify-full)
 *
 * URL lengkap (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `DATABASE_ADMIN_URL`,
 * `TEST_DATABASE_URL`, `TEST_DATABASE_MIGRATION_URL`) tetap diterima dan selalu
 * MENANG atas variabel `DB_*` — dipakai test e2e/standalone untuk menyuntikkan
 * koneksi lain tanpa mengubah .env. Modul ini murni (tanpa Bun/Nuxt) agar dapat
 * dipakai API, skrip database, seed, dan test.
 */

export type DatabaseEnv = Record<string, string | undefined>

export interface DatabaseConnectionParts {
  host: string
  port: string
  database: string
  user: string
  password: string
  sslmode?: string
}

export interface ResolvedDatabaseUrls {
  /** Role runtime aplikasi (DATABASE_URL atau DB_USERNAME). */
  app?: string
  /** Role pemilik skema untuk migrasi (DATABASE_MIGRATION_URL atau DB_MIGRATION_USERNAME). */
  owner?: string
  /** Role admin lokal untuk bootstrap/reset (DATABASE_ADMIN_URL atau DB_ADMIN_USERNAME). */
  admin?: string
  test: {
    app?: string
    owner?: string
  }
  /** Masalah konfigurasi yang terdeteksi (kosong bila valid). */
  issues: string[]
  /** `laravel` bila disusun dari DB_*, `url` bila dari *_URL, `none` bila tidak ada. */
  source: 'laravel' | 'url' | 'none'
}

export const LARAVEL_DB_CONNECTIONS = ['pgsql', 'postgres', 'postgresql'] as const
const PORT_PATTERN = /^\d{1,5}$/

/** Mengosongkan nilai kosong/whitespace menjadi undefined. */
function value(env: DatabaseEnv, key: string): string | undefined {
  const raw = env[key]
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Menyusun URL `postgresql://` dengan user/password/database ter-encode (aman untuk karakter khusus). */
export function buildPostgresUrl(parts: DatabaseConnectionParts): string {
  const auth = parts.password
    ? `${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}`
    : encodeURIComponent(parts.user)
  const host = parts.host.includes(':') && !parts.host.startsWith('[') ? `[${parts.host}]` : parts.host
  const query = parts.sslmode ? `?sslmode=${encodeURIComponent(parts.sslmode)}` : ''
  return `postgresql://${auth}@${host}:${parts.port}/${encodeURIComponent(parts.database)}${query}`
}

export function isPostgresUrl(candidate: string | undefined): candidate is string {
  return typeof candidate === 'string' && /^postgres(ql)?:\/\//.test(candidate)
}

/**
 * Menggabungkan kedua format. Variabel URL lengkap menang bila ada; sisanya
 * disusun dari DB_* bila host/port/database tersedia.
 */
export function resolveDatabaseUrls(env: DatabaseEnv): ResolvedDatabaseUrls {
  const issues: string[] = []
  const urls: ResolvedDatabaseUrls = { test: {}, issues, source: 'none' }

  const connection = value(env, 'DB_CONNECTION')
  if (connection && !(LARAVEL_DB_CONNECTIONS as readonly string[]).includes(connection.toLowerCase())) {
    issues.push(`DB_CONNECTION harus pgsql (PostgreSQL); nilai "${connection}" tidak didukung`)
  }

  const host = value(env, 'DB_HOST')
  const port = value(env, 'DB_PORT') ?? (host ? '5432' : undefined)
  const database = value(env, 'DB_DATABASE')
  const sslmode = value(env, 'DB_SSLMODE')
  const hasLaravelBase = Boolean(host && port && database)
  if (port !== undefined && !PORT_PATTERN.test(port)) issues.push(`DB_PORT harus berupa angka port, bukan "${port}"`)
  if ((host || database || value(env, 'DB_USERNAME')) && !hasLaravelBase) {
    issues.push('Format Laravel membutuhkan DB_HOST, DB_PORT, dan DB_DATABASE terisi bersama')
  }

  const compose = (user: string | undefined, password: string | undefined, db = database): string | undefined => {
    if (!hasLaravelBase || !user || !host || !port || !db) return undefined
    return buildPostgresUrl({ host, port, database: db, user, password: password ?? '', sslmode })
  }

  // Role runtime.
  const appUrl = value(env, 'DATABASE_URL')
  if (appUrl) {
    if (!isPostgresUrl(appUrl)) issues.push('DATABASE_URL wajib berupa URL PostgreSQL (postgresql://...)')
    urls.app = appUrl
    urls.source = 'url'
  } else {
    urls.app = compose(value(env, 'DB_USERNAME'), value(env, 'DB_PASSWORD'))
    if (urls.app) urls.source = 'laravel'
  }

  // Role pemilik skema (migrasi).
  const ownerUrl = value(env, 'DATABASE_MIGRATION_URL')
  if (ownerUrl) {
    if (!isPostgresUrl(ownerUrl)) issues.push('DATABASE_MIGRATION_URL wajib berupa URL PostgreSQL (postgresql://...)')
    urls.owner = ownerUrl
  } else {
    urls.owner = compose(value(env, 'DB_MIGRATION_USERNAME'), value(env, 'DB_MIGRATION_PASSWORD'))
  }

  // Admin lokal (bootstrap/reset) — database default `postgres`.
  const adminUrl = value(env, 'DATABASE_ADMIN_URL')
  if (adminUrl) {
    if (!isPostgresUrl(adminUrl)) issues.push('DATABASE_ADMIN_URL wajib berupa URL PostgreSQL (postgresql://...)')
    urls.admin = adminUrl
  } else {
    urls.admin = compose(
      value(env, 'DB_ADMIN_USERNAME'),
      value(env, 'DB_ADMIN_PASSWORD'),
      value(env, 'DB_ADMIN_DATABASE') ?? 'postgres',
    )
  }

  // Database test: role yang sama, database berbeda.
  const testDatabase = value(env, 'DB_TEST_DATABASE')
  const testAppUrl = value(env, 'TEST_DATABASE_URL')
  if (testAppUrl) {
    if (!isPostgresUrl(testAppUrl)) issues.push('TEST_DATABASE_URL wajib berupa URL PostgreSQL (postgresql://...)')
    urls.test.app = testAppUrl
  } else {
    urls.test.app = compose(value(env, 'DB_USERNAME'), value(env, 'DB_PASSWORD'), testDatabase)
  }
  const testOwnerUrl = value(env, 'TEST_DATABASE_MIGRATION_URL')
  if (testOwnerUrl) {
    if (!isPostgresUrl(testOwnerUrl))
      issues.push('TEST_DATABASE_MIGRATION_URL wajib berupa URL PostgreSQL (postgresql://...)')
    urls.test.owner = testOwnerUrl
  } else {
    urls.test.owner = compose(value(env, 'DB_MIGRATION_USERNAME'), value(env, 'DB_MIGRATION_PASSWORD'), testDatabase)
  }

  if (testDatabase && database && testDatabase === database) {
    issues.push('DB_TEST_DATABASE harus berbeda dari DB_DATABASE (test tidak boleh memakai database utama)')
  }

  return urls
}

/** Pesan bantuan seragam saat koneksi tertentu belum dikonfigurasi. */
export function describeMissingDatabase(kind: 'app' | 'owner' | 'admin' | 'test-app' | 'test-owner'): string {
  switch (kind) {
    case 'app':
      return (
        'Koneksi database runtime belum dikonfigurasi: isi DB_CONNECTION=pgsql, DB_HOST, DB_PORT, DB_DATABASE, ' +
        'DB_USERNAME, DB_PASSWORD (format Laravel) atau DATABASE_URL. Lihat .env.example.'
      )
    case 'owner':
      return 'Role pemilik skema belum dikonfigurasi: isi DB_MIGRATION_USERNAME dan DB_MIGRATION_PASSWORD (atau DATABASE_MIGRATION_URL).'
    case 'admin':
      return 'Role admin belum dikonfigurasi: isi DB_ADMIN_USERNAME (+ DB_ADMIN_PASSWORD, DB_ADMIN_DATABASE) atau DATABASE_ADMIN_URL. Hanya untuk lokal.'
    case 'test-app':
      return 'Database test belum dikonfigurasi: isi DB_TEST_DATABASE (memakai DB_USERNAME/DB_PASSWORD) atau TEST_DATABASE_URL.'
    case 'test-owner':
      return 'Database test untuk migrasi belum dikonfigurasi: isi DB_TEST_DATABASE + DB_MIGRATION_USERNAME/PASSWORD atau TEST_DATABASE_MIGRATION_URL.'
  }
}
