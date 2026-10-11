import { randomBytes, randomUUID } from 'node:crypto'
import type { SQL } from 'bun'
import type { PermissionKey } from '../../../domains/auth/permissions'
import type { TenantContext } from '../../../domains/tenancy/types'
import { isUniqueViolation } from '../../core/database/errors'
import { withNewTenantTransaction, withTenantTransaction } from '../../core/database/transactions'
import { errors } from '../../core/errors/app-error'
import { resolveTenantContext } from '../../core/tenancy/resolve-context'
import { sessionsRepository } from '../auth/session.repository'
import { tenantsRepository, type Tenant } from './repository'

export interface TenantDetail {
  tenant: Tenant
  membership: { id: string; roles: string[]; permissions: PermissionKey[] }
  activeMemberCount: number
}

/** Mengubah nama perusahaan menjadi slug URL-safe dengan sufiks acak agar unik. */
export function createTenantSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  const suffix = randomBytes(3).toString('hex')
  return `${base.length >= 2 ? base : 'perusahaan'}-${suffix}`
}

export function createTenantService(deps: { sql: SQL }) {
  const { sql } = deps

  return {
    /**
     * Detail tenant tertentu. Keanggotaan diverifikasi terhadap database;
     * non-anggota menerima 404 agar keberadaan tenant tidak bocor.
     */
    async getForUser(input: { userId: string; tenantId: string; requestId: string }): Promise<TenantDetail> {
      const context = await resolveTenantContext(sql, input)
      if (!context) throw errors.notFound('TENANT_NOT_FOUND', 'Perusahaan tidak ditemukan.')
      return withTenantTransaction(sql, context, async (scope) => {
        const tenant = await tenantsRepository.findCurrent(scope)
        if (!tenant) throw errors.notFound('TENANT_NOT_FOUND', 'Perusahaan tidak ditemukan.')
        return {
          tenant,
          membership: { id: context.membershipId, roles: context.userRoles, permissions: context.permissions },
          activeMemberCount: await tenantsRepository.countMembers(scope),
        }
      })
    },

    async create(input: { userId: string; name: string; requestId: string }): Promise<Tenant> {
      const name = input.name.trim()
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { tenant } = await withNewTenantTransaction(
            sql,
            { tenantId: randomUUID(), userId: input.userId, requestId: input.requestId },
            (scope) => tenantsRepository.createWithOwner(scope, { name, slug: createTenantSlug(name) }),
          )
          return tenant
        } catch (error) {
          // Tabrakan slug sangat jarang (sufiks acak 24-bit); coba lagi dengan sufiks baru.
          if (isUniqueViolation(error, 'tenants_slug_key') && attempt < 2) continue
          throw error
        }
      }
      throw errors.conflict('TENANT_SLUG_CONFLICT', 'Gagal membuat slug perusahaan yang unik. Coba lagi.')
    },

    /**
     * Mengganti tenant aktif pada sesi. Pilihan klien selalu divalidasi
     * terhadap keanggotaan aktif di database sebelum disimpan.
     */
    async switchActive(input: {
      sessionId: string
      userId: string
      tenantId: string
      requestId: string
    }): Promise<TenantContext> {
      const context = await resolveTenantContext(sql, input)
      if (!context) throw errors.notFound('TENANT_NOT_FOUND', 'Perusahaan tidak ditemukan.')
      await sessionsRepository.setActiveTenant(sql, input.sessionId, context.tenantId)
      return context
    },
  }
}

export type TenantService = ReturnType<typeof createTenantService>
