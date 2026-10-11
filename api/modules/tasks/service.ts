import type { SQL } from 'bun'
import {
  RUN_ERROR_MESSAGES,
  isTerminalTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from '../../../domains/tasks/types'
import { hasPermission, type TenantContext } from '../../../domains/tenancy/types'
import type { ApiConfig } from '../../core/config/env'
import { withTenantTransaction, type TenantScope } from '../../core/database/transactions'
import { AppError, errors } from '../../core/errors/app-error'
import type { AgentRuntime } from '../../core/runtime'
import type { RateLimiter } from '../../core/security/rate-limiter'
import { agentsRepository } from '../agents/repository'
import { approvalsRepository } from '../approvals/repository'
import { publishAgentEvent } from '../runs/events'
import { runsRepository, type RunRecord } from '../runs/repository'
import { tasksRepository, type TaskRecord } from './repository'

export interface TaskCapabilities {
  runtime: { available: boolean; kind: 'real' | 'fixture' | 'none'; provider: string; model: string }
  canCreate: boolean
  canCancel: boolean
  limits: { maxInstructionChars: number; maxActiveTasks: number; dailyTaskLimit: number; maxAttempts: number }
  usage: { activeTasks: number; createdToday: number }
}

export interface TaskListItem extends TaskRecord {
  agentName: string
  latestRun: RunRecord | null
}

export interface TaskDetail extends TaskListItem {
  runs: RunRecord[]
  output: { runId: string; outputType: 'text' | 'markdown'; released: boolean; createdAt: Date } | null
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function defaultTitle(instruction: string): string {
  const firstLine =
    instruction
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? 'Tugas'
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77).trimEnd()}…`
}

/**
 * Layanan tugas AI employee: pembuatan (dengan idempotensi, batas kapasitas,
 * dan runtime yang harus tersedia), pembacaan, dan pembatalan. Eksekusi
 * dilakukan worker (runs/worker.ts); layanan ini tidak pernah menjalankan model.
 */
export function createTaskService(deps: {
  sql: SQL
  config: ApiConfig
  runtime: AgentRuntime
  limits: { taskCreate: RateLimiter }
}) {
  const { sql, config, runtime } = deps

  async function latestRun(scope: TenantScope, task: TaskRecord): Promise<RunRecord | null> {
    return task.latestRunId ? runsRepository.findById(scope, task.latestRunId) : null
  }

  async function withAgentNames(scope: TenantScope, tasks: TaskRecord[]): Promise<TaskListItem[]> {
    const agents = await agentsRepository.listIncludingArchived(scope)
    const names = new Map(agents.map((agent) => [agent.id, agent.name]))
    const items: TaskListItem[] = []
    for (const task of tasks) {
      items.push({
        ...task,
        agentName: names.get(task.agentId) ?? 'AI employee',
        latestRun: await latestRun(scope, task),
      })
    }
    return items
  }

  return {
    async capabilities(context: TenantContext): Promise<TaskCapabilities> {
      const usage = await withTenantTransaction(sql, context, async (scope) => ({
        activeTasks: await tasksRepository.countActive(scope),
        createdToday: await tasksRepository.countCreatedSince(scope, startOfUtcDay(new Date())),
      }))
      return {
        runtime: { available: runtime.available, kind: runtime.kind, provider: runtime.provider, model: runtime.model },
        canCreate: runtime.available && hasPermission(context, 'tasks.create'),
        canCancel: hasPermission(context, 'tasks.cancel'),
        limits: {
          maxInstructionChars: config.ai.maxInstructionChars,
          maxActiveTasks: config.worker.tenantMaxActiveRuns,
          dailyTaskLimit: config.worker.tenantDailyRunLimit,
          maxAttempts: config.worker.maxAttempts,
        },
        usage,
      }
    },

    /**
     * Membuat tugas + run pertama (queued) secara atomik. Idempoten per
     * (tenant, pengguna, idempotencyKey): pengiriman ulang mengembalikan tugas
     * yang sama tanpa run tambahan.
     */
    async create(
      context: TenantContext,
      input: {
        agentId: string
        instruction: string
        title?: string
        priority?: TaskPriority
        requiresApproval?: boolean
        idempotencyKey?: string
      },
    ): Promise<{ task: TaskListItem; run: RunRecord | null; created: boolean }> {
      const decision = deps.limits.taskCreate.consume(context.userId)
      if (!decision.allowed) {
        throw errors.tooManyRequests('Terlalu banyak tugas dibuat dalam waktu singkat. Coba lagi nanti.', {
          retryAfterSeconds: decision.retryAfterSeconds,
        })
      }
      if (!runtime.available) {
        throw new AppError(409, 'RUNTIME_NOT_CONFIGURED', RUN_ERROR_MESSAGES.RUNTIME_NOT_CONFIGURED, {
          hint: 'Atur AI_RUNTIME_PROVIDER, AI_RUNTIME_BASE_URL, AI_RUNTIME_API_KEY, dan AI_RUNTIME_MODEL di server.',
        })
      }
      const instruction = input.instruction.trim()
      if (instruction.length === 0) {
        throw new AppError(422, 'INSTRUCTION_EMPTY', 'Instruksi tidak boleh kosong.')
      }
      if (instruction.length > config.ai.maxInstructionChars) {
        throw new AppError(422, 'INSTRUCTION_TOO_LONG', 'Instruksi melebihi batas panjang.', {
          maxInstructionChars: config.ai.maxInstructionChars,
        })
      }
      const title = (input.title?.trim() || defaultTitle(instruction)).slice(0, 200)

      return withTenantTransaction(sql, context, async (scope) => {
        const agent = await agentsRepository.findById(scope, input.agentId)
        if (!agent) throw errors.notFound('AGENT_NOT_FOUND', 'AI employee tidak ditemukan.')
        if (agent.lifecycleStatus !== 'active') {
          throw errors.conflict('AGENT_NOT_ASSIGNABLE', 'AI employee ini belum aktif sehingga belum dapat ditugaskan.')
        }
        if (input.idempotencyKey) {
          const existing = await tasksRepository.findByIdempotencyKey(scope, context.userId, input.idempotencyKey)
          if (existing) {
            const [item] = await withAgentNames(scope, [existing])
            if (!item) throw new Error('Tugas idempoten tidak dapat dibaca')
            return { task: item, run: item.latestRun, created: false }
          }
        }
        const active = await tasksRepository.countActive(scope)
        if (active >= config.worker.tenantMaxActiveRuns) {
          throw errors.tooManyRequests('Batas tugas aktif perusahaan tercapai. Tunggu tugas lain selesai.', {
            maxActiveTasks: config.worker.tenantMaxActiveRuns,
            retryAfterSeconds: 30,
          })
        }
        const today = await tasksRepository.countCreatedSince(scope, startOfUtcDay(new Date()))
        if (today >= config.worker.tenantDailyRunLimit) {
          throw errors.tooManyRequests('Batas tugas harian perusahaan tercapai.', {
            dailyTaskLimit: config.worker.tenantDailyRunLimit,
            retryAfterSeconds: 3600,
          })
        }

        const { task, created } = await tasksRepository.create(scope, {
          agentId: agent.id,
          createdByUserId: context.userId,
          title,
          instruction,
          priority: input.priority ?? 'normal',
          requiresApproval: input.requiresApproval ?? false,
          idempotencyKey: input.idempotencyKey ?? null,
          maxAttempts: config.worker.maxAttempts,
        })
        if (!created) {
          const [item] = await withAgentNames(scope, [task])
          if (!item) throw new Error('Tugas idempoten tidak dapat dibaca')
          return { task: item, run: item.latestRun, created: false }
        }
        await publishAgentEvent(scope, { type: 'agent.task.created', task, run: null, extra: { title: task.title } })
        const run = await runsRepository.create(scope, {
          taskId: task.id,
          agentId: agent.id,
          attempt: 1,
          provider: runtime.provider,
          model: runtime.model,
        })
        const queued = await tasksRepository.markQueued(scope, { id: task.id, runId: run.id, attempts: 1 })
        if (!queued) throw new Error('Tugas baru tidak dapat diantrekan')
        await runsRepository.appendEvent(scope, {
          runId: run.id,
          taskId: task.id,
          type: 'run.queued',
          payload: { attempt: 1, provider: runtime.provider, model: runtime.model },
        })
        await publishAgentEvent(scope, { type: 'agent.task.queued', task: queued, run, extra: { title: queued.title } })
        return { task: { ...queued, agentName: agent.name, latestRun: run }, run, created: true }
      })
    },

    list(context: TenantContext, filter: { agentId?: string; status?: TaskStatus; limit?: number }) {
      return withTenantTransaction(sql, context, async (scope) =>
        withAgentNames(scope, await tasksRepository.list(scope, { ...filter, limit: filter.limit ?? 50 })),
      )
    },

    get(context: TenantContext, taskId: string): Promise<TaskDetail> {
      return withTenantTransaction(sql, context, async (scope) => {
        const task = await tasksRepository.findById(scope, taskId)
        if (!task) throw errors.notFound('TASK_NOT_FOUND', 'Tugas tidak ditemukan.')
        const [item] = await withAgentNames(scope, [task])
        if (!item) throw errors.notFound('TASK_NOT_FOUND', 'Tugas tidak ditemukan.')
        const runs = await runsRepository.listForTask(scope, task.id)
        const outputRun = [...runs]
          .reverse()
          .find((run) => run.status === 'completed' || run.status === 'waiting_approval')
        const output = outputRun ? await runsRepository.findOutput(scope, outputRun.id) : null
        return {
          ...item,
          runs,
          output: output
            ? {
                runId: output.runId,
                outputType: output.outputType,
                released: output.released,
                createdAt: output.createdAt,
              }
            : null,
        }
      })
    },

    /**
     * Pembatalan: run antrean/menunggu persetujuan dibatalkan seketika; run yang
     * sedang dieksekusi diberi tanda `cancel_requested` dan diselesaikan worker
     * (hasil tidak pernah dirilis setelahnya).
     */
    cancel(context: TenantContext, taskId: string): Promise<TaskListItem> {
      return withTenantTransaction(sql, context, async (scope) => {
        const task = await tasksRepository.lockById(scope, taskId)
        if (!task) throw errors.notFound('TASK_NOT_FOUND', 'Tugas tidak ditemukan.')
        if (isTerminalTaskStatus(task.status)) {
          throw errors.conflict('TASK_ALREADY_FINISHED', 'Tugas sudah selesai dan tidak dapat dibatalkan.')
        }
        const run = await latestRun(scope, task)
        if (run && (run.status === 'claimed' || run.status === 'running')) {
          await runsRepository.requestCancel(scope, run.id)
          await runsRepository.appendEvent(scope, {
            runId: run.id,
            taskId: task.id,
            type: 'cancel.requested',
            payload: { byUserId: context.userId },
          })
          const [item] = await withAgentNames(scope, [task])
          if (!item) throw new Error('Tugas tidak dapat dibaca')
          return item
        }
        if (run && run.status === 'waiting_approval') {
          const approval = await approvalsRepository.findPendingForRun(scope, run.id)
          if (approval) {
            await approvalsRepository.close(scope, { id: approval.id, status: 'canceled' })
            await publishAgentEvent(scope, {
              type: 'approval.decided',
              task,
              run,
              extra: {
                approvalId: approval.id,
                actionType: approval.actionType,
                actionSummary: approval.actionSummary,
                approvalStatus: 'canceled',
              },
            })
          }
        }
        let canceledRun: RunRecord | null = run
        if (run && (run.status === 'queued' || run.status === 'waiting_approval')) {
          canceledRun = await runsRepository.finish(scope, {
            id: run.id,
            workerId: null,
            from: ['queued', 'waiting_approval'],
            to: 'canceled',
            errorCode: 'CANCELED',
            errorMessage: RUN_ERROR_MESSAGES.CANCELED,
            retryable: false,
          })
          await runsRepository.appendEvent(scope, {
            runId: run.id,
            taskId: task.id,
            type: 'run.canceled',
            payload: { byUserId: context.userId },
          })
        }
        const canceled = await tasksRepository.markCanceled(scope, task.id)
        if (!canceled) throw errors.conflict('TASK_ALREADY_FINISHED', 'Tugas sudah selesai dan tidak dapat dibatalkan.')
        await publishAgentEvent(scope, { type: 'agent.run.canceled', task: canceled, run: canceledRun })
        const [item] = await withAgentNames(scope, [canceled])
        if (!item) throw new Error('Tugas tidak dapat dibaca')
        return item
      })
    },
  }
}

export type TaskService = ReturnType<typeof createTaskService>
