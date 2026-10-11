import { describe, expect, test } from 'bun:test'
import { buildPostgresUrl, resolveDatabaseUrls } from '../../api/core/config/database-env'

const LARAVEL = {
  DB_CONNECTION: 'pgsql',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_DATABASE: 'agentic_office',
  DB_USERNAME: 'agentic_app',
  DB_PASSWORD: 'p@ss:word/1',
  DB_MIGRATION_USERNAME: 'agentic_owner',
  DB_MIGRATION_PASSWORD: 'owner#pw',
  DB_ADMIN_USERNAME: 'postgres',
  DB_TEST_DATABASE: 'agentic_office_test',
}

describe('resolveDatabaseUrls (format Laravel)', () => {
  test('menyusun semua koneksi dari DB_* dengan password ter-encode', () => {
    const urls = resolveDatabaseUrls(LARAVEL)
    expect(urls.issues).toEqual([])
    expect(urls.source).toBe('laravel')
    expect(urls.app).toBe('postgresql://agentic_app:p%40ss%3Aword%2F1@127.0.0.1:5432/agentic_office')
    expect(urls.owner).toBe('postgresql://agentic_owner:owner%23pw@127.0.0.1:5432/agentic_office')
    expect(urls.admin).toBe('postgresql://postgres@127.0.0.1:5432/postgres')
    expect(urls.test.app).toBe('postgresql://agentic_app:p%40ss%3Aword%2F1@127.0.0.1:5432/agentic_office_test')
    expect(urls.test.owner).toBe('postgresql://agentic_owner:owner%23pw@127.0.0.1:5432/agentic_office_test')
    // URL yang dihasilkan dapat dibaca kembali oleh parser URL standar.
    const parsed = new URL(urls.app ?? '')
    expect(decodeURIComponent(parsed.password)).toBe('p@ss:word/1')
    expect(parsed.pathname).toBe('/agentic_office')
  })

  test('DB_PORT default 5432; DB_ADMIN_DATABASE & DB_SSLMODE dihormati', () => {
    const urls = resolveDatabaseUrls({
      ...LARAVEL,
      DB_PORT: undefined,
      DB_ADMIN_DATABASE: 'template1',
      DB_SSLMODE: 'require',
    })
    expect(urls.issues).toEqual([])
    expect(urls.app).toBe('postgresql://agentic_app:p%40ss%3Aword%2F1@127.0.0.1:5432/agentic_office?sslmode=require')
    expect(urls.admin).toBe('postgresql://postgres@127.0.0.1:5432/template1?sslmode=require')
  })

  test('URL lengkap menang atas DB_* (dipakai e2e/standalone untuk menyuntikkan koneksi lain)', () => {
    const urls = resolveDatabaseUrls({
      ...LARAVEL,
      DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/nowhere',
      TEST_DATABASE_URL: 'postgresql://t:t@localhost:5432/t_db',
    })
    expect(urls.issues).toEqual([])
    expect(urls.source).toBe('url')
    expect(urls.app).toBe('postgresql://nobody:nobody@127.0.0.1:1/nowhere')
    expect(urls.test.app).toBe('postgresql://t:t@localhost:5432/t_db')
    // Koneksi lain tetap dari DB_*.
    expect(urls.owner).toContain('agentic_owner')
    expect(urls.test.owner).toContain('agentic_office_test')
  })

  test('hanya URL saja (tanpa DB_*) tetap didukung', () => {
    const urls = resolveDatabaseUrls({
      DATABASE_URL: 'postgresql://agentic_app:pw@localhost:5432/agentic_office',
      DATABASE_MIGRATION_URL: 'postgresql://agentic_owner:pw@localhost:5432/agentic_office',
    })
    expect(urls.issues).toEqual([])
    expect(urls.app).toBe('postgresql://agentic_app:pw@localhost:5432/agentic_office')
    expect(urls.owner).toBe('postgresql://agentic_owner:pw@localhost:5432/agentic_office')
    expect(urls.admin).toBeUndefined()
    expect(urls.test.app).toBeUndefined()
  })

  test('menolak DB_CONNECTION bukan pgsql, DB_PORT bukan angka, DB_* tidak lengkap, dan test = utama', () => {
    expect(resolveDatabaseUrls({ ...LARAVEL, DB_CONNECTION: 'mysql' }).issues).toEqual([
      'DB_CONNECTION harus pgsql (PostgreSQL); nilai "mysql" tidak didukung',
    ])
    expect(resolveDatabaseUrls({ ...LARAVEL, DB_PORT: 'abc' }).issues[0]).toMatch(/DB_PORT/)
    expect(resolveDatabaseUrls({ DB_HOST: 'localhost', DB_USERNAME: 'x' }).issues[0]).toMatch(
      /DB_HOST, DB_PORT, dan DB_DATABASE/,
    )
    expect(resolveDatabaseUrls({ ...LARAVEL, DB_TEST_DATABASE: LARAVEL.DB_DATABASE }).issues[0]).toMatch(
      /DB_TEST_DATABASE harus berbeda/,
    )
    expect(resolveDatabaseUrls({ DATABASE_URL: 'mysql://x' }).issues[0]).toMatch(/DATABASE_URL/)
  })

  test('tanpa konfigurasi sama sekali → tidak ada URL dan tidak ada issue palsu', () => {
    const urls = resolveDatabaseUrls({})
    expect(urls.source).toBe('none')
    expect(urls.app).toBeUndefined()
    expect(urls.issues).toEqual([])
  })

  test('buildPostgresUrl membungkus host IPv6 dan meng-encode identifier', () => {
    expect(buildPostgresUrl({ host: '::1', port: '5432', database: 'db', user: 'u', password: '' })).toBe(
      'postgresql://u@[::1]:5432/db',
    )
  })
})
