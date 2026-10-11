import { Elysia, t } from 'elysia'
import { TASK_STATUSES } from '../../../domains/tasks/types'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import { ApiErrorSchema, tenantErrors, validationErrors } from '../../core/errors/schemas'
import { IdParams, Uuid, optionalEnum } from '../../shared/schemas'
import type { AuthService } from '../auth/service'
import type { RunRecord } from '../runs/repository'
import { CapabilitiesSchema, CreateTaskBody, TaskDetailSchema, TaskSchema, type RunSchema } from './schemas'
import type { TaskListItem, TaskService } from './service'

const TENANT_SECURITY = [{ sessionCookie: [] }]

export function presentRun(run: RunRecord): typeof RunSchema.static {
  return {
    id: run.id,
    taskId: run.taskId,
    agentId: run.agentId,
    attempt: run.attempt,
    status: run.status,
    runtimeProvider: run.runtimeProvider,
    runtimeModel: run.runtimeModel,
    claimedAt: run.claimedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelRequested: run.cancelRequested,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    retryable: run.retryable,
    providerRequestId: run.providerRequestId,
    usage:
      run.usageInputTokens === null && run.usageOutputTokens === null
        ? null
        : { inputTokens: run.usageInputTokens, outputTokens: run.usageOutputTokens },
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export function presentTask(task: TaskListItem): typeof TaskSchema.static {
  return {
    id: task.id,
    agentId: task.agentId,
    agentName: task.agentName,
    createdByUserId: task.createdByUserId,
    title: task.title,
    instruction: task.instruction,
    priority: task.priority,
    status: task.status,
    requiresApproval: task.requiresApproval,
    latestRun: task.latestRun ? presentRun(task.latestRun) : null,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    errorCode: task.errorCode,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    queuedAt: task.queuedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  }
}

export function taskRoutes(deps: { config: ApiConfig; auth: AuthService; tasks: TaskService }) {
  return new Elysia({ prefix: '/tasks', tags: ['Tasks'] })
    .use(guardPlugin(deps))
    .get('/capabilities', ({ tenant }) => deps.tasks.capabilities(tenant), {
      tenant: 'tasks.read',
      response: { 200: CapabilitiesSchema, ...tenantErrors },
      detail: {
        summary: 'Kemampuan eksekusi tugas',
        description:
          'Ketersediaan runtime AI (jujur: `available=false` bila belum dikonfigurasi), izin pengguna, batas, dan ' +
          'pemakaian tenant hari ini.',
        security: TENANT_SECURITY,
      },
    })
    .get(
      '',
      async ({ tenant, query }) => ({
        items: (
          await deps.tasks.list(tenant, { agentId: query.agentId, status: query.status, limit: query.limit })
        ).map(presentTask),
      }),
      {
        tenant: 'tasks.read',
        query: t.Object({
          agentId: t.Optional(Uuid),
          status: optionalEnum(TASK_STATUSES, 'Filter status tugas'),
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
        }),
        response: { 200: t.Object({ items: t.Array(TaskSchema) }), ...tenantErrors, ...validationErrors },
        detail: {
          summary: 'Riwayat tugas',
          description: 'Tugas milik tenant aktif (terbaru dahulu), opsional difilter agent/status. Butuh `tasks.read`.',
          security: TENANT_SECURITY,
        },
      },
    )
    .post(
      '',
      async ({ tenant, body, status }) => {
        const result = await deps.tasks.create(tenant, body)
        const task = presentTask(result.task)
        if (result.created) {
          const created = true as const
          return status(201, { task, created })
        }
        const created = false as const
        return status(200, { task, created })
      },
      {
        tenant: 'tasks.create',
        body: CreateTaskBody,
        response: {
          201: t.Object({ task: TaskSchema, created: t.Literal(true) }),
          200: t.Object({ task: TaskSchema, created: t.Literal(false) }),
          ...tenantErrors,
          404: ApiErrorSchema,
          429: ApiErrorSchema,
          ...validationErrors,
        },
        detail: {
          summary: 'Beri tugas kepada AI employee',
          description:
            'Membuat tugas + run pertama (queued) untuk dieksekusi worker. 409 `RUNTIME_NOT_CONFIGURED` bila runtime ' +
            'belum dikonfigurasi, 409 `AGENT_NOT_ASSIGNABLE` bila agent tidak aktif, 429 bila batas aktif/harian/laju ' +
            'tercapai. Pengiriman ulang dengan `idempotencyKey` yang sama mengembalikan 200 dan tugas yang sama.',
          security: TENANT_SECURITY,
        },
      },
    )
    .get(
      '/:id',
      async ({ tenant, params }) => {
        const detail = await deps.tasks.get(tenant, params.id)
        return { ...presentTask(detail), runs: detail.runs.map(presentRun), output: detail.output }
      },
      {
        tenant: 'tasks.read',
        params: IdParams,
        response: { 200: TaskDetailSchema, ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Detail tugas',
          description: 'Tugas beserta semua run dan ketersediaan hasil. 404 bila tugas bukan milik tenant aktif.',
          security: TENANT_SECURITY,
        },
      },
    )
    .post(
      '/:id/cancel',
      async ({ tenant, params }) => ({ task: presentTask(await deps.tasks.cancel(tenant, params.id)) }),
      {
        tenant: 'tasks.cancel',
        params: IdParams,
        response: { 200: t.Object({ task: TaskSchema }), ...tenantErrors, 404: ApiErrorSchema, ...validationErrors },
        detail: {
          summary: 'Batalkan tugas',
          description:
            'Run antrean/menunggu persetujuan dibatalkan seketika; run yang sedang dieksekusi diberi tanda dan ' +
            'dihentikan worker. 409 `TASK_ALREADY_FINISHED` bila sudah terminal.',
          security: TENANT_SECURITY,
        },
      },
    )
}
