import { describe, expect, test } from 'bun:test'
import { isTenantScopedKey, safeRedirectPath, tenantDataKey } from '../../app/utils/tenant-cache'

describe('kunci cache tenant (frontend)', () => {
  test('kunci memuat ID tenant sehingga data antar tenant tidak tercampur', () => {
    expect(tenantDataKey('tenant-a', 'agents')).toBe('tenant:tenant-a:agents')
    expect(tenantDataKey('tenant-a', 'agents')).not.toBe(tenantDataKey('tenant-b', 'agents'))
    expect(tenantDataKey(null, 'agents')).toBe('tenant:none:agents')
  })

  test('hanya kunci tenant-scoped yang dibuang saat ganti tenant', () => {
    expect(isTenantScopedKey(tenantDataKey('t1', 'office'))).toBe(true)
    expect(isTenantScopedKey('auth-state')).toBe(false)
  })

  test('redirect setelah login hanya ke path internal (cegah open redirect)', () => {
    expect(safeRedirectPath('/agents')).toBe('/agents')
    expect(safeRedirectPath('//evil.example')).toBe('/office')
    expect(safeRedirectPath('/\\evil.example')).toBe('/office')
    expect(safeRedirectPath('https://evil.example')).toBe('/office')
    expect(safeRedirectPath(undefined)).toBe('/office')
  })
})
