/**
 * Preload Bun Test: menerapkan migrasi ke database test sekali per proses
 * test, bila TEST_DATABASE_MIGRATION_URL tersedia. Unit test murni tetap dapat
 * berjalan tanpa database.
 */
import { SQL } from 'bun'
import { runMigrations } from '../../db/migrator'

const ownerUrl = process.env.TEST_DATABASE_MIGRATION_URL
if (ownerUrl) {
  const sql = new SQL({ url: ownerUrl, max: 1 })
  try {
    await runMigrations(sql)
  } finally {
    await sql.close()
  }
}
