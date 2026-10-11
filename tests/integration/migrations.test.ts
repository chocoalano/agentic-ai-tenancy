/** Membutuhkan PostgreSQL (TEST_DATABASE_MIGRATION_URL). */
import { afterAll, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SQL } from 'bun'
import { MIGRATIONS_DIR, loadMigrations, runMigrations } from '../../db/migrator'
import { testDatabaseUrls } from '../helpers/env'

const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 2 })
afterAll(() => ownerSql.close())

describe('migrasi database', () => {
  test('idempoten: menjalankan ulang tidak menerapkan apa pun', async () => {
    const files = await loadMigrations()
    const result = await runMigrations(ownerSql)
    expect(result.applied).toEqual([])
    expect(result.alreadyApplied).toHaveLength(files.length)
  })

  test('menolak migrasi lama yang diubah (checksum berbeda)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aivo-migrations-'))
    try {
      await cp(MIGRATIONS_DIR, dir, { recursive: true })
      await writeFile(join(dir, '0002_identity.sql'), '-- diubah diam-diam\nselect 1;\n')
      await expect(runMigrations(ownerSql, { dir })).rejects.toThrow(/Checksum migrasi 0002_identity/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('menolak nama file migrasi yang tidak sesuai format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aivo-migrations-'))
    try {
      await writeFile(join(dir, 'tanpa-nomor.sql'), 'select 1;')
      await expect(loadMigrations(dir)).rejects.toThrow(/tidak valid/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('ekstensi pgvector siap (bila tersedia di server)', async () => {
    const [row] = await ownerSql<{ available: boolean; installed: boolean }[]>`
      select
        exists (select 1 from pg_available_extensions where name = 'vector') as available,
        exists (select 1 from pg_extension where extname = 'vector') as installed
    `
    if (row?.available) expect(row.installed).toBe(true)
  })
})
