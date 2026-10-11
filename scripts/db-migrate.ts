/**
 * Menjalankan migrasi SQL di db/migrations memakai role pemilik skema.
 *
 *   bun run db:migrate          → database utama (DATABASE_MIGRATION_URL)
 *   bun run db:migrate --test   → database test (TEST_DATABASE_MIGRATION_URL)
 */
import { SQL } from 'bun'
import { runMigrations } from '../db/migrator'
import { parseDatabaseUrl } from './lib/database-urls'

const useTest = process.argv.includes('--test')
const variable = useTest ? 'TEST_DATABASE_MIGRATION_URL' : 'DATABASE_MIGRATION_URL'
const target = parseDatabaseUrl(variable, process.env[variable])
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
