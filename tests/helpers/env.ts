import { describeMissingDatabase, resolveDatabaseUrls } from '../../api/core/config/database-env'
import { loadApiConfig, type ApiConfig } from '../../api/core/config/env'

/** Secret khusus test (bukan secret pengembangan dari .env). */
export const TEST_SESSION_SECRET = 'test-session-secret-0123456789abcdefghijklmnop'

export interface TestDatabaseUrls {
  /** Role runtime aplikasi (tunduk pada RLS). */
  app: string
  /** Role pemilik skema (migrasi). */
  owner: string
}

/**
 * Test integrasi, keamanan, dan e2e MEMBUTUHKAN PostgreSQL. Konfigurasi format
 * Laravel: DB_HOST/DB_PORT + DB_TEST_DATABASE dengan DB_USERNAME/DB_PASSWORD
 * (runtime) dan DB_MIGRATION_USERNAME/DB_MIGRATION_PASSWORD (pemilik); alternatif
 * URL lengkap TEST_DATABASE_URL dan TEST_DATABASE_MIGRATION_URL. Test tidak
 * dilewati diam-diam bila database tidak tersedia.
 */
export function testDatabaseUrls(): TestDatabaseUrls {
  const urls = resolveDatabaseUrls(process.env)
  const app = urls.test.app
  const owner = urls.test.owner
  if (!app || !owner) {
    throw new Error(
      `${describeMissingDatabase(app ? 'test-owner' : 'test-app')} ` +
        'Jalankan "bun run db:bootstrap" lalu "bun run db:migrate:test".',
    )
  }
  return { app, owner }
}

export function testConfig(overrides: Record<string, string> = {}): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrls().app,
    DATABASE_POOL_MAX: '5',
    SESSION_SECRET: TEST_SESSION_SECRET,
    ...overrides,
  })
}
