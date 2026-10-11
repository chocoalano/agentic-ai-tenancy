import { Elysia, t } from 'elysia'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import { ApiErrorSchema, protectedErrors, validationErrors } from '../../core/errors/schemas'
import { requestIdOf } from '../../core/http/request-context'
import { IdParams, PermissionKeySchema, TenantContextSchema, TenantSchema, Uuid } from '../../shared/schemas'
import type { AuthService } from '../auth/service'
import type { MembershipService } from '../memberships/service'
import type { TenantService } from './service'

const SESSION_SECURITY = [{ sessionCookie: [] }]

const TenantListItem = t.Object(
  {
    id: Uuid,
    slug: t.String(),
    name: t.String(),
    status: t.UnionEnum(['active', 'suspended']),
    membershipId: Uuid,
    roles: t.Array(t.String()),
    isActive: t.Boolean({ description: 'Tenant ini adalah tenant aktif pada sesi saat ini' }),
  },
  { title: 'TenantListItem' },
)

const TenantDetailResponse = t.Object(
  {
    tenant: TenantSchema,
    membership: t.Object({ id: Uuid, roles: t.Array(t.String()), permissions: t.Array(PermissionKeySchema) }),
    activeMemberCount: t.Integer({ minimum: 0 }),
  },
  { title: 'TenantDetail' },
)

export function tenantRoutes(deps: {
  config: ApiConfig
  auth: AuthService
  tenants: TenantService
  memberships: MembershipService
}) {
  const { tenants, memberships } = deps

  return new Elysia({ prefix: '/tenants', tags: ['Tenants'] })
    .use(guardPlugin(deps))
    .get(
      '',
      async ({ session }) => {
        const items = await memberships.listForUser(session.user.id)
        return {
          items: items.map((membership) => ({
            id: membership.tenant.id,
            slug: membership.tenant.slug,
            name: membership.tenant.name,
            status: membership.tenant.status,
            membershipId: membership.id,
            roles: membership.roles,
            isActive: membership.tenant.id === session.activeTenantId,
          })),
        }
      },
      {
        auth: true,
        response: { 200: t.Object({ items: t.Array(TenantListItem) }), ...protectedErrors },
        detail: {
          summary: 'Daftar perusahaan saya',
          description: 'Hanya perusahaan tempat pengguna memiliki keanggotaan aktif (ditegakkan RLS).',
          security: SESSION_SECURITY,
        },
      },
    )
    .post(
      '',
      async ({ body, session, request, status }) => {
        const tenant = await tenants.create({
          userId: session.user.id,
          name: body.name,
          requestId: requestIdOf(request),
        })
        return status(201, tenant)
      },
      {
        auth: true,
        body: t.Object({ name: t.String({ minLength: 2, maxLength: 120, description: 'Nama perusahaan' }) }),
        response: { 201: TenantSchema, ...protectedErrors, 409: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Buat perusahaan',
          description: 'Membuat tenant baru; pengguna menjadi owner. Tenant aktif sesi tidak berubah otomatis.',
          security: SESSION_SECURITY,
        },
      },
    )
    .get(
      '/:id',
      ({ params, session, request }) =>
        tenants.getForUser({ userId: session.user.id, tenantId: params.id, requestId: requestIdOf(request) }),
      {
        auth: true,
        params: IdParams,
        response: { 200: TenantDetailResponse, ...protectedErrors, 404: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Detail perusahaan',
          description: 'Mengembalikan 404 bila tenant tidak ada atau pengguna bukan anggota aktif.',
          security: SESSION_SECURITY,
        },
      },
    )
    .post(
      '/:id/switch',
      async ({ params, session, request }) => {
        const context = await tenants.switchActive({
          sessionId: session.sessionId,
          userId: session.user.id,
          tenantId: params.id,
          requestId: requestIdOf(request),
        })
        return {
          tenantId: context.tenantId,
          membershipId: context.membershipId,
          roles: context.userRoles,
          permissions: context.permissions,
        }
      },
      {
        auth: true,
        params: IdParams,
        response: { 200: TenantContextSchema, ...protectedErrors, 404: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Ganti tenant aktif',
          description:
            'Memvalidasi keanggotaan aktif lalu menyimpan tenant terpilih pada sesi. Klien wajib membuang ' +
            'seluruh cache data tenant sebelumnya setelah memanggil endpoint ini.',
          security: SESSION_SECURITY,
        },
      },
    )
}
