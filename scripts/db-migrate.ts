/**
 * Menjalankan migrasi SQL di db/migrations memakai role pemilik skema.
 *
 *   bun run db:migrate          → database utama (DB_DATABASE dengan DB_MIGRATION_USERNAME,
 *                                 atau DATABASE_MIGRATION_URL)
 *   bun run db:migrate --test   → database test (DB_TEST_DATABASE, atau TEST_DATABASE_MIGRATION_URL)
 */
import { SQL } from 'bun'
import { resolveDatabaseUrls } from '../api/core/config/database-env'
import { runMigrations } from '../db/migrator'
import { LABELS, parseDatabaseUrl } from './lib/database-urls'

const useTest = process.argv.includes('--test')
const urls = resolveDatabaseUrls(process.env)
for (const issue of urls.issues) console.error(`✖ ${issue}`)
if (urls.issues.length > 0) process.exit(1)
const target = useTest
  ? parseDatabaseUrl(LABELS.testOwner, urls.test.owner)
  : parseDatabaseUrl(LABELS.owner, urls.owner)
const sql = new SQL({ url: target.url, max: 1 })

try {
  const result = await runMigrations(sql, { log: (message) => console.log(message) })
  console.log(
    `✓ Migrasi ${target.database}: ${result.applied.length} diterapkan, ${result.alreadyApplied.length} sudah ada sebelumnya.`,
  )
} catch (error) {
  console.error('✖ Migrasi gagal:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.close()
}
