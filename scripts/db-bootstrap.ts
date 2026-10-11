/**
 * Bootstrap database lokal (idempoten): membuat role dan database.
 *
 * Membutuhkan koneksi admin (DB_ADMIN_USERNAME/DB_ADMIN_PASSWORD/DB_ADMIN_DATABASE, atau
 * DATABASE_ADMIN_URL). Role yang dibuat:
 *   - agentic_runtime : group role NOLOGIN penerima hak akses tabel
 *   - <owner>         : DB_MIGRATION_USERNAME (atau user DATABASE_MIGRATION_URL), pemilik skema
 *   - <app>           : DB_USERNAME (atau user DATABASE_URL), role runtime aplikasi
 *                       (NOSUPERUSER, NOBYPASSRLS, bukan pemilik tabel)
 * Database test (DB_TEST_DATABASE / TEST_DATABASE_*_URL) ikut dibuat bila dikonfigurasi.
 *
 * Password role yang sudah ada tidak diubah kecuali dengan flag --sync-passwords.
 */
import { SQL } from 'bun'
import { describeMissingDatabase, resolveDatabaseUrls } from '../api/core/config/database-env'
import { LABELS, parseDatabaseUrl, withDatabase, type ParsedDatabaseUrl } from './lib/database-urls'

const RUNTIME_GROUP = 'agentic_runtime'
const syncPasswords = process.argv.includes('--sync-passwords')

const urls = resolveDatabaseUrls(process.env)
for (const issue of urls.issues) console.error(`✖ ${issue}`)
if (urls.issues.length > 0) process.exit(1)

const adminUrl = urls.admin
if (!adminUrl) {
  console.error(`✖ ${describeMissingDatabase('admin')}`)
  process.exit(1)
}

const targets: { app: ParsedDatabaseUrl; owner: ParsedDatabaseUrl }[] = [
  { app: parseDatabaseUrl(LABELS.app, urls.app), owner: parseDatabaseUrl(LABELS.owner, urls.owner) },
]
if (urls.test.app || urls.test.owner) {
  targets.push({
    app: parseDatabaseUrl(LABELS.testApp, urls.test.app),
    owner: parseDatabaseUrl(LABELS.testOwner, urls.test.owner),
  })
}

for (const target of targets) {
  if (target.app.user === target.owner.user) {
    console.error('✖ Role runtime (DB_USERNAME) dan pemilik skema (DB_MIGRATION_USERNAME) harus berbeda.')
    process.exit(1)
  }
  if (target.app.database !== target.owner.database) {
    console.error('✖ Koneksi runtime dan pemilik skema harus menunjuk database yang sama.')
    process.exit(1)
  }
}

const admin = new SQL({ url: adminUrl, max: 1 })

/** Membangun statement DDL dengan quoting aman di sisi server (format %I / %L). */
async function execFormatted(template: string, ...args: string[]): Promise<void> {
  const [row] = await admin<
    { statement: string }[]
  >`select format(${template}, variadic ${admin.array(args, 'TEXT')}) as statement`
  if (!row) throw new Error('Gagal menyusun statement')
  await admin.unsafe(row.statement)
}

async function roleExists(name: string): Promise<boolean> {
  const rows = await admin`select 1 from pg_roles where rolname = ${name}`
  return rows.length > 0
}

async function ensureLoginRole(role: ParsedDatabaseUrl, attributes: string): Promise<void> {
  if (!role.password) throw new Error(`Password untuk role ${role.user} wajib diisi di URL koneksi.`)
  if (await roleExists(role.user)) {
    await execFormatted(`alter role %I ${attributes}`, role.user)
    if (syncPasswords) await execFormatted('alter role %I password %L', role.user, role.password)
    console.log(`• role ${role.user} sudah ada (atribut diperbarui${syncPasswords ? ', password disinkronkan' : ''})`)
    return
  }
  await execFormatted(`create role %I ${attributes} password %L`, role.user, role.password)
  console.log(`✓ role ${role.user} dibuat`)
}

try {
  const [me] = await admin<
    { is_superuser: boolean }[]
  >`select rolsuper as is_superuser from pg_roles where rolname = current_user`
  if (!me?.is_superuser) console.warn('! Role admin bukan superuser; pembuatan ekstensi pgvector mungkin gagal.')

  if (!(await roleExists(RUNTIME_GROUP))) {
    await execFormatted('create role %I nologin', RUNTIME_GROUP)
    console.log(`✓ group role ${RUNTIME_GROUP} dibuat`)
  }

  for (const { app, owner } of targets) {
    await ensureLoginRole(owner, 'login nosuperuser nocreatedb nocreaterole nobypassrls')
    await ensureLoginRole(app, 'login inherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication')
    await execFormatted('grant %I to %I', RUNTIME_GROUP, app.user)

    const exists = await admin`select 1 from pg_database where datname = ${owner.database}`
    if (exists.length === 0) {
      await execFormatted(
        'create database %I owner %I encoding %L template template0',
        owner.database,
        owner.user,
        'UTF8',
      )
      console.log(`✓ database ${owner.database} dibuat (owner ${owner.user})`)
    } else {
      console.log(`• database ${owner.database} sudah ada`)
    }

    await execFormatted('revoke all on database %I from public', owner.database)
    await execFormatted('grant connect, temporary on database %I to %I', owner.database, RUNTIME_GROUP)

    const adminOnTarget = new SQL({ url: withDatabase(adminUrl, owner.database), max: 1 })
    try {
      await adminOnTarget.unsafe('revoke create on schema public from public')
      const [grantPublic] = await adminOnTarget<{ statement: string }[]>`
        select format('grant usage, create on schema public to %I; grant usage on schema public to %I', ${owner.user}::text, ${RUNTIME_GROUP}::text) as statement
      `
      if (grantPublic) await adminOnTarget.unsafe(grantPublic.statement)

      const [vector] = await adminOnTarget<{ available: boolean }[]>`
        select exists (select 1 from pg_available_extensions where name = 'vector') as available
      `
      if (vector?.available) {
        await adminOnTarget.unsafe('create extension if not exists vector')
        console.log(`✓ ekstensi pgvector aktif di ${owner.database}`)
      } else {
        console.log(`• pgvector tidak tersedia di server; dilewati untuk ${owner.database}`)
      }
    } finally {
      await adminOnTarget.close()
    }
  }
  console.log('Bootstrap selesai. Lanjutkan dengan: bun run db:migrate')
} catch (error) {
  console.error('✖ Bootstrap gagal:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await admin.close()
}
