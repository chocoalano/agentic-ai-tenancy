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
 * Test integrasi, keamanan, dan e2e MEMBUTUHKAN PostgreSQL. Variabel
 * TEST_DATABASE_URL dan TEST_DATABASE_MIGRATION_URL wajib diisi (lihat
 * docs/setup.md). Test tidak dilewati diam-diam bila database tidak tersedia.
 */
export function testDatabaseUrls(): TestDatabaseUrls {
  const app = process.env.TEST_DATABASE_URL
  const owner = process.env.TEST_DATABASE_MIGRATION_URL
  if (!app || !owner) {
    throw new Error(
      'TEST_DATABASE_URL dan TEST_DATABASE_MIGRATION_URL wajib diisi untuk test yang memakai database. ' +
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
