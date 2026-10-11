import { Elysia, t } from 'elysia'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import { ApiErrorSchema, tenantErrors, validationErrors } from '../../core/errors/schemas'
import { IdParams } from '../../shared/schemas'
import type { AuthService } from '../auth/service'
import { presentRun } from '../tasks/routes'
import { RunEventSchema, RunOutputSchema, RunSchema } from '../tasks/schemas'
import type { RunService } from './service'

const TENANT_SECURITY = [{ sessionCookie: [] }]

export function runRoutes(deps: { config: ApiConfig; auth: AuthService; runs: RunService }) {
  return new Elysia({ tags: ['Tasks'] })
    .use(guardPlugin(deps))
    .get(
      '/tasks/:id/runs',
      async ({ tenant, params }) => ({ items: (await deps.runs.listForTask(tenant, params.id)).map(presentRun) }),
      {
        tenant: 'tasks.read',
        params: IdParams,
        response: { 200: t.Object({ items: t.Array(RunSchema) }), ...tenantErrors, ...validationErrors },
        detail: { summary: 'Daftar run sebuah tugas', security: TENANT_SECURITY },
      },
    )
    .get('/runs/:id', async ({ tenant, params }) => presentRun(await deps.runs.get(tenant, params.id)), {
      tenant: 'tasks.read',
      params: IdParams,
      response: { 200: RunSchema, ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
      detail: { summary: 'Detail run', security: TENANT_SECURITY },
    })
    .get('/runs/:id/events', async ({ tenant, params }) => ({ items: await deps.runs.listEvents(tenant, params.id) }), {
      tenant: 'tasks.read',
      params: IdParams,
      response: {
        200: t.Object({ items: t.Array(RunEventSchema) }),
        ...tenantErrors,
        404: ApiErrorSchema,
        ...validationErrors,
      },
      detail: {
        summary: 'Jejak event run',
        description: 'Event siklus hidup run dengan payload tersanitasi (tanpa prompt/penalaran model).',
        security: TENANT_SECURITY,
      },
    })
    .get(
      '/runs/:id/output',
      async ({ tenant, params }) => {
        const output = await deps.runs.getOutput(tenant, params.id)
        return {
          runId: output.runId,
          taskId: output.taskId,
          outputType: output.outputType,
          content: output.content,
          released: output.released,
          createdAt: output.createdAt,
        }
      },
      {
        tenant: 'tasks.read',
        params: IdParams,
        response: { 200: RunOutputSchema, ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Hasil run',
          description:
            'Keluaran model yang dipersistenkan. 404 bila belum ada; 409 `OUTPUT_PENDING_APPROVAL` bila hasil belum ' +
            'dirilis karena menunggu persetujuan.',
          security: TENANT_SECURITY,
        },
      },
    )
}
