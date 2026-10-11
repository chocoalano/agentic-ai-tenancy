import { Elysia, t } from 'elysia'
import { AGENT_LIFECYCLE_STATUSES } from '../../../domains/agents/types'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import { ApiErrorSchema, tenantErrors, validationErrors } from '../../core/errors/schemas'
import { IdParams, Timestamp, Uuid } from '../../shared/schemas'
import type { AuthService } from '../auth/service'
import type { AgentService } from './service'

const AgentSummarySchema = t.Object(
  {
    id: Uuid,
    slug: t.String(),
    name: t.String(),
    roleKey: t.String(),
    roleTitle: t.String(),
    description: t.String(),
    lifecycleStatus: t.UnionEnum(AGENT_LIFECYCLE_STATUSES),
    runtimeStatus: t.Union([t.UnionEnum(['thinking', 'working', 'waiting_approval']), t.Null()], {
      description:
        'Status runtime otoritatif dari run aktif terbaru (queued/claimed → thinking, running → working). ' +
        'null bila agent tidak sedang mengerjakan tugas.',
    }),
    currentTaskId: t.Union([Uuid, t.Null()]),
    currentRunId: t.Union([Uuid, t.Null()]),
    isSeedData: t.Boolean({ description: 'true untuk data seed pengembangan' }),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { title: 'AgentSummary' },
)

const AgentDetailSchema = t.Composite([AgentSummarySchema, t.Object({ mainInstruction: t.String() })], {
  title: 'AgentDetail',
})

const TENANT_SECURITY = [{ sessionCookie: [] }]

export function agentRoutes(deps: { config: ApiConfig; auth: AuthService; agents: AgentService }) {
  return new Elysia({ prefix: '/agents', tags: ['Agents'] })
    .use(guardPlugin(deps))
    .get(
      '',
      async ({ tenant }) => {
        return { items: await deps.agents.list(tenant) }
      },
      {
        tenant: 'agents.read',
        response: { 200: t.Object({ items: t.Array(AgentSummarySchema) }), ...tenantErrors },
        detail: {
          summary: 'Daftar AI employee',
          description: 'AI employee milik tenant aktif. Butuh izin `agents.read`. Data diisolasi oleh RLS.',
          security: TENANT_SECURITY,
        },
      },
    )
    .get('/:id', ({ tenant, params }) => deps.agents.get(tenant, params.id), {
      tenant: 'agents.read',
      params: IdParams,
      response: { 200: AgentDetailSchema, ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
      detail: {
        summary: 'Detail AI employee',
        description: 'Mengembalikan 404 bila agent tidak ada di tenant aktif (termasuk agent milik tenant lain).',
        security: TENANT_SECURITY,
      },
    })
}
