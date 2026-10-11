import { Elysia, t } from 'elysia'
import { APPROVAL_STATUSES } from '../../../domains/tasks/types'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import { ApiErrorSchema, tenantErrors, validationErrors } from '../../core/errors/schemas'
import { IdParams, optionalEnum } from '../../shared/schemas'
import type { AuthService } from '../auth/service'
import { ApprovalSchema, DecideApprovalBody } from '../tasks/schemas'
import type { ApprovalRecord } from './repository'
import type { ApprovalService } from './service'

const TENANT_SECURITY = [{ sessionCookie: [] }]

function presentApproval(approval: ApprovalRecord): typeof ApprovalSchema.static {
  return {
    id: approval.id,
    taskId: approval.taskId,
    runId: approval.runId,
    agentId: approval.agentId,
    actionType: approval.actionType,
    actionSummary: approval.actionSummary,
    status: approval.status,
    requestedBy: approval.requestedBy,
    requestedAt: approval.requestedAt,
    expiresAt: approval.expiresAt,
    decidedByUserId: approval.decidedByUserId,
    decidedAt: approval.decidedAt,
    decisionNote: approval.decisionNote,
  }
}

export function approvalRoutes(deps: { config: ApiConfig; auth: AuthService; approvals: ApprovalService }) {
  return new Elysia({ prefix: '/approvals', tags: ['Approvals'] })
    .use(guardPlugin(deps))
    .get(
      '',
      async ({ tenant, query }) => ({
        items: (await deps.approvals.list(tenant, { status: query.status, limit: query.limit })).map(presentApproval),
      }),
      {
        tenant: 'approvals.read',
        query: t.Object({
          status: optionalEnum(APPROVAL_STATUSES, 'Filter status persetujuan'),
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
        }),
        response: { 200: t.Object({ items: t.Array(ApprovalSchema) }), ...tenantErrors, ...validationErrors },
        detail: {
          summary: 'Daftar permintaan persetujuan',
          description: 'Permintaan persetujuan tenant aktif (default semua status; filter `status=pending`).',
          security: TENANT_SECURITY,
        },
      },
    )
    .get('/:id', async ({ tenant, params }) => presentApproval(await deps.approvals.get(tenant, params.id)), {
      tenant: 'approvals.read',
      params: IdParams,
      response: { 200: ApprovalSchema, ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
      detail: { summary: 'Detail permintaan persetujuan', security: TENANT_SECURITY },
    })
    .post(
      '/:id/decide',
      async ({ tenant, params, body }) => presentApproval(await deps.approvals.decide(tenant, params.id, body)),
      {
        tenant: 'approvals.decide',
        params: IdParams,
        body: DecideApprovalBody,
        response: { 200: ApprovalSchema, ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Setujui atau tolak',
          description:
            'Butuh izin `approvals.decide`; keputusan ganda ditolak 409. Menyetujui merilis hasil dan menyelesaikan ' +
            'tugas; menolak menggagalkan tugas (APPROVAL_REJECTED). 403 `APPROVAL_SELF_DECISION` bila kebijakan ' +
            'melarang pembuat tugas memutuskan sendiri.',
          security: TENANT_SECURITY,
        },
      },
    )
}
