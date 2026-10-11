import { describe, expect, test } from 'bun:test'
import { ConfigError, loadApiConfig } from '../../api/core/config/env'

const BASE = {
  DATABASE_URL: 'postgresql://agentic_app:pw@localhost:5432/agentic_office',
  SESSION_SECRET: 'x'.repeat(48),
}

describe('loadApiConfig', () => {
  test('memuat konfigurasi valid dengan default yang aman', () => {
    const config = loadApiConfig({ ...BASE, NODE_ENV: 'development' })
    expect(config.isProduction).toBe(false)
    expect(config.session.cookieSecure).toBe(false)
    expect(config.session.cookieName).toBe('aivo_session')
    expect(config.database.poolMax).toBe(10)
    expect(config.standalone.port).toBe(4000)
    expect(loadApiConfig({ ...BASE, API_STANDALONE_PORT: '4123' }).standalone.port).toBe(4123)
    expect(() => loadApiConfig({ ...BASE, API_STANDALONE_PORT: '70000' })).toThrow(/API_STANDALONE_PORT/)
  })

  test('production memaksa cookie Secure dengan prefix __Host- dan mematikan OpenAPI secara default', () => {
    const config = loadApiConfig({ ...BASE, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' })
    expect(config.session.cookieSecure).toBe(true)
    expect(config.session.cookieName).toBe('__Host-aivo_session')
    expect(config.openapi.enabled).toBe(false)
    expect(loadApiConfig({ ...BASE, NODE_ENV: 'production', OPENAPI_ENABLED: 'true' }).openapi.enabled).toBe(true)
    expect(loadApiConfig({ ...BASE, NODE_ENV: 'development' }).openapi.enabled).toBe(true)
    expect(config.security.rateLimit.loginPerIp).toEqual({ max: 30, windowMinutes: 15 })
    expect(config.security.rateLimit.registerPerIp).toEqual({ max: 10, windowMinutes: 60 })
    expect(config.security.rateLimit.tenantCreatePerUser).toEqual({ max: 10, windowMinutes: 60 })
  })

  test('menolak SESSION_SECRET kosong, pendek, atau nilai contoh', () => {
    expect(() => loadApiConfig({ DATABASE_URL: BASE.DATABASE_URL })).toThrow(ConfigError)
    expect(() => loadApiConfig({ ...BASE, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
    expect(() => loadApiConfig({ ...BASE, SESSION_SECRET: 'replace-with-strong-random-secret' })).toThrow(
      /nilai contoh/,
    )
  })

  test('menolak DATABASE_URL yang bukan PostgreSQL dan angka di luar batas', () => {
    expect(() => loadApiConfig({ ...BASE, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/)
    expect(() => loadApiConfig({ ...BASE, DATABASE_POOL_MAX: '0' })).toThrow(/DATABASE_POOL_MAX/)
  })

  test('menerima variabel database format Laravel (DB_CONNECTION, DB_HOST, ...) dan menolak yang tidak lengkap', () => {
    const laravel = {
      SESSION_SECRET: BASE.SESSION_SECRET,
      DB_CONNECTION: 'pgsql',
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_DATABASE: 'agentic_office',
      DB_USERNAME: 'agentic_app',
      DB_PASSWORD: 'p@ss word',
    }
    expect(loadApiConfig(laravel).database.url).toBe(
      'postgresql://agentic_app:p%40ss%20word@127.0.0.1:5432/agentic_office',
    )
    // URL lengkap menang bila keduanya ada.
    expect(loadApiConfig({ ...laravel, DATABASE_URL: BASE.DATABASE_URL }).database.url).toBe(BASE.DATABASE_URL)
    expect(() => loadApiConfig({ ...laravel, DB_CONNECTION: 'mysql' })).toThrow(/DB_CONNECTION/)
    expect(() => loadApiConfig({ ...laravel, DB_DATABASE: undefined })).toThrow(/DB_HOST, DB_PORT, dan DB_DATABASE/)
    expect(() => loadApiConfig({ SESSION_SECRET: BASE.SESSION_SECRET })).toThrow(/DB_CONNECTION=pgsql, DB_HOST/)
  })

  test('heartbeat SSE default di bawah idle timeout Bun (10 dtk); kombinasi yang memutus stream ditolak', () => {
    expect(loadApiConfig(BASE).realtime.heartbeatIntervalMs).toBe(5_000)
    expect(() => loadApiConfig({ ...BASE, REALTIME_HEARTBEAT_MS: '15000' })).toThrow(/idle timeout server/)
    expect(() => loadApiConfig({ ...BASE, REALTIME_HEARTBEAT_MS: '10000' })).toThrow(/NITRO_BUN_IDLE_TIMEOUT/)
    expect(
      loadApiConfig({ ...BASE, REALTIME_HEARTBEAT_MS: '30000', NITRO_BUN_IDLE_TIMEOUT: '60' }).realtime
        .heartbeatIntervalMs,
    ).toBe(30_000)
    expect(() => loadApiConfig({ ...BASE, NITRO_BUN_IDLE_TIMEOUT: '0' })).toThrow(/NITRO_BUN_IDLE_TIMEOUT/)
  })

  test('memvalidasi APP_TRUSTED_ORIGINS sebagai origin murni', () => {
    expect(loadApiConfig({ ...BASE, APP_TRUSTED_ORIGINS: 'https://app.example.com' }).security.trustedOrigins).toEqual([
      'https://app.example.com',
    ])
    expect(() => loadApiConfig({ ...BASE, APP_TRUSTED_ORIGINS: 'https://app.example.com/path' })).toThrow(
      /APP_TRUSTED_ORIGINS/,
    )
  })
})
