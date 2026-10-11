/**
 * KHUSUS PENGEMBANGAN: menghapus database (utama atau --test) memakai koneksi
 * admin (DB_ADMIN_* atau DATABASE_ADMIN_URL). Dipakai oleh `bun run db:reset`,
 * yang kemudian menjalankan bootstrap dan migrasi ulang.
 */
import { SQL } from 'bun'
import { describeMissingDatabase, resolveDatabaseUrls } from '../api/core/config/database-env'
import { LABELS, parseDatabaseUrl, requireNonProduction } from './lib/database-urls'

requireNonProduction('db:reset')

const useTest = process.argv.includes('--test')
const urls = resolveDatabaseUrls(process.env)
const target = useTest
  ? parseDatabaseUrl(LABELS.testOwner, urls.test.owner)
  : parseDatabaseUrl(LABELS.owner, urls.owner)
const adminUrl = urls.admin
if (!adminUrl) {
  console.error(`✖ ${describeMissingDatabase('admin')}`)
  process.exit(1)
}

const admin = new SQL({ url: adminUrl, max: 1 })
try {
  await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${target.database} and pid <> pg_backend_pid()`
  const [row] = await admin<
    { statement: string }[]
  >`select format('drop database if exists %I', ${target.database}::text) as statement`
  if (row) await admin.unsafe(row.statement)
  console.log(`✓ database ${target.database} dihapus`)
} catch (error) {
  console.error('✖ Gagal menghapus database:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await admin.close()
}
