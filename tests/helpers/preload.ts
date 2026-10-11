/**
 * Preload Bun Test: menerapkan migrasi ke database test sekali per proses
 * test, bila koneksi pemilik database test tersedia (DB_TEST_DATABASE +
 * DB_MIGRATION_USERNAME/PASSWORD, atau TEST_DATABASE_MIGRATION_URL). Unit test
 * murni tetap dapat berjalan tanpa database.
 */
import { SQL } from 'bun'
import { resolveDatabaseUrls } from '../../api/core/config/database-env'
import { runMigrations } from '../../db/migrator'

const ownerUrl = resolveDatabaseUrls(process.env).test.owner
if (ownerUrl) {
  const sql = new SQL({ url: ownerUrl, max: 1 })
  try {
    await runMigrations(sql)
  } finally {
    await sql.close()
  }
}
