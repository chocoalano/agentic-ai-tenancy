import type { SQL } from 'bun'
import { RUN_ERROR_MESSAGES, type ApprovalStatus } from '../../../domains/tasks/types'
import type { TenantContext } from '../../../domains/tenancy/types'
import type { ApiConfig } from '../../core/config/env'
import { withTenantTransaction } from '../../core/database/transactions'
import { AppError, errors } from '../../core/errors/app-error'
import { publishAgentEvent } from '../runs/events'
import { runsRepository } from '../runs/repository'
import { tasksRepository } from '../tasks/repository'
import { approvalsRepository, type ApprovalRecord } from './repository'

/**
 * Persetujuan manusia yang dipersistenkan. Aksi yang dilindungi pada Phase 5:
 * `release_result` — hasil run tidak dapat dibaca (409 OUTPUT_PENDING_APPROVAL)
 * dan tugas tidak `completed` sampai pemegang izin `approvals.decide`
 * menyetujuinya. Otorisasi diperiksa ulang di dalam transaksi keputusan.
 */
export function createApprovalService(deps: { sql: SQL; config: ApiConfig }) {
  const { sql, config } = deps

  return {
    list(context: TenantContext, filter: { status?: ApprovalStatus; limit?: number }): Promise<ApprovalRecord[]> {
      return withTenantTransaction(sql, context, (scope) =>
        approvalsRepository.list(scope, { status: filter.status, limit: filter.limit ?? 50 }),
      )
    },

    get(context: TenantContext, approvalId: string): Promise<ApprovalRecord> {
      return withTenantTransaction(sql, context, async (scope) => {
        const approval = await approvalsRepository.findById(scope, approvalId)
        if (!approval) throw errors.notFound('APPROVAL_NOT_FOUND', 'Permintaan persetujuan tidak ditemukan.')
        return approval
      })
    },

    decide(
      context: TenantContext,
      approvalId: string,
      input: { decision: 'approve' | 'reject'; note?: string },
    ): Promise<ApprovalRecord> {
      return withTenantTransaction(sql, context, async (scope) => {
        const approval = await approvalsRepository.lockById(scope, approvalId)
        if (!approval) throw errors.notFound('APPROVAL_NOT_FOUND', 'Permintaan persetujuan tidak ditemukan.')
        if (approval.status !== 'pending') {
          throw errors.conflict('APPROVAL_ALREADY_DECIDED', `Permintaan ini sudah berstatus ${approval.status}.`)
        }
        if (approval.expiresAt.getTime() <= Date.now()) {
          throw errors.conflict('APPROVAL_EXPIRED', RUN_ERROR_MESSAGES.APPROVAL_EXPIRED)
        }
        const task = await tasksRepository.lockById(scope, approval.taskId)
        const run = await runsRepository.findById(scope, approval.runId)
        if (!task || !run) throw errors.notFound('APPROVAL_NOT_FOUND', 'Permintaan persetujuan tidak ditemukan.')
        if (config.approvals.forbidSelfDecision && task.createdByUserId === context.userId) {
          throw new AppError(
            403,
            'APPROVAL_SELF_DECISION',
            'Pembuat tugas tidak boleh memutuskan persetujuannya sendiri.',
          )
        }
        if (run.status !== 'waiting_approval' || task.status !== 'waiting_approval') {
          throw errors.conflict('APPROVAL_NOT_ACTIONABLE', 'Tugas ini tidak lagi menunggu persetujuan.')
        }

        const status = input.decision === 'approve' ? 'approved' : 'rejected'
        const decided = await approvalsRepository.decide(scope, {
          id: approval.id,
          status,
          userId: context.userId,
          note: input.note?.trim() || null,
        })
        if (!decided) throw errors.conflict('APPROVAL_ALREADY_DECIDED', 'Permintaan ini sudah diputuskan.')

        const approvalExtra = {
          approvalId: decided.id,
          actionType: decided.actionType,
          actionSummary: decided.actionSummary,
          approvalStatus: decided.status,
        }
        if (status === 'approved') {
          await runsRepository.releaseOutput(scope, run.id)
          const completedRun = await runsRepository.finish(scope, {
            id: run.id,
            workerId: null,
            from: ['waiting_approval'],
            to: 'completed',
          })
          const completedTask = await tasksRepository.markCompleted(scope, task.id)
          if (!completedRun || !completedTask) throw errors.conflict('APPROVAL_NOT_ACTIONABLE', 'State tugas berubah.')
          await runsRepository.appendEvent(scope, {
            runId: run.id,
            taskId: task.id,
            type: 'approval.approved',
            payload: { approvalId: decided.id, byUserId: context.userId },
          })
          await publishAgentEvent(scope, {
            type: 'approval.decided',
            task: completedTask,
            run: completedRun,
            extra: approvalExtra,
          })
          const output = await runsRepository.findOutput(scope, run.id)
          await publishAgentEvent(scope, {
            type: 'agent.run.completed',
            task: completedTask,
            run: completedRun,
            extra: { released: true, outputType: output?.outputType ?? null },
          })
        } else {
          const failedRun = await runsRepository.finish(scope, {
            id: run.id,
            workerId: null,
            from: ['waiting_approval'],
            to: 'failed',
            errorCode: 'APPROVAL_REJECTED',
            errorMessage: RUN_ERROR_MESSAGES.APPROVAL_REJECTED,
            retryable: false,
          })
          const failedTask = await tasksRepository.markFailed(scope, {
            id: task.id,
            errorCode: 'APPROVAL_REJECTED',
            errorMessage: RUN_ERROR_MESSAGES.APPROVAL_REJECTED,
          })
          if (!failedRun || !failedTask) throw errors.conflict('APPROVAL_NOT_ACTIONABLE', 'State tugas berubah.')
          await runsRepository.appendEvent(scope, {
            runId: run.id,
            taskId: task.id,
            type: 'approval.rejected',
            payload: { approvalId: decided.id, byUserId: context.userId },
          })
          await publishAgentEvent(scope, {
            type: 'approval.decided',
            task: failedTask,
            run: failedRun,
            extra: approvalExtra,
          })
          await publishAgentEvent(scope, {
            type: 'agent.run.failed',
            task: failedTask,
            run: failedRun,
            extra: {
              errorCode: 'APPROVAL_REJECTED',
              errorMessage: RUN_ERROR_MESSAGES.APPROVAL_REJECTED,
              retryScheduled: false,
            },
          })
        }
        return decided
      })
    },
  }
}

export type ApprovalService = ReturnType<typeof createApprovalService>
