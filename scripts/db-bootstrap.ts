/**
 * Bootstrap database lokal (idempoten): membuat role dan database.
 *
 * Membutuhkan DATABASE_ADMIN_URL (role superuser/admin). Role yang dibuat:
 *   - agentic_runtime : group role NOLOGIN penerima hak akses tabel
 *   - <owner>         : user dari DATABASE_MIGRATION_URL, pemilik skema
 *   - <app>           : user dari DATABASE_URL, role runtime aplikasi
 *                       (NOSUPERUSER, NOBYPASSRLS, bukan pemilik tabel)
 *
 * Password role yang sudah ada tidak diubah kecuali dengan flag --sync-passwords.
 */
import { SQL } from 'bun'
import { parseDatabaseUrl, withDatabase, type ParsedDatabaseUrl } from './lib/database-urls'

const RUNTIME_GROUP = 'agentic_runtime'
const syncPasswords = process.argv.includes('--sync-passwords')

const adminUrl = process.env.DATABASE_ADMIN_URL
if (!adminUrl) {
  console.error('✖ DATABASE_ADMIN_URL belum diisi (mis. postgresql://postgres@localhost:5432/postgres).')
  process.exit(1)
}

const targets: { app: ParsedDatabaseUrl; owner: ParsedDatabaseUrl }[] = [
  {
    app: parseDatabaseUrl('DATABASE_URL', process.env.DATABASE_URL),
    owner: parseDatabaseUrl('DATABASE_MIGRATION_URL', process.env.DATABASE_MIGRATION_URL),
  },
]
if (process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_MIGRATION_URL) {
  targets.push({
    app: parseDatabaseUrl('TEST_DATABASE_URL', process.env.TEST_DATABASE_URL),
    owner: parseDatabaseUrl('TEST_DATABASE_MIGRATION_URL', process.env.TEST_DATABASE_MIGRATION_URL),
  })
}

for (const target of targets) {
  if (target.app.user === target.owner.user) {
    console.error('✖ DATABASE_URL dan DATABASE_MIGRATION_URL harus memakai role berbeda (runtime ≠ pemilik skema).')
    process.exit(1)
  }
  if (target.app.database !== target.owner.database) {
    console.error('✖ DATABASE_URL dan DATABASE_MIGRATION_URL harus menunjuk database yang sama.')
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
  if (!me?.is_superuser)
    console.warn('! DATABASE_ADMIN_URL bukan superuser; pembuatan ekstensi pgvector mungkin gagal.')

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
