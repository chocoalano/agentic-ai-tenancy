/**
 * KHUSUS PENGEMBANGAN: menghapus database (utama atau --test) memakai
 * DATABASE_ADMIN_URL. Dipakai oleh `bun run db:reset`, yang kemudian
 * menjalankan bootstrap dan migrasi ulang.
 */
import { SQL } from 'bun'
import { parseDatabaseUrl, requireNonProduction } from './lib/database-urls'

requireNonProduction('db:reset')

const useTest = process.argv.includes('--test')
const variable = useTest ? 'TEST_DATABASE_MIGRATION_URL' : 'DATABASE_MIGRATION_URL'
const target = parseDatabaseUrl(variable, process.env[variable])
const adminUrl = process.env.DATABASE_ADMIN_URL
if (!adminUrl) {
  console.error('✖ DATABASE_ADMIN_URL belum diisi.')
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
