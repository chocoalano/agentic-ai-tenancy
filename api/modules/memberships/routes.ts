import { Elysia, t } from 'elysia'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import { protectedErrors } from '../../core/errors/schemas'
import { Timestamp, Uuid } from '../../shared/schemas'
import type { AuthService } from '../auth/service'
import type { MembershipService } from './service'

const MembershipSchema = t.Object(
  {
    id: Uuid,
    status: t.UnionEnum(['invited', 'active', 'suspended']),
    roles: t.Array(t.String()),
    createdAt: Timestamp,
    isActiveTenant: t.Boolean(),
    tenant: t.Object({
      id: Uuid,
      slug: t.String(),
      name: t.String(),
      status: t.UnionEnum(['active', 'suspended']),
    }),
  },
  { title: 'Membership' },
)

export function membershipRoutes(deps: { config: ApiConfig; auth: AuthService; memberships: MembershipService }) {
  return new Elysia({ prefix: '/memberships', tags: ['Tenants'] }).use(guardPlugin(deps)).get(
    '',
    async ({ session }) => {
      const items = await deps.memberships.listForUser(session.user.id)
      return { items: items.map((item) => ({ ...item, isActiveTenant: item.tenant.id === session.activeTenantId })) }
    },
    {
      auth: true,
      response: { 200: t.Object({ items: t.Array(MembershipSchema) }), ...protectedErrors },
      detail: {
        summary: 'Keanggotaan saya',
        description: 'Keanggotaan aktif pengguna di semua perusahaan beserta perannya.',
        security: [{ sessionCookie: [] }],
      },
    },
  )
}
