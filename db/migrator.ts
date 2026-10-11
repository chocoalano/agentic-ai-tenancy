import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQL } from 'bun'

export const MIGRATIONS_DIR = join(import.meta.dir, 'migrations')

export interface MigrationFile {
  version: string
  name: string
  path: string
  checksum: string
  content: string
}

export interface MigrationResult {
  applied: string[]
  alreadyApplied: string[]
}

const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/
const LOCK_KEY = 'agentic_office_schema_migrations'

export async function loadMigrations(dir: string = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const migrations: MigrationFile[] = []
  for (const file of entries) {
    const match = MIGRATION_PATTERN.exec(file)
    if (!match?.[1] || !match[2]) {
      throw new Error(`Nama file migrasi tidak valid: ${file} (format: 0001_nama_migrasi.sql)`)
    }
    const path = join(dir, file)
    const content = await Bun.file(path).text()
    migrations.push({
      version: match[1],
      name: match[2],
      path,
      checksum: createHash('sha256').update(content).digest('hex'),
      content,
    })
  }
  const versions = new Set<string>()
  for (const migration of migrations) {
    if (versions.has(migration.version)) throw new Error(`Versi migrasi duplikat: ${migration.version}`)
    versions.add(migration.version)
  }
  return migrations
}

/**
 * Menjalankan migrasi SQL yang belum diterapkan, masing-masing di dalam
 * transaksi sendiri. Advisory lock mencegah dua proses migrasi berjalan
 * bersamaan. Checksum mencegah perubahan diam-diam pada migrasi yang sudah
 * diterapkan.
 */
export async function runMigrations(
  sql: SQL,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<MigrationResult> {
  const log = options.log ?? (() => {})
  const migrations = await loadMigrations(options.dir)
  const connection = await sql.reserve()
  try {
    await connection`select pg_advisory_lock(hashtext(${LOCK_KEY}))`
    await connection`
      create table if not exists schema_migrations (
        version text primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `
    const appliedRows = await connection<{ version: string; checksum: string }[]>`
      select version, checksum from schema_migrations order by version
    `
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]))
    const result: MigrationResult = { applied: [], alreadyApplied: [] }

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.version)
      const label = `${migration.version}_${migration.name}`
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(
            `Checksum migrasi ${label} berbeda dari yang sudah diterapkan. ` +
              'Jangan mengubah migrasi lama; buat migrasi baru.',
          )
        }
        result.alreadyApplied.push(label)
        continue
      }
      log(`→ menerapkan ${label}`)
      await connection.begin(async (tx) => {
        await tx.unsafe(migration.content)
        await tx`
          insert into schema_migrations (version, name, checksum)
          values (${migration.version}, ${migration.name}, ${migration.checksum})
        `
      })
      result.applied.push(label)
    }
    return result
  } finally {
    await connection`select pg_advisory_unlock(hashtext(${LOCK_KEY}))`.catch(() => {})
    connection.release()
  }
}
