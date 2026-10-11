import { describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { normalizeDatabaseError } from '../../api/core/database/errors'
import { createTenantSlug } from '../../api/modules/tenants/service'
import { hasPermission } from '../../domains/tenancy/types'

describe('slug tenant', () => {
  test('menghasilkan slug yang memenuhi constraint database', () => {
    const pattern = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/
    for (const name of ['PT Nusantara Digital', 'Café Ñandú & Co.', '!!', 'A'.repeat(200)]) {
      expect(createTenantSlug(name)).toMatch(pattern)
    }
    expect(createTenantSlug('Café Ñandú')).toStartWith('cafe-nandu-')
  })
})

describe('izin', () => {
  test('hasPermission hanya berdasarkan daftar izin dari database', () => {
    expect(hasPermission({ permissions: ['agents.read'] }, 'agents.read')).toBe(true)
    expect(hasPermission({ permissions: [] }, 'agents.read')).toBe(false)
  })
})

describe('normalisasi error database', () => {
  const pgError = (errno: string) =>
    new SQL.PostgresError('detail internal', { code: 'ERR_POSTGRES_SERVER_ERROR', errno })

  test('memetakan SQLSTATE ke error aman tanpa membocorkan pesan asli', () => {
    expect(normalizeDatabaseError(pgError('23505'))).toMatchObject({ status: 409, code: 'RESOURCE_CONFLICT' })
    expect(normalizeDatabaseError(pgError('42501'))).toMatchObject({ status: 403, code: 'DATABASE_ACCESS_DENIED' })
    expect(normalizeDatabaseError(pgError('22P02'))).toMatchObject({ status: 422, code: 'INVALID_DATA' })
    expect(normalizeDatabaseError(pgError('40001'))).toMatchObject({ status: 503 })
    expect(normalizeDatabaseError(pgError('08006'))).toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' })
    expect(normalizeDatabaseError(pgError('23505'))?.message).not.toContain('detail internal')
  })

  test('error non-database tidak dinormalisasi', () => {
    expect(normalizeDatabaseError(new Error('x'))).toBeNull()
  })
})
