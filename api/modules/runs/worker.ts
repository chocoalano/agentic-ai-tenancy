import type { SQL } from 'bun'
import { RUN_ERROR_MESSAGES, type OutputType, type RunErrorCode } from '../../../domains/tasks/types'
import type { ApiConfig } from '../../core/config/env'
import { withWorkerTransaction, type WorkerTransaction } from '../../core/database/transactions'
import type { Logger } from '../../core/http/logger'
import type { AgentRuntime } from '../../core/runtime'
import { approvalsRepository } from '../approvals/repository'
import { tasksRepository, type TaskRecord } from '../tasks/repository'
import { publishAgentEvent } from './events'
import { runsRepository, type RunRecord } from './repository'

/*
 * Worker eksekusi yang tahan gangguan (PostgreSQL sebagai antrean):
 *
 * - klaim atomik lewat fungsi definer `app.claim_agent_run` (FOR UPDATE SKIP LOCKED) dengan lease;
 * - setiap transisi state adalah transaksi pendek (tidak ada transaksi terbuka selama inferensi);
 * - lease diperpanjang berkala; bila lease hilang (dipulihkan worker lain) eksekusi dihentikan dan
 *   TIDAK ada hasil yang ditulis (compare-and-swap mencocokkan worker_id);
 * - lease kedaluwarsa dipulihkan: run → failed (LEASE_EXPIRED, retryable) → percobaan baru bila kuota ada;
 * - pembatalan: flag `cancel_requested` dibaca saat heartbeat → AbortSignal ke adapter;
 * - kegagalan dibedakan: retryable (timeout/5xx/429/lease) vs non-retryable (ditolak/validasi/terlalu besar).
 *
 * Jaminan: at-least-once eksekusi dengan hasil akhir idempoten (satu output per run, CAS
 * pada status) — BUKAN exactly-once terhadap provider.
 */
export interface ExecutionWorker {
  readonly workerId: string
  readonly active: number
  start(): void
  stop(): Promise<void>
  /** Satu putaran: pemulihan lease/persetujuan kedaluwarsa lalu klaim sampai konkurensi penuh. */
  tick(): Promise<number>
  /** Menunggu semua eksekusi aktif selesai (dipakai test). */
  drain(): Promise<void>
}

interface Claim {
  run_id: string
  tenant_id: string
  task_id: string
  agent_id: string
  attempt: number
  runtime_provider: string
  runtime_model: string
}

class AbortReason extends Error {
  constructor(readonly kind: 'LEASE_LOST' | 'CANCELED' | 'SHUTDOWN') {
    super(kind)
    this.name = 'AbortReason'
  }
}

export function createExecutionWorker(deps: {
  sql: SQL
  config: ApiConfig
  runtime: AgentRuntime
  logger: Logger
}): ExecutionWorker {
  const { sql, config, runtime, logger } = deps
  const workerId = config.worker.workerId
  const leaseSeconds = config.worker.leaseSeconds
  const inflight = new Map<string, { controller: AbortController; done: Promise<void> }>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let ticking: Promise<number> | null = null
  let lastPrune = 0

  function worker(tenantId: string) {
    return <T>(fn: (scope: WorkerTransaction) => Promise<T>) => withWorkerTransaction(sql, { tenantId, workerId }, fn)
  }

  /** Percobaan ulang bila run gagal secara retryable dan kuota percobaan tersisa; selain itu tugas gagal. */
  async function scheduleRetryOrFail(scope: WorkerTransaction, task: TaskRecord, run: RunRecord) {
    const canRetry = run.retryable === true && task.attempts < task.maxAttempts && !run.cancelRequested
    if (canRetry) {
      const next = await runsRepository.create(scope, {
        taskId: task.id,
        agentId: task.agentId,
        attempt: task.attempts + 1,
        provider: run.runtimeProvider,
        model: run.runtimeModel,
      })
      const queued = await tasksRepository.markQueued(scope, {
        id: task.id,
        runId: next.id,
        attempts: task.attempts + 1,
      })
      await runsRepository.appendEvent(scope, {
        runId: next.id,
        taskId: task.id,
        type: 'run.queued',
        payload: { attempt: next.attempt, retryOf: run.id, reason: run.errorCode },
      })
      await publishAgentEvent(scope, {
        type: 'agent.run.failed',
        task: queued ?? task,
        run,
        extra: { errorCode: run.errorCode, errorMessage: run.errorMessage, retryScheduled: true },
      })
      if (queued)
        await publishAgentEvent(scope, {
          type: 'agent.task.queued',
          task: queued,
          run: next,
          extra: { title: queued.title },
        })
      return
    }
    const code: RunErrorCode =
      run.retryable === true && task.attempts >= task.maxAttempts
        ? 'ATTEMPTS_EXHAUSTED'
        : ((run.errorCode as RunErrorCode | null) ?? 'INTERNAL_ERROR')
    const message =
      code === 'ATTEMPTS_EXHAUSTED'
        ? RUN_ERROR_MESSAGES.ATTEMPTS_EXHAUSTED
        : (run.errorMessage ?? RUN_ERROR_MESSAGES.INTERNAL_ERROR)
    const failed = await tasksRepository.markFailed(scope, { id: task.id, errorCode: code, errorMessage: message })
    await publishAgentEvent(scope, {
      type: 'agent.run.failed',
      task: failed ?? task,
      run,
      extra: { errorCode: code, errorMessage: message, retryScheduled: false },
    })
  }

  async function recoverExpiredLeases(): Promise<number> {
    const expired = await sql<{ run_id: string; tenant_id: string }[]>`select * from app.expired_run_leases()`
    let recovered = 0
    for (const item of expired) {
      await worker(item.tenant_id)(async (scope) => {
        const run = await runsRepository.finish(scope, {
          id: item.run_id,
          workerId: null,
          from: ['claimed', 'running'],
          to: 'failed',
          errorCode: 'LEASE_EXPIRED',
          errorMessage: RUN_ERROR_MESSAGES.LEASE_EXPIRED,
          retryable: true,
        })
        if (!run || (run.leaseExpiresAt && run.leaseExpiresAt.getTime() > Date.now())) return
        const task = await tasksRepository.lockById(scope, run.taskId)
        if (!task) return
        await runsRepository.appendEvent(scope, {
          runId: run.id,
          taskId: task.id,
          type: 'lease.expired',
          payload: { previousWorker: run.workerId, recoveredBy: workerId },
        })
        await scheduleRetryOrFail(scope, task, run)
        recovered += 1
      })
    }
    return recovered
  }

  async function expireApprovals(): Promise<number> {
    const expired = await sql<
      { approval_id: string; tenant_id: string }[]
    >`select * from app.expired_pending_approvals()`
    let count = 0
    for (const item of expired) {
      await worker(item.tenant_id)(async (scope) => {
        const approval = await approvalsRepository.close(scope, { id: item.approval_id, status: 'expired' })
        if (!approval) return
        const run = await runsRepository.finish(scope, {
          id: approval.runId,
          workerId: null,
          from: ['waiting_approval'],
          to: 'failed',
          errorCode: 'APPROVAL_EXPIRED',
          errorMessage: RUN_ERROR_MESSAGES.APPROVAL_EXPIRED,
          retryable: false,
        })
        const task = await tasksRepository.markFailed(scope, {
          id: approval.taskId,
          errorCode: 'APPROVAL_EXPIRED',
          errorMessage: RUN_ERROR_MESSAGES.APPROVAL_EXPIRED,
        })
        if (!run || !task) return
        await runsRepository.appendEvent(scope, {
          runId: run.id,
          taskId: task.id,
          type: 'approval.expired',
          payload: { approvalId: approval.id },
        })
        await publishAgentEvent(scope, {
          type: 'approval.decided',
          task,
          run,
          extra: {
            approvalId: approval.id,
            actionType: approval.actionType,
            actionSummary: approval.actionSummary,
            approvalStatus: 'expired',
          },
        })
        await publishAgentEvent(scope, {
          type: 'agent.run.failed',
          task,
          run,
          extra: {
            errorCode: 'APPROVAL_EXPIRED',
            errorMessage: RUN_ERROR_MESSAGES.APPROVAL_EXPIRED,
            retryScheduled: false,
          },
        })
        count += 1
      })
    }
    return count
  }

  async function claimOne(): Promise<Claim | null> {
    const [claim] = await sql<Claim[]>`select * from app.claim_agent_run(${workerId}, ${leaseSeconds})`
    return claim ?? null
  }

  async function finalizeCanceled(claim: Claim) {
    await worker(claim.tenant_id)(async (scope) => {
      const run = await runsRepository.finish(scope, {
        id: claim.run_id,
        workerId,
        from: ['claimed', 'running'],
        to: 'canceled',
        errorCode: 'CANCELED',
        errorMessage: RUN_ERROR_MESSAGES.CANCELED,
        retryable: false,
      })
      if (!run) return
      await runsRepository.appendEvent(scope, { runId: run.id, taskId: run.taskId, type: 'run.canceled', payload: {} })
      const task =
        (await tasksRepository.markCanceled(scope, run.taskId)) ?? (await tasksRepository.findById(scope, run.taskId))
      if (task) await publishAgentEvent(scope, { type: 'agent.run.canceled', task, run })
    })
  }

  async function finalizeFailure(claim: Claim, failure: { code: RunErrorCode; message: string; retryable: boolean }) {
    await worker(claim.tenant_id)(async (scope) => {
      const run = await runsRepository.finish(scope, {
        id: claim.run_id,
        workerId,
        from: ['claimed', 'running'],
        to: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable: failure.retryable,
      })
      if (!run) return
      await runsRepository.appendEvent(scope, {
        runId: run.id,
        taskId: run.taskId,
        type: 'run.failed',
        payload: { code: failure.code, retryable: failure.retryable },
      })
      const task = await tasksRepository.lockById(scope, run.taskId)
      if (task) await scheduleRetryOrFail(scope, task, run)
    })
  }

  async function finalizeSuccess(
    claim: Claim,
    result: { outputType: OutputType; content: string; inputTokens: number | null; outputTokens: number | null },
  ) {
    await worker(claim.tenant_id)(async (scope) => {
      const task = await tasksRepository.lockById(scope, claim.task_id)
      if (!task) return
      if (task.requiresApproval) {
        const run = await runsRepository.finish(scope, {
          id: claim.run_id,
          workerId,
          from: ['running'],
          to: 'waiting_approval',
          usageInputTokens: result.inputTokens,
          usageOutputTokens: result.outputTokens,
        })
        if (!run) return
        await runsRepository.saveOutput(scope, {
          runId: run.id,
          taskId: task.id,
          outputType: result.outputType,
          content: result.content,
          released: false,
        })
        const approval = await approvalsRepository.create(scope, {
          taskId: task.id,
          runId: run.id,
          agentId: task.agentId,
          actionType: 'release_result',
          actionSummary: `Merilis hasil tugas "${task.title}" kepada pengguna`,
          expiresAt: new Date(Date.now() + config.approvals.ttlHours * 3_600_000),
        })
        const waiting = (await tasksRepository.markWaitingApproval(scope, task.id)) ?? task
        await runsRepository.appendEvent(scope, {
          runId: run.id,
          taskId: task.id,
          type: 'approval.requested',
          payload: { approvalId: approval.id, actionType: approval.actionType },
        })
        const extra = {
          approvalId: approval.id,
          actionType: approval.actionType,
          actionSummary: approval.actionSummary,
          approvalStatus: approval.status,
        }
        await publishAgentEvent(scope, { type: 'agent.run.waiting_approval', task: waiting, run, extra })
        await publishAgentEvent(scope, { type: 'approval.requested', task: waiting, run, extra })
        return
      }
      const run = await runsRepository.finish(scope, {
        id: claim.run_id,
        workerId,
        from: ['running'],
        to: 'completed',
        usageInputTokens: result.inputTokens,
        usageOutputTokens: result.outputTokens,
      })
      if (!run) return
      await runsRepository.saveOutput(scope, {
        runId: run.id,
        taskId: task.id,
        outputType: result.outputType,
        content: result.content,
        released: true,
      })
      const completed = (await tasksRepository.markCompleted(scope, task.id)) ?? task
      await runsRepository.appendEvent(scope, {
        runId: run.id,
        taskId: task.id,
        type: 'run.completed',
        payload: { outputType: result.outputType, outputChars: result.content.length },
      })
      await publishAgentEvent(scope, {
        type: 'agent.run.completed',
        task: completed,
        run,
        extra: { released: true, outputType: result.outputType },
      })
    })
  }

  /** Lepas klaim saat shutdown: run kembali ke antrean agar worker lain melanjutkan. */
  async function releaseClaim(claim: Claim) {
    await worker(claim.tenant_id)(async (scope) => {
      const rows = await scope.sql`
        update agent_runs set status = 'queued', worker_id = null, lease_expires_at = null, claimed_at = null,
                              started_at = null, version = version + 1
        where id = ${claim.run_id} and tenant_id = ${scope.tenantId} and worker_id = ${workerId}
          and status in ('claimed', 'running')
        returning id
      `
      if (rows.length === 0) return
      const task = await tasksRepository.findById(scope, claim.task_id)
      if (task) await tasksRepository.markQueued(scope, { id: task.id, runId: claim.run_id, attempts: task.attempts })
      await runsRepository.appendEvent(scope, {
        runId: claim.run_id,
        taskId: claim.task_id,
        type: 'run.released',
        payload: { reason: 'shutdown', worker: workerId },
      })
    })
  }

  async function process(claim: Claim, controller: AbortController) {
    // 1. claimed → running (transaksi pendek) + profil agent.
    const started = await worker(claim.tenant_id)(async (scope) => {
      const run = await runsRepository.markRunning(scope, { id: claim.run_id, workerId })
      if (!run) return null
      const task =
        (await tasksRepository.markRunning(scope, claim.task_id)) ??
        (await tasksRepository.findById(scope, claim.task_id))
      if (!task) return null
      const [agent] = await scope.sql<{ name: string; role_title: string; main_instruction: string }[]>`
        select name, role_title, main_instruction from agents where id = ${claim.agent_id} and tenant_id = ${scope.tenantId}
      `
      if (!agent) return null
      await runsRepository.appendEvent(scope, {
        runId: run.id,
        taskId: task.id,
        type: 'run.started',
        payload: { worker: workerId, attempt: run.attempt },
      })
      await publishAgentEvent(scope, {
        type: 'agent.run.started',
        task,
        run,
        extra: { activity: 'Memulai eksekusi' },
      })
      return { run, task, agent }
    })
    if (!started) {
      logger.warn('Run tidak dapat dimulai (klaim hilang)', { runId: claim.run_id, workerId })
      return
    }

    // 2. Heartbeat lease + pembacaan permintaan pembatalan (tanpa transaksi panjang).
    const heartbeat = setInterval(
      () => {
        void worker(claim.tenant_id)((scope) =>
          runsRepository.heartbeat(scope, { id: claim.run_id, workerId, leaseSeconds }),
        )
          .then((state) => {
            if (!state) controller.abort(new AbortReason('LEASE_LOST'))
            else if (state.cancelRequested) controller.abort(new AbortReason('CANCELED'))
          })
          .catch((error) => logger.warn('Heartbeat lease gagal', { runId: claim.run_id, error: String(error) }))
      },
      Math.max(250, (leaseSeconds * 1000) / 3),
    )

    let output: { outputType: OutputType; content: string } | null = null
    let usage = { inputTokens: null as number | null, outputTokens: null as number | null }
    let failure: { code: RunErrorCode; message: string; retryable: boolean } | null = null
    let completed = false
    try {
      const events = runtime.execute({
        runId: claim.run_id,
        taskId: claim.task_id,
        agentId: claim.agent_id,
        tenantId: claim.tenant_id,
        instruction: started.task.instruction,
        agent: {
          name: started.agent.name,
          roleTitle: started.agent.role_title,
          mainInstruction: started.agent.main_instruction,
        },
        limits: {
          maxOutputTokens: config.ai.maxOutputTokens,
          maxOutputChars: config.ai.maxOutputChars,
          timeoutMs: config.ai.timeoutSeconds * 1000,
          temperature: config.ai.temperature,
        },
        signal: controller.signal,
      })
      for await (const event of events) {
        if (controller.signal.aborted) break
        switch (event.type) {
          case 'started':
            await worker(claim.tenant_id)(async (scope) => {
              await runsRepository.recordProviderRequest(scope, {
                id: claim.run_id,
                providerRequestId: event.providerRequestId,
              })
              await runsRepository.appendEvent(scope, {
                runId: claim.run_id,
                taskId: claim.task_id,
                type: 'provider.started',
                payload: { provider: event.provider, model: event.model, providerRequestId: event.providerRequestId },
              })
            })
            break
          case 'activity':
            await worker(claim.tenant_id)(async (scope) => {
              await runsRepository.appendEvent(scope, {
                runId: claim.run_id,
                taskId: claim.task_id,
                type: 'activity',
                payload: { activity: event.activity },
              })
              await publishAgentEvent(scope, {
                type: 'agent.run.activity',
                task: started.task,
                run: started.run,
                extra: { activity: event.activity },
              })
            })
            break
          case 'output':
            output = { outputType: event.outputType, content: event.content }
            break
          case 'usage':
            usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens }
            break
          case 'completed':
            completed = true
            break
          case 'failed':
            failure = { code: event.code, message: event.message, retryable: event.retryable }
            break
        }
        if (completed || failure) break
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        logger.error('Adapter runtime melempar error', { runId: claim.run_id, error: String(error) })
        failure = { code: 'INTERNAL_ERROR', message: RUN_ERROR_MESSAGES.INTERNAL_ERROR, retryable: true }
      }
    } finally {
      clearInterval(heartbeat)
    }

    const reason = controller.signal.reason
    if (controller.signal.aborted && reason instanceof AbortReason) {
      if (reason.kind === 'LEASE_LOST') {
        logger.warn('Lease hilang; hasil tidak ditulis', { runId: claim.run_id, workerId })
        return
      }
      if (reason.kind === 'SHUTDOWN') {
        await releaseClaim(claim)
        return
      }
      await finalizeCanceled(claim)
      return
    }
    if (failure) {
      await finalizeFailure(claim, failure)
      return
    }
    if (completed && output) {
      if (output.content.length > config.ai.maxOutputChars) {
        await finalizeFailure(claim, {
          code: 'OUTPUT_TOO_LARGE',
          message: RUN_ERROR_MESSAGES.OUTPUT_TOO_LARGE,
          retryable: false,
        })
        return
      }
      await finalizeSuccess(claim, { ...output, ...usage })
      return
    }
    await finalizeFailure(claim, {
      code: 'PROVIDER_INVALID_RESPONSE',
      message: RUN_ERROR_MESSAGES.PROVIDER_INVALID_RESPONSE,
      retryable: false,
    })
  }

  async function tick(): Promise<number> {
    if (ticking) return ticking
    ticking = (async () => {
      let claimed = 0
      try {
        await recoverExpiredLeases()
        await expireApprovals()
        if (Date.now() - lastPrune > 600_000) {
          lastPrune = Date.now()
          await sql`select app.prune_realtime_outbox(${config.realtime.outboxRetentionHours})`
        }
        while (!stopped && inflight.size < config.worker.concurrency) {
          const claim = await claimOne()
          if (!claim) break
          claimed += 1
          const controller = new AbortController()
          const done = process(claim, controller)
            .catch((error) =>
              logger.error('Eksekusi run gagal tak terduga', { runId: claim.run_id, error: String(error) }),
            )
            .finally(() => inflight.delete(claim.run_id))
          inflight.set(claim.run_id, { controller, done })
        }
      } catch (error) {
        logger.warn('Putaran worker gagal', { workerId, error: String(error) })
      } finally {
        ticking = null
      }
      return claimed
    })()
    return ticking
  }

  function schedule() {
    if (stopped || timer) return
    timer = setTimeout(async () => {
      timer = null
      const claimed = await tick()
      // Ada pekerjaan: langsung putaran berikutnya; tidak ada: tunggu pollMs.
      if (claimed > 0 && !stopped) setImmediate(() => schedule())
      else schedule()
    }, deps.config.worker.pollMs)
  }

  return {
    workerId,
    get active() {
      return inflight.size
    },
    start() {
      stopped = false
      logger.info('Worker eksekusi berjalan', {
        workerId,
        provider: runtime.provider,
        model: runtime.model,
        concurrency: config.worker.concurrency,
      })
      schedule()
    },
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
      for (const { controller } of inflight.values()) controller.abort(new AbortReason('SHUTDOWN'))
      await Promise.allSettled([...inflight.values()].map((item) => item.done))
      if (ticking) await ticking
    },
    tick,
    async drain() {
      while (inflight.size > 0) await Promise.allSettled([...inflight.values()].map((item) => item.done))
    },
  }
}
